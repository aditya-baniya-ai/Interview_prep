"""
Standalone polling worker for Prompt Engineering Tester grading jobs.

Design:
- Polls `pt_grading_jobs` WHERE state='pending' ORDER BY id LIMIT 1.
- Atomic claim: UPDATE SET state='claimed' WHERE id=? AND state='pending'.
- Calls grade_submission on success.
- Retries up to 3 times with exponential backoff; sets state='failed' after that.

Swap path:
- Replace the poll loop with a Celery task consumer:
    @celery.task
    def grade_task(submission_id): ...
- Change DB queue to a Redis queue (Celery broker).
- The grade_submission function itself is unchanged.

Run with: python -m prompt_tester.worker
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime

# grader is imported at module level so tests can patch prompt_tester.worker.grade_submission
from .grader import grade_submission  # noqa: F401 (re-exported for patching)

logger = logging.getLogger(__name__)

PROMPT_TESTER_ENABLED = os.getenv("PROMPT_TESTER_ENABLED", "").lower() in (
    "1",
    "true",
    "yes",
)

POLL_INTERVAL_SECONDS = float(os.getenv("PT_WORKER_POLL_INTERVAL", "2"))
MAX_ATTEMPTS = 3


def _run_once(db) -> bool:
    """
    Try to claim one pending job and process it.
    Returns True if a job was found and processed (success or failure),
    False if no pending jobs.
    """
    from .models import PTGradingJob, PTSubmission
    # Use module-level import so tests can patch prompt_tester.worker.grade_submission
    import prompt_tester.worker as _self
    _grade = _self.grade_submission

    # Find a pending job
    job = (
        db.query(PTGradingJob)
        .filter(PTGradingJob.state == "pending")
        .order_by(PTGradingJob.id)
        .limit(1)
        .first()
    )
    if not job:
        return False

    # Atomic claim: only succeed if still pending
    rows_updated = (
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

    if rows_updated == 0:
        # Another worker claimed it first
        logger.debug("Lost race to claim job %s — skipping", job.id)
        return False

    # Re-load after update
    db.refresh(job)
    submission_id = job.submission_id

    logger.info("Claimed grading job %s (attempt %d)", job.id, job.attempts)

    try:
        _grade(submission_id, db)
        job.state = "done"
        db.commit()
        logger.info("Grading job %s completed successfully", job.id)
    except Exception as exc:
        error_msg = str(exc)
        logger.error("Grading job %s failed: %s", job.id, error_msg)

        if job.attempts >= MAX_ATTEMPTS:
            job.state = "failed"
            job.last_error = error_msg
            # Also mark submission as failed
            submission = db.query(PTSubmission).filter(
                PTSubmission.id == submission_id
            ).first()
            if submission:
                submission.status = "failed"
        else:
            # Reset to pending for retry
            job.state = "pending"
            job.last_error = error_msg

        db.commit()

        if job.attempts < MAX_ATTEMPTS:
            # Exponential backoff: 2^(attempt-1) seconds
            backoff = 2 ** (job.attempts - 1)
            logger.info("Retrying job %s in %ds", job.id, backoff)
            time.sleep(backoff)

    return True


def run_worker():
    """Main polling loop. Runs until interrupted."""
    if not PROMPT_TESTER_ENABLED:
        logger.error(
            "PROMPT_TESTER_ENABLED is not set. "
            "Set it to '1' or 'true' to run the worker."
        )
        return

    from .database import SessionLocal, init_db

    init_db()

    logger.info("Prompt Tester worker started. Polling every %.1fs...", POLL_INTERVAL_SECONDS)

    while True:
        db = SessionLocal()
        try:
            found = _run_once(db)
            if not found:
                time.sleep(POLL_INTERVAL_SECONDS)
        except Exception as exc:
            logger.exception("Unexpected worker error: %s", exc)
            time.sleep(POLL_INTERVAL_SECONDS)
        finally:
            db.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    run_worker()
