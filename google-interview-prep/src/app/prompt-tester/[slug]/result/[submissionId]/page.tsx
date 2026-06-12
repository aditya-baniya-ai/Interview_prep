"use client";

/**
 * Prompt Engineering Tester — Score Result Page
 *
 * Shows:
 * - Total score (0-100, big number)
 * - Three axis gauges: correctness / consistency / efficiency
 * - Per-test-case breakdown table (NO hidden inputs or expected values shown)
 * - Metadata: model_version, grader_version, graded_at
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import styles from "./result.module.css";

const ENABLED = process.env.NEXT_PUBLIC_PROMPT_TESTER_ENABLED === "true";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ScoreDetail {
  total_score: number;
  correctness_score: number;
  consistency_score: number;
  efficiency_score: number;
  breakdown: Record<
    string,
    {
      weight?: number;
      majority_pass?: number;
      pass_count?: number;
      total_runs?: number;
      consistency?: number;
      judge_score?: number | null;
    } | boolean
  >;
  model_version: string;
  grader_version: string;
  graded_at: string | null;
}

interface SubmissionResult {
  submission_id: string;
  status: string;
  question_version: number;
  created_at: string;
  score: ScoreDetail | null;
}

type BreakdownEntry = {
  tc_id: string;
  majority_pass: number | null;
  pass_count: number | null;
  total_runs: number | null;
  judge_score: number | null;
};

function scoreColorClass(score: number): string {
  if (score >= 75) return styles.heroScoreHigh;
  if (score >= 50) return styles.heroScoreMid;
  return styles.heroScoreLow;
}

function parseBreakdown(breakdown: ScoreDetail["breakdown"]): BreakdownEntry[] {
  const entries: BreakdownEntry[] = [];
  for (const [key, value] of Object.entries(breakdown)) {
    if (key === "anti_gaming_flag") continue;
    if (typeof value === "object" && value !== null) {
      const v = value as {
        majority_pass?: number;
        pass_count?: number;
        total_runs?: number;
        judge_score?: number | null;
      };
      entries.push({
        tc_id: key,
        majority_pass: v.majority_pass ?? null,
        pass_count: v.pass_count ?? null,
        total_runs: v.total_runs ?? null,
        judge_score: v.judge_score ?? null,
      });
    }
  }
  return entries;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ResultPage() {
  const params = useParams<{ slug: string; submissionId: string }>();

  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ENABLED || !params.submissionId) return;

    fetch(
      `${API_BASE}/api/prompt-tester/submissions/${params.submissionId}`
    )
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SubmissionResult) => {
        setResult(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load result");
        setLoading(false);
      });
  }, [params.submissionId]);

  if (!ENABLED) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p>Prompt Tester is not enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Link
          href={`/prompt-tester/${params.slug}`}
          className={styles.back}
        >
          ← Back to question
        </Link>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading result…</p>
          </div>
        )}

        {error && (
          <div className={styles.errorState}>{error}</div>
        )}

        {!loading && result && result.status === "failed" && (
          <div className={styles.card}>
            <p style={{ color: "var(--accent-red)" }}>
              Grading failed for this submission. Please try submitting again.
            </p>
          </div>
        )}

        {!loading && result && result.score && (
          <>
            {/* Total Score Hero */}
            <div className={styles.heroCard}>
              <p className={styles.heroLabel}>Total Score</p>
              <p
                className={`${styles.heroScore} ${scoreColorClass(result.score.total_score)}`}
              >
                {result.score.total_score.toFixed(1)}
              </p>
              <p className={styles.heroSubtitle}>out of 100</p>
            </div>

            {/* Axis Gauges */}
            <div className={styles.card}>
              <h2 className={styles.sectionTitle}>Score Breakdown</h2>
              <div className={styles.gaugeList}>
                {(
                  [
                    {
                      label: "Correctness",
                      value: result.score.correctness_score,
                      fillClass: styles.gaugeFillCorrectness,
                      title: "Weighted majority pass rate across test cases (70% of total)",
                    },
                    {
                      label: "Consistency",
                      value: result.score.consistency_score,
                      fillClass: styles.gaugeFillConsistency,
                      title: "Stability of outputs across repeated runs (15% of total)",
                    },
                    {
                      label: "Efficiency",
                      value: result.score.efficiency_score,
                      fillClass: styles.gaugeFillEfficiency,
                      title: "Output token efficiency vs budget (15% of total)",
                    },
                  ] as const
                ).map((axis) => (
                  <div key={axis.label} className={styles.gaugeRow}>
                    <div className={styles.gaugeHeader}>
                      <span className={styles.gaugeLabel} title={axis.title}>
                        {axis.label}
                      </span>
                      <span className={styles.gaugeValue}>
                        {axis.value.toFixed(1)}
                      </span>
                    </div>
                    <div className={styles.gaugeTrack}>
                      <div
                        className={`${styles.gaugeFill} ${axis.fillClass}`}
                        style={{ width: `${Math.min(100, axis.value)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {result.score.breakdown.anti_gaming_flag === true && (
                <div className={styles.antiGamingWarning}>
                  Warning: All test cases produced identical outputs regardless of
                  different inputs. This may indicate prompt gaming.
                </div>
              )}
            </div>

            {/* Per-test-case breakdown */}
            {(() => {
              const entries = parseBreakdown(result.score.breakdown);
              if (entries.length === 0) return null;
              return (
                <div className={styles.card}>
                  <h2 className={styles.sectionTitle}>Per-Test-Case Results</h2>
                  <div className={styles.tableWrapper}>
                    <table className={styles.breakdownTable}>
                      <thead>
                        <tr>
                          <th>Test Case</th>
                          <th>Passed</th>
                          <th>Runs (pass/total)</th>
                          <th>Judge Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.tc_id}>
                            <td>{e.tc_id}</td>
                            <td>
                              {e.majority_pass === null ? (
                                <span className={styles.passedNull}>—</span>
                              ) : e.majority_pass >= 0.5 ? (
                                <span className={styles.passedYes}>Yes</span>
                              ) : (
                                <span className={styles.passedNo}>No</span>
                              )}
                            </td>
                            <td>
                              {e.pass_count !== null && e.total_runs !== null
                                ? `${e.pass_count} / ${e.total_runs}`
                                : "—"}
                            </td>
                            <td>
                              {e.judge_score !== null && e.judge_score !== undefined
                                ? e.judge_score.toFixed(2)
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Metadata */}
            <div className={styles.card}>
              <h2 className={styles.sectionTitle}>Grading Metadata</h2>
              <div className={styles.metaGrid}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Model Version</span>
                  <span className={styles.metaValue}>
                    {result.score.model_version || "—"}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Grader Version</span>
                  <span className={styles.metaValue}>
                    {result.score.grader_version || "—"}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Graded At</span>
                  <span className={styles.metaValue}>
                    {formatDate(result.score.graded_at)}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Submission ID</span>
                  <span className={styles.metaValue}>
                    {result.submission_id.slice(0, 8)}…
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
