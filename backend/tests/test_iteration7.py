"""
Iteration 7 — Reviews refactor (schedule + historical record).

Covers:
- New Review statuses (upcoming, in_progress, completed, cancelled)
- Recurrence enum incl. custom + custom_recurrence_days
- POST /api/reviews/{id}/complete happy-path (quarterly spawn), custom recurrence spawn,
  none = no spawn, already-completed 400, completion_notes append, lineage
- Dashboard KPIs: overdue excludes completed/cancelled
- Legacy migration: no reviews with status planned/blocked/overdue remain
- Tenant scoping (Acme contributor cannot complete Globex review) -> 403
- Read-only role -> 403 on /complete
"""
import os
import re
from datetime import datetime, timedelta, timezone
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as _f:
            for _line in _f:
                if _line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = _line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    return _login("robbashea@gmail.com", "Admin@2026")


@pytest.fixture(scope="module")
def acme_contrib_token():
    return _login("contributor@acme.demo", "Demo@2026")


@pytest.fixture(scope="module")
def globex_contrib_token():
    return _login("contributor@globex.demo", "Demo@2026")


@pytest.fixture(scope="module")
def readonly_token():
    return _login("readonly@acme.demo", "Demo@2026")


@pytest.fixture(scope="module")
def acme_cid(admin_token):
    r = requests.get(f"{BASE_URL}/api/clients", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    for c in r.json():
        if "acme" in (c.get("name") or "").lower():
            return c["client_id"]
    pytest.skip("Acme client not found")


@pytest.fixture(scope="module")
def globex_cid(admin_token):
    r = requests.get(f"{BASE_URL}/api/clients", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    for c in r.json():
        if "globex" in (c.get("name") or "").lower():
            return c["client_id"]
    pytest.skip("Globex client not found")


def _create_review(token, cid, **overrides):
    base_due = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    payload = {
        "title": overrides.pop("title", "TEST_iter7_review"),
        "review_type": "control",
        "client_id": cid,
        "due_date": base_due,
        "status": "upcoming",
        "recurrence": "none",
        "notes": "seed notes",
    }
    payload.update(overrides)
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(token), json=payload, timeout=20)
    assert r.status_code in (200, 201), f"create review failed: {r.status_code} {r.text}"
    return r.json()


def _get_review(token, rid):
    r = requests.get(f"{BASE_URL}/api/reviews", headers=_h(token), timeout=20)
    assert r.status_code == 200
    for it in r.json():
        if it.get("review_id") == rid:
            return it
    return None


# ---- Model / persistence ---------------------------------------------------

def test_post_reviews_accepts_new_statuses_and_custom_recurrence(admin_token, acme_cid):
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_custom", status="in_progress",
                         recurrence="custom", custom_recurrence_days=45)
    assert rec["status"] == "in_progress"
    assert rec["recurrence"] == "custom"
    assert rec["custom_recurrence_days"] == 45
    # verify persisted
    got = _get_review(admin_token, rec["review_id"])
    assert got and got["status"] == "in_progress"
    assert got["custom_recurrence_days"] == 45


# ---- Complete endpoint -----------------------------------------------------

def test_complete_quarterly_spawns_next_occurrence(admin_token, acme_cid):
    base_due = "2026-03-15T09:00:00+00:00"
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_q", due_date=base_due,
                         recurrence="quarterly", notes="original notes")
    rid = rec["review_id"]
    r = requests.post(f"{BASE_URL}/api/reviews/{rid}/complete",
                      headers=_h(admin_token), json={}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["review"]["status"] == "completed"
    assert data["review"].get("completion_date")
    assert data["review"].get("next_occurrence_id")
    sp = data["spawned"]
    assert sp is not None
    assert sp["status"] == "upcoming"
    assert sp["parent_review_id"] == rid
    # Base +3 months → 2026-06-15
    assert sp["due_date"].startswith("2026-06-15"), f"expected 2026-06-15, got {sp['due_date']}"
    # No inherited findings/evidence
    assert "findings" not in sp
    assert "evidence" not in sp
    # linkage from completed review
    assert data["review"]["next_occurrence_id"] == sp["review_id"]


def test_complete_custom_recurrence_spawns_45_days(admin_token, acme_cid):
    base = "2026-05-01T09:00:00+00:00"
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_c45", due_date=base,
                         recurrence="custom", custom_recurrence_days=45)
    rid = rec["review_id"]
    r = requests.post(f"{BASE_URL}/api/reviews/{rid}/complete",
                      headers=_h(admin_token), json={}, timeout=30)
    assert r.status_code == 200, r.text
    sp = r.json()["spawned"]
    assert sp is not None
    # 2026-05-01 + 45 days = 2026-06-15
    assert sp["due_date"].startswith("2026-06-15"), f"expected 2026-06-15, got {sp['due_date']}"
    assert sp["custom_recurrence_days"] == 45


