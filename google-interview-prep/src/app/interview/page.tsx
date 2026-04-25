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
  const [phase, setPhase] = useState<"behavioral" | "transitioning" | "coding">(
    interviewType === "coding" ? "coding" : "behavioral"
  );
  const [interimEntry, setInterimEntry] = useState<{ speaker: string; text: string } | null>(null);
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
        const sp = speaker === "user" ? "user" : "interviewer";
        if (!isFinal) {
          setInterimEntry({ speaker: sp, text });
          return;
        }
        setInterimEntry(null);
        const entry = { speaker: sp, text, timestamp: Date.now() };
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

  const fetchProblem = useCallback(async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const listRes = await fetch(`${backendUrl}/api/problems`);
      if (!listRes.ok) return;
      const list = await listRes.json();
      const filtered = list.filter((p: { difficulty: string }) => p.difficulty === difficulty);
      const pool = filtered.length ? filtered : list;
      const picked = pool[Math.floor(Math.random() * pool.length)];
      const fullRes = await fetch(`${backendUrl}/api/problems/${picked.id}`);
      if (!fullRes.ok) return;
      const full = await fullRes.json();
      setProblem(full);
      if (full.starterCode?.[selectedLanguage]) setCode(full.starterCode[selectedLanguage]);
    } catch (e) {
      console.error("Failed to fetch problem:", e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, selectedLanguage]);

  // Fetch problem immediately when starting in coding mode
  useEffect(() => {
    if (interviewType === "coding") fetchProblem();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTransitionToCoding = async () => {
    setPhase("transitioning");
    await fetchProblem();
    await new Promise((r) => setTimeout(r, 2000));
    setPhase("coding");
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
            <div className={styles.navLogoIcon}>G</div>
            Interview Prep
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
          {phase === "behavioral" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleTransitionToCoding}
              style={{ marginRight: "8px" }}
            >
              Move to Coding Round →
            </button>
          )}
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowEndModal(true)}
            id="end-interview-btn"
          >
            End Interview
          </button>
        </div>
      </nav>

      {/* ---------- Transition Overlay ---------- */}
      {phase === "transitioning" && (
        <div className={styles.transitionOverlay}>
          <div className={styles.transitionContent}>
            <div className="google-dots">
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
              <div className="dot"></div>
            </div>
            <p className={styles.transitionTitle}>Moving to Coding Round</p>
            <p className={styles.transitionSub}>Preparing your problem...</p>
          </div>
        </div>
      )}

      {/* ── Behavioral Phase — Video Call ── */}
      {phase === "behavioral" && (
        <div className={styles.behavioralRoom}>
          {/* Transcript Sidebar */}
          <aside className={styles.transcriptSidebar}>
            <div className={styles.transcriptHeader}>
              <span className={styles.transcriptDot} />
              Transcript
            </div>
            <div className={styles.transcriptFeed} ref={chatContainerRef}>
              {transcript.length === 0 && !interimEntry && (
                <p className={styles.transcriptEmpty}>Transcript will appear here as you speak...</p>
              )}
              {transcript.map((entry, i) => (
                <div key={i} className={styles.transcriptEntry}>
                  <span className={styles.transcriptSpeaker}>
                    {entry.speaker === "interviewer" ? "Sarah" : "You"}
                  </span>
                  <p className={styles.transcriptText}>{entry.text}</p>
                </div>
              ))}
              {interimEntry && (
                <div className={`${styles.transcriptEntry} ${styles.transcriptEntryLive}`}>
                  <span className={styles.transcriptSpeaker}>
                    {interimEntry.speaker === "interviewer" ? "Sarah" : "You"}
                  </span>
                  <p className={styles.transcriptText}>
                    {interimEntry.text}
                    <span className={styles.transcriptCursor} />
                  </p>
                </div>
              )}
            </div>
          </aside>

          {/* Video Stage */}
          <div className={styles.videoStage}>
            <div className={styles.videoTiles}>
              {/* AI Tile */}
              <div className={`${styles.videoTile} ${audioStatus === "speaking" ? styles.videoTileActive : ""}`}>
                <div className={styles.aiAvatarFull}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={isAvatarMouthOpen ? "/avatar-open.png" : "/avatar-closed.png"}
                    alt="AI Interviewer"
                    className={styles.aiAvatarFullImg}
                  />
                </div>
                <div className={styles.videoTileLabel}>
                  {audioStatus === "speaking" && <span className={styles.speakingIndicator} />}
                  Sarah · Interviewer
                </div>
              </div>

              {/* User Tile */}
              <div className={`${styles.videoTile} ${audioStatus === "listening" ? styles.videoTileActive : ""}`}>
                <video
                  ref={videoRef}
                  className={styles.videoTileStream}
                  autoPlay playsInline muted
                  style={{ display: isWebcamActive ? "block" : "none" }}
                />
                {!isWebcamActive && (
                  <div className={styles.videoTilePlaceholder}>
                    <span>📹</span>
                    <span>Camera off</span>
                  </div>
                )}
                <div className={styles.videoTileLabel}>
                  {audioStatus === "listening" && <span className={styles.speakingIndicator} />}
                  You
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className={styles.videoControls}>
              <button
                className={`${styles.controlBtn} ${!isMicActive ? styles.controlBtnMuted : ""}`}
                onClick={toggleMic}
                title={isMicActive ? "Mute microphone" : "Unmute microphone"}
              >
                {isMicActive ? "🎤" : "🔇"}
              </button>
              <div className={styles.audioStatusBadge}>
                {audioStatus === "listening" && "Listening..."}
                {audioStatus === "speaking" && "Sarah is speaking..."}
                {audioStatus === "idle" && (isMicActive ? "Mic ready" : "Muted")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Coding Phase — Reversed Layout ── */}
      {phase === "coding" && (
        <div className={styles.mainContent}>
          {/* Left: Stacked videos + transcript (mirror of behavioral) */}
          <div className={styles.codingLeftPanel}>
            <div className={styles.videoStack}>
              {/* AI tile */}
              <div className={`${styles.videoTileStacked} ${audioStatus === "speaking" ? styles.videoTileActive : ""}`}>
                <div className={styles.aiAvatarFull}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={isAvatarMouthOpen ? "/avatar-open.png" : "/avatar-closed.png"} alt="AI Interviewer" className={styles.aiAvatarFullImg} />
                </div>
                <div className={styles.videoTileLabel}>
                  {audioStatus === "speaking" && <span className={styles.speakingIndicator} />}
                  Sarah · Interviewer
                </div>
              </div>
              {/* User tile */}
              <div className={`${styles.videoTileStacked} ${audioStatus === "listening" ? styles.videoTileActive : ""}`}>
                <video ref={videoRef} className={styles.videoTileStream} autoPlay playsInline muted style={{ display: isWebcamActive ? "block" : "none" }} />
                {!isWebcamActive && (
                  <div className={styles.videoTilePlaceholder}><span>📹</span><span>Camera off</span></div>
                )}
                <div className={styles.videoTileLabel}>
                  {audioStatus === "listening" && <span className={styles.speakingIndicator} />}
                  You
                </div>
              </div>
            </div>

            {/* Transcript */}
            <div className={styles.codingTranscript}>
              <div className={styles.transcriptHeader}>
                <span className={styles.transcriptDot} />
                Transcript
              </div>
              <div className={styles.transcriptFeed} ref={chatContainerRef}>
                {transcript.length === 0 && !interimEntry && (
                  <p className={styles.transcriptEmpty}>Transcript will appear here as you speak...</p>
                )}
                {transcript.map((entry, i) => (
                  <div key={i} className={styles.transcriptEntry}>
                    <span className={styles.transcriptSpeaker}>{entry.speaker === "interviewer" ? "Sarah" : "You"}</span>
                    <p className={styles.transcriptText}>{entry.text}</p>
                  </div>
                ))}
                {interimEntry && (
                  <div className={`${styles.transcriptEntry} ${styles.transcriptEntryLive}`}>
                    <span className={styles.transcriptSpeaker}>{interimEntry.speaker === "interviewer" ? "Sarah" : "You"}</span>
                    <p className={styles.transcriptText}>{interimEntry.text}<span className={styles.transcriptCursor} /></p>
                  </div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className={styles.codingControls}>
              <button className={`${styles.controlBtn} ${!isMicActive ? styles.controlBtnMuted : ""}`} onClick={toggleMic} title={isMicActive ? "Mute" : "Unmute"}>
                {isMicActive ? "🎤" : "🔇"}
              </button>
              <div className={styles.audioStatusBadge}>
                {audioStatus === "listening" && "Listening..."}
                {audioStatus === "speaking" && "Sarah is speaking..."}
                {audioStatus === "idle" && (isMicActive ? "Mic ready" : "Muted")}
              </div>
            </div>
          </div>

          {/* Right: IDE + problem */}
          <div className={styles.rightPanel}>
            {problem && (
              <div className={styles.problemBar}>
                <span className={styles.problemTitle}>{problem.title}</span>
                <span className={`${styles.problemDifficulty} ${styles.difficultyMedium}`}>{problem.difficulty}</span>
              </div>
            )}
            <div className={styles.editorSection}>
              <div className={styles.editorToolbar}>
                <div className={styles.editorToolbarLeft}>
                  <select className="select" value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} id="editor-language-select">
                    {Object.entries(LANGUAGE_DISPLAY).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                  </select>
                </div>
                <div className={styles.editorToolbarRight}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCode(DEFAULT_CODE[selectedLanguage] || "")}>↺ Reset</button>
                </div>
              </div>
              <div className={styles.editorWrapper}>
                <Editor
                  height="100%"
                  language={LANGUAGE_MAP[selectedLanguage] || "python"}
                  value={code}
                  onChange={(value) => setCode(value || "")}
                  theme="vs-dark"
                  options={{ fontSize: 14, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", minimap: { enabled: false }, padding: { top: 16 }, scrollBeyondLastLine: false, wordWrap: "on", smoothScrolling: true, cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on", bracketPairColorization: { enabled: true }, lineNumbers: "on", renderLineHighlight: "all", tabSize: 4, autoClosingBrackets: "always", autoClosingQuotes: "always" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

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
            background: "var(--surface-ground)",
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
