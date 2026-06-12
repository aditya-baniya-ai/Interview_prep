"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "@firebase/firestore";
import { NavBrand } from "@/components/NavBrand";
import styles from "./feedback.module.css";

// Read-only Monaco editor for the reviewer view. SSR-disabled because Monaco
// touches `window` during init.
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Severity = "warning" | "suggestion" | "info" | "praise";

interface CodeAnnotation {
  line: number;
  severity: Severity;
  message: string;
}

const LANGUAGE_LABEL: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  java: "Java",
  cpp: "C++",
};

const FILE_EXTENSION: Record<string, string> = {
  python: "py",
  javascript: "js",
  java: "java",
  cpp: "cpp",
};

// Comment prefix per language — used when weaving reviewer comments into the
// source so Monaco's tokenizer renders them in its native comment color.
const COMMENT_PREFIX: Record<string, string> = {
  python: "# ",
  javascript: "// ",
  java: "// ",
  cpp: "// ",
};

const SEVERITY_ICON: Record<Severity, string> = {
  warning: "⚠️ ",
  suggestion: "💡 ",
  info: "ℹ️ ",
  praise: "✅ ",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  warning: "ISSUE",
  suggestion: "SUGGEST",
  info: "NOTE",
  praise: "WELL DONE",
};

/**
 * Insert reviewer comments directly into the source as native comment lines,
 * preserving the original indentation of the line being annotated. We process
 * annotations from highest line number to lowest so earlier insertions don't
 * shift the line indices of later ones.
 */
function weaveAnnotations(
  code: string,
  language: string,
  annotations: CodeAnnotation[] | undefined,
): string {
  if (!code) return "";
  if (!annotations || annotations.length === 0) return code;

  const prefix = COMMENT_PREFIX[language] || "// ";
  const lines = code.split("\n");

  // Sort descending so insertions don't invalidate later line indices.
  const sorted = [...annotations]
    .filter((a) => a && typeof a.line === "number" && a.message)
    .sort((a, b) => b.line - a.line);

  for (const ann of sorted) {
    // Clamp to a valid 1-indexed line — Gemini occasionally emits an off-by-one.
    const idx = Math.max(1, Math.min(ann.line, lines.length)) - 1;
    const original = lines[idx] || "";
    const indent = original.match(/^\s*/)?.[0] ?? "";
    const icon = SEVERITY_ICON[ann.severity] ?? "ℹ️ ";
    const tag = SEVERITY_LABEL[ann.severity] ?? "NOTE";
    const commentLine = `${indent}${prefix}${icon}${tag}: ${ann.message}`;
    lines.splice(idx, 0, commentLine);
  }
  return lines.join("\n");
}

