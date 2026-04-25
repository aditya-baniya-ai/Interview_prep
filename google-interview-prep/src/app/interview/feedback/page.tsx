"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { NavBrand } from "@/components/NavBrand";
import styles from "./feedback.module.css";

// Default feedback (fallback if sessionStorage has nothing)
const DEFAULT_FEEDBACK = {
  overallDecision: "Lean No Hire",
  overallScore: 50,
  communication: { clarity: 3, approach: 3, hintsUsed: 0 },
  engagement: { eyeContact: 3, confidence: 3 },
  recommendations: [
    "Complete a full interview session to receive detailed feedback.",
    "Practice answering behavioral questions using the STAR method.",
    "Speak clearly and at a moderate pace.",
    "Ask clarifying questions when needed.",
    "Practice more mock interviews to build confidence.",
  ],
};

function getScoreClass(score: number) {
  if (score >= 4) return styles.scoreBarGood;
  if (score >= 3) return styles.scoreBarOkay;
  return styles.scoreBarPoor;
}

function getDecisionClass(decision: string) {
  switch (decision) {
    case "Hire":
      return styles.scoreHire;
    case "Lean Hire":
      return styles.scoreLeanHire;
    case "Lean No Hire":
      return styles.scoreLeanNoHire;
    case "No Hire":
      return styles.scoreNoHire;
    default:
      return styles.scoreLeanHire;
  }
}

function FeedbackContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sid") || "demo";
  const interviewType = searchParams.get("type") || "coding";
  const { user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeedback() {
      // 1. Try to load from sessionStorage (recent interview)
      const stored = sessionStorage.getItem(`feedback_${sessionId}`);
      if (stored) {
        try {
          setFeedback(JSON.parse(stored));
          setLoading(false);
          return;
        } catch {
          // Fallthrough
        }
      }

      // 2. Try to fetch from Firestore (historical interview)
      if (user && db) {
        try {
          const docRef = doc(db, "users", user.uid, "sessions", sessionId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && docSnap.data().feedback) {
            setFeedback(docSnap.data().feedback);
            setLoading(false);
            return;
          }
        } catch (dbErr) {
          console.error("Failed to fetch from Firestore:", dbErr);
        }
      }

      // 3. Fallback: try fetching from backend
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/api/interview/${sessionId}/feedback`);
        if (res.ok) {
          setFeedback(await res.json());
        } else {
          setFeedback(DEFAULT_FEEDBACK);
        }
      } catch {
        setFeedback(DEFAULT_FEEDBACK);
      }
      setLoading(false);
    }

    // Wait until auth state resolves before attempting to fetch
    // If not logged in, it will skip Firestore but still fall back
    loadFeedback();
  }, [sessionId, user]);

  if (loading || !feedback) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-secondary)" }}>
        <div className="google-dots">
          <div className="dot"></div><div className="dot"></div><div className="dot"></div><div className="dot"></div>
        </div>
      </div>
    );
  }

  const hasCoding = interviewType === "coding" && feedback.coding;

  return (
    <div className={styles.feedbackPage}>
      {/* Navbar */}
      <nav className={styles.feedbackNav}>
        <div className={styles.feedbackNavLogo}>
          <NavBrand />
          <span className={styles.feedbackNavSuffix}>— Feedback Report</span>
        </div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← Back to Dashboard
        </Link>
      </nav>

      <main className={styles.feedbackContent}>
        {/* ---------- Overall Score ---------- */}
        <div className={styles.overallHeader}>
          <h1 className={styles.overallTitle}>Interview Feedback Report</h1>
          <p className={styles.overallSub}>
            Here&apos;s a detailed breakdown of your performance
          </p>

          <div className={styles.overallScore}>
            <div
              className={`${styles.scoreCircle} ${getDecisionClass(feedback.overallDecision)}`}
            >
              {feedback.overallScore}
            </div>
            <div className={styles.scoreDecision}>
              {feedback.overallDecision}
            </div>
            <div className={styles.scoreLabel}>Overall Score / 100</div>
          </div>
        </div>

        {/* ---------- Coding Assessment ---------- */}
        {hasCoding && (
        <div className={styles.feedbackSection}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <div
                className={styles.sectionIcon}
                style={{ background: "rgba(66, 133, 244, 0.12)" }}
              >
                💻
              </div>
              <h2 className={styles.sectionTitle}>Coding Assessment</h2>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>Problem Solving</span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.coding.problemSolving)}`}
                  style={{
                    width: `${(feedback.coding.problemSolving / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.coding.problemSolving}/5
              </span>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>Code Correctness</span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.coding.codeCorrectness)}`}
                  style={{
                    width: `${(feedback.coding.codeCorrectness / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.coding.codeCorrectness}/5
              </span>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>Code Quality & Style</span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.coding.codeQuality)}`}
                  style={{
                    width: `${(feedback.coding.codeQuality / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.coding.codeQuality}/5
              </span>
            </div>


            <div className={styles.complexityGrid}>
              <div className={styles.complexityItem}>
                <div className={styles.complexityLabel}>
                  Your Time Complexity
                </div>
                <div
                  className={`${styles.complexityValue} ${
                    feedback.coding.timeComplexity ===
                    feedback.coding.optimalTimeComplexity
                      ? styles.complexityOptimal
                      : styles.complexitySuboptimal
                  }`}
                >
                  {feedback.coding.timeComplexity}
                </div>
              </div>
              <div className={styles.complexityItem}>
                <div className={styles.complexityLabel}>
                  Optimal Time Complexity
                </div>
                <div
                  className={`${styles.complexityValue} ${styles.complexityOptimal}`}
                >
                  {feedback.coding.optimalTimeComplexity}
                </div>
              </div>
              <div className={styles.complexityItem}>
                <div className={styles.complexityLabel}>
                  Your Space Complexity
                </div>
                <div
                  className={`${styles.complexityValue} ${styles.complexityOptimal}`}
                >
                  {feedback.coding.spaceComplexity}
                </div>
              </div>
              <div className={styles.complexityItem}>
                <div className={styles.complexityLabel}>
                  Optimal Space Complexity
                </div>
                <div
                  className={`${styles.complexityValue} ${styles.complexityOptimal}`}
                >
                  {feedback.coding.optimalSpaceComplexity}
                </div>
              </div>
            </div>
            
            {/* Side-by-side Code Comparison */}
            <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ background: "var(--surface-1)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "1.5px" }}>Your Code</h4>
                <pre style={{ margin: 0, padding: 0, overflowX: "auto", fontSize: "13px", lineHeight: 1.5, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  <code>{feedback.coding.userCode || "(No code provided)"}</code>
                </pre>
              </div>
              <div style={{ background: "var(--surface-1)", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: 500, color: "var(--accent-green)", textTransform: "uppercase", letterSpacing: "1.5px" }}>Optimal Solution</h4>
                <pre style={{ margin: 0, padding: 0, overflowX: "auto", fontSize: "13px", lineHeight: 1.5, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                  <code>{feedback.coding.optimalCode || "(No optimal code generated)"}</code>
                </pre>
              </div>
            </div>

          </div>
        </div>
        )}

        {/* ---------- Communication ---------- */}
        <div className={styles.feedbackSection}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <div
                className={styles.sectionIcon}
                style={{ background: "rgba(52, 168, 83, 0.12)" }}
              >
                🗣️
              </div>
              <h2 className={styles.sectionTitle}>Communication Skills</h2>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>Clarity of Thought</span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.communication.clarity)}`}
                  style={{
                    width: `${(feedback.communication.clarity / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.communication.clarity}/5
              </span>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>
                Approach Explanation
              </span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.communication.approach)}`}
                  style={{
                    width: `${(feedback.communication.approach / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.communication.approach}/5
              </span>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>Hints Used</span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${styles.scoreBarOkay}`}
                  style={{
                    width: `${(feedback.communication.hintsUsed / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.communication.hintsUsed}
              </span>
            </div>
          </div>
        </div>

        {/* ---------- Engagement & Body Language ---------- */}
        <div className={styles.feedbackSection}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <div
                className={styles.sectionIcon}
                style={{ background: "rgba(251, 188, 4, 0.12)" }}
              >
                📹
              </div>
              <h2 className={styles.sectionTitle}>
                Engagement & Body Language
              </h2>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>
                Eye Contact / Screen Focus
              </span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.engagement.eyeContact)}`}
                  style={{
                    width: `${(feedback.engagement.eyeContact / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.engagement.eyeContact}/5
              </span>
            </div>

            <div className={styles.scoreRow}>
              <span className={styles.scoreLabel2}>Confidence Level</span>
              <div className={styles.scoreBarContainer}>
                <div
                  className={`${styles.scoreBar} ${getScoreClass(feedback.engagement.confidence)}`}
                  style={{
                    width: `${(feedback.engagement.confidence / 5) * 100}%`,
                  }}
                ></div>
              </div>
              <span className={styles.scoreValue}>
                {feedback.engagement.confidence}/5
              </span>
            </div>
          </div>
        </div>

        {/* ---------- Recommendations ---------- */}
        <div className={styles.feedbackSection}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitleRow}>
              <div
                className={styles.sectionIcon}
                style={{ background: "rgba(250, 123, 23, 0.12)" }}
              >
                💡
              </div>
              <h2 className={styles.sectionTitle}>
                Improvement Recommendations
              </h2>
            </div>

            <ul className={styles.recList}>
              {feedback.recommendations.map((rec: string, i: number) => (
                <li key={i} className={styles.recItem}>
                  <span className={styles.recIcon}>
                    {i === 0 ? "🔑" : i === 1 ? "💬" : i === 2 ? "⚠️" : i === 3 ? "✨" : "📚"}
                  </span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---------- Actions ---------- */}
        <div className={styles.feedbackActions}>
          <Link href="/dashboard" className="btn btn-primary btn-lg">
            🔄 Practice Again
          </Link>
          <button className="btn btn-secondary btn-lg">
            📄 Export as PDF
          </button>
        </div>
      </main>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-secondary)",
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
      <FeedbackContent />
    </Suspense>
  );
}
