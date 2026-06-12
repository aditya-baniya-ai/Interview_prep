"""
SQLAlchemy ORM models for the Prompt Engineering Tester feature.
All tables are prefixed with `pt_` to avoid conflicts with existing tables.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    Boolean,
    String,
)
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import relationship

from .database import Base


def _uuid():
    return str(uuid.uuid4())


class PTQuestion(Base):
    __tablename__ = "pt_questions"

    id = Column(String(36), primary_key=True, default=_uuid)
    slug = Column(String(200), unique=True, nullable=False)
    title = Column(Text, nullable=False)
    task_spec = Column(Text, nullable=False)
    difficulty = Column(
        Enum("easy", "medium", "hard", name="pt_difficulty"),
        nullable=False,
    )
    tags = Column(JSON, nullable=False, default=list)
    category = Column(
        Enum(
            "extraction",
            "classification",
            "structured_output",
            "constraint",
            "summarization",
            "robustness",
            name="pt_category",
        ),
        nullable=False,
    )
    status = Column(
        Enum("draft", "published", "retired", name="pt_status"),
        nullable=False,
        default="draft",
    )
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    versions = relationship(
        "PTQuestionVersion", back_populates="question", cascade="all, delete-orphan"
    )
    submissions = relationship(
        "PTSubmission", back_populates="question", cascade="all, delete-orphan"
    )


class PTQuestionVersion(Base):
    __tablename__ = "pt_question_versions"

    id = Column(String(36), primary_key=True, default=_uuid)
    question_id = Column(
        String(36), ForeignKey("pt_questions.id"), nullable=False
    )
    version = Column(Integer, nullable=False)
    test_suite = Column(JSON, nullable=False, default=list)
    rubric = Column(JSON, nullable=False, default=dict)
    reference_solution_prompt = Column(Text, nullable=True)
    exec_config = Column(JSON, nullable=False, default=dict)
    grader_version = Column(String(50), nullable=False, default="1.0")
    frozen_at = Column(DateTime, nullable=True)

    question = relationship("PTQuestion", back_populates="versions")


class PTSubmission(Base):
    __tablename__ = "pt_submissions"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(200), nullable=False)
    question_id = Column(
        String(36), ForeignKey("pt_questions.id"), nullable=False
    )
    question_version = Column(Integer, nullable=False)
    prompt_text = Column(Text, nullable=False)
    status = Column(
        Enum("queued", "running", "scored", "failed", name="pt_submission_status"),
        nullable=False,
        default="queued",
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    question = relationship("PTQuestion", back_populates="submissions")
    grading_job = relationship(
        "PTGradingJob", back_populates="submission", uselist=False
    )
    runs = relationship(
        "PTRun", back_populates="submission", cascade="all, delete-orphan"
    )
    score = relationship(
        "PTScore", back_populates="submission", uselist=False
    )


class PTGradingJob(Base):
    __tablename__ = "pt_grading_jobs"

    id = Column(String(36), primary_key=True, default=_uuid)
    submission_id = Column(
        String(36), ForeignKey("pt_submissions.id"), nullable=False
    )
    state = Column(
        Enum("pending", "claimed", "done", "failed", name="pt_job_state"),
        nullable=False,
        default="pending",
    )
    claimed_at = Column(DateTime, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    last_error = Column(Text, nullable=True)

    submission = relationship("PTSubmission", back_populates="grading_job")

    __table_args__ = (Index("ix_pt_grading_jobs_state", "state"),)


class PTRun(Base):
    __tablename__ = "pt_runs"

    id = Column(String(36), primary_key=True, default=_uuid)
    submission_id = Column(
        String(36), ForeignKey("pt_submissions.id"), nullable=False
    )
    test_case_id = Column(String(200), nullable=False)
    run_index = Column(Integer, nullable=False)
    model_output = Column(Text, nullable=False, default="")
    output_tokens = Column(Integer, nullable=False, default=0)
    latency_ms = Column(Integer, nullable=False, default=0)
    passed = Column(Boolean, nullable=True)
    judge_score = Column(Float, nullable=True)

    submission = relationship("PTSubmission", back_populates="runs")


class PTScore(Base):
    __tablename__ = "pt_scores"

    id = Column(String(36), primary_key=True, default=_uuid)
    submission_id = Column(
        String(36), ForeignKey("pt_submissions.id"), unique=True, nullable=False
    )
    total_score = Column(Float, nullable=False)
    correctness_score = Column(Float, nullable=False)
    consistency_score = Column(Float, nullable=False)
    efficiency_score = Column(Float, nullable=False)
    breakdown = Column(JSON, nullable=False, default=dict)
    model_version = Column(String(100), nullable=False, default="")
    grader_version = Column(String(50), nullable=False, default="1.0")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    submission = relationship("PTSubmission", back_populates="score")
