# Experiment Log 02 — Testing Strategy: AI-Driven Playwright E2E + Traditional Pytest Unit Tests

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
**6.** This cycle is specifically about testing — we used AI tools (Claude Code) to design and write tests, and Playwright to automate browser-level testing, while traditional pytest unit tests validate the AI grading logic independently of any browser or network.

**Type of Experiment Log:**
- [x] Technical feasibility test
- [x] AI-enabled product or workflow test
- [x] Prototype or MVP test with users

**Short title:**
"Validated the Prompt Engineering Tester with two-layer testing: AI-assisted Playwright e2e + traditional pytest unit tests — no mocks on the browser side"

**Date or date range:**
June 3–4, 2026

**Summary (2-4 sentences):**
After building the Prompt Engineering Tester module, we validated it using two complementary testing layers: Playwright end-to-end tests running against a real Chromium browser and live Next.js dev server (no mocks, no fake data), and a traditional pytest unit test suite covering the AI grading pipeline logic with mocked Gemini API calls. The two layers tested different things: Playwright verified that real users could navigate the full flow (auth → dashboard → challenge → submit → score), while pytest verified that the grading math, deterministic checks, and judge orchestration were correct in isolation. Playwright tests caught two pre-existing auth vulnerabilities in the product that unit tests could not have found. Combined, 17 Playwright tests and 26 pytest tests all passed.

---

## Hypothesis / Assumption Tested

**Hypothesis:**
"A two-layer testing strategy — Playwright for real browser flows (no mocks) and pytest for deterministic grading logic — will catch different classes of bugs and give us higher confidence than either approach alone, without requiring a full staging environment."

**Type of assumption tested:**
- [x] Technical feasibility — we can test a full-stack AI-graded feature without a staging environment
- [x] AI feasibility — AI-assisted test generation (Claude Code writing test cases) produces valid, non-trivial tests
- [x] Product usability — users can navigate the actual UI flow without errors

**Why did this assumption matter?**
Without a solid test foundation, every change to the grading pipeline or UI risks silently breaking the product. An AI-graded feature has a higher failure surface than a deterministic one — bugs can be silent (wrong score with no crash). Choosing the wrong testing strategy (e.g., all mocks) would give false confidence. If this approach failed, we'd either ship with untested code or invest in a full staging environment prematurely.

**Importance of assumption:** 4

**Pre-test confidence:** 3 — We knew both tools were capable individually but weren't sure they'd cover the right surface area when combined on an AI-graded feature.

---

## The Two-Layer Testing Architecture

### Layer 1 — Playwright End-to-End (Browser + Live Server)

**What it tests:** Full user flows in a real browser against a running Next.js dev server. No API mocks, no fake Firebase auth simulation, no stubbed data — if the real server isn't running or auth fails, the test fails.

**Configuration:**
```ts
// playwright.config.ts
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "html",
  use: { baseURL: BASE_URL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
```

Key decision: `reuseExistingServer: true` in dev — tests run against the same server the developer is looking at, making failures immediately reproducible.

**Test files and coverage:**

| File | Tests | What it covers |
|---|---|---|
| `e2e/landing.spec.ts` | 4 | Landing page headline, CTA button, theme toggle, document title |
| `e2e/auth.spec.ts` | 4 | Unauthenticated access to `/dashboard`, `/interview`, `/interview/feedback` → redirect to `/login` |
| `e2e/prompt-tester.spec.ts` | 5 | Question list renders, challenge detail page, prompt submission flow, score report display |
| `e2e/dashboard-card.spec.ts` | 4 | Applied AI Engineering section visibility, prompt-tester card route accessibility |

**Total: 17 Playwright tests, all passing.**

**Critical bugs Playwright caught that unit tests could not:**

1. **Auth guard missing on `/interview`** — unauthenticated users could access the live interview room directly by URL. Playwright's auth redirect test failed → we added a `useEffect` auth guard to `interview/page.tsx`.

2. **Auth guard missing on `/interview/feedback`** — same vulnerability on the feedback report page. Playwright caught it → fixed with auth redirect `useEffect` + loading state guard in `interview/feedback/page.tsx`.

3. **Auth race condition on feedback page** — `loadFeedback` fired before Firebase auth resolved, causing an immediate 401. Playwright exposed the timing issue → fixed by adding `if (authLoading) return;` early return and adding `authLoading` to the `useEffect` dependency array.

These were real security and UX bugs in production code. No unit test could have found them — they only exist at the browser/auth/routing intersection.

---

### Layer 2 — Pytest Unit Tests (Traditional, Isolated)

**What it tests:** The AI grading pipeline logic in complete isolation from the browser, network, and real Gemini API. Gemini API calls are mocked using `unittest.mock.patch` — this is the correct place for mocks because we're testing our logic, not Google's API.

