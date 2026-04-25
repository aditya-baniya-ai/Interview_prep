"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs } from "firebase/firestore";
import styles from "./dashboard.module.css";

const LANGUAGES = ["python", "javascript", "java", "cpp"];
const DURATIONS = [30, 45, 60];

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [language, setLanguage] = useState("python");
  const [duration, setDuration] = useState(45);
  const [difficulty, setDifficulty] = useState("Medium");
  const [interviewType, setInterviewType] = useState<"coding" | "behavioral">(
    "coding"
  );

  const availableDurations = interviewType === "coding" ? [5, 10, 20, 30, 45] : [5];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pastSessions, setPastSessions] = useState<any[]>([]);

  // Fetch past sessions when user loads
  useEffect(() => {
    async function loadSessions() {
      if (user && db) {
        try {
          const q = query(
            collection(db, "users", user.uid, "sessions"),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          const sessions = snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          setPastSessions(sessions);
        } catch (err) {
          console.error("Failed to load sessions:", err);
        }
      }
    }
    loadSessions();
  }, [user]);

  // Update duration when interview type changes
  useEffect(() => {
    setDuration(interviewType === "coding" ? 30 : 5);
  }, [interviewType]);

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
          }}
        >
          <div className="google-dots">
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
            <div className="dot"></div>
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
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const params = new URLSearchParams({
      type: interviewType,
      language,
      duration: duration.toString(),
      difficulty,
    });
    router.push(`/interview?${params.toString()}&sid=${sessionId}`);
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={styles.dashboard}>
      {/* ---------- Navbar ---------- */}
      <nav className={styles.dashNav} id="dashboard-nav">
        <div className={styles.dashNavLogo}>
          <div className={styles.dashNavLogoIcon}>G</div>
          Interview Prep AI
        </div>
        <div className={styles.dashNavRight}>
          <div className={styles.userChip}>
            <div className={styles.userAvatar}>
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || "User"}
                  referrerPolicy="no-referrer"
                />
              ) : (
                getInitials(user.displayName)
              )}
            </div>
            <span>{user.displayName || "User"}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* ---------- Content ---------- */}
      <main className={styles.dashContent}>
        <div className={styles.dashWelcome}>
          <h1 className={styles.dashWelcomeTitle}>
            Welcome, {user.displayName?.split(" ")[0] || "there"} 👋
          </h1>
          <p className={styles.dashWelcomeSub}>
            Ready to practice for your FAANG interview? Choose your session
            type below.
          </p>
        </div>

        {/* ---------- Interview Type Selection ---------- */}
        <div className={styles.startSection}>
          <h2 className={styles.startSectionTitle}>Choose Interview Type</h2>
          <div className={styles.interviewTypes}>
            <div
              className={`card card-interactive ${styles.interviewTypeCard} ${styles.cardCoding}`}
              onClick={() => setInterviewType("coding")}
              style={{
                borderColor:
                  interviewType === "coding"
                    ? "var(--color-primary)"
                    : undefined,
                boxShadow:
                  interviewType === "coding"
                    ? "var(--shadow-glow)"
                    : undefined,
              }}
              id="type-coding"
            >
              <div className={`${styles.interviewTypeIcon} ${styles.iconCoding}`}>
                💻
              </div>
              <h3 className={styles.interviewTypeTitle}>
                Coding Interview
              </h3>
              <p className={styles.interviewTypeDesc}>
                Solve a DSA problem while explaining your approach to the AI
                interviewer. Get real-time code compilation, test case
                execution, and follow-up questions.
              </p>
              <div className={styles.interviewTypeTags}>
                <span className={styles.tag}>Arrays</span>
                <span className={styles.tag}>Trees</span>
                <span className={styles.tag}>Graphs</span>
                <span className={styles.tag}>DP</span>
                <span className={styles.tag}>Strings</span>
              </div>
              <span className="btn btn-primary btn-sm">
                {interviewType === "coding" ? "✓ Selected" : "Select"}
              </span>
            </div>

            <div
              className={`card card-interactive ${styles.interviewTypeCard} ${styles.cardBehavioral}`}
              onClick={() => setInterviewType("behavioral")}
              style={{
                borderColor:
                  interviewType === "behavioral"
                    ? "var(--color-accent-yellow)"
                    : undefined,
                boxShadow:
                  interviewType === "behavioral"
                    ? "0 0 30px rgba(251, 188, 4, 0.15)"
                    : undefined,
              }}
              id="type-behavioral"
            >
              <div
                className={`${styles.interviewTypeIcon} ${styles.iconBehavioral}`}
              >
                🗣️
              </div>
              <h3 className={styles.interviewTypeTitle}>
                Behavioral Interview
              </h3>
              <p className={styles.interviewTypeDesc}>
                Practice answering behavioral questions using the STAR
                framework. The AI asks follow-ups and evaluates your
                communication and storytelling ability.
              </p>
              <div className={styles.interviewTypeTags}>
                <span className={styles.tag}>Leadership</span>
                <span className={styles.tag}>Teamwork</span>
                <span className={styles.tag}>Conflict</span>
                <span className={styles.tag}>Growth</span>
              </div>
              <span className="btn btn-secondary btn-sm">
                {interviewType === "behavioral" ? "✓ Selected" : "Select"}
              </span>
            </div>
          </div>
        </div>

        {/* ---------- Configuration ---------- */}
        <div className={styles.configSection}>
          <h2 className={styles.startSectionTitle}>Session Settings</h2>
          <div className={styles.configGrid}>
            <div className={`card ${styles.configCard}`}>
              <label className={styles.configLabel}>
                Programming Language
              </label>
              <select
                className="select w-full"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                id="select-language"
                disabled={interviewType === "behavioral"}
                style={{ opacity: interviewType === "behavioral" ? 0.5 : 1 }}
              >
                {LANGUAGES.map((lang) => (
                   <option key={lang} value={lang}>
                    {lang === "cpp"
                      ? "C++"
                      : lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className={`card ${styles.configCard}`}>
              <label className={styles.configLabel}>Session Duration</label>
              <select
                className="select w-full"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                id="select-duration"
              >
                {availableDurations.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </div>

            <div className={`card ${styles.configCard}`}>
              <label className={styles.configLabel}>Difficulty</label>
              <select 
                className="select w-full" 
                id="select-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                disabled={interviewType === "behavioral"}
                style={{ opacity: interviewType === "behavioral" ? 0.5 : 1 }}
              >
                <option value="Easy">Easy (L2)</option>
                <option value="Medium">Medium (L3 - L4)</option>
                <option value="Hard">Hard (L5+)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ---------- Start Button ---------- */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-12)" }}>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleStartInterview}
            id="start-interview-btn"
            style={{ padding: "16px 48px", fontSize: "18px" }}
          >
            🎤 Start Interview Session
          </button>
        </div>

        {/* ---------- History ---------- */}
        <div className={styles.historySection}>
          <h2 className={styles.startSectionTitle}>Past Sessions</h2>
          {pastSessions.length === 0 ? (
            <div className={`card ${styles.historyEmpty}`}>
              <div className={styles.historyEmptyIcon}>📋</div>
              <p>No interview sessions yet.</p>
              <p style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
                Start your first practice session above!
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              {pastSessions.map((session) => (
                <div key={session.id} className={`card ${styles.configCard}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "600" }}>
                      {session.interviewType === "coding" ? "💻 Coding Interview" : "🗣️ Behavioral Interview"}
                    </h3>
                    <p style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)" }}>
                      {new Date(session.createdAt).toLocaleDateString()} • {session.durationMinutes} minutes
                      {session.feedback?.overallDecision && ` • ${session.feedback.overallDecision}`}
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
