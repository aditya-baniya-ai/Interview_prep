# Experiment Log 01 — Strategic Pivot: Applied AI Engineering Module

---

## Team Identification

| Field | Value |
|---|---|
| **Team ID** | *(to be filled by team)* |
| **Venture / Team Name** | ViewPrep |
| **Primary Contact Name** | Saurav Rijal |
| **Primary Contact Email** | butterprasad@gmail.com |
| **Institution** | Texas State University |

---

## Experiment Cycle Overview

**To what extent have you considered using AI agents to automate key business functions?**
**7 — To a great extent.** ViewPrep's core product is already AI-agent-driven: a Gemini Live AI conducts real-time mock interviews, evaluates answers, and generates personalized feedback reports. This cycle extended that agent-first philosophy into a new product domain.

**Type of Experiment Log:**
- [x] Strategic pivot or major decision
- [x] AI-enabled product or workflow test
- [x] Prototype or MVP build

**Short title:**
"Pivoted from DSA-only interview prep to include Prompt Engineering — tapping the growing AI engineering job market"

**Date or date range:**
June 2–4, 2026

**Summary (2-4 sentences):**
ViewPrep originally focused exclusively on data structures and algorithms (DSA) interview preparation — a crowded market. We identified a high-growth adjacent opportunity: as tech companies hire rapidly for AI engineering roles, candidates need to practice prompt engineering skills, which no incumbent tool tests rigorously. We pivoted by shipping an "Applied AI Engineering" module that lets users submit real prompts against FAANG-style challenges and receive AI-graded scores across correctness, consistency, and efficiency axes. The module went from concept to working prototype in a single development cycle, gated behind a feature flag to keep the existing DSA product untouched.

---

## Hypothesis / Assumption Tested

**Hypothesis:**
"Software engineers preparing for FAANG AI engineering roles have no structured, hands-on tool for practicing prompt engineering — and an AI-graded prompt lab will be a meaningfully differentiated addition to ViewPrep that captures a market the DSA-only product cannot serve."

**Type of assumption tested:**
- [x] Problem importance — candidates have a real, painful gap in AI engineering interview prep
- [x] Customer segment — we are targeting the right expanding customer (AI/ML engineering candidates, not only SWE DSA candidates)
- [x] Value proposition — graded prompt challenges create more value than static tutorials or MCQ quizzes
- [x] Technical feasibility — an AI judge can reliably and explainably score prompt submissions

**Why did this assumption matter?**
DSA interview prep is a commodity market with well-funded incumbents (LeetCode, NeetCode, AlgoExpert). If ViewPrep stays DSA-only, differentiation is difficult. The AI engineering hiring surge creates a window to own a new category before competition matures. If this assumption was wrong — if candidates don't actually practice prompt engineering or don't see value in scored feedback — we would have wasted the build and needed to return to competing on DSA features alone.

