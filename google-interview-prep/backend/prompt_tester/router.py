"""
FastAPI router for Prompt Engineering Tester.
Prefix: /api/prompt-tester
All routes are gated by the PROMPT_TESTER_ENABLED env var.
"""

import os
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import get_db
from .models import (
    PTGradingJob,
    PTQuestion,
    PTQuestionVersion,
    PTScore,
    PTSubmission,
)

PROMPT_TESTER_ENABLED = os.getenv("PROMPT_TESTER_ENABLED", "").lower() in (
    "1",
    "true",
    "yes",
)

router = APIRouter(prefix="/api/prompt-tester", tags=["prompt-tester"])


def _require_enabled():
    if not PROMPT_TESTER_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")


# ─── Pydantic schemas ─────────────────────────────────────────────────────────


class QuestionSummary(BaseModel):
    id: str
    slug: str
    title: str
    difficulty: str
    tags: list
    category: str

    class Config:
        from_attributes = True


class QuestionDetail(BaseModel):
    id: str
    slug: str
    title: str
    task_spec: str
    difficulty: str
    tags: list
    category: str
    version: int

    class Config:
        from_attributes = True


class SubmitRequest(BaseModel):
    question_slug: str
    prompt_text: str


class SubmitResponse(BaseModel):
    submission_id: str
    job_id: str
    status: str


class ScoreDetail(BaseModel):
    total_score: float
    correctness_score: float
    consistency_score: float
    efficiency_score: float
    breakdown: dict
    model_version: str
    grader_version: str
    graded_at: Optional[datetime]


class SubmissionResponse(BaseModel):
    submission_id: str
    status: str
    question_version: int
    created_at: datetime
    score: Optional[ScoreDetail]


# ─── Routes ───────────────────────────────────────────────────────────────────


@router.get("/questions", response_model=List[QuestionSummary])
def list_questions(db: Session = Depends(get_db)):
    """Return published questions (slug, title, difficulty, tags, category).
    Never returns test_suite, expected, reference_solution_prompt, or exec_config."""
    _require_enabled()

    questions = (
        db.query(PTQuestion).filter(PTQuestion.status == "published").all()
    )
    return [
        QuestionSummary(
            id=q.id,
            slug=q.slug,
            title=q.title,
            difficulty=q.difficulty,
            tags=q.tags or [],
            category=q.category,
        )
        for q in questions
    ]


@router.get("/questions/{slug}", response_model=QuestionDetail)
def get_question(slug: str, db: Session = Depends(get_db)):
    """Return task_spec + metadata only. Never leaks test_suite or solutions."""
    _require_enabled()

    q = (
        db.query(PTQuestion)
        .filter(PTQuestion.slug == slug, PTQuestion.status == "published")
        .first()
    )
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    return QuestionDetail(
        id=q.id,
        slug=q.slug,
        title=q.title,
        task_spec=q.task_spec,
        difficulty=q.difficulty,
        tags=q.tags or [],
        category=q.category,
        version=q.version,
    )


@router.post("/submissions", response_model=SubmitResponse)
def create_submission(
    body: SubmitRequest,
    x_user_id: str = Header(default="anonymous"),
    db: Session = Depends(get_db),
):
    """Submit a candidate prompt for grading."""
    _require_enabled()

    # Resolve question
    q = (
        db.query(PTQuestion)
        .filter(PTQuestion.slug == body.question_slug, PTQuestion.status == "published")
        .first()
    )
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # Resolve current version
    qv = (
        db.query(PTQuestionVersion)
        .filter(
            PTQuestionVersion.question_id == q.id,
            PTQuestionVersion.version == q.version,
        )
        .first()
    )
    if not qv:
        raise HTTPException(status_code=500, detail="Question version not found")

    # Create submission
    submission = PTSubmission(
        id=str(uuid.uuid4()),
        user_id=x_user_id,
        question_id=q.id,
        question_version=q.version,
        prompt_text=body.prompt_text,
        status="queued",
        created_at=datetime.utcnow(),
    )
    db.add(submission)
    db.flush()

    # Create grading job
    job = PTGradingJob(
        id=str(uuid.uuid4()),
        submission_id=submission.id,
        state="pending",
        attempts=0,
    )
    db.add(job)
    db.commit()

    return SubmitResponse(
        submission_id=submission.id,
        job_id=job.id,
        status="queued",
    )


@router.get("/submissions/{submission_id}", response_model=SubmissionResponse)
def get_submission(submission_id: str, db: Session = Depends(get_db)):
    """Return submission status and score (if available)."""
    _require_enabled()

    sub = db.query(PTSubmission).filter(PTSubmission.id == submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    score_detail = None
    if sub.score:
        s = sub.score
        score_detail = ScoreDetail(
            total_score=s.total_score,
            correctness_score=s.correctness_score,
            consistency_score=s.consistency_score,
            efficiency_score=s.efficiency_score,
            breakdown=s.breakdown or {},
            model_version=s.model_version,
            grader_version=s.grader_version,
            graded_at=s.created_at,
        )

    return SubmissionResponse(
        submission_id=sub.id,
        status=sub.status,
        question_version=sub.question_version,
        created_at=sub.created_at,
        score=score_detail,
    )