function annotationCounts(annotations: CodeAnnotation[] | undefined) {
  const counts = { warning: 0, suggestion: 0, info: 0, praise: 0 };
  if (!annotations) return counts;
  for (const a of annotations) {
    if (a && a.severity in counts) counts[a.severity] += 1;
  }
  return counts;
}

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
  const router = useRouter();
  const sessionId = searchParams.get("sid") || "demo";
  const interviewType = searchParams.get("type") || "coding";
  const { user, loading: authLoading } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [feedback, setFeedback] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    // Don't attempt any fetch until Firebase auth has resolved — prevents
    // flashing DEFAULT_FEEDBACK on historical sessions before Firestore loads.
    if (authLoading) return;

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

    loadFeedback();
  }, [sessionId, user, authLoading]);

  // ── Code review (Monaco IDE) data prep ─────────────────────────────────
  // Computed BEFORE the loading early-return so React Hook ordering is stable
  // across renders. Empty/default values when the feedback payload is missing.
  const codingLanguage: string = feedback?.coding?.language || "python";
  const userCodeRaw: string = feedback?.coding?.userCode || "";
  const optimalCodeRaw: string = feedback?.coding?.optimalCode || "";
  // Memoize the annotation arrays themselves so their identity is stable across
  // renders and we don't re-run the weave step every render.
  const userAnnotations = useMemo<CodeAnnotation[]>(
    () => feedback?.coding?.codeAnnotations || [],
    [feedback],
  );
  const optimalAnnotations = useMemo<CodeAnnotation[]>(
    () => feedback?.coding?.optimalCodeAnnotations || [],
    [feedback],
  );

  const userCodeWoven = useMemo(
    () => weaveAnnotations(userCodeRaw, codingLanguage, userAnnotations),
    [userCodeRaw, codingLanguage, userAnnotations],
  );
  const optimalCodeWoven = useMemo(
    () => weaveAnnotations(optimalCodeRaw, codingLanguage, optimalAnnotations),
    [optimalCodeRaw, codingLanguage, optimalAnnotations],
  );

  const userCounts = annotationCounts(userAnnotations);
  const fileExt = FILE_EXTENSION[codingLanguage] || "txt";
  const langLabel = LANGUAGE_LABEL[codingLanguage] || codingLanguage;
  // Editor height: scale to content but cap so it doesn't dominate the page.
  // ~22px per line + padding works for Monaco's default 14px line-height.
  const userEditorHeight = Math.min(
    720,
    Math.max(320, userCodeWoven.split("\n").length * 22 + 40),
  );
  const optimalEditorHeight = Math.min(
    720,
    Math.max(280, optimalCodeWoven.split("\n").length * 22 + 40),
  );

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
                  className={`${styles.complexityValue} ${
                    feedback.coding.spaceComplexity ===
                    feedback.coding.optimalSpaceComplexity
                      ? styles.complexityOptimal
                      : styles.complexitySuboptimal
                  }`}
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
            
            {/* ── Code Review IDE — your code with reviewer comments ────────── */}
            <div className={styles.ideStack}>
              {/* Optional one-line verdict, only if Gemini provided it */}
              {feedback.coding.codeReviewSummary && (
                <p className={styles.ideSummary}>
                  {feedback.coding.codeReviewSummary}
                </p>
              )}

              {/* — Your Code — */}
              <div className={`${styles.ideCard} ${styles.ideCardUser}`}>
                <div className={styles.ideHeader}>
                  <div className={styles.ideTrafficLights}>
                    <span style={{ background: "#ff5f57" }} />
                    <span style={{ background: "#febc2e" }} />
                    <span style={{ background: "#28c840" }} />
                  </div>
                  <div className={styles.ideFilename}>
                    your_solution.{fileExt}
                  </div>
                  <div className={styles.ideHeaderRight}>
                    <span className={styles.ideBadge}>{langLabel}</span>
                    {userCounts.warning > 0 && (
                      <span className={`${styles.ideStat} ${styles.ideStatWarn}`}>
                        ⚠ {userCounts.warning}{" "}
                        {userCounts.warning === 1 ? "issue" : "issues"}
                      </span>
                    )}
                    {userCounts.suggestion > 0 && (
                      <span className={`${styles.ideStat} ${styles.ideStatSuggest}`}>
                        💡 {userCounts.suggestion}{" "}
                        {userCounts.suggestion === 1
                          ? "suggestion"
                          : "suggestions"}
                      </span>
                    )}
                    {userCounts.praise > 0 && (
                      <span className={`${styles.ideStat} ${styles.ideStatPraise}`}>
                        ✅ {userCounts.praise}
                      </span>
                    )}
                  </div>
                </div>

                <p className={styles.ideMicroHint}>
                  Reviewer comments appear inline as{" "}
                  <code>{(COMMENT_PREFIX[codingLanguage] || "// ").trim()}</code>{" "}
                  comments above the line they refer to.
                </p>

                <div
                  className={styles.ideEditor}
                  style={{ height: `${userEditorHeight}px` }}
                >
                  <Editor
                    height="100%"
                    language={codingLanguage}
                    value={userCodeWoven || "(No code submitted)"}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      domReadOnly: true,
                      fontSize: 15,
                      fontFamily:
                        "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
                      lineHeight: 22,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      renderLineHighlight: "none",
                      wordWrap: "on",
                      lineNumbers: "on",
                      padding: { top: 14, bottom: 14 },
                      smoothScrolling: true,
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </div>

                {/* Annotation legend / sidebar list — reinforces the inline comments */}
                {userAnnotations.length > 0 && (
                  <ul className={styles.ideAnnotationList}>
                    {userAnnotations
                      .slice()
                      .sort((a, b) => a.line - b.line)
                      .map((a, i) => (
                        <li
                          key={i}
                          className={`${styles.ideAnnotation} ${
                            styles[
                              `ideAnnotation_${a.severity}` as keyof typeof styles
                            ] || ""
                          }`}
                        >
                          <span className={styles.ideAnnotationLine}>
                            L{a.line}
                          </span>
                          <span className={styles.ideAnnotationIcon}>
                            {SEVERITY_ICON[a.severity] || "ℹ️"}
                          </span>
                          <span className={styles.ideAnnotationMsg}>
                            {a.message}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              {/* — Optimal Solution — */}
              <div className={`${styles.ideCard} ${styles.ideCardOptimal}`}>
                <div className={styles.ideHeader}>
                  <div className={styles.ideTrafficLights}>
                    <span style={{ background: "#ff5f57" }} />
                    <span style={{ background: "#febc2e" }} />
                    <span style={{ background: "#28c840" }} />
                  </div>
                  <div className={styles.ideFilename}>
                    optimal_solution.{fileExt}
                  </div>
                  <div className={styles.ideHeaderRight}>
                    <span className={styles.ideBadge}>{langLabel}</span>
                    <span
                      className={`${styles.ideStat} ${styles.ideStatPraise}`}
                    >
                      ✅ Reference
                    </span>
                  </div>
                </div>

                <p className={styles.ideMicroHint}>
                  A clean reference solution. Inline notes call out the key
                  techniques worth taking home.
                </p>

                <div
                  className={styles.ideEditor}
                  style={{ height: `${optimalEditorHeight}px` }}
                >
                  <Editor
                    height="100%"
                    language={codingLanguage}
                    value={optimalCodeWoven || "(No optimal code generated)"}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      domReadOnly: true,
                      fontSize: 15,
                      fontFamily:
                        "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
                      lineHeight: 22,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      renderLineHighlight: "none",
                      wordWrap: "on",
                      lineNumbers: "on",
                      padding: { top: 14, bottom: 14 },
                      smoothScrolling: true,
                      bracketPairColorization: { enabled: true },
                    }}
                  />
                </div>
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
                  className={`${styles.scoreBar} ${
                    feedback.communication.hintsUsed === 0
                      ? styles.scoreBarGood
                      : feedback.communication.hintsUsed <= 2
                      ? styles.scoreBarOkay
                      : styles.scoreBarPoor
                  }`}
                  style={{
                    width: `${Math.max(0, 100 - (feedback.communication.hintsUsed / 3) * 100)}%`,
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
              {(feedback.recommendations || []).map((rec: string, i: number) => (
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
          <button className="btn btn-secondary btn-lg" onClick={() => window.print()}>
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
