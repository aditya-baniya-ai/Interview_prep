"""
Shared pytest fixtures for Prompt Engineering Tester tests.
"""

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="session")
def engine():
    from prompt_tester.database import Base
    import prompt_tester.models  # noqa: F401 — register models with Base
    eng = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    """Provide a DB session that is rolled back after each test."""
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def mock_gemini_client():
    """
    Mock google.genai.Client that returns canned responses.
    Tests can override response.text as needed.
    """
    mock_response = MagicMock()
    mock_response.text = '["2024-01-15"]'
    mock_response.usage_metadata.candidates_token_count = 10

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response
    return mock_client, mock_response


# ─── Factory helpers ──────────────────────────────────────────────────────────

def make_question(db, slug="test-question", status="published", version=1):
    from prompt_tester.models import PTQuestion

    q = PTQuestion(
        id=str(uuid.uuid4()),
        slug=slug,
        title="Test Question",
        task_spec="Write a prompt that does X.",
        difficulty="easy",
        tags=["test"],
        category="extraction",
        status=status,
        version=version,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(q)
    db.flush()
    return q


def make_question_version(
    db,
    question,
    test_suite=None,
    rubric=None,
    exec_config=None,
    reference_solution_prompt="Extract all ISO dates.",
    frozen_at=None,
):
    from prompt_tester.models import PTQuestionVersion

    if test_suite is None:
        test_suite = [
            {
                "id": "tc1",
                "hidden_input": "Today is 2024-01-15.",
                "type": "exact_match",
                "expected": '["2024-01-15"]',
                "weight": 1.0,
            }
        ]
    if rubric is None:
        rubric = {}
    if exec_config is None:
        exec_config = {
            "model_id": "gemini-2.0-flash",
            "temperature": 0,
            "n_runs": 3,
            "max_output_tokens": 200,
            "token_budget": 200,
        }

    qv = PTQuestionVersion(
        id=str(uuid.uuid4()),
        question_id=question.id,
        version=question.version,
        test_suite=test_suite,
        rubric=rubric,
        reference_solution_prompt=reference_solution_prompt,
        exec_config=exec_config,
        grader_version="1.0",
        frozen_at=frozen_at,
    )
    db.add(qv)
    db.flush()
    return qv


def make_submission(
    db,
    question,
    prompt_text="Extract dates.",
    status="queued",
    user_id="user-123",
):
    from prompt_tester.models import PTSubmission

    sub = PTSubmission(
        id=str(uuid.uuid4()),
        user_id=user_id,
        question_id=question.id,
        question_version=question.version,
        prompt_text=prompt_text,
        status=status,
        created_at=datetime.utcnow(),
    )
    db.add(sub)
    db.flush()
    return sub


def make_grading_job(db, submission, state="pending"):
    from prompt_tester.models import PTGradingJob

    job = PTGradingJob(
        id=str(uuid.uuid4()),
        submission_id=submission.id,
        state=state,
        attempts=0,
    )
    db.add(job)
    db.flush()
    return job


def make_score(db, submission, total_score=85.0):
    from prompt_tester.models import PTScore

    score = PTScore(
        id=str(uuid.uuid4()),
        submission_id=submission.id,
        total_score=total_score,
        correctness_score=80.0,
        consistency_score=90.0,
        efficiency_score=88.0,
        breakdown={"tc1": {"majority_pass": 1.0, "pass_count": 3, "total_runs": 3}},
        model_version="gemini-2.0-flash",
        grader_version="1.0",
        created_at=datetime.utcnow(),
    )
    db.add(score)
    db.flush()
    return score
