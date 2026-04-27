"""
FAANG Interview Prep AI — FastAPI Backend Server

Main server that handles:
- WebSocket connections for real-time interview sessions
- REST endpoints for session management and code execution
- Integration with Google ADK agents and Gemini Live API
"""

import json
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import HOST, PORT, CORS_ORIGINS
from tools.problem_bank import get_random_problem, get_problem_by_id, get_all_problems
from tools.judge0 import run_test_cases
from tools.gemini_live import create_live_token, get_interviewer_system_instruction

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ──────────── Data Models ────────────

class InterviewSession:
    """Tracks state for a single interview session."""

    def __init__(self, session_id: str, interview_type: str, language: str, duration: int):
        self.session_id = session_id
        self.interview_type = interview_type
        self.language = language
        self.duration = duration
        self.started_at = datetime.utcnow()
        self.transcript: List[dict] = []
        self.code_snapshots: List[dict] = []
        self.test_results: List[dict] = []
        self.problem: Optional[dict] = None
        self.hints_given = 0
        self.is_active = True
        self.feedback: Optional[dict] = None

    def add_transcript(self, speaker: str, text: str):
        self.transcript.append({
            "speaker": speaker,
            "text": text,
            "timestamp": datetime.utcnow().isoformat(),
        })

    def add_code_snapshot(self, language: str, code: str):
        self.code_snapshots.append({
            "language": language,
            "code": code,
            "timestamp": datetime.utcnow().isoformat(),
        })


class StartInterviewRequest(BaseModel):
    interview_type: str = "coding"
    language: str = "python"
    duration: int = 45


class RunCodeRequest(BaseModel):
    language: str
    code: str
    problem_id: Optional[str] = None


# ──────────── Session Store ────────────

sessions: Dict[str, InterviewSession] = {}
active_connections: Dict[str, WebSocket] = {}


# ──────────── App Lifecycle ────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    logger.info("🚀 FAANG Interview Prep AI Backend starting...")
    logger.info(f"📡 CORS origins: {CORS_ORIGINS}")
    yield
    logger.info("👋 Backend shutting down...")


# ──────────── FastAPI App ────────────

app = FastAPI(
    title="FAANG Interview Prep AI",
    description="Backend API for AI-powered FAANG interview preparation",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ──────────── REST Endpoints ────────────

@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "FAANG Interview Prep AI",
        "status": "running",
        "version": "1.0.0",
    }


@app.get("/api/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "active_sessions": len(sessions),
        "active_connections": len(active_connections),
    }


class LiveTokenRequest(BaseModel):
    interview_type: str = "coding"
    session_id: Optional[str] = None
    difficulty: Optional[str] = "Medium"


@app.post("/api/live/token")
async def get_live_token(request: LiveTokenRequest):
    """Generate an ephemeral token for Gemini Live API.

    The frontend uses this token to connect directly to Gemini's
    WebSocket endpoint for lowest-latency voice conversations.
    """
    # Get the system instruction based on interview type and problem
    problem = None
    if request.session_id and request.session_id in sessions:
        problem = sessions[request.session_id].problem
    
    if not problem and request.interview_type == "coding":
        from tools.problem_bank import get_random_problem
        problem = get_random_problem(difficulty=request.difficulty)
        # We can store the session if we want, but at minimum pass the problem
        if request.session_id and request.session_id not in sessions:
            sessions[request.session_id] = InterviewSession(
                session_id=request.session_id,
                interview_type=request.interview_type,
                language="python",
                duration=45
            )
        if request.session_id:
            sessions[request.session_id].problem = problem

    system_instruction = get_interviewer_system_instruction(
        request.interview_type, problem
    )

    token_data = create_live_token(request.interview_type)
    token_data["system_instruction"] = system_instruction

    logger.info(f"🎤 Live API token generated for {request.interview_type} interview")

    return token_data


@app.post("/api/interview/start")
async def start_interview(request: StartInterviewRequest):
    """Create a new interview session."""
    import uuid
    session_id = f"session_{uuid.uuid4().hex[:12]}"

    session = InterviewSession(
        session_id=session_id,
        interview_type=request.interview_type,
        language=request.language,
        duration=request.duration,
    )

    # Select a problem for coding interviews
    if request.interview_type == "coding":
        problem = get_random_problem(difficulty="Medium")
        session.problem = problem

    sessions[session_id] = session

    logger.info(f"📋 New interview session: {session_id} ({request.interview_type})")

    return {
        "session_id": session_id,
        "interview_type": request.interview_type,
        "language": request.language,
        "duration": request.duration,
        "problem": session.problem if session.problem else None,
    }


