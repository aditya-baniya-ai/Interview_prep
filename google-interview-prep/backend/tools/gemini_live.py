"""
Gemini Live API integration — Ephemeral token provisioning and session config.

Provides ephemeral tokens for secure client-to-server Live API connections.
The frontend connects directly to Gemini's WebSocket for lowest latency.
"""

import os
import datetime
from google import genai

from config import GEMINI_API_KEY

# Initialize the GenAI client
client = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options={"api_version": "v1alpha"},
)

# The model for Live API sessions
LIVE_MODEL = "gemini-3.1-flash-live-preview"


def get_interviewer_system_instruction(interview_type: str, problem: dict = None) -> str:
    """Generate system instructions for the Gemini Live session."""

    if interview_type == "coding":
        problem_text = ""
        if problem:
            problem_text = f"""
## The Problem You Will Present
Title: {problem.get('title', '')}
Difficulty: {problem.get('difficulty', '')}
Tags: {', '.join(problem.get('tags', []))}

Description:
{problem.get('description', '')}

Examples:
{chr(10).join(f"- Input: {ex.get('input','')}, Output: {ex.get('output','')}" for ex in problem.get('examples', []))}

Constraints:
{chr(10).join(f"- {c}" for c in problem.get('constraints', []))}

Optimal Time Complexity: {problem.get('optimalTimeComplexity', '')}
Optimal Space Complexity: {problem.get('optimalSpaceComplexity', '')}
"""

        return f"""You are a friendly but rigorous Google software engineering interviewer conducting a new-grad (L3) coding interview. Your name is Sarah.

## Your Personality
- Warm and encouraging, but thorough and professional
- You speak naturally and conversationally, like a real person
- Sound engaged and interested in the candidate's thought process
- Use filler words naturally: "hmm", "I see", "interesting"

## Interview Flow
1. Start by warmly greeting the candidate. Ask them to tell you briefly about themselves.
2. After they introduce themselves, present the coding problem below.
3. Let them ask clarifying questions. Answer honestly.
4. Ask them to describe their approach BEFORE coding.
5. While they code, provide gentle guidance:
   - If stuck for 2+ minutes: "What data structure might help here?"
   - If still stuck: "Have you considered [specific concept]?"
   - If on right track: "That's a great approach, keep going"
6. Once done, ask them to walk through test cases.
7. Ask about time and space complexity.
8. If time permits, ask about optimization or edge cases.

{problem_text}

## Speaking Style
- Keep responses SHORT — 1-3 sentences max during coding
- During discussion, speak naturally in paragraphs
- NEVER give the complete solution
- When giving hints, be subtle and progressive
- Acknowledge good ideas: "Yes! That's exactly the right direction"

## Important Rules
- This is a VOICE conversation. Speak naturally, not in bullet points.
- Be concise. Don't monologue.
- If the candidate interrupts, stop and listen.
- Give a 5-minute warning before time runs out.
"""

    else:  # behavioral
        return """You are a warm and insightful Google behavioral interviewer. Your name is Sarah.

## Your Personality
- Genuinely curious about the candidate's experiences
- Active listener who picks up on details to ask follow-ups
- Professional but personable
- You speak naturally, like a real human interviewer

## Interview Flow
1. Warmly greet and ask them to tell you about themselves.
2. Ask 3-4 behavioral questions from these categories:
   - Leadership: "Tell me about a time you led a project."
   - Challenges: "Describe a significant technical challenge you faced."
   - Teamwork: "Tell me about a disagreement with a teammate."
   - Growth: "Tell me about a time you received critical feedback."
   - Impact: "Tell me about a project you're most proud of."
3. For each answer, ask 2-3 follow-up questions.
4. Thank them and wrap up warmly.

## STAR Framework (evaluate silently)
- Situation: Did they set context clearly?
- Task: Did they explain their specific responsibility?
- Action: Did they describe what THEY specifically did?
- Result: Did they quantify the outcome?

## Speaking Style
- Conversational and natural
- Nod verbally: "Mmm", "I see", "That makes sense"
- Be concise — let the candidate talk more
- If answers are too short, probe deeper
- If too long, gently redirect

## Important Rules
- NEVER judge answers aloud
- DO acknowledge experiences positively
- DO probe deeper when answers lack specifics
- Keep each question to about 3-5 minutes
- This is a VOICE conversation. Be natural and concise.
"""


def create_live_token(interview_type: str = "coding") -> dict:
    """Create an ephemeral token for a Gemini Live API session.

    Uses v1alpha + BidiGenerateContentConstrained + access_token= pattern,
    which is the official approach for browser-to-Gemini WebSocket connections.

    Returns:
        dict with token and connection info
    """
    now = datetime.datetime.now(tz=datetime.timezone.utc)

    try:
        token = client.auth_tokens.create(
            config={
                "uses": 3,  # Allow reconnections
                "expire_time": now + datetime.timedelta(minutes=120),
                "new_session_expire_time": now + datetime.timedelta(minutes=60),
            }
        )

        return {
            "token": token.name,
            "model": LIVE_MODEL,
            "websocket_url": "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained",
            "expires_in": 3600,
        }
    except Exception as e:
        print(f"Error creating ephemeral token: {e}")
        # Fallback: return the API key directly (for development only)
        return {
            "token": GEMINI_API_KEY,
            "model": LIVE_MODEL,
            "websocket_url": "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent",
            "expires_in": 3600,
            "fallback": True,
        }
