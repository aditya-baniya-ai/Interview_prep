/**
 * Gemini Live API Client — Direct browser-to-Gemini WebSocket for real-time voice.
 *
 * Architecture:
 * 1. Frontend requests an ephemeral token from our backend
 * 2. Frontend opens a WebSocket directly to Gemini Live API
 *    (v1alpha + BidiGenerateContentConstrained + access_token=)
 * 3. Mic audio (16-bit PCM, 16kHz) → Gemini → Audio response (24kHz PCM) → Speaker
 *
 * This gives us the lowest possible latency for voice conversations.
 */

export type InterviewType =
  | "coding"
  | "behavioral"
  | "system-design"
  | "data-analyst"
  | "resume-dive";

export interface GeminiLiveConfig {
  backendUrl: string;
  interviewType: InterviewType;
  sessionId?: string;
  difficulty?: string;
  resumeText?: string;
  onTranscriptUpdate: (speaker: "user" | "interviewer", text: string, isFinal: boolean) => void;
  onAudioStateChange: (isPlaying: boolean) => void;
  onConnectionChange: (connected: boolean) => void;
  onError: (error: string) => void;
}

interface TokenResponse {
  token: string;
  model: string;
  websocket_url: string;
  system_instruction: string;
  fallback?: boolean;
}

export class GeminiLiveClient {
  private config: GeminiLiveConfig;
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private isConnected = false;
  private isMicActive = false;
  private isPlaying = false;
  private playbackContext: AudioContext | null = null;
  private tokenData: TokenResponse | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  // Transcript accumulation buffers
  private userTranscriptBuffer = "";
  private aiTranscriptBuffer = "";
  // Silence detection — nudges Sarah if no turn completes within the threshold
  private silenceNudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private hasOpenedConversation = false;

  // Silence before a check-in: 22 s for coding (user may be typing), 14 s for behavioral
  private get silenceThresholdMs(): number {
    return this.config.interviewType === "coding" ? 22000 : 14000;
  }

  // ── Greeting + VAD (voice-activity detection) state ─────────────────────
  // Greeting: nudge the model to greet the candidate ~2s after setup if it
  // hasn't already started speaking on its own.
  private static readonly GREETING_DELAY_MS = 2000;
  private greetingTimer: ReturnType<typeof setTimeout> | null = null;
  private aiHasSpokenThisSession = false;

  // VAD thresholds — calibrated for typical laptop mics. RMS is computed on
  // Float32 samples in [-1, 1], so:
  //   < 0.012   = silence / room tone
  //   0.012-0.03 = soft sounds, distant speech, keyboard taps (ignore)
  //   > 0.04    = sustained voice (treat as speech)
  // We require N *consecutive* loud frames before declaring speech, which
  // filters out short transients like coughs, key clicks, or chair creaks.
  private static readonly VAD_SPEECH_THRESHOLD = 0.04;
  private static readonly VAD_MIN_CONSECUTIVE_FRAMES = 2; // ~512ms at 4096-sample frames
  // While the AI is playing, the speaker→mic echo bleed (typically RMS ~0.02–
  // 0.05 even with echoCancellation: true) can falsely trip the speech VAD.
  // We use a stricter threshold + more sustained frames for barge-in so only
  // the candidate's actual voice can interrupt.
  private static readonly VAD_BARGE_IN_THRESHOLD = 0.07;
  private static readonly VAD_MIN_BARGE_IN_FRAMES = 3; // ~768ms sustained voice
  private vadConsecutiveLoudFrames = 0;
  // Emit a lightweight user-speaking heartbeat at most every ~450ms while
  // local VAD detects sustained candidate speech.
  private static readonly USER_SPEECH_SIGNAL_INTERVAL_MS = 450;
  private lastUserSpeechSignalAt = 0;

  // Barge-in grace period: don't let the AI's own audio (bleeding through the
  // speakers into the mic) cancel its first words. Echo cancellation is on,
  // but this is a belt-and-braces guard.
  private static readonly BARGE_IN_GRACE_MS = 500;
  // Tail gate: once AI playback ends, wait this long before forwarding mic
  // audio to Gemini again. Prevents the speaker's audio tail (still bleeding
  // into the mic for a few ms) from being shipped upstream.
  private static readonly POST_PLAYBACK_GATE_MS = 300;
  private playbackStartedAt = 0;
  private playbackEndedAt = 0;

