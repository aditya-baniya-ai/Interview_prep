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
  // Silence detection — nudges Sarah if no turn completes within the threshold
  private silenceNudgeTimer: ReturnType<typeof setTimeout> | null = null;
  private hasOpenedConversation = false;

  // Silence before a check-in: 22 s for coding (user may be typing), 14 s for behavioral
  private get silenceThresholdMs(): number {
    return this.config.interviewType === "coding" ? 22000 : 14000;
  }

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

        // Create the playback context eagerly so it's ready when audio arrives.
        // It may start in 'suspended' state (browser autoplay policy) — we
        // call resume() before the first audio chunk in playAudioChunk().
        this.playbackContext = new AudioContext({ sampleRate: 24000 });
        return;
      }

      // Handle server content (audio and transcriptions)
      if (response.serverContent) {
        const serverContent = response.serverContent;

        // Audio data from the model
        if (serverContent.modelTurn?.parts) {
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
        }
      };

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

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
