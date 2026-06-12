"""
Tests for the grading pipeline deterministic logic and score aggregation.
All Gemini API calls are mocked — no real API calls are made.
"""

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from prompt_tester.grader import (
    SCORE_WEIGHTS,
    _call_judge,
    _deterministic_grade,
    _grade_classification,
    _grade_constraint,
    _grade_exact_match,
    _grade_json_schema,
    _grade_regex,
    grade_submission,
)

from .conftest import (
    make_grading_job,
    make_question,
    make_question_version,
    make_submission,
)


# ─── Exact Match ─────────────────────────────────────────────────────────────

def test_exact_match_pass_case_insensitive():
    tc = {"type": "exact_match", "expected": "Hello World", "case_insensitive": True}
    assert _grade_exact_match("hello world", tc) is True


def test_exact_match_fail_case_insensitive():
    tc = {"type": "exact_match", "expected": "Hello World", "case_insensitive": True}
    assert _grade_exact_match("goodbye", tc) is False


def test_exact_match_strict():
    tc = {"type": "exact_match", "expected": "Hello World", "case_insensitive": False}
    assert _grade_exact_match("Hello World", tc) is True
    assert _grade_exact_match("hello world", tc) is False


# ─── Regex ───────────────────────────────────────────────────────────────────

def test_regex_match():
    tc = {"type": "regex", "pattern": r"\d{4}-\d{2}-\d{2}"}
    assert _grade_regex("Today is 2024-01-15.", tc) is True


def test_regex_no_match():
    tc = {"type": "regex", "pattern": r"\d{4}-\d{2}-\d{2}"}
    assert _grade_regex("No dates here at all.", tc) is False


# ─── JSON Schema ─────────────────────────────────────────────────────────────

def test_json_schema_valid():
    tc = {
        "type": "json_schema",
        "schema": {
            "type": "array",
            "items": {"type": "string"},
        },
    }
    assert _grade_json_schema('["a", "b"]', tc) is True


def test_json_schema_invalid():
    tc = {
        "type": "json_schema",
        "schema": {
            "type": "array",
            "items": {"type": "string"},
        },
    }
    assert _grade_json_schema("not json at all", tc) is False
    assert _grade_json_schema('{"key": "value"}', tc) is False


# ─── Classification ───────────────────────────────────────────────────────────

def test_classification_correct():
    tc = {"type": "classification", "expected": "POSITIVE"}
    assert _grade_classification("POSITIVE", tc) is True


def test_classification_wrong():
    tc = {"type": "classification", "expected": "POSITIVE"}
    assert _grade_classification("NEGATIVE", tc) is False
    assert _grade_classification("positive", tc) is False  # case sensitive


# ─── Constraint ───────────────────────────────────────────────────────────────

def test_constraint_word_count():
    tc = {"type": "constraint", "max_words": 5}
    assert _grade_constraint("one two three four five", tc) is True
    assert _grade_constraint("one two three four five six", tc) is False


def test_constraint_forbidden_term():
    tc = {"type": "constraint", "forbidden_terms": ["I cannot", "As an AI"]}
    assert _grade_constraint("Sure, happy to help!", tc) is True
    assert _grade_constraint("I cannot assist with that.", tc) is False


def test_constraint_required_term():
    tc = {"type": "constraint", "required_terms": ["summary"]}
    assert _grade_constraint("Here is a summary of the text.", tc) is True
    assert _grade_constraint("Here is the answer.", tc) is False


# ─── Judge Isolation ──────────────────────────────────────────────────────────

def test_judge_isolation():
    """
    Verify that the judge call does NOT receive the candidate's prompt text —
    only the hidden_input and the candidate's OUTPUT.
    """
    mock_response = MagicMock()
    mock_response.text = '{"score": 0.8, "reasoning": "Looks good."}'

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    candidate_prompt = "THIS_IS_THE_SECRET_CANDIDATE_PROMPT"
    hidden_input = "Rewrite this: hey whatsup"
    rubric_criterion = "Does the output use formal business English?"
    candidate_output = "Good day, how may I assist you?"

    exec_config = {"model_id": "gemini-2.0-flash"}

    score, reasoning = _call_judge(
        mock_client,
        hidden_input,
        rubric_criterion,
        candidate_output,
        exec_config,
    )

    # Check the call was made
    assert mock_client.models.generate_content.called

    call_kwargs = mock_client.models.generate_content.call_args
    # Get contents argument
    contents = call_kwargs.kwargs.get("contents") or call_kwargs.args[1] if call_kwargs.args else ""
    if not contents and call_kwargs.kwargs:
        contents = call_kwargs.kwargs.get("contents", "")

    # The candidate prompt must NOT appear anywhere in the judge call
    assert candidate_prompt not in str(contents), (
        "Candidate prompt text leaked into the judge call!"
    )

    # But the output should be there
    assert candidate_output in str(contents)

    assert score == pytest.approx(0.8)


