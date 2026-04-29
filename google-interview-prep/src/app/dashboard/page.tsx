"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  limit,
} from "@firebase/firestore";
import { ThemeToggle } from "@/lib/theme";
import { NavBrand } from "@/components/NavBrand";
import type { InterviewType } from "@/lib/gemini-live";
import styles from "./dashboard.module.css";

const LANGUAGES = ["python", "javascript", "java", "cpp"];

const INTERVIEW_MODES: {
  id: InterviewType;
  title: string;
  icon: string;
  desc: string;
  tags: string[];
  company: string;
  iconClass: string;
}[] = [
  {
    id: "coding",
    title: "Coding & DSA",
    icon: "💻",
    desc: "Solve a data structures & algorithms problem while explaining your approach to the AI interviewer. Real-time code execution and follow-up questions.",
    tags: ["Arrays", "Trees", "Graphs", "DP", "Strings"],
    company: "Used at Google, Amazon, Meta",
    iconClass: styles.iconCoding,
  },
  {
    id: "behavioral",
    title: "Behavioral",
    icon: "🤝",
    desc: "Practice STAR-framework storytelling with follow-up questions on leadership, teamwork, conflict, and impact. Then optionally transition to a coding round.",
    tags: ["Leadership", "Teamwork", "Conflict", "Growth"],
    company: "Used at all FAANG",
    iconClass: styles.iconBehavioral,
  },
  {
    id: "system-design",
    title: "System Design",
    icon: "🏗️",
    desc: "Whiteboard distributed systems: scalability, consistency, failure modes, and database tradeoffs. Architect real Google-scale products under pressure.",
    tags: ["Distributed Systems", "CAP Theorem", "Caching", "DBs"],
    company: "L5+ at Google, Stripe, Uber",
    iconClass: styles.iconSystemDesign,
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    icon: "📊",
    desc: "Write complex SQL, define metrics, design A/B tests, and debug data pipelines. Evaluated on correctness, efficiency, and data quality awareness.",
    tags: ["SQL", "Pandas", "A/B Testing", "Metrics"],
    company: "Google Analytics, Meta, Airbnb",
    iconClass: styles.iconDataAnalyst,
  },
  {
    id: "resume-dive",
    title: "Resume Deep Dive",
    icon: "📄",
    desc: "Upload your resume and the AI interviewer will grill you on every vague claim — impact numbers, technical decisions, and ownership questions.",
    tags: ["Impact Claims", "Tech Stack", "Leadership", "Ownership"],
    company: "All FAANG loops",
    iconClass: styles.iconResume,
  },
];

