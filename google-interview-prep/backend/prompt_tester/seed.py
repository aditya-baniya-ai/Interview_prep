"""
Seed CLI for Prompt Engineering Tester questions.

Usage:
    python -m prompt_tester.seed                     # upsert as draft
    python -m prompt_tester.seed --publish           # upsert + freeze if score >= 90
    python -m prompt_tester.seed --file questions/extract-iso-dates.json

Reads all JSON files from backend/prompt_tester/questions/ by default.
Each file is one question with its test suite.

The --publish flag runs the self-validation gate:
    - Execute reference_solution_prompt through the grading pipeline.
    - If score < 90, abort and print the failure.
    - If score >= 90, set frozen_at on the version.
"""

import argparse
import json
import logging
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

QUESTIONS_DIR = Path(__file__).parent / "questions"


def load_question_file(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def upsert_question(data: dict, db) -> tuple:
    """
    Upsert a question + its version into the DB.
    Returns (question, question_version).
    """
    from .models import PTQuestion, PTQuestionVersion

    slug = data["slug"]

    # Upsert question
    q = db.query(PTQuestion).filter(PTQuestion.slug == slug).first()
    if q is None:
        q = PTQuestion(
            id=str(uuid.uuid4()),
            slug=slug,
            title=data["title"],
            task_spec=data["task_spec"],
            difficulty=data["difficulty"],
            tags=data.get("tags", []),
            category=data["category"],
            status=data.get("status", "draft"),
            version=data.get("version", 1),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(q)
        db.flush()
        logger.info("Created question: %s", slug)
    else:
        q.title = data["title"]
        q.task_spec = data["task_spec"]
        q.difficulty = data["difficulty"]
        q.tags = data.get("tags", [])
        q.category = data["category"]
        q.status = data.get("status", q.status)
        q.version = data.get("version", q.version)
        q.updated_at = datetime.utcnow()
        logger.info("Updated question: %s", slug)

    version_num = data.get("version", 1)

    # Upsert version
    qv = (
        db.query(PTQuestionVersion)
        .filter(
            PTQuestionVersion.question_id == q.id,
            PTQuestionVersion.version == version_num,
        )
        .first()
    )
    if qv is None:
        qv = PTQuestionVersion(
            id=str(uuid.uuid4()),
            question_id=q.id,
            version=version_num,
            test_suite=data.get("test_suite", []),
            rubric=data.get("rubric", {}),
            reference_solution_prompt=data.get("reference_solution_prompt", ""),
            exec_config=data.get("exec_config", {}),
            grader_version=data.get("grader_version", "1.0"),
            frozen_at=None,
        )
        db.add(qv)
    else:
        if qv.frozen_at is not None:
            logger.warning(
                "Version %d of %s is already frozen — skipping version update",
                version_num,
                slug,
            )
        else:
            qv.test_suite = data.get("test_suite", [])
            qv.rubric = data.get("rubric", {})
            qv.reference_solution_prompt = data.get("reference_solution_prompt", "")
            qv.exec_config = data.get("exec_config", {})
            qv.grader_version = data.get("grader_version", "1.0")

    db.commit()
    return q, qv


def run_self_validation(q, qv, db) -> float:
    """
    Run the reference_solution_prompt through the grading pipeline.
    Returns the total_score (0-100). Raises on hard errors.
    """
    from .grader import grade_submission
    from .models import PTGradingJob, PTSubmission, PTScore

    ref_prompt = qv.reference_solution_prompt
    if not ref_prompt:
        raise ValueError(f"No reference_solution_prompt for question {q.slug}")

    # Create a temporary submission
    sub_id = str(uuid.uuid4())
    sub = PTSubmission(
        id=sub_id,
        user_id="__seed_validator__",
        question_id=q.id,
        question_version=qv.version,
        prompt_text=ref_prompt,
        status="queued",
        created_at=datetime.utcnow(),
    )
    db.add(sub)
    db.commit()

    grade_submission(sub_id, db)
    db.refresh(sub)

    score_row = db.query(PTScore).filter(PTScore.submission_id == sub_id).first()
    if score_row is None:
        raise RuntimeError(f"No score produced for validation submission {sub_id}")

    return score_row.total_score


def seed(paths: list[Path], publish: bool, db) -> None:
    for path in paths:
        data = load_question_file(path)
        slug = data.get("slug", path.stem)

        try:
            q, qv = upsert_question(data, db)
        except Exception as e:
            logger.error("Failed to upsert %s: %s", slug, e)
            continue

        if publish:
            if qv.frozen_at is not None:
                logger.info("Skipping validation for already-frozen %s v%d", slug, qv.version)
                # Ensure status is published
                q.status = "published"
                db.commit()
                continue

            logger.info("Running self-validation for %s...", slug)
            try:
                score = run_self_validation(q, qv, db)
            except Exception as e:
                logger.error(
                    "ABORT: Self-validation FAILED for %s — error: %s", slug, e
                )
                sys.exit(1)

            if score < 90.0:
                logger.error(
                    "ABORT: Reference solution for '%s' scored %.1f < 90. "
                    "Fix the reference_solution_prompt or test suite before publishing.",
                    slug,
                    score,
                )
                sys.exit(1)

            logger.info(
                "Self-validation passed for %s (score=%.1f). Freezing version.",
                slug,
                score,
            )
            qv.frozen_at = datetime.utcnow()
            q.status = "published"
            db.commit()


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    parser = argparse.ArgumentParser(description="Seed Prompt Tester questions")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Run self-validation and freeze versions (requires score >= 90)",
    )
    parser.add_argument(
        "--file",
        type=Path,
        default=None,
        help="Seed a single JSON file instead of the whole questions/ directory",
    )
    args = parser.parse_args()

    from .database import SessionLocal, init_db

    init_db()
    db = SessionLocal()

    try:
        if args.file:
            paths = [args.file]
        else:
            paths = sorted(QUESTIONS_DIR.glob("*.json"))
            if not paths:
                logger.warning("No JSON files found in %s", QUESTIONS_DIR)
                return

        seed(paths, args.publish, db)
        logger.info("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
