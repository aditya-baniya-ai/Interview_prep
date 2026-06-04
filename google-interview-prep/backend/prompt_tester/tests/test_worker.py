"""
Tests for the grading worker: claim atomicity, retry logic, and failure handling.
"""

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from .conftest import (
    make_grading_job,
    make_question,
    make_question_version,
    make_submission,
)


def test_worker_claims_job_atomically(db):
    """
    Simulate two sequential claim attempts on the same job.
    The first UPDATE should succeed (rows_updated=1).
    The second UPDATE on the now-claimed job should return 0 (job no longer pending).
    This verifies the atomic WHERE state='pending' guard.
    """
    from prompt_tester.models import PTGradingJob

    question = make_question(db, slug="atomic-test-" + str(uuid.uuid4())[:8])
    make_question_version(db, question)
    submission = make_submission(db, question)
    job = make_grading_job(db, submission, state="pending")
    db.commit()

    # First claim attempt — should succeed
    rows1 = (
        db.query(PTGradingJob)
        .filter(PTGradingJob.id == job.id, PTGradingJob.state == "pending")
        .update(
            {
                "state": "claimed",
                "claimed_at": datetime.utcnow(),
                "attempts": PTGradingJob.attempts + 1,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    assert rows1 == 1, "First claim should succeed"

    # Second claim attempt on the same job — should fail (no longer pending)
    rows2 = (
        db.query(PTGradingJob)
        .filter(PTGradingJob.id == job.id, PTGradingJob.state == "pending")
        .update(
            {
                "state": "claimed",
                "claimed_at": datetime.utcnow(),
                "attempts": PTGradingJob.attempts + 1,
            },
            synchronize_session=False,
        )
    )
    db.commit()
    assert rows2 == 0, "Second claim should fail — job is no longer pending"


def test_worker_retries_on_failure(db):
    """
    When grade_submission raises, the job attempts should increment
    and state should go back to 'pending' for retry (if attempts < MAX).
    """
    from prompt_tester.worker import _run_once, MAX_ATTEMPTS
    from prompt_tester.models import PTGradingJob

    question = make_question(db, slug="retry-test-" + str(uuid.uuid4())[:8])
    make_question_version(db, question)
    submission = make_submission(db, question)
    job = make_grading_job(db, submission, state="pending")
    db.commit()

    with patch("prompt_tester.worker.grade_submission", side_effect=RuntimeError("boom")):
        _run_once(db)

    db.refresh(job)
    # First failure: attempts=1, state should be pending for retry
    assert job.attempts == 1
    assert job.state == "pending"
    assert job.last_error == "boom"


def test_worker_fails_after_max_attempts(db):
    """
    After MAX_ATTEMPTS failures, job state becomes 'failed' and last_error is set.
    """
    from prompt_tester.worker import _run_once, MAX_ATTEMPTS
    from prompt_tester.models import PTGradingJob, PTSubmission

    question = make_question(db, slug="maxfail-test-" + str(uuid.uuid4())[:8])
    make_question_version(db, question)
    submission = make_submission(db, question)
    job = make_grading_job(db, submission, state="pending")
    # Pre-set attempts to MAX_ATTEMPTS - 1 so the next failure triggers final fail
    job.attempts = MAX_ATTEMPTS - 1
    db.commit()

    with patch("prompt_tester.worker.grade_submission", side_effect=RuntimeError("final error")):
        _run_once(db)

    db.refresh(job)
    assert job.state == "failed"
    assert job.last_error == "final error"
    assert job.attempts == MAX_ATTEMPTS

    db.refresh(submission)
    assert submission.status == "failed"