**Why mocks are appropriate here (and not in Playwright):**
- Unit tests verify our math: score weights, deterministic graders, consistency axis variance calculation, anti-gaming detection
- If the Gemini API is down, our grading logic should still be verifiably correct
- Mocking the API surface means tests are fast (ms, not seconds) and fully deterministic
- Playwright handles the real-API integration — mocking there would defeat the purpose

**Test files and coverage:**

| File | Tests | What it covers |
|---|---|---|
| `tests/test_grader.py` | ~15 | Exact match, regex, JSON schema, classification, constraint, consistency axis, efficiency axis, score aggregation, anti-gaming flag |
| `tests/test_api.py` | ~7 | FastAPI endpoint responses: question list, question detail, submission create, submission status polling, score retrieval |
| `tests/test_worker.py` | ~4 | Worker atomicity (job claims are exclusive), retry logic, failure state transitions |
| `tests/test_self_validation.py` | ~4 | Seed CLI self-validation gate: rejects broken question specs before they can be loaded |

**Total: 26 pytest tests, all passing.**

**Sample: grader unit test structure**
```python
def test_exact_match_pass_case_insensitive():
    tc = {"type": "exact_match", "expected": "Hello World", "case_insensitive": True}
    assert _grade_exact_match("hello world", tc) is True

def test_consistency_axis_penalizes_identical_outputs():
    # All outputs identical across different inputs = anti-gaming flag
    outputs = ["yes", "yes", "yes", "yes"]
    score, flagged = _compute_consistency(outputs, inputs=["a", "b", "c", "d"])
    assert flagged is True
    assert score < 0.5
```

**Bugs pytest caught:**

1. **Consistency axis edge case** — when all outputs were identical strings but inputs varied, the anti-gaming check was not firing. Fixed in `grader.py`.
2. **Score weights not summing to 1.0** — early draft had `correctness: 0.70, consistency: 0.20, efficiency: 0.15` (sum = 1.05). Caught by the self-validation gate, fixed to `0.70 / 0.15 / 0.15`.
3. **JSON schema grader crashing on empty output** — `json.loads("")` raises `JSONDecodeError`; added try/except. Caught by a targeted test case.

---

## Experiment / Test Design

**What we did:**
1. Wrote Playwright config with real dev server (no mock server, no static fixtures)
2. Wrote 4 e2e test files covering auth, landing, prompt-tester flows, and dashboard
3. Wrote 4 pytest test files covering grader functions, API endpoints, worker, and seed validation
4. Ran all tests against the real codebase — fixed every failure before committing
5. Fixed tsconfig to exclude `e2e/` from the app TypeScript compiler (they use different `types`)

**Evidence collected:**
- [x] Technical test results
- [x] Behavioral data (Playwright browser execution traces)
- [x] AI model outputs / evaluations (Claude Code wrote the tests; we reviewed and corrected)

**Who / what was tested:**
- 4 user-facing flows in a real Chromium browser
- 8 grading pipeline functions in isolation
- 3 API endpoint behaviors
- Worker atomicity and retry logic

**Success criteria defined in advance:**
- 0 test failures after fixes
- Playwright tests run against real browser with no mocks at the HTTP or Firebase layer
- Pytest tests run without a real Gemini API key (full mock isolation)
- TypeScript compiler reports 0 errors after tsconfig fix

---

## Evidence Collected

**What we actually observed:**

**Playwright (17/17 passing):**
- All auth redirect tests pass: unauthenticated access to protected routes correctly redirects to `/login`
- Landing page renders with correct headline and CTA
- Prompt-tester question list renders with at least one challenge card
- Dashboard Applied AI Engineering section is visible when feature flag is on
- No console errors or navigation failures in any test run

**Pytest (26/26 passing):**
- All 5 deterministic grader functions return correct pass/fail for boundary cases
- Score aggregation respects weight formula: correctness×0.70 + consistency×0.15 + efficiency×0.15
- Anti-gaming detection fires correctly on constant-output prompts
- Worker correctly marks jobs as claimed atomically (no double-processing in concurrent test)
- Self-validation gate rejects question specs with missing required fields

**TypeScript (0 errors):**
- Root cause of 1,300 false-positive errors identified: `e2e/` directory was inside the app's `**/*.ts` glob but had no `@playwright/test` types in scope
- Fix: added `"e2e"` to `exclude` in `tsconfig.json`, created `e2e/tsconfig.json` with `"types": ["node"]`

**Strongest evidence:**
Two real security bugs (missing auth guards on `/interview` and `/interview/feedback`) discovered and fixed purely because Playwright ran as a real unauthenticated browser session — something no unit test or TypeScript compiler check would have found.

**Did the evidence support the assumption?**
**Strongly supported.** The two-layer approach caught different bug classes. Playwright found auth/routing/timing bugs; pytest found math and edge-case logic bugs. Neither layer alone would have been sufficient.

**Post-test confidence:** 5

---

## Learning and Decision

**What we learned:**