  constructor(config: GeminiLiveConfig) {
    this.config = config;
  }

  // ──────────── Silence detection ────────────

  /**
   * Reset the silence countdown.  Call this after every completed turn
   * (user or AI) so the timer only fires when there is genuine dead air.
   */
  private scheduleSilenceNudge(): void {
    if (this.silenceNudgeTimer) clearTimeout(this.silenceNudgeTimer);
    this.silenceNudgeTimer = setTimeout(() => {
      // Only nudge when the mic is live, connected, and Sarah is not already speaking
      if (!this.isConnected || !this.isMicActive || this.isPlaying) {
        this.scheduleSilenceNudge(); // retry shortly
        return;
      }
      const nudge =
        this.config.interviewType === "coding"
          ? "[SYSTEM] The candidate has been silent — they may be coding or thinking deeply. As Sarah, briefly fill the pause naturally: e.g. 'Take your time, I can see you working through it' or ask a light check-in question. One sentence only. Do NOT reveal the solution."
          : "[SYSTEM] The candidate has gone quiet. As Sarah, gently re-engage: a warm filler like 'Take your time' or a soft prompt like 'What's coming to mind?'. One sentence only.";
      this.sendText(nudge);
      this.scheduleSilenceNudge(); // re-arm for the next silence window
    }, this.silenceThresholdMs);
  }

  private clearSilenceNudge(): void {
    if (this.silenceNudgeTimer) {
      clearTimeout(this.silenceNudgeTimer);
      this.silenceNudgeTimer = null;
    }
  }