@app.post("/api/code/run")
async def run_code(request: RunCodeRequest):
    """Execute code against test cases via Judge0."""
    if request.problem_id:
        problem = get_problem_by_id(request.problem_id)
        if not problem:
            raise HTTPException(status_code=404, detail="Problem not found")
        test_cases = problem["testCases"]
    else:
        # Default single execution
        test_cases = [{"input": "", "expected_output": ""}]

    results = await run_test_cases(
        source_code=request.code,
        language=request.language,
        test_cases=test_cases,
    )

    return {"results": results}


@app.get("/api/problems")
async def list_problems():
    """Get all available problems."""
    problems = get_all_problems()
    # Return without test cases (to prevent cheating)
    return [
        {
            "id": p["id"],
            "title": p["title"],
            "difficulty": p["difficulty"],
            "tags": p["tags"],
        }
        for p in problems
    ]


@app.get("/api/problems/{problem_id}")
async def get_problem(problem_id: str):
    """Get a specific problem by ID."""
    problem = get_problem_by_id(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    # Return without test cases
    return {
        "id": problem["id"],
        "title": problem["title"],
        "difficulty": problem["difficulty"],
        "tags": problem["tags"],
        "description": problem["description"],
        "examples": problem["examples"],
        "constraints": problem["constraints"],
        "starterCode": problem["starterCode"],
        "optimalTimeComplexity": problem["optimalTimeComplexity"],
        "optimalSpaceComplexity": problem["optimalSpaceComplexity"],
    }


@app.get("/api/interview/{session_id}/feedback")
async def get_feedback(session_id: str):
    """Get the feedback report for a completed session."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session.feedback:
        raise HTTPException(status_code=404, detail="Feedback not yet generated")

    return session.feedback


class FeedbackRequest(BaseModel):
    interview_type: str = "behavioral"
    transcript: list = []
    code: Optional[str] = None
    language: Optional[str] = None
    duration_minutes: int = 45
    time_used_seconds: int = 0
    # Penalty signals — accumulated by the frontend during the session.
    mic_off_seconds: int = 0          # mic muted outside of breaks
    video_off_seconds: int = 0        # camera off outside of breaks
    breaks_taken: int = 0             # number of breaks the candidate requested
    break_seconds_total: int = 0      # cumulative break duration


@app.post("/api/interview/{session_id}/generate-feedback")
async def generate_feedback(session_id: str, request: FeedbackRequest):
    """Generate real feedback using Gemini based on the interview transcript."""
    from google import genai
    from config import GEMINI_API_KEY

    # Format transcript for analysis
    transcript_text = ""
    for entry in request.transcript:
        speaker = "Interviewer" if entry.get("speaker") == "interviewer" else "Candidate"
        transcript_text += f"{speaker}: {entry.get('text', '')}\n"

    if not transcript_text.strip():
        transcript_text = "(No conversation recorded)"

    code_section = ""
    if request.code and request.code.strip():
        code_section = f"""
## Candidate's Code ({request.language or 'unknown'}):
```{request.language or ''}
{request.code}
```
"""

    # Build a "session conduct" section that surfaces the candidate's choices
    # to mute the mic, turn off the camera, or take breaks. The model is
    # instructed below to fold these signals into the engagement score.
    conduct_lines = []
    if request.mic_off_seconds > 0:
        conduct_lines.append(
            f"- Microphone was muted (outside of breaks) for ~{request.mic_off_seconds // 60}m {request.mic_off_seconds % 60}s."
        )
    if request.video_off_seconds > 0:
        conduct_lines.append(
            f"- Camera was off (outside of breaks) for ~{request.video_off_seconds // 60}m {request.video_off_seconds % 60}s."
        )
    if request.breaks_taken > 0:
        conduct_lines.append(
            f"- Candidate requested {request.breaks_taken} break(s), pausing the interview for "
            f"~{request.break_seconds_total // 60}m {request.break_seconds_total % 60}s in total."
        )
    if conduct_lines:
        conduct_section = (
            "\n## Session Conduct (penalty signals)\n"
            + "\n".join(conduct_lines)
            + "\nWhen scoring engagement (eyeContact, confidence) and the overall decision, "
            "lower the relevant scores proportionally to reflect that the candidate disengaged "
            "their camera/microphone or took breaks. Do not zero out the score — apply a "
            "modest, proportional penalty.\n"
        )
    else:
        conduct_section = ""

    # Coding-only schema fragment — kept as its own variable for readability.
    # We ask the model to produce inline `codeAnnotations` so the feedback page
    # can render the candidate's code with reviewer-style comments above the
    # specific lines that matter.
    coding_schema = ""
    if request.interview_type == "coding":
        coding_schema = """,
  "coding": {
    "problemSolving": <1-5>,
    "codeCorrectness": <1-5>,
    "codeQuality": <1-5>,
    "timeComplexity": "<detected>",
    "optimalTimeComplexity": "<optimal>",
    "spaceComplexity": "<detected>",
    "optimalSpaceComplexity": "<optimal>",
    "optimalCode": "<flawless optimal code snippet solving the problem constraints>",
    "codeReviewSummary": "<one or two sentence overall verdict on the candidate's code: what works, what doesn't>",
    "codeAnnotations": [
      {
        "line": <1-indexed line number in the candidate's code>,
        "severity": "warning" | "suggestion" | "info" | "praise",
        "message": "<short, specific reviewer comment — under 18 words>"
      }
    ],
    "optimalCodeAnnotations": [
      {
        "line": <1-indexed line number in the optimal code>,
        "severity": "info" | "praise",
        "message": "<short note explaining a key technique used in the optimal solution>"
      }
    ]
  }"""

    prompt = f"""You are a Staff Software Engineer at Google serving as a Bar Raiser. You are strictly evaluating a candidate's {request.interview_type} interview performance.
Analyze the following interview transcript meticulously. Your job is to provide a comprehensive, rigorous, and highly actionable evaluation based on Google's actual hiring rubrics.
Look for signal on: technical depth, problem-solving structuring, communication clarity, edge-case detection, leadership (for behavioral), and coding efficiency (for coding).

## Interview Transcript:
{transcript_text}

{code_section}
{conduct_section}
## Interview Duration: {request.time_used_seconds // 60} minutes used out of {request.duration_minutes} minutes

Please respond with ONLY a valid JSON object (no markdown, no extra text) with this exact structure:
{{
  "overallDecision": "Hire" | "Lean Hire" | "Lean No Hire" | "No Hire",
  "overallScore": <number 0-100>,
  "communication": {{
    "clarity": <1-5>,
    "approach": <1-5>,
    "hintsUsed": <estimated number>
  }},
  "engagement": {{
    "eyeContact": <1-5>,
    "confidence": <1-5>
  }},
  "recommendations": [
    "<detailed actionable recommendation 1 - focusing on root cause>",
    "<detailed actionable recommendation 2>",
    "<detailed actionable recommendation 3>",
    "<detailed actionable recommendation 4>",
    "<detailed actionable recommendation 5>"
  ]{coding_schema}
}}

For coding interviews, the `codeAnnotations` array MUST cite specific 1-indexed line numbers from the candidate's code (counting blank lines and comments) and each `message` must be a concrete, short reviewer note — e.g.:
  - severity "warning":    something is wrong or risky (off-by-one, mutation issue, O(n^2) bottleneck, missing edge case)
  - severity "suggestion": a clear way the code could be improved (use a hash map, extract a helper, simplify the branch)
  - severity "info":       a non-judgmental observation worth flagging (data structure choice, traversal direction)
  - severity "praise":     something the candidate did well (good naming, smart short-circuit, clean recursion base case)
Aim for 4–8 annotations covering both issues AND wins. Do not annotate every line — pick the ones that materially shape the code review.

Take a deep breath and analyze everything carefully. Base your scores exclusively on the ACTUAL conversation content and code provided. Do not be overly nice; give constructive, elite Google-level feedback.
"""

    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=genai.types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )

        # Parse the JSON response
        response_text = response.text.strip()
        # Remove markdown code fences if present
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1]
            if response_text.endswith("```"):
                response_text = response_text[:-3].strip()

        import json as json_module
        feedback = json_module.loads(response_text)

        # Add coding defaults if missing for coding interviews
        if request.interview_type == "coding":
            if "coding" not in feedback:
                feedback["coding"] = {
                    "problemSolving": 3, "codeCorrectness": 3, "codeQuality": 3,
                    "timeComplexity": "N/A", "optimalTimeComplexity": "N/A",
                    "spaceComplexity": "N/A", "optimalSpaceComplexity": "N/A",
                    "testCasesPassed": 0, "totalTestCases": 10,
                }
            # Inject user code manually to save Gemini generation tokens
            feedback["coding"]["userCode"] = request.code or ""
            feedback["coding"]["language"] = request.language or "python"
            # Defensive defaults so the UI never has to null-check the new fields.
            feedback["coding"].setdefault("codeReviewSummary", "")
            feedback["coding"].setdefault("codeAnnotations", [])
            feedback["coding"].setdefault("optimalCodeAnnotations", [])

        # Store in session
        session = sessions.get(session_id)
        if session:
            session.feedback = feedback
            session.transcript = request.transcript

        logger.info(f"✅ Feedback generated for session {session_id}: {feedback.get('overallDecision')}")
        return feedback

    except Exception as e:
        logger.error(f"❌ Feedback generation failed: {e}")
        # Return a basic fallback
        return {
            "overallDecision": "Lean No Hire",
            "overallScore": 50,
            "communication": {"clarity": 3, "approach": 3, "hintsUsed": 0},
            "engagement": {"eyeContact": 3, "confidence": 3},
            "recommendations": [
                "The interview session was too short to provide detailed feedback.",
                "Try to engage more with the interviewer's questions.",
                "Practice answering behavioral questions using the STAR method.",
                "Speak clearly and at a moderate pace.",
                "Ask clarifying questions when needed."
            ],
        }


# ──────────── WebSocket Handler ────────────

@app.websocket("/ws/interview/{session_id}")
async def websocket_interview(websocket: WebSocket, session_id: str):
    """Main bidirectional WebSocket for interview sessions.

    Handles:
    - Audio streaming (binary frames)
    - Code snapshots (JSON)
    - Video frames (JSON with base64)
    - Code execution requests
    - Interview state management
    """
    await websocket.accept()
    active_connections[session_id] = websocket

    # Get or create session
    session = sessions.get(session_id)
    if not session:
        session = InterviewSession(
            session_id=session_id,
            interview_type="coding",
            language="python",
            duration=45,
        )
        sessions[session_id] = session

    logger.info(f"🔌 WebSocket connected: {session_id}")

    # Send welcome message
    welcome_text = (
        f"Welcome to your {session.interview_type} interview! "
        "I'm Alex, your AI interviewer today. Let me know when you're ready, "
        "and I'll present you with a problem to solve."
    )
    session.add_transcript("interviewer", welcome_text)

    await websocket.send_json({
        "type": "transcript",
        "speaker": "interviewer",
        "text": welcome_text,
    })

    # If coding, send the problem
    if session.interview_type == "coding" and session.problem:
        await websocket.send_json({
            "type": "problem",
            "problem": {
                "title": session.problem["title"],
                "description": session.problem["description"],
                "examples": session.problem["examples"],
                "constraints": session.problem["constraints"],
                "difficulty": session.problem["difficulty"],
                "tags": session.problem["tags"],
                "starterCode": session.problem["starterCode"],
            },
        })

    try:
        while True:
            # Receive message (text or binary)
            try:
                data = await websocket.receive()
            except WebSocketDisconnect:
                break

            if "text" in data:
                message = json.loads(data["text"])
                msg_type = message.get("type")

                if msg_type == "code_snapshot":
                    # Store code snapshot
                    session.add_code_snapshot(
                        message.get("language", "python"),
                        message.get("code", ""),
                    )
                    logger.debug(f"📝 Code snapshot received for {session_id}")

                elif msg_type == "run_code":
                    # Execute code
                    await websocket.send_json({
                        "type": "status",
                        "message": "Compiling and running your code...",
                    })

                    language = message.get("language", "python")
                    code = message.get("code", "")

                    # Get test cases from the problem
                    test_cases = []
                    if session.problem:
                        test_cases = session.problem.get("testCases", [])

                    if test_cases:
                        results = await run_test_cases(code, language, test_cases)
                    else:
                        results = []

                    session.test_results = results

                    await websocket.send_json({
                        "type": "test_results",
                        "results": [
                            {
                                "input": r.get("input", ""),
                                "expected": r.get("expected", ""),
                                "actual": r.get("actual", ""),
                                "passed": r.get("passed", False),
                                "time": r.get("time", ""),
                                "memory": r.get("memory", ""),
                            }
                            for r in results
                        ],
                    })

                elif msg_type == "video_frame":
                    # Receive webcam frame (for engagement analysis)
                    logger.debug(f"📹 Video frame received for {session_id}")

                elif msg_type == "end_interview":
                    # End the interview session
                    session.is_active = False
                    logger.info(f"🏁 Interview ended: {session_id}")

                    await websocket.send_json({
                        "type": "status",
                        "message": "Generating your feedback report...",
                    })

                    # TODO: Call FeedbackGenerator agent here
                    await asyncio.sleep(2)  # Simulate processing

                    await websocket.send_json({
                        "type": "feedback",
                        "report": {
                            "session_id": session_id,
                            "status": "ready",
                        },
                    })
                    break

            elif "bytes" in data:
                # Binary audio data
                audio_bytes = data["bytes"]
                logger.debug(f"🎤 Audio chunk received: {len(audio_bytes)} bytes")

                # TODO: Forward to Gemini Live API for processing
                # For now, just acknowledge
                pass

    except WebSocketDisconnect:
        logger.info(f"🔌 WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"❌ WebSocket error for {session_id}: {e}")
    finally:
        if session_id in active_connections:
            del active_connections[session_id]


# ──────────── Entry Point ────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