# ─── Consistency Axis ─────────────────────────────────────────────────────────

def test_consistency_axis(db):
    """
    Mock 3 runs: 2 pass, 1 fail → consistency = 2/3 ≈ 0.667
    """
    question = make_question(db, slug="consist-test-" + str(uuid.uuid4())[:8])
    qv = make_question_version(
        db,
        question,
        test_suite=[
            {
                "id": "tc1",
                "hidden_input": "input text",
                "type": "exact_match",
                "expected": "PASS",
                "weight": 1.0,
            }
        ],
        exec_config={
            "model_id": "gemini-2.0-flash",
            "temperature": 0,
            "n_runs": 3,
            "max_output_tokens": 50,
            "token_budget": 100,
        },
    )
    submission = make_submission(db, question)

    # Mock Gemini: first two runs return "PASS", third returns "FAIL"
    call_count = [0]
    mock_response = MagicMock()
    mock_response.usage_metadata.candidates_token_count = 5

    def side_effect(*args, **kwargs):
        call_count[0] += 1
        r = MagicMock()
        r.usage_metadata.candidates_token_count = 5
        r.text = "PASS" if call_count[0] <= 2 else "FAIL"
        return r

    mock_client = MagicMock()
    mock_client.models.generate_content.side_effect = side_effect

    with patch("prompt_tester.grader._get_gemini_client", return_value=mock_client):
        grade_submission(submission.id, db)

    db.refresh(submission)
    score_row = submission.score
    assert score_row is not None

    # consistency should reflect 2/3 ≈ 66.7 (expressed as 0-100)
    assert 60.0 <= score_row.consistency_score <= 75.0


# ─── Efficiency Axis ──────────────────────────────────────────────────────────

def test_efficiency_axis(db):
    """
    100 output tokens, token_budget=200 → efficiency = clip(1 - 100/200, 0, 1) = 0.5
    So efficiency_score = 50.0 (0-100 scale)
    """
    question = make_question(db, slug="effic-test-" + str(uuid.uuid4())[:8])
    qv = make_question_version(
        db,
        question,
        test_suite=[
            {
                "id": "tc1",
                "hidden_input": "some input",
                "type": "exact_match",
                "expected": "any output",
                "weight": 1.0,
            }
        ],
        exec_config={
            "model_id": "gemini-2.0-flash",
            "temperature": 0,
            "n_runs": 1,
            "max_output_tokens": 200,
            "token_budget": 200,
        },
    )
    submission = make_submission(db, question)

    mock_response = MagicMock()
    mock_response.text = "any output"
    mock_response.usage_metadata.candidates_token_count = 100

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("prompt_tester.grader._get_gemini_client", return_value=mock_client):
        grade_submission(submission.id, db)

    db.refresh(submission)
    score_row = submission.score
    assert score_row is not None
    assert score_row.efficiency_score == pytest.approx(50.0, abs=1.0)


# ─── Anti-Gaming Flag ─────────────────────────────────────────────────────────

def test_anti_gaming_flag(db):
    """
    All runs return identical output for different inputs → flag appears in breakdown.
    """
    question = make_question(db, slug="gaming-test-" + str(uuid.uuid4())[:8])
    qv = make_question_version(
        db,
        question,
        test_suite=[
            {
                "id": "tc1",
                "hidden_input": "input one",
                "type": "exact_match",
                "expected": "SAME OUTPUT",
                "weight": 1.0,
            },
            {
                "id": "tc2",
                "hidden_input": "input two",
                "type": "exact_match",
                "expected": "SAME OUTPUT",
                "weight": 1.0,
            },
        ],
        exec_config={
            "model_id": "gemini-2.0-flash",
            "temperature": 0,
            "n_runs": 2,
            "max_output_tokens": 50,
            "token_budget": 100,
        },
    )
    submission = make_submission(db, question)

    # All calls return identical output regardless of input
    mock_response = MagicMock()
    mock_response.text = "SAME OUTPUT"
    mock_response.usage_metadata.candidates_token_count = 3

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_response

    with patch("prompt_tester.grader._get_gemini_client", return_value=mock_client):
        grade_submission(submission.id, db)

    db.refresh(submission)
    score_row = submission.score
    assert score_row is not None
    assert score_row.breakdown.get("anti_gaming_flag") is True
