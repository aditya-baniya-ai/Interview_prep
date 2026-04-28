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

export interface GeminiLiveConfig {
  backendUrl: string;
  interviewType: "coding" | "behavioral";
  sessionId?: string;
  difficulty?: string;
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
            silenceDurationMs: 4000,   // needs 4s of silence before turn ends
            prefixPaddingMs: 700,      // needs 0.7s of speech before triggering
            endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
            startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
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

        // Initialize playback audio context
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

        // Input transcription (what the user said) — accumulate + stream interim
        if (serverContent.inputTranscription?.text) {
          const chunk = serverContent.inputTranscription.text;
          // Discard chunks with non-Latin characters — Gemini hallucinating from noise
          if (/[^\x00-\x7F]/.test(chunk)) {
            this.userTranscriptBuffer = "";
            return;
          }
          this.userTranscriptBuffer += chunk;
          this.config.onTranscriptUpdate("user", this.userTranscriptBuffer, false);
        }

        // Output transcription (what the AI said) — accumulate + stream interim
        if (serverContent.outputTranscription?.text) {
          this.aiTranscriptBuffer += serverContent.outputTranscription.text;
          this.config.onTranscriptUpdate("interviewer", this.aiTranscriptBuffer, false);
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
            // Only commit if it's clean English text
            if (!/[^\x00-\x7F]/.test(userText)) {
              this.config.onTranscriptUpdate("user", userText, true);
            }
          }
          // Flush AI's text SECOND
          if (this.aiTranscriptBuffer.trim()) {
            this.config.onTranscriptUpdate("interviewer", this.aiTranscriptBuffer.trim(), true);
            this.aiTranscriptBuffer = "";
          }
          this.config.onAudioStateChange(false);
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

        // Convert Float32 to Int16 PCM
        const pcmData = this.float32ToInt16(inputData);

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

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