const TYPE_DISPLAY: Record<InterviewType, string> = {
  "coding": "Coding Interview",
  "behavioral": "Behavioral Interview",
  "system-design": "System Design",
  "data-analyst": "Data Analyst",
  "resume-dive": "Resume Deep Dive",
};

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [language, setLanguage] = useState("python");
  const [duration, setDuration] = useState(30);
  const [difficulty, setDifficulty] = useState("Medium");
  const [interviewType, setInterviewType] = useState<InterviewType>("coding");

  // Resume-dive state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [resumeStatus, setResumeStatus] = useState<"idle" | "parsing" | "ready" | "error">("idle");
  const [resumeError, setResumeError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pastSessions, setPastSessions] = useState<any[]>([]);

  const availableDurations: number[] =
    interviewType === "coding"         ? [5, 10, 20, 30, 45] :
    interviewType === "system-design"  ? [20, 30, 45, 60]    :
    interviewType === "resume-dive"    ? [15, 20, 30]        :
                                         [15, 20, 30, 45];

  const showLanguagePicker = interviewType === "coding";
  const showDifficultyPicker = interviewType === "coding" || interviewType === "data-analyst";

  // Fetch past sessions
  useEffect(() => {
    async function loadSessions() {
      if (user && db) {
        try {
          const q = query(
            collection(db, "users", user.uid, "sessions"),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          setPastSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
          console.error("Failed to load sessions:", err);
        }
      }
    }
    loadSessions();
  }, [user]);

  // Reset duration when type changes
  useEffect(() => {
    const defaults: Record<InterviewType, number> = {
      coding: 30,
      behavioral: 20,
      "system-design": 45,
      "data-analyst": 20,
      "resume-dive": 20,
    };
    setDuration(defaults[interviewType]);
    // Clear resume state when switching away from resume-dive
    if (interviewType !== "resume-dive") {
      setResumeFile(null);
      setResumeText("");
      setResumeStatus("idle");
      setResumeError("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [interviewType]);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setResumeStatus("parsing");
    setResumeError("");

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${backendUrl}/api/resume/parse`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail || "Parse failed");
      }
      const data = await res.json();
      setResumeText(data.text);
      setResumeStatus("ready");
    } catch (err) {
      setResumeStatus("error");
      setResumeError(err instanceof Error ? err.message : "Failed to parse resume");
      setResumeText("");
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <div className="google-dots">
            <div className="dot"></div><div className="dot"></div>
            <div className="dot"></div><div className="dot"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  const handleStartInterview = () => {
    if (interviewType === "resume-dive" && resumeStatus !== "ready") return;

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store resume text in sessionStorage before navigating
    if (interviewType === "resume-dive" && resumeText) {
      sessionStorage.setItem(`resume_${sessionId}`, resumeText);
    }

    const params = new URLSearchParams({
      type: interviewType,
      language,
      duration: duration.toString(),
      difficulty,
      sid: sessionId,
    });
    router.push(`/interview?${params.toString()}`);
  };

  const diffClass = (d: string) => {
    if (d === "Easy") return styles.diffEasy;
    if (d === "Medium") return styles.diffMedium;
    return styles.diffHard;
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const startDisabled = interviewType === "resume-dive" && resumeStatus !== "ready";

  return (
    <div className={styles.dashboard}>
      {/* ---------- Navbar ---------- */}
      <nav className={styles.dashNav} id="dashboard-nav">
        <NavBrand />
        <div className={styles.dashNavRight}>
          <ThemeToggle className={styles.themeToggle} />
          <div className={styles.userChip}>
            <div className={styles.userAvatar}>
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "User"} referrerPolicy="no-referrer" />
              ) : (
                getInitials(user.displayName)
              )}
            </div>
            <span>{user.displayName || "User"}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign Out</button>
        </div>
      </nav>

      {/* ---------- Content ---------- */}
      <main className={styles.dashContent}>
        <div className={styles.dashWelcome}>
          <h1 className={styles.dashWelcomeTitle}>
            Welcome, {user.displayName?.split(" ")[0] || "there"}
          </h1>
          <p className={styles.dashWelcomeSub}>
            Choose an interview mode below to start your AI-powered practice session.
          </p>
        </div>

        {/* ---------- Interview Type Selection ---------- */}
        <div className={styles.startSection}>
          <h2 className={styles.startSectionTitle}>Choose Interview Mode</h2>
          <div className={styles.interviewTypes}>
            {INTERVIEW_MODES.map((mode) => (
              <div
                key={mode.id}
                className={`${styles.interviewTypeCard} ${interviewType === mode.id ? styles.interviewTypeCardSelected : ""}`}
                onClick={() => setInterviewType(mode.id)}
                id={`type-${mode.id}`}
              >
                <div className={`${styles.interviewTypeIcon} ${mode.iconClass}`}>
                  {mode.icon}
                </div>
                <h3 className={styles.interviewTypeTitle}>{mode.title}</h3>
                <p className={styles.interviewTypeDesc}>{mode.desc}</p>
                <div className={styles.interviewTypeTags}>
                  {mode.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
                <span className={styles.companyPill}>{mode.company}</span>

                {/* Resume uploader — only shown inside the resume-dive card when selected */}
                {mode.id === "resume-dive" && interviewType === "resume-dive" && (
                  <div className={styles.resumeUploadRow} onClick={(e) => e.stopPropagation()}>
                    <label className={styles.resumeUploadLabel}>Upload Your Resume</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx"
                      className={styles.resumeInput}
                      onChange={handleResumeUpload}
                    />
                    {resumeStatus === "parsing" && (
                      <p className={styles.resumeStatus}>Parsing resume...</p>
                    )}
                    {resumeStatus === "ready" && resumeFile && (
                      <p className={styles.resumeStatus}>✓ {resumeFile.name} ready</p>
                    )}
                    {resumeStatus === "error" && (
                      <p className={styles.resumeError}>⚠ {resumeError}</p>
                    )}
                  </div>
                )}

                <span className={`btn btn-primary btn-sm`} style={{ marginTop: "var(--space-4)" }}>
                  {interviewType === mode.id ? "✓ Selected" : "Select"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Configuration ---------- */}
        <div className={styles.configSection}>
          <h2 className={styles.startSectionTitle}>Session Settings</h2>
          <div className={styles.configGrid}>
            <div className={styles.configCard}>
              <label className={styles.configLabel}>Programming Language</label>
              <select
                className="select w-full"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                id="select-language"
                disabled={!showLanguagePicker}
                style={{ opacity: showLanguagePicker ? 1 : 0.4 }}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang === "cpp" ? "C++" : lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.configCard}>
              <label className={styles.configLabel}>Session Duration</label>
              <select
                className="select w-full"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                id="select-duration"
              >
                {availableDurations.map((d) => (
                  <option key={d} value={d}>{d} minutes</option>
                ))}
              </select>
            </div>

            <div className={styles.configCard}>
              <label className={styles.configLabel}>Difficulty</label>
              <select
                className="select w-full"
                id="select-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                disabled={!showDifficultyPicker}
                style={{ opacity: showDifficultyPicker ? 1 : 0.4 }}
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>
        </div>

        {/* ---------- Start Button ---------- */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
          {interviewType === "resume-dive" && resumeStatus !== "ready" && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
              Upload your resume above to enable this mode.
            </p>
          )}
          <button
            className={styles.startBtn}
            onClick={handleStartInterview}
            id="start-interview-btn"
            disabled={startDisabled}
            style={{ opacity: startDisabled ? 0.5 : 1, cursor: startDisabled ? "not-allowed" : "pointer" }}
          >
            Start Interview Session
          </button>
        </div>

        {/* ---------- Practice Questions ---------- */}
        <div className={styles.practiceSection}>
          <h2 className={styles.startSectionTitle}>Practice Questions</h2>
          <div className={styles.filterRow}>
            {COMPANIES.map((c) => (
              <button
                key={c}
                className={`${styles.filterPill} ${selectedCompany === c ? styles.filterPillActive : ""}`}
                onClick={() => setSelectedCompany(selectedCompany === c ? null : c)}
                id={`filter-company-${c.toLowerCase()}`}
              >
                {c}
              </button>
            ))}
            <div className={styles.filterDivider} />
            {DIFFICULTY_OPTIONS.map((d) => (
              <button
                key={d}
                className={`${styles.filterPill} ${selectedDifficulty === d ? styles.filterPillActive : ""}`}
                onClick={() => setSelectedDifficulty(selectedDifficulty === d ? null : d)}
                id={`filter-diff-${d.toLowerCase()}`}
              >
                {d}
              </button>
            ))}
          </div>

          {questionsLoading ? (
            <div className={styles.questionsEmpty}>Loading...</div>
          ) : questions.length === 0 ? (
            <div className={styles.questionsEmpty}>
              No questions found. Try adjusting your filters.
            </div>
          ) : (
            <div className={styles.questionCards}>
              {questions.map((q) => (
                <div
                  key={q.id}
                  className={styles.questionCard}
                  onClick={() => {
                    // Launch the interview round with the exact problem the user selected
                    const sid = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const params = new URLSearchParams({
                      type: "coding",
                      language,
                      duration: duration.toString(),
                      difficulty: q.difficulty,
                      problemId: q.id,
                    });
                    router.push(`/interview?${params.toString()}&sid=${sid}`);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <div className={styles.questionLeft}>
                    <h3 className={styles.questionTitle}>{q.title}</h3>
                    <div className={styles.questionTopics}>
                      {q.topics.map((t) => (
                        <span key={t} className={styles.topicTag}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className={styles.questionRight}>
                    <span className={`${styles.diffBadge} ${diffClass(q.difficulty)}`}>
                      {q.difficulty}
                    </span>
                    <span className={styles.extLink} title="Start interview">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---------- History ---------- */}
        <div className={styles.historySection}>
          <h2 className={styles.startSectionTitle}>Past Sessions</h2>
          {pastSessions.length === 0 ? (
            <div className={styles.historyEmpty}>
              <div className={styles.historyEmptyIcon}>📋</div>
              <p style={{ color: "var(--text-secondary)" }}>No interview sessions yet.</p>
              <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)", color: "var(--text-secondary)" }}>
                Start your first practice session above!
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {pastSessions.map((session) => (
                <div key={session.id} className={styles.historyItem}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "var(--text-base)", fontWeight: "500", color: "var(--text-primary)" }}>
                      {TYPE_DISPLAY[session.interviewType as InterviewType] ?? session.interviewType}
                    </h3>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                      {new Date(session.createdAt).toLocaleDateString()} · {session.durationMinutes} min
                      {session.feedback?.overallDecision && ` · ${session.feedback.overallDecision}`}
                    </p>
                  </div>
                  <Link href={`/interview/feedback?sid=${session.id}&type=${session.interviewType}`} className="btn btn-secondary btn-sm">
                    View Report
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
