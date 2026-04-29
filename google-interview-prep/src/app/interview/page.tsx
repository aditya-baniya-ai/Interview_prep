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
import { GeminiLiveClient, type InterviewType } from "@/lib/gemini-live";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "@firebase/firestore";
import { NavBrand } from "@/components/NavBrand";
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
  python: 'class Solution():\n    pass\n',
  javascript: 'class Solution {}\n',
  java: 'class Solution {}\n',
  cpp: 'class Solution {};\n',
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
  // When coming from the practice questions grid, the exact problem slug is passed
  const problemId = searchParams.get("problemId");

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
  // We deliberately do NOT render in-flight (interim) transcription text.
  // The chat only shows finalized messages, dropped after each speaker
  // finishes their utterance — same shape as a real chat thread. See
  // onTranscriptUpdate and the same-speaker merge logic below.
  //
  // We DO surface a lightweight "Sarah…" / "You…" typing indicator while
  // the respective speaker is talking. AI activity is driven by audioStatus;
  // user activity is driven by the cadence of Gemini's interim
  // inputTranscription pings (see onTranscriptUpdate + the debounce timer).
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isAvatarMouthOpen, setIsAvatarMouthOpen] = useState(false);

  // Break + penalty tracking
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0);

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
  const breakTimerRef = useRef<NodeJS.Timeout | null>(null);
  const codeSnapshotRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  // Penalty accumulators — total time mic / camera were off OUTSIDE of breaks,
  // plus break stats. Sent to the feedback generator at the end of the interview.
  const isOnBreakRef = useRef<boolean>(false);
  const micOffStartRef = useRef<number | null>(null);
  const videoOffStartRef = useRef<number | null>(null);
  const micOffSecondsRef = useRef<number>(0);
  const videoOffSecondsRef = useRef<number>(0);
  const breakCountRef = useRef<number>(0);
  const totalBreakSecondsRef = useRef<number>(0);
  // Snapshot of mic/camera state at break start so we can restore it after.
  const preBreakMicRef = useRef<boolean>(true);
  const preBreakCamRef = useRef<boolean>(false);
  const breakStartedAtRef = useRef<number | null>(null);

  // Mirror of audioStatus, readable from any callback closure without
  // having to rebuild that closure on every state change.
  const audioStatusRef = useRef<"idle" | "listening" | "speaking">("idle");

  useEffect(() => {
    audioStatusRef.current = audioStatus;
  }, [audioStatus]);

  // Debounce timer that clears the "You…" typing indicator if no new
  // inputTranscription chunks have arrived for USER_SPEAKING_TIMEOUT_MS.
  const userSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Main interview timer — paused while the candidate is on break.
  useEffect(() => {
    if (isOnBreak) return; // freeze main timer during a break
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
  }, [isOnBreak]);

  // Break timer — only runs while on break.
  useEffect(() => {
    if (!isOnBreak) return;
    breakTimerRef.current = setInterval(() => {
      setBreakSecondsLeft((prev) => {
        if (prev <= 1) {
          // Auto-end break when timer hits zero
          endBreak();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (breakTimerRef.current) clearInterval(breakTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnBreak]);

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Auto-scroll chat — but ONLY when the user is already near the bottom of
  // the feed. If they've scrolled up to read earlier messages we leave the
  // scroll position alone so a new message doesn't yank them back down.
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const STICK_THRESHOLD_PX = 80;
    if (distanceFromBottom <= STICK_THRESHOLD_PX) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript, audioStatus, isUserSpeaking]);

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
      // Close out any pending "video-off" penalty interval, but only if we
      // weren't on a break (break time is tracked separately).
      if (videoOffStartRef.current !== null && !isOnBreakRef.current) {
        videoOffSecondsRef.current += Math.max(
          0,
          Math.floor((Date.now() - videoOffStartRef.current) / 1000)
        );
      }
      videoOffStartRef.current = null;
      setIsWebcamActive(true);
    } catch (error) {
      console.error("Webcam access denied:", error);
      setIsWebcamActive(false);
    }
  }, []);

  // Stop webcam — fully releases the camera so the OS-level "in use" indicator goes off.
  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (videoOffStartRef.current === null && !isOnBreakRef.current) {
      videoOffStartRef.current = Date.now();
    }
    setIsWebcamActive(false);
  }, []);

  const toggleWebcam = useCallback(() => {
    if (isWebcamActive) {
      stopWebcam();
    } else {
      startWebcam();
    }
  }, [isWebcamActive, startWebcam, stopWebcam]);

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
    
    const resumeText = typeof window !== "undefined"
      ? sessionStorage.getItem(`resume_${sessionId}`) ?? undefined
      : undefined;

    const client = new GeminiLiveClient({
      backendUrl,
      interviewType: interviewType as InterviewType,
      sessionId,
      difficulty,
      resumeText,
      onTranscriptUpdate: (speaker, text, isFinal) => {
        const sp = speaker === "user" ? "user" : "interviewer";

        // Interim updates: don't render text, but use them as a heartbeat
        // for the "You…" typing indicator (only the user side — the AI
        // indicator is driven by audioStatus, which is more reliable).
        if (!isFinal) {
          if (sp === "user") {
            setIsUserSpeaking(true);
            if (userSpeakingTimerRef.current) clearTimeout(userSpeakingTimerRef.current);
            // If no chunk arrives for ~1.4s assume the user paused/stopped.
            userSpeakingTimerRef.current = setTimeout(() => {
              setIsUserSpeaking(false);
              userSpeakingTimerRef.current = null;
            }, 1400);
          }
          return;
        }

        // Finalized message — commit it to the transcript. Note: we do NOT
        // gate user finals on audioStatus here. Gemini emits the user
        // final BEFORE its onAudioStateChange(false) on turnComplete, so
        // audioStatus could still read "speaking" at this exact moment;
        // gating would silently drop a legit message.
        if (sp === "user") {
          setIsUserSpeaking(false);
          if (userSpeakingTimerRef.current) {
            clearTimeout(userSpeakingTimerRef.current);
            userSpeakingTimerRef.current = null;
          }
        }
        const trimmed = text.trim();
        if (!trimmed) return;

        // Merge consecutive same-speaker finals into one bubble. Gemini Live
        // sometimes splits one logical utterance into multiple turns — a
        // brief pause, a false-positive barge-in, or its own pacing — and
        // we don't want each fragment to spawn a new bubble.
        const MERGE_WINDOW_MS = 8000;
        setTranscript((prev) => {
          const now = Date.now();
          const last = prev[prev.length - 1];
          let next: TranscriptEntry[];
          if (last && last.speaker === sp && now - last.timestamp < MERGE_WINDOW_MS) {
            next = [
              ...prev.slice(0, -1),
              { ...last, text: `${last.text} ${trimmed}`.replace(/\s+/g, " ").trim(), timestamp: now },
            ];
          } else {
            next = [...prev, { speaker: sp, text: trimmed, timestamp: now }];
          }
          transcriptRef.current = next;
          return next;
        });
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

  // (Removed) The local Web Speech API recognizer used to drive a "live"
  // bubble that updated as the candidate spoke. We now only show finalized
  // messages, so that recognizer + its lifecycle bookkeeping are gone.
  // Gemini Live's own inputTranscription is the sole source of user text.

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

      // If a specific problem was selected from the practice grid, load it directly
      if (problemId) {
        const res = await fetch(`${backendUrl}/api/problems/${problemId}`);
        if (res.ok) {
          const full = await res.json();
          setProblem(full);
          if (full.starterCode?.[selectedLanguage]) setCode(full.starterCode[selectedLanguage]);
          return;
        }
      }

      // Fallback: pick a random problem matching the selected difficulty
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
  }, [difficulty, selectedLanguage, problemId]);

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

  // Function declaration (hoisted) so the timer effect above can reference it
  // before the source-order definition.
  async function handleEndInterview() {
    setShowEndModal(false);
    setIsGeneratingFeedback(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (breakTimerRef.current) clearInterval(breakTimerRef.current);

    // Flush in-flight penalty timers so the totals we send are accurate.
    const now = Date.now();
    if (micOffStartRef.current !== null) {
      micOffSecondsRef.current += Math.max(
        0,
        Math.floor((now - micOffStartRef.current) / 1000)
      );
      micOffStartRef.current = null;
    }
    if (videoOffStartRef.current !== null) {
      videoOffSecondsRef.current += Math.max(
        0,
        Math.floor((now - videoOffStartRef.current) / 1000)
      );
      videoOffStartRef.current = null;
    }
    if (isOnBreakRef.current && breakStartedAtRef.current !== null) {
      totalBreakSecondsRef.current += Math.max(
        0,
        Math.floor((now - breakStartedAtRef.current) / 1000)
      );
      breakStartedAtRef.current = null;
      isOnBreakRef.current = false;
    }

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
          mic_off_seconds: micOffSecondsRef.current,
          video_off_seconds: videoOffSecondsRef.current,
          breaks_taken: breakCountRef.current,
          break_seconds_total: totalBreakSecondsRef.current,
        }),
      });
        if (res.ok) {
        const feedback = await res.json();
        // Store in sessionStorage for fast immediate loading
        sessionStorage.setItem(`feedback_${sessionId}`, JSON.stringify(feedback));

        // Persist to Firestore (Fire and forget so it never blocks routing)
        if (user && db) {
          setDoc(doc(db, "users", user.uid, "sessions", sessionId), {
            sessionId,
            interviewType,
            createdAt: new Date().toISOString(),
            durationMinutes,
            language: interviewType === "coding" ? selectedLanguage : null,
            code: interviewType === "coding" ? code : null,
            transcript: transcriptRef.current,
            feedback,
          }).catch((dbErr) => {
            console.error("Failed to save session to Firestore:", dbErr);
          });
        }
      }
    } catch (err) {
      console.error("Failed to generate feedback:", err);
    }
    
    router.push(`/interview/feedback?sid=${sessionId}&type=${interviewType}`);
  }

  const muteMic = useCallback(() => {
    if (geminiRef.current) geminiRef.current.stopMicrophone();
    if (micOffStartRef.current === null && !isOnBreakRef.current) {
      micOffStartRef.current = Date.now();
    }
    setIsMicActive(false);
    setAudioStatus("idle");
  }, []);

  const unmuteMic = useCallback(() => {
    if (geminiRef.current) geminiRef.current.startMicrophone();
    if (micOffStartRef.current !== null && !isOnBreakRef.current) {
      micOffSecondsRef.current += Math.max(
        0,
        Math.floor((Date.now() - micOffStartRef.current) / 1000)
      );
    }
    micOffStartRef.current = null;
    setIsMicActive(true);
    setAudioStatus("listening");
  }, []);

  const toggleMic = () => {
    if (isMicActive) muteMic();
    else unmuteMic();
  };

  // ── Break flow ──────────────────────────────────────────────────────────────
  // When a break starts: freeze main timer, mute mic, stop camera, remember
  // pre-break state. When it ends: restore mic/camera and resume the main timer.
  const startBreak = useCallback(
    (minutes: number) => {
      if (isOnBreak) return;
      preBreakMicRef.current = isMicActive;
      preBreakCamRef.current = isWebcamActive;
      // Stop accumulating mic-off / video-off penalty during the break
      // (the break itself has its own counter).
      if (micOffStartRef.current !== null) {
        micOffSecondsRef.current += Math.max(
          0,
          Math.floor((Date.now() - micOffStartRef.current) / 1000)
        );
        micOffStartRef.current = null;
      }
      if (videoOffStartRef.current !== null) {
        videoOffSecondsRef.current += Math.max(
          0,
          Math.floor((Date.now() - videoOffStartRef.current) / 1000)
        );
        videoOffStartRef.current = null;
      }
      isOnBreakRef.current = true;
      breakStartedAtRef.current = Date.now();
      setIsOnBreak(true);
      setBreakSecondsLeft(minutes * 60);
      setShowBreakModal(false);
      // Mute mic + stop camera for the duration of the break
      if (isMicActive) {
        if (geminiRef.current) geminiRef.current.stopMicrophone();
        setIsMicActive(false);
        setAudioStatus("idle");
      }
      if (isWebcamActive) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsWebcamActive(false);
      }
      breakCountRef.current += 1;
    },
    [isOnBreak, isMicActive, isWebcamActive]
  );

  // Resume from a break: flush the break-time counter, restore mic/camera, and
  // let the main timer effect tick again (driven by the isOnBreak state flip).
  // Function declaration (hoisted) so the break-timer effect above can call it.
  async function endBreak() {
    if (!isOnBreakRef.current) return;
    if (breakStartedAtRef.current !== null) {
      const consumed = Math.max(
        0,
        Math.floor((Date.now() - breakStartedAtRef.current) / 1000)
      );
      totalBreakSecondsRef.current += consumed;
      breakStartedAtRef.current = null;
    }
    isOnBreakRef.current = false;
    setIsOnBreak(false);
    setBreakSecondsLeft(0);
    if (breakTimerRef.current) {
      clearInterval(breakTimerRef.current);
      breakTimerRef.current = null;
    }
    // Restore pre-break mic/camera state
    if (preBreakMicRef.current) {
      unmuteMic();
    }
    if (preBreakCamRef.current) {
      await startWebcam();
    }
  }

  const handleLanguageChange = (newLang: string) => {
    setSelectedLanguage(newLang);
    setCode(DEFAULT_CODE[newLang] || DEFAULT_CODE.python);
  };

  const loadingSteps = [
    "Uploading secure transcript...",
    "Gemini 2.5 analyzing code architecture...",
    "Evaluating communication & behavioral cues...",
    "Compiling algorithmic complexity analysis...",
    "Generating actionable recommendations...",
    "Finalizing mock Google Hiring Decision...",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGeneratingFeedback) {
      interval = setInterval(() => {
        setLoadingStepIndex((prev) => Math.min(prev + 1, loadingSteps.length - 1));
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isGeneratingFeedback]);

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
          {loadingSteps[loadingStepIndex]}
        </p>
        <p className={styles.feedbackGeneratingSub}>
          This deep AI analysis usually takes 5-10 seconds.
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
            <NavBrand forceDark />
          </div>
          <span className={styles.interviewType}>
            {interviewType === "coding" ? "💻 Coding" :
             interviewType === "system-design" ? "🏗️ System Design" :
             interviewType === "data-analyst" ? "📊 Data Analyst" :
             interviewType === "resume-dive" ? "📄 Resume Deep Dive" :
             "🤝 Behavioral"}
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
          {phase === "behavioral" && interviewType === "behavioral" && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleTransitionToCoding}
              style={{ marginRight: "8px" }}
              suppressHydrationWarning
            >
              Move to Coding Round →
            </button>
          )}
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowEndModal(true)}
            id="end-interview-btn"
            suppressHydrationWarning
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
              {transcript.length === 0 && (
                <p className={styles.transcriptEmpty}>Transcript will appear here as you speak...</p>
              )}
              {transcript.map((entry, i) => (
                <div key={i} className={styles.transcriptEntry}>
                  <span className={`${styles.transcriptSpeaker} ${entry.speaker === "interviewer" ? styles.speakerAi : styles.speakerUser}`}>
                    {entry.speaker === "interviewer" ? "Sarah" : "You"}
                  </span>
                  <p className={`${styles.transcriptText} ${entry.speaker === "interviewer" ? styles.textAi : styles.textUser}`}>
                    {entry.text}
                  </p>
                </div>
              ))}
              {/* Live typing indicator: AI takes priority if both flags happen
                  to be true at the same moment (e.g., echo). */}
              {audioStatus === "speaking" ? (
                <div className={`${styles.transcriptEntry} ${styles.transcriptEntryTyping}`}>
                  <span className={`${styles.transcriptSpeaker} ${styles.speakerAi}`}>Sarah</span>
                  <p className={`${styles.transcriptText} ${styles.textAi} ${styles.typingText}`}>
                    <span className={styles.typingDots}>
                      <span /><span /><span />
                    </span>
                  </p>
                </div>
              ) : isUserSpeaking ? (
                <div className={`${styles.transcriptEntry} ${styles.transcriptEntryTyping}`}>
                  <span className={`${styles.transcriptSpeaker} ${styles.speakerUser}`}>You</span>
                  <p className={`${styles.transcriptText} ${styles.textUser} ${styles.typingText}`}>
                    <span className={styles.typingDots}>
                      <span /><span /><span />
                    </span>
                  </p>
                </div>
              ) : null}
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
                suppressHydrationWarning
              >
                {isMicActive ? "🎤" : "🔇"}
              </button>
              <button
                className={`${styles.controlBtn} ${!isWebcamActive ? styles.controlBtnMuted : ""}`}
                onClick={toggleWebcam}
                title={isWebcamActive ? "Stop camera" : "Start camera"}
                suppressHydrationWarning
              >
                {isWebcamActive ? "📷" : "📵"}
              </button>
              <button
                className={styles.breakBtn}
                onClick={() => setShowBreakModal(true)}
                title="Take a short break (counts against your feedback score)"
                suppressHydrationWarning
              >
                ☕ Take a break
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
                {transcript.length === 0 && (
                  <p className={styles.transcriptEmpty}>Transcript will appear here as you speak...</p>
                )}
                {transcript.map((entry, i) => (
                  <div key={i} className={styles.transcriptEntry}>
                    <span className={`${styles.transcriptSpeaker} ${entry.speaker === "interviewer" ? styles.speakerAi : styles.speakerUser}`}>
                      {entry.speaker === "interviewer" ? "Sarah" : "You"}
                    </span>
                    <p className={`${styles.transcriptText} ${entry.speaker === "interviewer" ? styles.textAi : styles.textUser}`}>
                      {entry.text}
                    </p>
                  </div>
                ))}
                {audioStatus === "speaking" ? (
                  <div className={`${styles.transcriptEntry} ${styles.transcriptEntryTyping}`}>
                    <span className={`${styles.transcriptSpeaker} ${styles.speakerAi}`}>Sarah</span>
                    <p className={`${styles.transcriptText} ${styles.textAi} ${styles.typingText}`}>
                      <span className={styles.typingDots}>
                        <span /><span /><span />
                      </span>
                    </p>
                  </div>
                ) : isUserSpeaking ? (
                  <div className={`${styles.transcriptEntry} ${styles.transcriptEntryTyping}`}>
                    <span className={`${styles.transcriptSpeaker} ${styles.speakerUser}`}>You</span>
                    <p className={`${styles.transcriptText} ${styles.textUser} ${styles.typingText}`}>
                      <span className={styles.typingDots}>
                        <span /><span /><span />
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Controls */}
            <div className={styles.codingControls}>
              <button className={`${styles.controlBtn} ${!isMicActive ? styles.controlBtnMuted : ""}`} onClick={toggleMic} title={isMicActive ? "Mute" : "Unmute"} suppressHydrationWarning>
                {isMicActive ? "🎤" : "🔇"}
              </button>
              <button
                className={`${styles.controlBtn} ${!isWebcamActive ? styles.controlBtnMuted : ""}`}
                onClick={toggleWebcam}
                title={isWebcamActive ? "Stop camera" : "Start camera"}
                suppressHydrationWarning
              >
                {isWebcamActive ? "📷" : "📵"}
              </button>
              <button
                className={`${styles.breakBtn} ${styles.breakBtnCompact}`}
                onClick={() => setShowBreakModal(true)}
                title="Take a short break (counts against your feedback score)"
                suppressHydrationWarning
              >
                ☕ Break
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
            <div className={styles.editorSection}>
              <div className={styles.editorToolbar}>
                <div className={styles.editorToolbarLeft}>
                  <select className="select" value={selectedLanguage} onChange={(e) => handleLanguageChange(e.target.value)} id="editor-language-select" suppressHydrationWarning>
                    {Object.entries(LANGUAGE_DISPLAY).map(([key, label]) => (<option key={key} value={key} suppressHydrationWarning>{label}</option>))}
                  </select>
                </div>
                <div className={styles.editorToolbarRight}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setCode(DEFAULT_CODE[selectedLanguage] || "")} suppressHydrationWarning>↺ Reset</button>
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

      {/* ---------- Break Picker Modal ---------- */}
      {showBreakModal && !isOnBreak && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowBreakModal(false)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalIcon}>☕</div>
            <h2 className={styles.modalTitle}>Take a Break?</h2>
            <p className={styles.modalDesc}>
              Your mic and camera will turn off and the main timer will pause.
              Taking a break will count against your final feedback score.
            </p>
            <div className={styles.breakOptionRow}>
              <button
                className={styles.breakOptionBtn}
                onClick={() => startBreak(5)}
                suppressHydrationWarning
              >
                <span className={styles.breakOptionMinutes}>5</span>
                <span className={styles.breakOptionLabel}>minutes</span>
              </button>
              <button
                className={styles.breakOptionBtn}
                onClick={() => startBreak(10)}
                suppressHydrationWarning
              >
                <span className={styles.breakOptionMinutes}>10</span>
                <span className={styles.breakOptionLabel}>minutes</span>
              </button>
            </div>
            <div className={styles.modalActions}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowBreakModal(false)}
              >
                Never mind
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- On-Break Overlay ---------- */}
      {isOnBreak && (
        <div className={styles.breakOverlay}>
          <div className={styles.breakCard}>
            <div className={styles.breakIcon}>☕</div>
            <p className={styles.breakKicker}>Interview paused — you&apos;re on a break</p>
            <div className={styles.breakCountdown}>{formatTime(breakSecondsLeft)}</div>
            <p className={styles.breakSub}>
              Mic and camera are off. Main timer is frozen at{" "}
              <strong>{formatTime(timeLeft)}</strong>.
            </p>
            <button
              className="btn btn-primary"
              onClick={endBreak}
              suppressHydrationWarning
            >
              I&apos;m back — resume interview
            </button>
            <p className={styles.breakNote}>
              Heads up: breaks reduce your engagement score.
            </p>
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
