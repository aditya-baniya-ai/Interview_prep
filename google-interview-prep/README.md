# Google Interview Prep AI

An immersive, real-time mock interview application designed to help candidates prepare for Google software engineering and behavioral interviews. The application features a fully interactive AI interviewer ("Sarah") capable of real-time voice conversation, code analysis, and dynamic feedback generation powered by the Gemini Live API.

## 🌟 Core Features

- **Real-Time Voice AI Interviewer**: Engage in low-latency, bidirectional, natural spoken conversations with an AI interviewer.
- **Photorealistic Animated Avatar**: Experience a realistic simulated video call with "Sarah", a generated interviewer whose mouth animates in sync with the semantic flow of the audio.
- **Live Code Evaluation**: Integrated Monaco code editor. Every 10 seconds, your code is silently synced to the AI interviewer so she can see your progress and provide targeted hints when you are stuck.
- **Behavioral & Coding Tracks**: 
  - *Coding*: 30-minute sessions focused on DSA, problem-solving, and code execution.
  - *Behavioral*: 5-minute sessions focused on the STAR method, leadership, and teamwork.
- **Dynamic Feedback Engine**: At the end of every interview, Gemini 2.5 Flash acts as a Senior Google Engineer to evaluate your complete transcript and code, providing a detailed breakdown of your Communication, Engagement, Code Quality, and a final "Hire / No Hire" decision.
- **Secure Architecture**: Implements Google's recommended Ephemeral Token architecture so your sensitive API keys are never exposed to the browser.
- **Google Authentication**: Seamless Firebase Google Sign-In backend to track your mock interview history.

---

## 🏗️ Technical Architecture & Connection Mechanics

The application is split into a robust **Next.js Frontend** and a lightweight **FastAPI Backend**, communicating tightly with Google's **Gemini Models**.

### 1. The Ephemeral Token Flow (WebSocket Initialization)
To establish a real-time voice connection directly between the user's browser and Google GenAI without routing massive audio streams through our backend (which would cause severe latency), the system uses an Ephemeral Token exchange:
1. When you start an interview, the frontend asks the Python backend for a token.
2. The FastAPI backend authenticates with `gemini.google.com` using the secure `GEMINI_API_KEY` and requests a short-lived **Ephemeral Authentication Token** via the `auth_tokens.create` endpoint. The backend also attaches system instructions (telling the AI to act as Sarah, providing the coding problem context, etc.).
3. The token is returned to the frontend.
4. The frontend uses this token to open a direct WebSocket connection (`BidiGenerateContentConstrained`) to `wss://generativelanguage.googleapis.com`.

### 2. Bi-Directional Audio Streaming
Once the WebSocket is active:
- **Microphone (Input)**: The frontend uses the `Web Audio API` (`ScriptProcessorNode`) to capture the user's microphone at 16kHz, converts it to Int16 PCM data, encodes it to base64, and streams it to Gemini. Voice Activity Detection (VAD) is configured to wait 3 seconds before the AI responds, preventing unnatural interruptions while the human pauses to think.
- **Speaker (Output)**: When the AI speaks, it streams base64 audio chunks back over the WebSocket. The frontend decodes these chunks back into Int16 PCM, converts them to Float32, and plays them via an `AudioContext` buffer.

### 3. Live Code Sync
While you write coding solutions in the Monaco editor, a React `useEffect` interval triggers every 10 seconds. It captures your current code state and sends it as a silent text update (`clientContent`) over the active WebSocket. The AI stores this in its context window, allowing you to ask "Does this implementation look right?" and allowing the AI to organically reply based on your actual typed code.

### 4. Avatar Lip-Sync Simulation
To create a realistic "video call" feel without relying on expensive, high-latency third-party generation APIs (like HeyGen):
- We generated two identical photorealistic images of Sarah: one with a closed mouth and one with an open mouth.
- When the WebSocket receives a stream indicating the AI is speaking (`audioStatus === "speaking"`), a rapid 150ms interval toggle is activated in React.
- The UI seamlessly flashes between the closed and open mouth images, creating a highly effective simulated lip-sync effect synchronized perfectly with the inbound audio buffer.

### 5. Dynamic Evaluation & Feedback
When you intentionally click "End Interview", or the timer runs out, the WebSocket is closed. 
1. The frontend gathers all recorded dialogue into a complete `Transcript` and grabs your final code block.
2. This packet is POSTed to the backend `/api/interview/{session_id}/generate-feedback`.
3. The backend feeds this entire context to `gemini-2.5-flash` with a strict JSON system prompt.
4. Gemini evaluates performance based on Google's actual rubric (Clarity, Hint Usage, Time Complexity, Confidence) and returns a structured JSON payload which is instantly rendered on the Feedback Dashboard.

---

## 🛠️ Technology Stack

**Frontend:**
- **Next.js 14+ (App Router)** & React 18
- **Monaco Editor** (for live coding)
- **Web Audio API** (PCM processing & audio playback)
- **Firebase Authentication**

**Backend:**
- **Python 3.10+ & FastAPI**
- **Uvicorn** (ASGI Server)
- **Google GenAI SDK** (latest `google-genai` package)

**AI Models:**
- `gemini-2.0-flash-exp` (utilized via Bidi API format for low-latency Real-time Voice)
- `gemini-2.5-flash` (utilized for post-interview transcript analysis and feedback)