  /**
   * Initialize the connection: get token → connect WebSocket → start audio
   */
  async connect(): Promise<void> {
    try {
      // Step 1: Get ephemeral token from our backend
      const res = await fetch(`${this.config.backendUrl}/api/live/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_type: this.config.interviewType,
          session_id: this.config.sessionId,
          difficulty: this.config.difficulty,
          resume_text: this.config.resumeText,
        }),
      });

      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      this.tokenData = await res.json();

      // Step 2: Connect to Gemini Live API WebSocket
      // Ephemeral tokens use access_token=, fallback (API key) uses key=
      const wsUrl = this.tokenData!.fallback
        ? `${this.tokenData!.websocket_url}?key=${this.tokenData!.token}`
        : `${this.tokenData!.websocket_url}?access_token=${this.tokenData!.token}`;

      console.log("🔗 Connecting to Gemini Live API...");
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = "arraybuffer"; // Ensure binary data is ArrayBuffer, not Blob
      this.ws.onopen = () => this.onWebSocketOpen();
      this.ws.onmessage = (event) => this.onWebSocketMessage(event);
      this.ws.onerror = (event) => this.onWebSocketError(event);
      this.ws.onclose = (event) => this.onWebSocketClose(event);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Connection failed";
      this.config.onError(msg);
    }
  }

  /**
   * WebSocket opened — send the setup config
   */
  private onWebSocketOpen(): void {
    if (!this.ws || !this.tokenData) return;

    // Send the BidiGenerateContentSetup config
    const setupMessage: Record<string, unknown> = {
      setup: {
        model: `models/${this.tokenData.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.tokenData.system_instruction }],
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            silenceDurationMs: 4000,
            prefixPaddingMs: 700,
          },
        },
      },
    };

    this.ws.send(JSON.stringify(setupMessage));
    console.log("📤 Setup config sent");
  }

  /**
   * Handle messages from Gemini
   */
  private onWebSocketMessage(event: MessageEvent): void {
    try {
      let text: string;
      if (typeof event.data === "string") {
        text = event.data;
      } else if (event.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(event.data);
      } else {
        // Blob fallback — shouldn't happen with binaryType='arraybuffer'
        console.warn("Unexpected message type:", typeof event.data);
        return;
      }

      const response = JSON.parse(text);

      // Handle setup complete
      if (response.setupComplete) {
        console.log("✅ Gemini Live session configured");
        this.isConnected = true;
        this.config.onConnectionChange(true);

        // Create the playback context eagerly so it's ready when audio arrives.
        // It may start in 'suspended' state (browser autoplay policy) — we
        // call resume() before the first audio chunk in playAudioChunk().
        this.playbackContext = new AudioContext({ sampleRate: 24000 });

        // Kick the model into greeting the candidate ~2 seconds after the
        // session is ready. If the AI starts speaking on its own first
        // (e.g., from mic audio), the timer is cancelled in the modelTurn
        // branch below.
        this.scheduleGreeting();
        return;
      }

      // Handle server content (audio and transcriptions)
      if (response.serverContent) {
        const serverContent = response.serverContent;

        // Audio data from the model
        if (serverContent.modelTurn?.parts) {
          // As soon as the model starts its next response, commit the
          // candidate's current utterance. Waiting for turnComplete can delay
          // the user bubble until after the AI finishes speaking.
          if (!this.isPlaying && this.userTranscriptBuffer.trim()) {
            const userText = this.userTranscriptBuffer.trim();
            this.userTranscriptBuffer = "";
            this.config.onTranscriptUpdate("user", userText, true);
          }

          // The model has started speaking — cancel any pending greeting
          // nudge so we don't double-trigger.
          this.aiHasSpokenThisSession = true;
          if (this.greetingTimer !== null) {
            clearTimeout(this.greetingTimer);
            this.greetingTimer = null;
          }
          for (const part of serverContent.modelTurn.parts) {
            if (part.inlineData) {
              this.playAudioChunk(part.inlineData.data);
            }
          }
        }

        // Input transcription (what the user said). The UI doesn't render
        // interim text, but it DOES use the interim ping as a "user is
        // currently speaking" signal to drive the typing indicator. Final
        // text is committed on turnComplete / interrupted.
        if (serverContent.inputTranscription?.text) {
          const chunk = serverContent.inputTranscription.text;
          this.userTranscriptBuffer += chunk;
          this.config.onTranscriptUpdate("user", this.userTranscriptBuffer, false);
        }

        // Output transcription (what the AI said) — accumulate silently;
        // flushed as one final message on turnComplete / interrupted. The
        // AI's typing indicator is driven separately by audio playback state.
        if (serverContent.outputTranscription?.text) {
          this.aiTranscriptBuffer += serverContent.outputTranscription.text;
        }

        // Handle interruption (user started speaking while AI is talking)
        if (serverContent.interrupted) {
          this.stopPlayback();
          // Flush the AI buffer as-is since it was interrupted
          if (this.aiTranscriptBuffer.trim()) {
            this.config.onTranscriptUpdate("interviewer", this.aiTranscriptBuffer.trim(), true);
            this.aiTranscriptBuffer = "";
          }
        }

        // Turn complete — flush the accumulated transcript as one paragraph
        if (serverContent.turnComplete) {
          // Flush User's text FIRST
          if (this.userTranscriptBuffer.trim()) {
            const userText = this.userTranscriptBuffer.trim();
            this.userTranscriptBuffer = "";
            this.config.onTranscriptUpdate("user", userText, true);
          }
          // Flush AI's text SECOND
          if (this.aiTranscriptBuffer.trim()) {
            this.config.onTranscriptUpdate("interviewer", this.aiTranscriptBuffer.trim(), true);
            this.aiTranscriptBuffer = "";
          }
          this.config.onAudioStateChange(false);
          // Restart the silence countdown after every completed turn so Sarah
          // checks in if the candidate goes quiet for too long.
          this.scheduleSilenceNudge();
        }
      }
    } catch (error) {
      console.error("Error processing Gemini message:", error);
    }
  }

  private onWebSocketError(event: Event): void {
    console.error("WebSocket error:", event);
    this.config.onError("WebSocket connection error");
  }

  private onWebSocketClose(event: CloseEvent): void {
    this.isConnected = false;
    this.config.onConnectionChange(false);
    console.log(
      `🔌 Gemini Live API disconnected (code: ${event.code}, reason: ${event.reason})`
    );
    if (event.code !== 1000) {
      this.config.onError(
        `Connection closed: ${event.reason || `code ${event.code}`}`
      );
    }
  }

  /**
   * Schedule a one-shot greeting trigger ~2s after the session is set up.
   * If the model has already started speaking by then (e.g., responding to
   * mic audio), this is a no-op.
   */
  private scheduleGreeting(): void {
    if (this.greetingTimer !== null) return;
    this.greetingTimer = setTimeout(() => {
      this.greetingTimer = null;
      if (this.aiHasSpokenThisSession) return;
      this.triggerGreeting();
    }, GeminiLiveClient.GREETING_DELAY_MS);
  }

  /**
   * Send a tiny clientContent nudge that asks the model to begin. The system
   * instruction already tells the model exactly how to greet, so this is just
   * the "go" signal. Sent as a user-role text turn because that's the only
   * role Gemini Live's clientContent accepts; it's not visible in any
   * transcription stream so it stays invisible to the candidate.
   */
  private triggerGreeting(): void {
    if (!this.ws || !this.isConnected || this.aiHasSpokenThisSession) return;
    console.log("👋 Triggering 2s greeting kickoff");
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: "Please begin the interview now. Greet me warmly and ask your first question.",
                },
              ],
            },
          ],
          turnComplete: true,
        },
      }),
    );
  }

  /**
   * Start capturing microphone audio and streaming to Gemini
   */
  async startMicrophone(): Promise<void> {
    if (this.isMicActive) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(
        this.mediaStream
      );

      // Use ScriptProcessorNode to capture raw PCM data
      // Buffer size of 4096 gives us ~256ms chunks at 16kHz
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        4096,
        1,
        1
      );

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isConnected || !this.ws || !this.isMicActive) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // ── Local VAD ──────────────────────────────────────────────────
        // Compute root-mean-square (RMS) energy of this 4096-sample frame.
        // RMS is a clean proxy for "loudness" that ignores phase and DC
        // offset, which makes it more robust than simple peak detection
        // for telling speech apart from steady background noise.
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);

        const now = performance.now();
        const isAiTalking = this.isPlaying;
        const inAiStartGrace =
          isAiTalking &&
          now - this.playbackStartedAt < GeminiLiveClient.BARGE_IN_GRACE_MS;
        const inTailGate =
          !isAiTalking &&
          this.playbackEndedAt > 0 &&
          now - this.playbackEndedAt < GeminiLiveClient.POST_PLAYBACK_GATE_MS;

        // Use a stricter VAD when the AI is making sound (or just stopped),
        // because the speaker→mic bleed adds energy that would otherwise
        // false-positive the speech detector.
        const threshold =
          isAiTalking || inTailGate
            ? GeminiLiveClient.VAD_BARGE_IN_THRESHOLD
            : GeminiLiveClient.VAD_SPEECH_THRESHOLD;
        const minFrames = isAiTalking
          ? GeminiLiveClient.VAD_MIN_BARGE_IN_FRAMES
          : GeminiLiveClient.VAD_MIN_CONSECUTIVE_FRAMES;

        if (rms > threshold) {
          this.vadConsecutiveLoudFrames++;
        } else {
          // Quiet frame — reset the streak. Background noise (room tone,
          // hum, distant chatter, typing) lives below the threshold so it
          // never accumulates here.
          this.vadConsecutiveLoudFrames = 0;
        }

        // Local speaking heartbeat for the UI's "You..." indicator.
        // This is independent of Gemini's inputTranscription cadence, which
        // can be sparse on some turns/devices.
        if (!isAiTalking && this.vadConsecutiveLoudFrames >= minFrames) {
          const nowMs = Math.floor(now);
          if (
            nowMs - this.lastUserSpeechSignalAt >=
            GeminiLiveClient.USER_SPEECH_SIGNAL_INTERVAL_MS
          ) {
            this.lastUserSpeechSignalAt = nowMs;
            this.config.onTranscriptUpdate("user", this.userTranscriptBuffer, false);
          }
        }

        // Local barge-in: if we've heard the user *sustainably* (multiple
        // consecutive loud frames) while the AI is currently talking,
        // stop playback right now instead of waiting for Gemini's
        // server-side `interrupted` event to round-trip back to us.
        // Skip barge-in for the first ~500ms of AI playback so the AI's
        // own audio bleeding through the speakers can't cancel itself.
        if (
          isAiTalking &&
          !inAiStartGrace &&
          this.vadConsecutiveLoudFrames >= minFrames
        ) {
          console.log("🛑 Local barge-in (user is speaking)");
          this.stopPlayback();
          // Continue to the gate check below — the gate is now open
          // because stopPlayback flipped isPlaying off.
        }

        // ── CRITICAL: AUDIO GATE ──────────────────────────────────────
        // While the AI is playing — and for a short tail window after it
        // stops — DO NOT forward mic frames to Gemini. The browser's
        // echoCancellation flag in getUserMedia doesn't reliably suppress
        // audio played through the Web Audio API graph (it was designed
        // for HTMLAudioElement / WebRTC playback), so the AI's own voice
        // bleeds back into the mic. Without this gate, Gemini transcribes
        // the AI's voice as the candidate, gets confused about whose turn
        // it is, and the AI ends up "talking to itself" instead of
        // waiting for an answer.
        if (this.isPlaying || inTailGate) {
          return;
        }

        // iOS Safari (and some Androids) silently ignore the sampleRate
        // hints in getUserMedia / AudioContext, returning audio at the
        // device's native rate (typically 48000 Hz). Gemini Live expects
        // 16 kHz exactly, so we resample whenever the actual rate differs.
        const actualRate = this.audioContext!.sampleRate;
        const resampled =
          actualRate === 16000
            ? inputData
            : this.downsampleTo16k(inputData, actualRate);

        // Convert Float32 to Int16 PCM
        const pcmData = this.float32ToInt16(resampled);

        // Encode to base64
        const base64Data = this.arrayBufferToBase64(pcmData.buffer as ArrayBuffer);

        // Send to Gemini using the new format: realtimeInput.audio
        const message = {
          realtimeInput: {
            audio: {
              data: base64Data,
              mimeType: "audio/pcm;rate=16000",
            },
          },
        };

        try {
          this.ws.send(JSON.stringify(message));
        } catch {
          // Connection might have closed
        }
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      this.isMicActive = true;

      // Resume the playback context — works here because startMicrophone is
      // sometimes triggered directly from a user-gesture (mic toggle button).
      if (this.playbackContext?.state === "suspended") {
        this.playbackContext.resume().catch(() => {});
      }

      // On the very first mic start, send a silent system cue so Sarah
      // delivers her opening greeting immediately rather than waiting for
      // the user to speak first.
      if (!this.hasOpenedConversation) {
        this.hasOpenedConversation = true;
        setTimeout(() => {
          if (this.isConnected && this.isMicActive) {
            this.sendText(
              "[INTERVIEW_START] The candidate has just joined and their mic is live. As Sarah, warmly greet them now and ask them to briefly introduce themselves. Start speaking immediately."
            );
          }
        }, 600);
      }

      console.log("🎤 Microphone streaming started");
    } catch (error) {
      console.error("Microphone error:", error);
      this.config.onError("Could not access microphone");
    }
  }

  /**
   * Stop microphone capture
   */
  stopMicrophone(): void {
    this.isMicActive = false;
    this.clearSilenceNudge();

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    console.log("🔇 Microphone stopped");
  }

  /**
   * Toggle microphone on/off
   */
  toggleMicrophone(): boolean {
    if (this.isMicActive) {
      this.stopMicrophone();
    } else {
      this.startMicrophone();
    }
    return this.isMicActive;
  }

  /**
   * Send a text message to Gemini via realtimeInput.text
   * (the official approach for the Live API)
   */
  sendText(text: string): void {
    if (!this.ws || !this.isConnected) return;

    const message = {
      clientContent: {
        turns: [
          {
            role: "user",
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send code context to the AI interviewer
   */
  sendCodeSnapshot(language: string, code: string): void {
    if (!this.ws || !this.isConnected) return;

    this.sendText(
      `[CODE_UPDATE] The candidate's current code (${language}):\n\`\`\`${language}\n${code}\n\`\`\``
    );
  }

  /**
   * Play audio chunk received from Gemini (base64 encoded 24kHz PCM).
   * Uses sequential scheduling so chunks play one after another,
   * not all at once.
   */
  private playAudioChunk(base64Data: string): void {
    if (!this.playbackContext) return;

    // Browser autoplay policy may have left the context suspended (no user
    // gesture at creation time).  Resume it before scheduling audio so the
    // first response from Sarah actually plays.  Reset the schedule clock so
    // chunks don't pile up at t=0 after a late resume.
    if (this.playbackContext.state === "suspended") {
      this.playbackContext.resume().catch(() => {});
      this.nextPlayTime = 0;
    }

    try {
      // Decode base64 to raw bytes
      const rawBytes = atob(base64Data);
      const byteArray = new Uint8Array(rawBytes.length);
      for (let i = 0; i < rawBytes.length; i++) {
        byteArray[i] = rawBytes.charCodeAt(i);
      }

      // Convert Int16 PCM to Float32 for Web Audio API
      const int16Array = new Int16Array(byteArray.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      // Create an AudioBuffer
      const audioBuffer = this.playbackContext.createBuffer(
        1,
        float32Array.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.playbackContext.destination);

      // Schedule this chunk to play AFTER the previous one ends
      const now = this.playbackContext.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      source.start(startTime);

      // Update nextPlayTime to be after this chunk finishes
      this.nextPlayTime = startTime + audioBuffer.duration;

      // Track active sources for barge-in cancellation
      this.activeSources.push(source);
      source.onended = () => {
        this.activeSources = this.activeSources.filter((s) => s !== source);
        if (this.activeSources.length === 0) {
          this.isPlaying = false;
          this.playbackStartedAt = 0;
          // AI just finished its turn naturally. Start the tail-gate clock
          // so the next ~300ms of mic frames (which may still contain
          // speaker bleed-through) are NOT forwarded to Gemini.
          this.playbackEndedAt = performance.now();
        }
      };

      // Mark when AI playback began. Used by the VAD to honor a short grace
      // period before allowing barge-in (so the AI's own first words can't
      // cancel themselves through speaker→mic bleed).
      if (!this.isPlaying) {
        this.playbackStartedAt = performance.now();
        this.playbackEndedAt = 0; // not in tail-gate while actively playing
      }
      this.isPlaying = true;
      this.config.onAudioStateChange(true);
    } catch (error) {
      console.error("Audio playback error:", error);
    }
  }

  /**
   * Stop any currently playing audio (for barge-in).
   * Cancels all queued and playing audio sources.
   */
  private stopPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.activeSources = [];
    this.nextPlayTime = 0;
    this.isPlaying = false;
    this.playbackStartedAt = 0;
    // Barge-in: skip the tail gate. The user is talking right now, we want
    // their voice to flow to Gemini immediately rather than gating it.
    this.playbackEndedAt = 0;
    this.vadConsecutiveLoudFrames = 0;
    this.config.onAudioStateChange(false);
  }

  /**
   * Disconnect from Gemini Live API
   */
  disconnect(): void {
    this.clearSilenceNudge();
    this.stopMicrophone();
    this.stopPlayback();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.playbackContext) {
      this.playbackContext.close();
      this.playbackContext = null;
    }

    this.isConnected = false;
    this.config.onConnectionChange(false);
  }

  /**
   * Check if currently connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Check if mic is active
   */
  get micActive(): boolean {
    return this.isMicActive;
  }

  // ──────────── Utility Methods ────────────

  private float32ToInt16(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  /**
   * Linear-interpolation downsampler from `inputRate` Hz to 16000 Hz.
   *
   * iOS Safari (and a few Android setups) ignore the sampleRate hint we
   * pass to getUserMedia/AudioContext and deliver audio at the hardware's
   * native rate (usually 48000 Hz). Gemini Live's API strictly requires
   * 16 kHz mono PCM — sending 48 kHz audio mislabeled as 16 kHz makes the
   * server reject the stream with a generic "Operation not supported" 1008.
   *
   * Linear interpolation isn't audiophile-grade but it's plenty for speech,
   * adds zero dependencies, and runs comfortably on a phone CPU.
   */
  private downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
    if (inputRate === 16000) return input;
    const ratio = inputRate / 16000;
    const outputLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIdx = i * ratio;
      const idx = Math.floor(srcIdx);
      const frac = srcIdx - idx;
      const a = input[idx] || 0;
      const b = input[idx + 1] || a;
      output[i] = a * (1 - frac) + b * frac;
    }
    return output;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