1. **Real-browser testing without mocks is non-negotiable for auth flows.** Mocking Firebase or the Next.js router would have hidden the auth guard bugs entirely. Real Chromium + live server is the only way to test "what happens when a stranger visits this URL."

2. **Mock Gemini in unit tests, not in e2e.** This is the correct boundary: unit tests verify our logic (mock the external); e2e tests verify the full stack (use the real thing or an appropriately seeded test environment).

3. **tsconfig scope matters for AI-assisted test generation.** When Claude Code generated Playwright test files inside `e2e/`, they used `@playwright/test` types that the app's tsconfig didn't know about. Scope isolation via a separate `e2e/tsconfig.json` is the right fix — not suppressing errors.

4. **AI-written tests still require human review.** Claude Code generated syntactically valid, logically sound tests — but the auth test initially checked for a redirect to `/auth` instead of `/login`. One human review pass caught all such discrepancies.

5. **The self-validation gate (seed CLI) is itself a test.** Requiring question specs to pass validation before seeding means the question data is part of the tested surface, not an assumption.

**Decision made:**
- [x] Continue with current direction
- [x] Build or revise prototype/MVP

**What changed:**
- Playwright is now the standard for all e2e testing on this project (real browser, real server, no mocks at the HTTP layer)
- Pytest is the standard for all backend logic testing (full mock isolation for external APIs)
- `e2e/tsconfig.json` isolates Playwright types from the app compiler
- Both test suites are committed and run on the feature branch; CI integration is next

---

## AI Integration and Leverage

**AI tools used:**
- [x] Claude (Claude Code — wrote the majority of test cases; reviewed and corrected by developer)
- [x] Gemini (mocked in unit tests; real in the grading integration path)

**How AI helped:**
- [x] Write code (test files)
- [x] Evaluate technical feasibility
- [x] Identify responsible AI / privacy / bias / safety risks
- [x] Build prototype or MVP

**Hands-on experience with AI agents:**
"I have built AI agent systems that include custom integrations and guardrails"

**Most valuable AI-assisted step:**
Claude Code generated the full Playwright test suite and 26 pytest tests covering boundary cases (empty strings, schema mismatches, concurrent worker claims) that would take significant manual effort to enumerate. This was faster than writing tests by hand and produced more comprehensive edge-case coverage.

**Where AI fell short:**
- Generated tests occasionally checked wrong selectors (e.g., wrong heading text) — required 1 manual review pass
- AI could not run the tests in its own environment; developer had to execute and feed failures back
- Test strategy decisions (where to mock vs. where to use real APIs) required human judgment — the AI followed direction but did not independently propose the two-layer architecture

**What we learned about the AI-enabled solution:**
The grading pipeline's AI layer (Gemini judge) is fully mockable for unit testing without loss of test validity, because the judge interface is well-defined (input: prompt + rubric → output: score + rationale). This clean interface design is what makes the two-layer strategy work.

**Business functions using AI agents:**
- [x] Product or prototype development (Claude Code writing tests)
- [x] Analytics & decision support (grading pipeline validation)

---

## Responsible Impact

**Considerations raised:** Yes

1. **Test coverage ≠ correctness of AI scores** — passing tests prove the grading pipeline runs without crashing and respects the weight formula, but they cannot prove the judge's semantic scores are "fair." Human review of judge outputs remains necessary.
2. **No personal data in tests** — all Playwright tests use unauthenticated sessions or test account credentials; no real user data is created or read during test runs.
3. **Flaky tests from AI nondeterminism** — the Gemini judge is nondeterministic; we mock it entirely in unit tests to ensure test suite stability. This is intentional.

---

## Progress and Next Steps

**Meaningfulness of this cycle:** Meaningful progress

**Next priority:**
Set up CI (GitHub Actions) to run both test suites on every push to `feat/prompt-eng-tester`. Add a simple smoke test that hits the real Gemini judge once per CI run to catch API contract changes.

**Expected completion of next cycle:** Within two weeks

---

## Commit Evidence

| # | Hash | Message |
|---|---|---|
| 1 | `bb5bb9ae93ab92189a5434f56c0d40f265ce17d4` | `test(e2e): add Playwright tests + fix auth guards on interview pages` — 17 e2e tests, 2 auth bugs fixed |
| 2 | `b0ceb2274491631b668ca7a32ce9880c9de96052` | `fix(feedback): fix 5 bugs on the feedback report page` — auth race, space complexity, hints bar, PDF export, null guard |
| 3 | `4e783f5c716b84fecb6f9ff170b0a8adf164a828` | `fix(ts): exclude e2e/ from app tsconfig, add e2e/tsconfig.json` — 0 TypeScript errors |

Pytest tests (26 tests): committed as part of `2f500abc9ecf8b5937a102812cd7fc39b036d742` (`feat(prompt-tester): add Applied AI Engineering module`)

**Branch:** `feat/prompt-eng-tester` → `origin/feat/prompt-eng-tester`