**Importance of assumption:** 5 — Critical (this determines the product's long-term differentiation strategy)

**Pre-test confidence:** 3 — We observed the market signal (rapid AI hiring, prompt engineering listed in JDs) but had not yet validated with users that a scored lab is more valuable than reading guides.

**AI agent alignment importance:** 7 — Extremely important
**AI agent explainability importance:** 7 — Extremely important (candidates must understand *why* they scored poorly to improve)
**Data minimization importance:** 6
**Platform reliability importance:** 7
**Continuous improvement importance:** 6

---

## The Pivot Rationale

### Market Context
The 2025–2026 AI hiring surge changed what FAANG interviews test. Engineering roles increasingly include a "prompt engineering" or "AI systems design" component where candidates must:
- Write prompts that reliably extract structured outputs from LLMs
- Demonstrate understanding of model behavior (refusals, hallucinations, temperature effects)
- Design prompts that are robust across varied inputs (consistency)
- Write concise prompts that minimize token costs at scale (efficiency)

No existing tool graded these skills. LeetCode tests algorithms. HackerRank tests code. ViewPrep originally tested both — but the new category was unclaimed.

### The Decision
Rather than build a separate product, we added an "Applied AI Engineering" section to the ViewPrep dashboard — visually distinct from DSA practice, behind a feature flag, but sharing the same auth, UI system, and Gemini infrastructure. This was the minimal footprint to test the hypothesis without forking the codebase.

### What We Built

**8 FAANG-level prompt engineering challenge categories:**
1. Chain-of-thought reasoning
2. JSON extraction and schema enforcement
3. Sentiment classification with structured output
4. Constrained summarization (length + format constraints)
5. ISO date extraction (structured parsing)
6. Format enforcement (strict output templates)
7. Refusal robustness (adversarial prompt injection resistance)
8. Tone rewriting (style transfer with content preservation)

**Grading pipeline (3 axes):**
- **Correctness (70%)** — deterministic checks (exact match, regex, JSON schema) for objective cases; Gemini LLM judge for semantic cases
- **Consistency (15%)** — variance across repeated runs with the same prompt; penalizes brittle prompts
- **Efficiency (15%)** — token count vs. reference budget; rewards concise, precise prompts

**Architecture decisions driven by entrepreneurial constraints:**
- Reused the existing Gemini client singleton (no new API setup, no new credentials)
- SQLite-backed job queue (no new infrastructure for MVP)
- Feature flag isolation (`NEXT_PUBLIC_PROMPT_TESTER_ENABLED`) so the DSA product never risks breaking
- Version-pinned question specs so historical scores are always reproducible

---

## Experiment / Test Design

**What did we do?**
Built the full prototype — backend (FastAPI + SQLAlchemy, 6-table schema, grading pipeline, worker, seed CLI) and frontend (question list, challenge detail with prompt editor, submission polling, 3-axis score report) — in an isolated git branch (`feat/prompt-eng-tester`) with the main branch and live database completely untouched.

**Evidence collected:**
- [x] Technical test results
- [x] AI model outputs / evaluations
- [x] Prototype usage

**Who was tested:**
The grading pipeline was validated against 8 pre-seeded challenge types. The frontend flow was validated via Playwright e2e against a real browser and live dev server.

**Success criteria:**
- Feature flag correctly hides/shows the entire Applied AI Engineering section
- The DSA interview module, interview room, and feedback report are completely unaffected
- All 8 question types produce coherent, human-readable score rationales from the judge
- The prototype is live and navigable end-to-end on the feature branch

---

## Evidence Collected

**What did we actually observe?**

1. **Feature flag isolation confirmed** — toggling `NEXT_PUBLIC_PROMPT_TESTER_ENABLED=false` removes the Applied AI Engineering section without affecting the DSA module, interview room, or feedback report.
2. **All 8 question categories seeded and grading correctly** — the self-validation gate (seed CLI refuses to load broken question specs) passed all 8 question files without error.
3. **Gemini judge returns structured, explainable output** — every judge response includes a `score` (0.0–1.0), a human-readable `rationale`, and the `model` identifier. Candidates can read exactly why they lost points.
4. **3-axis score report renders correctly** — the frontend displays correctness, consistency, and efficiency axes with percentage breakdowns and pass/fail indicators.
5. **End-to-end user flow works**: dashboard → Applied AI Engineering card → question list → challenge detail → submit prompt → polling → score report.
6. **Side benefit**: the Playwright tests we wrote to validate this flow also caught two real auth guard vulnerabilities in the existing product (`/interview` and `/interview/feedback` had no authentication checks), which were then fixed.

**Strongest evidence:**
The full end-to-end flow — write a prompt, submit, poll for grading, view a score report with a Gemini-written rationale — works in a real browser against a live server, with zero changes to the existing DSA product or database.

**Did evidence support the assumption?**
**Strongly supported the technical assumption.** The AI judge is reliable and explainable. The pivot is buildable without touching existing product. Customer-side validation (do users value this?) is the logical next step.

**Post-test confidence:** 4

---

## Learning and Decision

**What did we learn?**

1. **Prompt engineering prep is a buildable category** — the technical risk is resolved. The question is now market validation, not feasibility.
2. **Layered grading (deterministic + LLM judge) is the right architecture** for AI-graded subjective tasks. Pure LLM is expensive and variable; pure deterministic fails on semantic tasks.
3. **The "Applied AI Engineering" framing resonates** — placing it as a distinct section from DSA on the dashboard signals to candidates that this is a different kind of practice, which matches how interviewers think about the two skill sets.
4. **Feature flag strategy worked** — we could ship a new product surface without any risk to the existing working product.

**Decision made:**
- [x] Continue with current direction
- [x] Build or revise prototype/MVP
- [x] Deploy new or revise existing AI agents

**Why:**
Technical feasibility is proven. The build adds a differentiated feature with zero regression to existing features. The next step is putting real candidates in front of it.

**What changed in this venture cycle:**
- ViewPrep now has two distinct product pillars: DSA Interview Practice (existing) and Applied AI Engineering (new)
- The dashboard communicates this split with a dedicated "Applied AI Engineering" section
- The grading architecture is extensible — new question types can be added as JSON files with no backend code changes

---

## AI Integration and Leverage

**AI tools used:**
- [x] Claude (Claude Code — AI pair programmer for the full build)
- [x] Gemini (Google Gemini API — the AI judge powering prompt grading)

**How AI helped:**
- [x] Build prototype or MVP
- [x] Write code
- [x] Evaluate technical feasibility
- [x] Identify responsible AI / privacy / bias / safety risks
- [x] Improve decision-making

**Hands-on experience with AI agents:**
"I have built AI agent systems that include custom integrations and guardrails (e.g., access controls, consent flows, audit logs)"
— The grading pipeline is a custom multi-step AI agent: it receives user submissions, runs deterministic gates, invokes the Gemini judge via API with a structured scoring prompt, enforces anti-gaming detection, and writes immutable score records.

**Most valuable AI-assisted step:**
Claude Code designed and implemented the entire module — 30 files, 4,222 lines — in a single session running in an isolated git worktree, without touching main branch or live database. The architecture decisions (version-pinning, layered grading, singleton client reuse) were co-designed in conversation, compressing what would be multiple planning and build sprints into one focused cycle.

**Where AI fell short:**
Customer-side validation cannot be AI-simulated. Whether FAANG candidates will find the question difficulty appropriate, whether the score report is actionable, and whether this feature drives retention — these require real users, not model outputs.

**Business functions using AI agents:**
- [x] Product or prototype development
- [x] Analytics & decision support (AI-graded scoring)
- [x] Customer service & support (AI feedback reports in interview module)

---

## Responsible Impact

**Considerations raised:** Yes

1. **Judge explainability** — rationale strings are required on every judge call; a score without explanation is rejected
2. **Anti-gaming** — consistency axis detects and penalizes trivially constant prompts; question test cases are never exposed via API
3. **Data minimization** — only user ID stored in grading tables, not name or email
4. **Fairness risk** — non-English speakers may score lower on style/tone questions due to linguistic bias in the Gemini judge; current question set is weighted toward structured-output tasks (JSON, regex, classification) to reduce this risk

---

## Progress and Next Steps

**Meaningfulness of this cycle:** Significant learning

**Next priority:**
Flip the feature flag in production and recruit 10 FAANG-track candidates to run through the 8 challenges. Measure: (a) do they complete the flow? (b) do they find the rationale actionable? (c) would they pay for access?

**Expected completion of next cycle:** Within two weeks

---

## Commit Evidence

| # | Hash | Message |
|---|---|---|
| 1 | `2f500abc9ecf8b5937a102812cd7fc39b036d742` | `feat(prompt-tester): add Applied AI Engineering module` — 30 files, 4,222 lines |
| 2 | `388f8ed5b9d41e4a48ad1e07efc36725bdb020aa` | `Update readme with recent features` |

**Branch:** `feat/prompt-eng-tester` → `origin/feat/prompt-eng-tester`
