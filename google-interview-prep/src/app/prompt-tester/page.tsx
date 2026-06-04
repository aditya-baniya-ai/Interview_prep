"use client";

/**
 * Prompt Engineering Tester — Question List
 *
 * Gated by NEXT_PUBLIC_PROMPT_TESTER_ENABLED=true.
 * Fetches published questions from GET /api/prompt-tester/questions
 * and renders them as cards with difficulty badges and category tags.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./prompt-tester.module.css";

const ENABLED = process.env.NEXT_PUBLIC_PROMPT_TESTER_ENABLED === "true";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Question {
  id: string;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  category: string;
}

function difficultyClass(difficulty: string): string {
  switch (difficulty) {
    case "easy":
      return styles.badgeEasy;
    case "medium":
      return styles.badgeMedium;
    case "hard":
      return styles.badgeHard;
    default:
      return styles.badgeEasy;
  }
}

function SkeletonCards() {
  return (
    <div className={styles.skeletonGrid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonTitle} />
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <div className={styles.skeletonBadge} />
            <div className={styles.skeletonBadge} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PromptTesterPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ENABLED) return;

    fetch(`${API_BASE}/api/prompt-tester/questions`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Question[]) => {
        setQuestions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load questions");
        setLoading(false);
      });
  }, []);

  if (!ENABLED) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <p>Prompt Tester is not enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Prompt Engineering Tester</h1>
        <p className={styles.subtitle}>
          Practice writing effective prompts and get scored on correctness,
          consistency, and efficiency.
        </p>
      </div>

      {loading && <SkeletonCards />}

      {error && (
        <div className={styles.errorState}>
          <p className={styles.errorTitle}>Failed to load questions</p>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && questions.length === 0 && (
        <div className={styles.errorState}>
          <p>No questions available yet. Check back soon.</p>
        </div>
      )}

      {!loading && !error && questions.length > 0 && (
        <div className={styles.grid}>
          {questions.map((q) => (
            <Link
              key={q.id}
              href={`/prompt-tester/${q.slug}`}
              className={styles.card}
            >
              <h2 className={styles.cardTitle}>{q.title}</h2>
              <div className={styles.cardMeta}>
                <span
                  className={`${styles.badge} ${difficultyClass(q.difficulty)}`}
                >
                  {q.difficulty}
                </span>
                <span className={styles.categoryTag}>
                  {q.category.replace(/_/g, " ")}
                </span>
                <span className={styles.cardArrow}>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
