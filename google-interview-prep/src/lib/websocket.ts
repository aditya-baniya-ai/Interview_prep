const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export type WSMessageType =
  | "audio"
  | "code_snapshot"
  | "video_frame"
  | "run_code"
  | "end_interview"
  | "transcript"
  | "test_results"
  | "feedback"
  | "status"
  | "problem"
  | "error";

export interface WSMessage {
  type: WSMessageType;
  data?: string;
  language?: string;
  code?: string;
  speaker?: string;
  text?: string;
  results?: TestResult[];
  report?: FeedbackReport;
  message?: string;
  problem?: InterviewProblem;
}

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  time?: string;
  memory?: string;
}

export interface InterviewProblem {
  title: string;
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  difficulty: string;
  tags: string[];
  starterCode: Record<string, string>;
}

export interface FeedbackReport {
  overallDecision: string;
  overallScore: number;
  coding: {
    problemSolving: number;
    codeCorrectness: number;
    timeComplexity: string;
    optimalTimeComplexity: string;
    spaceComplexity: string;
    optimalSpaceComplexity: string;
    codeQuality: number;
    testCasesPassed: number;
    totalTestCases: number;
  };
  communication: {
    clarity: number;
    approach: number;
    hintsUsed: number;
  };
  behavioral?: {
    starFramework: number;
    depth: number;
    relevance: number;
  };
  engagement: {
    eyeContact: number;
    confidence: number;
  };
  recommendations: string[];
  transcript: { speaker: string; text: string; timestamp: number }[];
}

type MessageHandler = (message: WSMessage) => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Map<WSMessageType, MessageHandler[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private sessionId: string;
  private isConnected = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${BACKEND_URL.replace("http", "ws")}/ws/interview/${this.sessionId}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log("[WS] Connected to interview session");
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          // Check if it's binary (audio)
          if (event.data instanceof Blob) {
            this.emit({ type: "audio", data: "" });
            // Handle binary audio separately
            event.data.arrayBuffer().then((buffer) => {
              const base64 = btoa(
                String.fromCharCode(...new Uint8Array(buffer))
              );
              this.emit({ type: "audio", data: base64 });
            });
            return;
          }

          const message: WSMessage = JSON.parse(event.data);
          this.emit(message);
        } catch (error) {
          console.error("[WS] Failed to parse message:", error);
        }
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        console.log("[WS] Connection closed:", event.code, event.reason);

        if (
          event.code !== 1000 &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          console.log(`[WS] Reconnecting in ${delay}ms...`);
          setTimeout(() => this.connect(), delay);
        }
      };

      this.ws.onerror = (error) => {
        console.error("[WS] Error:", error);
        reject(error);
      };
    });
  }

  on(type: WSMessageType, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: WSMessageType, handler: MessageHandler) {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
    }
  }

  private emit(message: WSMessage) {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
  }

  send(message: WSMessage) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendAudio(audioData: ArrayBuffer) {
    if (this.ws && this.isConnected) {
      this.ws.send(audioData);
    }
  }

  sendCodeSnapshot(language: string, code: string) {
    this.send({
      type: "code_snapshot",
      language,
      code,
    });
  }

  sendVideoFrame(base64Jpeg: string) {
    this.send({
      type: "video_frame",
      data: base64Jpeg,
    });
  }

  runCode(language: string, code: string) {
    this.send({
      type: "run_code",
      language,
      code,
    });
  }

  endInterview() {
    this.send({ type: "end_interview" });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, "Client disconnected");
      this.ws = null;
    }
  }

  getIsConnected() {
    return this.isConnected;
  }
}
