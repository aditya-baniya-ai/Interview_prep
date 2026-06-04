"use client";

/**
 * Prompt Engineering Tester — Question Detail & Submission
 *
 * Shows the task_spec and a textarea for the candidate's prompt.
 * Submits to POST /api/prompt-tester/submissions, then polls
 * GET /api/prompt-tester/submissions/{id} every 2 seconds until
 * status is 'scored' or 'failed' (max 60 polls = 2 minutes).
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import styles from "./question.module.css";

const ENABLED = process.env.NEXT_PUBLIC_PROMPT_TESTER_ENABLED === "true";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_POLLS = 60;
const POLL_INTERVAL_MS = 2000;

interface QuestionDetail {
  id: string;
  slug: string;
  title: string;
  task_spec: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  category: string;
  version: number;
}

function difficultyClass(difficulty: string): string {
  switch (difficulty) {
    case "easy": return styles.badgeEasy;
    case "medium": return styles.badgeMedium;
    case "hard": return styles.badgeHard;
    default: return styles.badgeEasy;
  }
}

export default function QuestionPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loadingQuestion, setLoadingQuestion] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [promptText, setPromptText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load question
  useEffect(() => {
    if (!ENABLED || !params.slug) return;

    fetch(`${API_BASE}/api/prompt-tester/questions/${params.slug}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: QuestionDetail) => {
        setQuestion(data);
        setLoadingQuestion(false);
      })
      .catch((err) => {
        setFetchError(err.message || "Failed to load question");
        setLoadingQuestion(false);
      });
  }, [params.slug]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const pollSubmission = (submissionId: string, count: number) => {
    if (count >= MAX_POLLS) {
      setPolling(false);
      setSubmitError("Grading timed out. Please try again.");
      return;
    }

    pollRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/prompt-tester/submissions/${submissionId}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.status === "scored" || data.status === "failed") {
          setPolling(false);
          // Navigate to result page
          router.push(
            `/prompt-tester/${params.slug}/result/${submissionId}`
          );
        } else {
          setPollCount(count + 1);
          pollSubmission(submissionId, count + 1);
        }
      } catch {
        setPollCount(count + 1);
        pollSubmission(submissionId, count + 1);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    if (!promptText.trim()) {
      setSubmitError("Please enter a prompt before submitting.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);

    const userId = user?.uid || "anonymous";

    try {
      const res = await fetch(`${API_BASE}/api/prompt-tester/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId,
        },
        body: JSON.stringify({
          question_slug: params.slug,
          prompt_text: promptText,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSubmitting(false);
      setPolling(true);
      setPollCount(0);
      pollSubmission(data.submission_id, 0);
    } catch (err: unknown) {
      setSubmitting(false);
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed"
      );
    }
  };

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
        <Link href="/prompt-tester" className={styles.back}>
          ← Back to questions
        </Link>

        {loadingQuestion && (
          <div className={styles.card}>
            <div
              style={{
                height: 32,
                width: "60%",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                marginBottom: "var(--space-4)",
              }}
            />
            <div
              style={{
                height: 80,
                background: "var(--surface-2)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>
        )}

        {fetchError && (
          <div className={styles.errorBanner}>{fetchError}</div>
        )}

        {!loadingQuestion && question && (
          <div className={styles.card}>
            <div className={styles.questionHeader}>
              <h1 className={styles.questionTitle}>{question.title}</h1>
              <span
                className={`${styles.badge} ${difficultyClass(question.difficulty)}`}
              >
                {question.difficulty}
              </span>
            </div>

            <p className={styles.taskSpecLabel}>Task</p>
            <pre className={styles.taskSpec}>{question.task_spec}</pre>

            <hr className={styles.divider} />

            <label className={styles.formLabel} htmlFor="prompt-input">
              Your Prompt
            </label>
            <textarea
              id="prompt-input"
              className={styles.promptTextarea}
              placeholder={
                "Write your prompt here. The model will receive your prompt " +
                "concatenated with a hidden test input."
              }
              rows={6}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              disabled={submitting || polling}
            />
            <p className={styles.formHint}>
              Your prompt will be prepended to each hidden test input.
            </p>

            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={submitting || polling || !promptText.trim()}
            >
              {submitting ? "Submitting…" : polling ? "Grading…" : "Submit Prompt →"}
            </button>

            {polling && (
              <div className={styles.pollingContainer}>
                <div className={styles.spinner} />
                <p className={styles.pollingLabel}>
                  Grading your prompt — running test cases…
                </p>
                <p className={styles.pollingCount}>
                  {pollCount * 2}s elapsed
                </p>
              </div>
            )}

            {submitError && (
              <div className={styles.errorBanner}>{submitError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
