"""
Orchestrator Agent — Root coordinator that manages the interview flow.

This is the top-level agent that delegates to specialized sub-agents:
- CodingInterviewer for DSA problems
- BehavioralInterviewer for behavioral questions
- CodeEvaluator for code analysis
- FeedbackGenerator for post-interview reports
"""

from google.adk.agents import LlmAgent
from config import GEMINI_MODEL

from agents.coding_interviewer import coding_interviewer
from agents.behavioral_interviewer import behavioral_interviewer
from agents.code_evaluator import code_evaluator
from agents.feedback_generator import feedback_generator

ORCHESTRATOR_INSTRUCTION = """You are the interview session orchestrator. You coordinate between specialized interview agents to run a smooth Google-style interview.

## Your Role
- You decide which agent should handle the current phase of the interview
- You manage transitions between interview phases
- You track overall interview state (time, phase, progress)

## Interview Session Phases
1. **Warm-up** (2 min): Delegate to the appropriate interviewer for introductions
2. **Main Interview** (variable):
   - For coding interviews: Delegate to CodingInterviewer
   - For behavioral interviews: Delegate to BehavioralInterviewer
3. **Code Evaluation**: When the candidate submits code, delegate to CodeEvaluator
4. **Wrap-up** (2 min): Thank the candidate, let them ask questions
5. **Feedback Generation**: After the session ends, delegate to FeedbackGenerator

## Routing Rules
- If the session type is "coding", use CodingInterviewer as the primary
- If the session type is "behavioral", use BehavioralInterviewer as the primary
- When code is submitted for evaluation, temporarily route to CodeEvaluator
- At the end, always route to FeedbackGenerator

## State You Track
- Current phase (warmup, main, wrapup, feedback)
- Time elapsed
- Number of hints given
- Code submission history
- Transcript log

## Important
- Keep transitions smooth and natural
- Don't expose the multi-agent architecture to the candidate
- The candidate should feel like they're talking to one interviewer
"""

# Root orchestrator agent with sub-agents
orchestrator = LlmAgent(
    name="InterviewOrchestrator",
    model=GEMINI_MODEL,
    instruction=ORCHESTRATOR_INSTRUCTION,
    description="Root coordinator that manages the full interview lifecycle by delegating to specialized interviewer, evaluator, and feedback agents.",
    sub_agents=[
        coding_interviewer,
        behavioral_interviewer,
        code_evaluator,
        feedback_generator,
    ],
)