def test_complete_none_recurrence_no_spawn(admin_token, acme_cid):
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_none", recurrence="none")
    r = requests.post(f"{BASE_URL}/api/reviews/{rec['review_id']}/complete",
                      headers=_h(admin_token), json={}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["spawned"] is None
    assert data["review"].get("next_occurrence_id") in (None, "")


def test_complete_already_completed_returns_400(admin_token, acme_cid):
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_double")
    r = requests.post(f"{BASE_URL}/api/reviews/{rec['review_id']}/complete",
                      headers=_h(admin_token), json={}, timeout=30)
    assert r.status_code == 200
    r2 = requests.post(f"{BASE_URL}/api/reviews/{rec['review_id']}/complete",
                       headers=_h(admin_token), json={}, timeout=30)
    assert r2.status_code == 400, f"expected 400 on already completed, got {r2.status_code} {r2.text}"


def test_complete_notes_appended_not_overwritten(admin_token, acme_cid):
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_notes", notes="ORIGINAL_NOTES_MARKER")
    r = requests.post(f"{BASE_URL}/api/reviews/{rec['review_id']}/complete",
                      headers=_h(admin_token),
                      json={"completion_notes": "COMPLETION_NOTE_MARKER"}, timeout=30)
    assert r.status_code == 200
    notes = r.json()["review"].get("notes", "")
    assert "ORIGINAL_NOTES_MARKER" in notes, "Original notes should be preserved (append not overwrite)"
    assert "COMPLETION_NOTE_MARKER" in notes


# ---- Authorization ---------------------------------------------------------

def test_readonly_cannot_complete(readonly_token, admin_token, acme_cid):
    rec = _create_review(admin_token, acme_cid, title="TEST_iter7_ro")
    r = requests.post(f"{BASE_URL}/api/reviews/{rec['review_id']}/complete",
                      headers=_h(readonly_token), json={}, timeout=30)
    assert r.status_code == 403, f"expected 403 for readonly, got {r.status_code} {r.text}"


def test_acme_contributor_cannot_complete_globex_review(acme_contrib_token, admin_token, globex_cid):
    rec = _create_review(admin_token, globex_cid, title="TEST_iter7_cross")
    r = requests.post(f"{BASE_URL}/api/reviews/{rec['review_id']}/complete",
                      headers=_h(acme_contrib_token), json={}, timeout=30)
    assert r.status_code == 403, f"expected 403 cross-tenant, got {r.status_code} {r.text}"


# ---- Dashboard -------------------------------------------------------------

def test_dashboard_overdue_excludes_completed_and_cancelled(admin_token, acme_cid):
    past = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()

    def _kpi():
        r = requests.get(f"{BASE_URL}/api/dashboard?client_id={acme_cid}",
                         headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        kpis = r.json().get("kpis") or {}
        v = kpis.get("overdue_reviews")
        assert isinstance(v, int), f"overdue_reviews KPI missing/non-int: {kpis}"
        return v

    baseline = _kpi()

    # Create an overdue upcoming review — KPI must go up by 1
    overdue_up = _create_review(admin_token, acme_cid, title="TEST_iter7_overdue_up",
                                due_date=past, status="upcoming")
    after_up = _kpi()
    assert after_up == baseline + 1, f"expected +1, baseline={baseline}, after={after_up}"

    # Create a cancelled past-due review — KPI must NOT change
    _create_review(admin_token, acme_cid, title="TEST_iter7_cancelled",
                   due_date=past, status="cancelled")
    after_cancel = _kpi()
    assert after_cancel == after_up, f"cancelled should not count: {after_up} -> {after_cancel}"

    # Complete the overdue one — KPI must go back down by 1
    r = requests.post(f"{BASE_URL}/api/reviews/{overdue_up['review_id']}/complete",
                      headers=_h(admin_token), json={"spawn_next": False}, timeout=30)
    assert r.status_code == 200
    after_complete = _kpi()
    assert after_complete == baseline, f"completed should decrement: expected {baseline}, got {after_complete}"


# ---- Legacy migration ------------------------------------------------------

def test_no_legacy_review_statuses(admin_token):
    r = requests.get(f"{BASE_URL}/api/reviews", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    for it in r.json():
        assert it.get("status") not in ("planned", "blocked", "overdue"), \
            f"legacy status {it.get('status')} still present on {it.get('review_id')}"


# ---- Regression: board report ---------------------------------------------

def test_board_report_still_generates(admin_token, acme_cid):
    r = requests.get(f"{BASE_URL}/api/reports/board?client_id={acme_cid}",
                     headers=_h(admin_token), timeout=60)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf") or len(r.content) > 500
