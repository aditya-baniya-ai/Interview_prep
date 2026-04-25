"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import {
  WebSocketManager,
  WSMessage,
  TestResult,
  InterviewProblem,
} from "@/lib/websocket";
import { GeminiLiveClient } from "@/lib/gemini-live";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { FaangLogoCluster } from "@/components/FaangLogos";
import styles from "./interview.module.css";

// Dynamic import Monaco Editor (no SSR)
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  python: "python",
  javascript: "javascript",
  java: "java",
  cpp: "cpp",
};

const LANGUAGE_DISPLAY: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  java: "Java",
  cpp: "C++",
};

const DEFAULT_CODE: Record<string, string> = {
  python: '# Write your solution here\n\ndef solution():\n    pass\n',
  javascript:
    "// Write your solution here\n\nfunction solution() {\n  \n}\n",
  java: '// Write your solution here\n\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n',
  cpp: '// Write your solution here\n\n#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
};

function InterviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  // URL params
  const interviewType = searchParams.get("type") || "coding";
  const language = searchParams.get("language") || "python";
  const durationMinutes = parseInt(searchParams.get("duration") || "45");
  const sessionId = searchParams.get("sid") || "demo";
  const difficulty = searchParams.get("difficulty") || "Medium";

  // State
  const [code, setCode] = useState(DEFAULT_CODE[language] || DEFAULT_CODE.python);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [problem, setProblem] = useState<InterviewProblem | null>(null);
  const [timeLeft, setTimeLeft] = useState(durationMinutes * 60);
  const [isMicActive, setIsMicActive] = useState(true);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [audioStatus, setAudioStatus] = useState<
    "idle" | "listening" | "speaking"
  >("idle");
  const [showEndModal, setShowEndModal] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isAvatarMouthOpen, setIsAvatarMouthOpen] = useState(false);

  // Avatar speaking animation loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (audioStatus === "speaking") {
      interval = setInterval(() => {
        setIsAvatarMouthOpen((prev) => !prev);
      }, 150); // Toggle mouth image every 150ms for realistic speech effect
    } else {
      setIsAvatarMouthOpen(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [audioStatus]);

  // Refs
  const wsRef = useRef<WebSocketManager | null>(null);
  const geminiRef = useRef<GeminiLiveClient | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const codeSnapshotRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleEndInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // Initialize webcam
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsWebcamActive(true);
    } catch (error) {
      console.error("Webcam access denied:", error);
      setIsWebcamActive(false);
    }
  }, []);

  useEffect(() => {
    startWebcam();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startWebcam]);

  // Connect to Gemini Live API on mount
  useEffect(() => {
    // Guard against double-mount (React StrictMode / HMR)
    if (geminiRef.current) return;

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    
    const client = new GeminiLiveClient({
      backendUrl,
      interviewType: interviewType as "coding" | "behavioral",
      sessionId,
      difficulty,
      onTranscriptUpdate: (speaker, text, isFinal) => {
        if (!isFinal) return; // Only add complete messages
        const entry = {
          speaker: speaker === "user" ? "user" : "interviewer",
          text,
          timestamp: Date.now(),
        };
        setTranscript((prev) => [...prev, entry]);
        transcriptRef.current = [...transcriptRef.current, entry];
      },
      onAudioStateChange: (isPlaying) => {
        setAudioStatus(isPlaying ? "speaking" : (isMicActive ? "listening" : "idle"));
      },
      onConnectionChange: (connected) => {
        setConnectionStatus(connected ? "connected" : "disconnected");
        if (connected) {
          // Auto-start mic when connected
          client.startMicrophone();
          setIsMicActive(true);
          setAudioStatus("listening");
        }
      },
      onError: (error) => {
        console.error("Gemini Live error:", error);
        // Fallback to simulated welcome if backend is not running
        setTranscript([{
          speaker: "interviewer",
          text: `Hi ${user?.displayName?.split(" ")[0] || "there"}! Welcome to your ${interviewType} interview. I'm your AI interviewer today. (Note: Voice is offline — start the backend server to enable real-time voice.)`,
          timestamp: Date.now(),
        }]);
        setConnectionStatus("disconnected");
      },
    });

    geminiRef.current = client;
    setConnectionStatus("connecting");
    client.connect();

    return () => {
      client.disconnect();
      geminiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Code snapshot debounce — send code context to AI every 10s
  useEffect(() => {
    if (codeSnapshotRef.current) clearTimeout(codeSnapshotRef.current);
    codeSnapshotRef.current = setTimeout(() => {
      if (geminiRef.current?.connected) {
        geminiRef.current.sendCodeSnapshot(selectedLanguage, code);
      }
      if (wsRef.current) {
        wsRef.current.sendCodeSnapshot(selectedLanguage, code);
      }
    }, 10000);

    return () => {
      if (codeSnapshotRef.current) clearTimeout(codeSnapshotRef.current);
    };
  }, [code, selectedLanguage]);

  // Handlers
  const handleRunCode = () => {
    setIsRunningCode(true);
    // Simulated test results (will be replaced by Judge0)
    setTimeout(() => {
      setTestResults([
        {
          input: "[2, 7, 11, 15], target = 9",
          expected: "[0, 1]",
          actual: "[0, 1]",
          passed: true,
          time: "12ms",
          memory: "14.2 MB",
        },
        {
          input: "[3, 2, 4], target = 6",
          expected: "[1, 2]",
          actual: "[1, 2]",
          passed: true,
          time: "8ms",
          memory: "14.1 MB",
        },
        {
          input: "[3, 3], target = 6",
          expected: "[0, 1]",
          actual: "[]",
          passed: false,
          time: "10ms",
          memory: "14.0 MB",
        },
      ]);
      setIsRunningCode(false);
    }, 2000);
  };

  const handleEndInterview = async () => {
    setShowEndModal(false);
    setIsGeneratingFeedback(true);
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Disconnect Gemini
    if (geminiRef.current) {
      geminiRef.current.disconnect();
    }

    // Send transcript to backend and generate real feedback
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const res = await fetch(`${backendUrl}/api/interview/${sessionId}/generate-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_type: interviewType,
          transcript: transcriptRef.current,
          code: interviewType === "coding" ? code : undefined,
          language: interviewType === "coding" ? selectedLanguage : undefined,
          duration_minutes: durationMinutes,
          time_used_seconds: durationMinutes * 60 - timeLeft,
        }),
      });
        if (res.ok) {
        const feedback = await res.json();
        // Store in sessionStorage for fast immediate loading
        sessionStorage.setItem(`feedback_${sessionId}`, JSON.stringify(feedback));

        // Persist to Firestore
        if (user && db) {
          try {
            await setDoc(doc(db, "users", user.uid, "sessions", sessionId), {
              sessionId,
              interviewType,
              createdAt: new Date().toISOString(),
              durationMinutes,
              language: interviewType === "coding" ? selectedLanguage : null,
              code: interviewType === "coding" ? code : null,
              transcript: transcriptRef.current,
              feedback,
            });
          } catch (dbErr) {
            console.error("Failed to save session to Firestore:", dbErr);
          }
        }
      }
    } catch (err) {
      console.error("Failed to generate feedback:", err);
    }
    
    router.push(`/interview/feedback?sid=${sessionId}&type=${interviewType}`);
  };

  const toggleMic = () => {
    if (geminiRef.current) {
      if (isMicActive) {
        geminiRef.current.stopMicrophone();
        setIsMicActive(false);
        setAudioStatus("idle");
      } else {
        geminiRef.current.startMicrophone();
        setIsMicActive(true);
        setAudioStatus("listening");
      }
    } else {
      setIsMicActive(!isMicActive);
      setAudioStatus(isMicActive ? "idle" : "listening");
    }
  };

  const handleLanguageChange = (newLang: string) => {
    setSelectedLanguage(newLang);
    setCode(DEFAULT_CODE[newLang] || DEFAULT_CODE.python);
  };

  // Loading states
  if (isGeneratingFeedback) {
    return (
      <div className={styles.feedbackGenerating}>
        <div className="google-dots">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
        <p className={styles.feedbackGeneratingText}>
          Generating Your Feedback Report
        </p>
        <p className={styles.feedbackGeneratingSub}>
          Analyzing code quality, communication, and overall performance...
        </p>
      </div>
    );
  }

  const passedTests = testResults.filter((t) => t.passed).length;
  const totalTests = testResults.length;

  return (
    <div className={styles.interviewRoom}>
      {/* ---------- Top Navbar ---------- */}
      <nav className={styles.interviewNav} id="interview-nav">
        <div className={styles.navLeft}>
          <div className={styles.navLogo}>
            <FaangLogoCluster forceDark />
          </div>
          <span className={styles.interviewType}>
            {interviewType === "coding" ? "💻 Coding" : "🗣️ Behavioral"}
          </span>
        </div>

        <div className={styles.navCenter}>
          <div
            className={`${styles.timer} ${timeLeft <= 300 ? styles.timerWarning : ""}`}
          >
            <span className={styles.timerIcon}>⏱️</span>
            {formatTime(timeLeft)}
          </div>
          <div className={styles.connectionStatus}>
            <span
              className={`${styles.statusDot} ${
                connectionStatus === "connected"
                  ? styles.statusDotConnected
                  : connectionStatus === "connecting"
                    ? styles.statusDotConnecting
                    : styles.statusDotDisconnected
              }`}
            ></span>
            {connectionStatus === "connected"
              ? "Connected"
              : connectionStatus === "connecting"
                ? "Connecting..."
                : "Disconnected"}
          </div>
        </div>

        <div className={styles.navRight}>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowEndModal(true)}
            id="end-interview-btn"
          >
            End Interview
          </button>
        </div>
      </nav>

      {/* ---------- Main Split Layout ---------- */}
      <div className={styles.mainContent}>
        {/* Left Panel: Webcam + Chat */}
        <div className={styles.leftPanel}>
          {/* Video Feeds — Side by Side */}
          <div className={styles.webcamSection}>
            <div className={styles.videoFeeds}>
              {/* AI Avatar */}
              <div className={styles.webcamContainer}>
                <div className={styles.aiAvatar}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={isAvatarMouthOpen ? "/avatar-open.png" : "/avatar-closed.png"} 
                    alt="AI Interviewer" 
                    className={`${styles.aiAvatarImage} ${audioStatus === "speaking" ? styles.aiAvatarSpeakingPulse : ""}`}
                  />
                  <span className={styles.aiAvatarLabel}>
                    {audioStatus === "speaking" ? "Speaking..." : "Sarah (Interviewer)"}
                  </span>
                </div>
                <div className={styles.webcamOverlay}>
                  <span className={styles.webcamBadge}>🤖 AI</span>
                </div>
              </div>

              {/* User Webcam */}
              <div className={styles.webcamContainer}>
                <video
                  ref={videoRef}
                  className={styles.webcamVideo}
                  autoPlay
                  playsInline
                  muted
                  style={{ display: isWebcamActive ? "block" : "none" }}
                />
                
                {isWebcamActive ? (
                  <div className={styles.webcamOverlay}>
                    <span className={styles.webcamBadge}>
                      <span className={styles.liveDot}></span>
                      YOU
                    </span>
                  </div>
                ) : (
                  <div className={styles.webcamPlaceholder}>
                    <span className={styles.webcamPlaceholderIcon}>📹</span>
                    <span>Camera off</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Audio Controls */}
          <div className={styles.audioControls}>
            <button
              className={`${styles.micBtn} ${isMicActive ? styles.micBtnActive : styles.micBtnMuted}`}
              onClick={toggleMic}
              id="mic-toggle"
              title={isMicActive ? "Mute microphone" : "Unmute microphone"}
            >
              {isMicActive ? "🎤" : "🔇"}
            </button>
            <div
              className={`${styles.audioStatus} ${
                audioStatus === "listening"
                  ? styles.audioStatusListening
                  : audioStatus === "speaking"
                    ? styles.audioStatusSpeaking
                    : ""
              }`}
            >
              {audioStatus === "listening" && (
                <>
                  <div className="waveform">
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                  </div>
                  Listening...
                </>
              )}
              {audioStatus === "speaking" && "AI is speaking..."}
              {audioStatus === "idle" && (isMicActive ? "Mic ready" : "Mic muted")}
            </div>
          </div>

          {/* Chat Transcript */}
          <div className={styles.chatSection}>
            <div className={styles.chatHeader}>💬 Conversation</div>
            <div className={styles.chatMessages} ref={chatContainerRef}>
              {transcript.length === 0 ? (
                <div className={styles.chatEmpty}>
                  <span className={styles.chatEmptyIcon}>💬</span>
                  Waiting for connection...
                </div>
              ) : (
                transcript.map((entry, i) => (
                  <div className={styles.chatMessage} key={i}>
                    <div
                      className={`${styles.chatAvatar} ${
                        entry.speaker === "interviewer"
                          ? styles.chatAvatarInterviewer
                          : styles.chatAvatarUser
                      }`}
                    >
                      {entry.speaker === "interviewer" ? "AI" : "U"}
                    </div>
                    <div className={styles.chatBubble}>
                      <div className={styles.chatSpeaker}>
                        {entry.speaker === "interviewer"
                          ? "Interviewer"
                          : "You"}
                      </div>
                      <div className={styles.chatText}>{entry.text}</div>
                      <div className={styles.chatTime}>
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Editor + Tests */}
        <div className={styles.rightPanel}>
          {/* Problem Bar */}
          {problem && (
            <div className={styles.problemBar}>
              <span className={styles.problemTitle}>{problem.title}</span>
              <span
                className={`${styles.problemDifficulty} ${styles.difficultyMedium}`}
              >
                {problem.difficulty}
              </span>
            </div>
          )}

          {/* Editor */}
          <div className={styles.editorSection}>
            <div className={styles.editorToolbar}>
              <div className={styles.editorToolbarLeft}>
                <select
                  className="select"
                  value={selectedLanguage}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  id="editor-language-select"
                >
                  {Object.entries(LANGUAGE_DISPLAY).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.editorToolbarRight}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setCode(DEFAULT_CODE[selectedLanguage] || "")
                  }
                >
                  ↺ Reset
                </button>
              </div>
            </div>
            <div className={styles.editorWrapper}>
              <Editor
                height="100%"
                language={LANGUAGE_MAP[selectedLanguage] || "python"}
                value={code}
                onChange={(value) => setCode(value || "")}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  minimap: { enabled: false },
                  padding: { top: 16 },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  cursorSmoothCaretAnimation: "on",
                  bracketPairColorization: { enabled: true },
                  lineNumbers: "on",
                  renderLineHighlight: "all",
                  tabSize: 4,
                  autoClosingBrackets: "always",
                  autoClosingQuotes: "always",
                }}
              />
            </div>
          </div>


        </div>
      </div>

      {/* ---------- End Interview Modal ---------- */}
      {showEndModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowEndModal(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalIcon}>⏹️</div>
            <h2 className={styles.modalTitle}>End Interview?</h2>
            <p className={styles.modalDesc}>
              Your interview will be ended and a feedback report will be
              generated based on your performance so far.
            </p>
            <div className={styles.modalActions}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowEndModal(false)}
              >
                Continue Interview
              </button>
              <button className="btn btn-danger" onClick={handleEndInterview}>
                End & Get Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#202124",
          }}
        >
          <div className="google-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
          </div>
        </div>
      }
    >
      <InterviewContent />
    </Suspense>
  );
}
