"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, getDocs } from "@firebase/firestore";
import { ThemeToggle } from "@/lib/theme";
import { NavBrand } from "@/components/NavBrand";
import styles from "./dashboard.module.css";

const LANGUAGES = ["python", "javascript", "java", "cpp"];
const DURATIONS = [30, 45, 60];
const COMPANIES = ["Google", "Amazon", "Meta", "Apple", "Netflix"];
const DIFFICULTY_OPTIONS = ["Easy", "Medium", "Hard"];

// Backend URL from env — avoids hardcoding localhost which breaks for other devs
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

// Mirrors the Firestore document shape from questions/{slug}
interface PracticeQuestion {
  id: string;
  title: string;
  difficulty: string;
  company: string;
  source: string;
  url: string;
  topics: string[];
  acceptance_rate: number;
}

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

  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);

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

  // Fetch questions from Firestore via backend whenever filters change.
  // Both filters are optional — omitting both returns all 50 questions (capped at 20).
  const fetchQuestions = useCallback(async () => {
    setQuestionsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCompany) params.set("company", selectedCompany);
      if (selectedDifficulty) params.set("difficulty", selectedDifficulty);
      const res = await fetch(
        `${BACKEND_URL}/api/questions?${params.toString()}`
      );
      if (res.ok) {
        const data: PracticeQuestion[] = await res.json();
        setQuestions(data);
      }
    } catch (err) {
      console.error("Failed to fetch questions:", err);
    } finally {
      setQuestionsLoading(false);
    }
  }, [selectedCompany, selectedDifficulty]);

  // Re-fetch on every filter change — initial load fetches all questions
  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

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

  const diffClass = (d: string) => {
    if (d === "Easy") return styles.diffEasy;
    if (d === "Medium") return styles.diffMedium;
    return styles.diffHard;
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
        <NavBrand />
        <div className={styles.dashNavRight}>
          <ThemeToggle className={styles.themeToggle} />
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
            Welcome, {user.displayName?.split(" ")[0] || "there"}
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
              className={`${styles.interviewTypeCard} ${interviewType === "coding" ? styles.interviewTypeCardSelected : ""}`}
              onClick={() => setInterviewType("coding")}
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
              <span className={styles.companyPill}>Used at Google, Amazon, Meta</span>
              <span className={`btn btn-primary btn-sm`}>
                {interviewType === "coding" ? "✓ Selected" : "Select"}
              </span>
            </div>

            <div
              className={`${styles.interviewTypeCard} ${interviewType === "behavioral" ? styles.interviewTypeCardSelected : ""}`}
              onClick={() => setInterviewType("behavioral")}
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
              <span className={styles.companyPill}>Used at all FAANG</span>
              <span className="btn btn-primary btn-sm">
                {interviewType === "behavioral" ? "✓ Selected" : "Select"}
              </span>
            </div>
          </div>
        </div>

        {/* ---------- Configuration ---------- */}
        <div className={styles.configSection}>
          <h2 className={styles.startSectionTitle}>Session Settings</h2>
          <div className={styles.configGrid}>
            <div className={styles.configCard}>
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

            <div className={styles.configCard}>
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

            <div className={styles.configCard}>
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
            className={styles.startBtn}
            onClick={handleStartInterview}
            id="start-interview-btn"
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
                <div key={q.id} className={styles.questionCard}>
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
                    <a
                      href={q.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.extLink}
                      title="Open on LeetCode"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
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
                      {session.interviewType === "coding" ? "Coding Interview" : "Behavioral Interview"}
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
