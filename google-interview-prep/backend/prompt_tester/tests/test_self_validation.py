"""
Tests for the seed self-validation gate.
"""

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from .conftest import (
    make_question,
    make_question_version,
)


def _run_validation(db, question, qv) -> float:
    """Helper to run self-validation and return the score."""
    from prompt_tester.seed import run_self_validation
    return run_self_validation(question, qv, db)


def test_good_reference_solution_passes_gate(db):
    """
    A reference solution that scores >= 90 should pass without error.
    Mock Gemini to return the correct expected output.
    """
    question = make_question(db, slug="good-ref-" + str(uuid.uuid4())[:8])
    qv = make_question_version(
        db,
        question,
        test_suite=[
            {
                "id": "tc1",
                "hidden_input": "Some text here.",
                "type": "exact_match",
                "expected": "CORRECT",
                "weight": 1.0,
            }
        ],
        exec_config={
            "model_id": "gemini-2.0-flash",
            "temperature": 0,
            "n_runs": 1,
            "max_output_tokens": 50,
            "token_budget": 100,
        },
        reference_solution_prompt="Answer: CORRECT",
    )
    db.commit()

    # Mock Gemini to always return the correct answer with low token count
    mock_response = MagicMock()
    mock_response.text = "CORRECT"
    mock_response.usage_metadata.candidates_token_count = 5

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("prompt_tester.grader._get_gemini_client", return_value=mock_client):
        score = _run_validation(db, question, qv)

    assert score >= 90.0, f"Expected score >= 90, got {score}"


def test_bad_reference_solution_blocks_publish(db):
    """
    A reference solution that scores < 90 should result in a score < 90.
    The caller (seed.py) is responsible for calling sys.exit.
    """
    question = make_question(db, slug="bad-ref-" + str(uuid.uuid4())[:8])
    qv = make_question_version(
        db,
        question,
        test_suite=[
            {
                "id": "tc1",
                "hidden_input": "Some text.",
                "type": "exact_match",
                "expected": "CORRECT",
                "weight": 1.0,
            }
        ],
        exec_config={
            "model_id": "gemini-2.0-flash",
            "temperature": 0,
            "n_runs": 1,
            "max_output_tokens": 50,
            "token_budget": 100,
        },
        reference_solution_prompt="This prompt always returns wrong answers.",
    )
    db.commit()

    # Mock Gemini to return WRONG answer every time
    mock_response = MagicMock()
    mock_response.text = "WRONG ANSWER"
    mock_response.usage_metadata.candidates_token_count = 20  # Also not efficient

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("prompt_tester.grader._get_gemini_client", return_value=mock_client):
        score = _run_validation(db, question, qv)

    assert score < 90.0, f"Expected score < 90 for bad solution, got {score}"
