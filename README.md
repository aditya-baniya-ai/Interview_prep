# FAANG Prep AI

> A real-time AI mock interview platform for Google, Amazon, Meta, Apple, and Netflix — built with Gemini Live API, Next.js, and FastAPI.

---

## The Problem

Preparing for FAANG interviews is hard — not because the material is inaccessible, but because **realistic practice is**. LeetCode tells you if your code is correct. YouTube teaches you STAR frameworks. But nothing puts you in the actual discomfort of speaking your solution out loud under time pressure, to a human who asks follow-up questions, while your code is being watched.

Mock interviews with real engineers are rare, expensive, and hard to schedule. AI chatbots are better than nothing, but they're asynchronous — you type, you wait, you read. That's not what a real interview feels like.

**FAANG Prep AI solves this by simulating the full interview experience end-to-end**: a voice-first AI interviewer that listens, responds, watches your code in real time, and delivers a structured hire/no-hire decision when you're done.

---

## Screenshots

### Landing Page
![Landing Page](./google-interview-prep/public/screenshots/landing.png)

### Dashboard — Choose Your Interview
![Dashboard](./google-interview-prep/public/screenshots/dashboard.png)

---

## What It Does

### Two Interview Tracks

**Coding Interview (DSA)**
- The AI presents a real DSA problem (Arrays, Trees, Graphs, DP, Strings) calibrated to Easy / Medium / Hard (L2–L5+)
- You speak your approach out loud while writing code in a Monaco editor
- Your code is silently synced to the AI every 10 seconds — it can see exactly what you're building and gives targeted hints accordingly
- A Judge0 sandbox compiles and runs your code against test cases in real time

**Behavioral Interview (STAR)**
- The AI asks behavioral questions on Leadership, Teamwork, Conflict Resolution, and Growth
- It listens to your full answer and probes with natural follow-up questions
- Evaluates STAR structure, communication clarity, and storytelling ability

### Real-Time Voice — Not a Chatbot
The interviewer is fully voice-driven. You speak; it listens and responds with sub-second latency using Google's **Gemini Live API** over a persistent WebSocket. There is no typing, no submit button, no waiting for a page to load. It feels like a phone call.

### Animated AI Interviewer — "Sarah"
The interview UI simulates a video call with a photorealistic AI interviewer. Her mouth animates in sync with her speech — without any third-party avatar API. The system alternates between a closed-mouth and open-mouth image on a 150ms interval whenever audio is streaming, creating a convincing lip-sync effect at zero added cost or latency.

### Feedback Report
When the interview ends, Gemini 2.5 Flash — acting as a Senior Engineer — evaluates your complete transcript and final code submission against a structured rubric:

- **Communication** — Clarity, structure, articulation
- **Problem Solving** — Approach, edge case handling, hint usage
- **Code Quality** — Correctness, time/space complexity, readability
- **Engagement** — Confidence, eye contact, composure
- **Final Decision** — Hire / Lean Hire / Lean No Hire / No Hire

---

## Architecture

```
Browser (Next.js)
    │
    ├── 1. Requests ephemeral token  ──►  FastAPI Backend
    │                                         │
    │   ◄── Short-lived token ────────────────┘
    │
    ├── 2. Opens direct WebSocket  ──►  Gemini Live API (wss://)
    │         │                               │
    │   PCM audio (16kHz, base64)    ◄── Audio chunks + text
    │
    ├── 3. Code sync (every 10s)  ──►  WebSocket clientContent
    │
    └── 4. End of interview POST  ──►  FastAPI /generate-feedback
                                           │
                                      Gemini 2.5 Flash
                                           │
                                    Structured JSON report
```

### Why Ephemeral Tokens?
Streaming microphone audio through a backend server would introduce 200–400ms of unnecessary latency on every audio chunk. Instead, the backend generates a **short-lived authentication token** (valid for one session), hands it to the browser, and the browser opens a direct WebSocket to Google's infrastructure. The API key never touches the client. Low latency, full security.

### Multi-Agent Backend (Google ADK)
The backend uses **Google's Agent Development Kit** to orchestrate a hierarchy of specialized agents:

| Agent | Responsibility |
|---|---|
| `Orchestrator` | Routes to the correct agent based on interview phase |
| `CodingInterviewer` | DSA problem presentation, hint management |
| `BehavioralInterviewer` | STAR question flow and follow-up logic |
| `CodeEvaluator` | Real-time code analysis and complexity feedback |
| `FeedbackGenerator` | Post-interview scoring and hire decision |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (App Router), React, TypeScript, CSS Modules |
| **Code Editor** | Monaco Editor (same engine as VS Code) |
| **Audio** | Web Audio API — PCM capture, base64 streaming, Float32 playback |
| **Backend** | Python 3.12, FastAPI, Uvicorn |
| **AI — Voice** | Gemini Live API (`gemini-2.0-flash-live-preview`) via WebSocket |
| **AI — Feedback** | Gemini 2.5 Flash (structured JSON evaluation) |
| **Agent Framework** | Google ADK (Agent Development Kit) |
| **Code Execution** | Judge0 (multi-language sandbox) |
| **Auth & Storage** | Firebase Authentication + Firestore |
| **Theming** | CSS custom properties, light/dark toggle, flash-free SSR |

---

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.12+
- A Google Gemini API key
- A Firebase project

### 1. Clone the repo
```bash
git clone https://github.com/aditya-baniya-ai/Interview_prep.git
cd Interview_prep/google-interview-prep
```

### 2. Frontend
```bash
npm install
```

Create `.env.local`:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

```bash
npx next dev
```

### 3. Backend
```bash
cd backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```env
GEMINI_API_KEY=your_key_here
```

```bash
uvicorn main:app --reload --port 8000
```

Frontend → `http://localhost:3000` · Backend → `http://localhost:8000`

---

## Key Engineering Decisions

**Direct WebSocket to Gemini (not proxied)**
Routing audio through the backend would add 200–400ms per chunk. The ephemeral token pattern eliminates this without compromising key security.

**Lip-sync without an avatar API**
Services like HeyGen add ~1–2s of latency and significant cost per session. The alternating image approach delivers a visually convincing result at zero added latency or cost.

**Live code sync as silent context**
Rather than asking the candidate to explicitly "submit" their code, a background interval pushes the current editor state into the AI's context window every 10 seconds. The interviewer naturally incorporates this — asking "I see you're using a hash map here, can you walk me through why?" — without any explicit handoff.

**CSS-only dark mode with no flash**
An inline `<script>` in `<head>` reads `localStorage` synchronously before React hydrates, setting `data-theme` on `<html>` before the first paint. Zero flash of wrong theme.

---

## Built By

**Shivendra Bhagat** — Built for the Launchd Build Sprint Hackathon

---

*"The best way to prepare for a FAANG interview is to do one — as many times as you need."*
