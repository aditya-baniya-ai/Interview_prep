"""
Tests for the FastAPI router endpoints.
"""

import os
import uuid
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from .conftest import (
    make_question,
    make_question_version,
    make_submission,
    make_grading_job,
    make_score,
)


def _make_app(db_session, enabled: bool = True):
    """
    Build a test FastAPI app with the prompt_tester router mounted,
    injecting our test DB session.
    """
    from fastapi import FastAPI
    from prompt_tester.router import router
    from prompt_tester.database import get_db

    app = FastAPI()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.include_router(router)

    return app


@pytest.fixture
def enabled_env(monkeypatch):
    monkeypatch.setenv("PROMPT_TESTER_ENABLED", "1")


@pytest.fixture
def disabled_env(monkeypatch):
    monkeypatch.setenv("PROMPT_TESTER_ENABLED", "")


def test_get_questions_returns_only_published(db, enabled_env):
    # Create one published and one draft question
    q_pub = make_question(db, slug="pub-" + str(uuid.uuid4())[:8], status="published")
    make_question_version(db, q_pub)
    q_draft = make_question(db, slug="draft-" + str(uuid.uuid4())[:8], status="draft")
    make_question_version(db, q_draft)
    db.commit()

    with patch.dict(os.environ, {"PROMPT_TESTER_ENABLED": "1"}):
        # Re-import to pick up env
        import importlib
        import prompt_tester.router as rt_mod
        importlib.reload(rt_mod)

        app = _make_app(db)
        client = TestClient(app)
        resp = client.get("/api/prompt-tester/questions")

    assert resp.status_code == 200
    slugs = [q["slug"] for q in resp.json()]
    assert q_pub.slug in slugs
    assert q_draft.slug not in slugs


def test_question_detail_never_leaks_test_suite(db, enabled_env):
    q = make_question(db, slug="leak-" + str(uuid.uuid4())[:8], status="published")
    make_question_version(
        db,
        q,
        test_suite=[{"id": "tc1", "hidden_input": "SECRET", "type": "exact_match", "expected": "X", "weight": 1}],
        reference_solution_prompt="SECRET_PROMPT",
    )
    db.commit()

    with patch.dict(os.environ, {"PROMPT_TESTER_ENABLED": "1"}):
        import importlib
        import prompt_tester.router as rt_mod
        importlib.reload(rt_mod)

        app = _make_app(db)
        client = TestClient(app)
        resp = client.get(f"/api/prompt-tester/questions/{q.slug}")

    assert resp.status_code == 200
    body = resp.json()
    body_str = str(body)
    assert "test_suite" not in body_str
    assert "SECRET_PROMPT" not in body_str
    assert "hidden_input" not in body_str


def test_submit_creates_job(db, enabled_env):
    q = make_question(db, slug="submit-" + str(uuid.uuid4())[:8], status="published")
    make_question_version(db, q)
    db.commit()

    with patch.dict(os.environ, {"PROMPT_TESTER_ENABLED": "1"}):
        import importlib
        import prompt_tester.router as rt_mod
        importlib.reload(rt_mod)

        app = _make_app(db)
        client = TestClient(app)
        resp = client.post(
            "/api/prompt-tester/submissions",
            json={"question_slug": q.slug, "prompt_text": "Extract dates please."},
            headers={"X-User-ID": "test-user"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "submission_id" in data
    assert "job_id" in data
    assert data["status"] == "queued"


def test_get_submission_returns_score_when_scored(db, enabled_env):
    q = make_question(db, slug="scored-" + str(uuid.uuid4())[:8], status="published")
    make_question_version(db, q)
    sub = make_submission(db, q, status="scored")
    make_score(db, sub, total_score=87.5)
    db.commit()

    with patch.dict(os.environ, {"PROMPT_TESTER_ENABLED": "1"}):
        import importlib
        import prompt_tester.router as rt_mod
        importlib.reload(rt_mod)

        app = _make_app(db)
        client = TestClient(app)
        resp = client.get(f"/api/prompt-tester/submissions/{sub.id}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "scored"
    assert data["score"] is not None
    assert data["score"]["total_score"] == pytest.approx(87.5)


def test_feature_flag_off_returns_404(db, disabled_env):
    with patch.dict(os.environ, {"PROMPT_TESTER_ENABLED": ""}):
        import importlib
        import prompt_tester.router as rt_mod
        importlib.reload(rt_mod)

        app = _make_app(db, enabled=False)
        client = TestClient(app)

        resp = client.get("/api/prompt-tester/questions")
        assert resp.status_code == 404

        resp = client.get("/api/prompt-tester/questions/any-slug")
        assert resp.status_code == 404

        resp = client.post(
            "/api/prompt-tester/submissions",
            json={"question_slug": "x", "prompt_text": "y"},
        )
        assert resp.status_code == 404
