"""Iteration 12 — GRC Portfolio Overview (/api/clients/directory redesign).

Covers non-overlap, dedup, unassigned, archived exclusion, RBAC, attention_queue,
team_workload, program_status rules, weekly digest regression.
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

# NOTE: platform.admin@grc.demo has role=client_contributor in the seeded preview DB
# (see BUG in test report). Falling back to super_admin so functional tests can run.
ADMIN_EMAIL = "robbashea@gmail.com"
ADMIN_PW = "Admin@2026"
CONTRIB_EMAIL = "contributor@acme.demo"
CONTRIB_PW = "Demo@2026"


def _iso(dt):
    return dt.replace(tzinfo=timezone.utc).isoformat() if dt.tzinfo is None else dt.isoformat()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def contrib_token():
    r = requests.post(f"{API}/auth/login", json={"email": CONTRIB_EMAIL, "password": CONTRIB_PW})
    assert r.status_code == 200, f"contrib login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def contrib_client(contrib_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {contrib_token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def test_client_id(admin_client):
    """Create a dedicated client for these tests so we can measure deltas precisely."""
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_Portfolio",
        "industry": "Technology",
        "status": "active",
    })
    assert r.status_code == 200, r.text
    cid = r.json()["client_id"]
    yield cid
    # Cleanup: archive so it stops contributing (no delete endpoint).
    admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived", "name": f"TEST_iter12_ARCHIVED_{int(time.time())}"})


@pytest.fixture(scope="module")
def archived_client_id(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_ArchivedTenant",
        "industry": "Technology",
        "status": "active",
    })
    assert r.status_code == 200, r.text
    cid = r.json()["client_id"]
    # Seed 2 overdue reviews before archiving.
    past = _iso(datetime.now(timezone.utc) - timedelta(days=5))
    for i in range(2):
        admin_client.post(f"{API}/reviews", json={
            "title": f"TEST_iter12_arch_overdue_{i}",
            "review_type": "vendor",
            "client_id": cid,
            "due_date": past,
            "status": "in_progress",
            "owner_id": "u_dummy",
        })
    # Archive
    admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})
    yield cid


def _get_directory(session, include_archived=False):
    params = {"include_archived": "true"} if include_archived else {}
    r = session.get(f"{API}/clients/directory", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def _find_client(payload, cid):
    for c in payload["clients"]:
        if c["client_id"] == cid:
            return c
    return None


# ---------------- RBAC ----------------
def test_rbac_contributor_forbidden(contrib_client):
    r = contrib_client.get(f"{API}/clients/directory")
    assert r.status_code == 403


def test_admin_can_read_directory(admin_client):
    r = admin_client.get(f"{API}/clients/directory")
    assert r.status_code == 200
    data = r.json()
    for k in ("clients", "portfolio", "attention_queue", "team_workload"):
        assert k in data, f"missing top-level key {k}"
    p = data["portfolio"]
    for k in ("past_due", "due_30d", "due_31_90d", "critical_high_open",
              "unassigned", "clients_requiring_attention", "total_clients", "generated_at"):
        assert k in p, f"missing portfolio key {k}"
    # Legacy keys retained
    for k in ("action_required", "needs_attention", "total_overdue_reviews",
              "total_critical_high", "total_significant_risks", "upcoming_reviews_30d"):
        assert k in p, f"legacy portfolio key {k} missing"


# ---------------- Non-overlap ----------------
def test_non_overlap_pastdue_vs_due30(admin_client, test_client_id):
    past = _iso(datetime.now(timezone.utc) - timedelta(days=3))
    soon = _iso(datetime.now(timezone.utc) + timedelta(days=15))
    r1 = admin_client.post(f"{API}/reviews", json={
        "title": "TEST_iter12_overdue_review", "review_type": "policy",
        "client_id": test_client_id, "due_date": past, "status": "in_progress",
        "owner_id": "u_owner1",
    })
    assert r1.status_code == 200, r1.text
    r2 = admin_client.post(f"{API}/reviews", json={
        "title": "TEST_iter12_due15d_review", "review_type": "policy",
        "client_id": test_client_id, "due_date": soon, "status": "in_progress",
        "owner_id": "u_owner1",
    })
    assert r2.status_code == 200, r2.text

    payload = _get_directory(admin_client)
    row = _find_client(payload, test_client_id)
    assert row is not None, "test client not in directory"
    assert row["past_due"] >= 1
    assert row["due_30d"] >= 1
    # non-overlap: the overdue one is NOT counted in due_30d
    # We seeded exactly one past + one soon in this fresh client, so both should be 1
    # (allowing >=1 in case fixtures re-order; but they should be equal here)
    assert row["past_due"] == 1, f"expected past_due=1, got {row['past_due']}"
    assert row["due_30d"] == 1, f"expected due_30d=1, got {row['due_30d']}"


# ---------------- De-duplication (finding + linked task) ----------------
def test_dedup_finding_and_linked_task(admin_client):
    # Fresh client so counts are deterministic
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_dedup", "industry": "Technology", "status": "active",
    })
    assert r.status_code == 200
    cid = r.json()["client_id"]
    try:
        past = _iso(datetime.now(timezone.utc) - timedelta(days=2))
        rf = admin_client.post(f"{API}/findings", json={
            "title": "TEST_iter12_dedup_finding", "client_id": cid,
            "severity": "critical", "status": "open",
            "due_date": past, "owner_id": "u_owner1",
        })
        assert rf.status_code == 200, rf.text
        fid = rf.json()["finding_id"]
        rt = admin_client.post(f"{API}/tasks", json={
            "title": "TEST_iter12_dedup_task", "client_id": cid,
            "status": "open", "priority": "critical",
            "due_date": past, "finding_id": fid, "assignee_id": "u_owner1",
        })
        assert rt.status_code == 200, rt.text

        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row is not None
        assert row["past_due"] == 1, f"expected past_due=1 (finding only, task deduped), got {row['past_due']}"
        assert row["critical_high_open"] == 1, f"expected critical_high_open=1, got {row['critical_high_open']}"
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


# ---------------- Unassigned counting ----------------
def test_unassigned_counts_all_four_types(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_unassigned", "industry": "Technology", "status": "active",
    })
    assert r.status_code == 200
    cid = r.json()["client_id"]
    try:
        soon = _iso(datetime.now(timezone.utc) + timedelta(days=20))
        assert admin_client.post(f"{API}/reviews", json={
            "title": "TEST_iter12_unrev", "review_type": "policy", "client_id": cid,
            "status": "in_progress", "due_date": soon,
        }).status_code == 200
        assert admin_client.post(f"{API}/tasks", json={
            "title": "TEST_iter12_untask", "client_id": cid, "status": "open",
            "priority": "medium", "due_date": soon,
        }).status_code == 200
        assert admin_client.post(f"{API}/findings", json={
            "title": "TEST_iter12_unfnd", "client_id": cid, "severity": "medium",
            "status": "open", "due_date": soon,
        }).status_code == 200
        assert admin_client.post(f"{API}/risks", json={
            "title": "TEST_iter12_unrisk", "client_id": cid, "status": "open",
            "likelihood_score": 3, "impact_score": 3,
        }).status_code == 200

        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row is not None
        assert row["unassigned"] == 4, f"expected 4 unassigned, got {row['unassigned']}"
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


# ---------------- Risks without next_review ignored in buckets ----------------
def test_risk_without_next_review_not_in_buckets(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_risks", "industry": "Technology", "status": "active",
    })
    assert r.status_code == 200
    cid = r.json()["client_id"]
    try:
        past = _iso(datetime.now(timezone.utc) - timedelta(days=4))
        # Risk without next_review — should NOT appear in past_due
        assert admin_client.post(f"{API}/risks", json={
            "title": "TEST_iter12_risk_no_review", "client_id": cid, "status": "open",
            "likelihood_score": 2, "impact_score": 2, "owner_id": "u_owner1",
        }).status_code == 200
        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row["past_due"] == 0
        assert row["due_30d"] == 0
        assert row["due_31_90d"] == 0

        # Now add a risk with next_review in the past — should appear in past_due
        assert admin_client.post(f"{API}/risks", json={
            "title": "TEST_iter12_risk_overdue_review", "client_id": cid, "status": "open",
            "likelihood_score": 4, "impact_score": 4, "next_review": past,
            "owner_id": "u_owner1",
        }).status_code == 200
        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row["past_due"] == 1
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


# ---------------- Archived exclusion ----------------
def test_archived_client_excluded_by_default(admin_client, archived_client_id):
    p_default = _get_directory(admin_client, include_archived=False)
    assert _find_client(p_default, archived_client_id) is None, "archived client should be excluded by default"
    p_full = _get_directory(admin_client, include_archived=True)
    assert _find_client(p_full, archived_client_id) is not None, "archived client should appear with include_archived=true"


# ---------------- Program status rule engine ----------------
def test_program_status_action_required_from_critical_overdue(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_status_ar", "industry": "Technology", "status": "active",
    })
    cid = r.json()["client_id"]
    try:
        past = _iso(datetime.now(timezone.utc) - timedelta(days=1))
        admin_client.post(f"{API}/findings", json={
            "title": "TEST_iter12_status_crit_overdue", "client_id": cid,
            "severity": "critical", "status": "open", "due_date": past,
            "owner_id": "u_owner1",
        })
        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row["program_status"] == "action_required", f"got {row['program_status']}"
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


def test_program_status_onboarding_preserved(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_status_onb", "industry": "Technology", "status": "onboarding",
    })
    cid = r.json()["client_id"]
    try:
        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row["program_status"] == "onboarding"
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


def test_program_status_healthy_when_clean(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_status_clean", "industry": "Technology", "status": "active",
    })
    cid = r.json()["client_id"]
    try:
        payload = _get_directory(admin_client)
        row = _find_client(payload, cid)
        assert row["program_status"] == "healthy", f"got {row['program_status']}"
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


# ---------------- Attention queue prioritization ----------------
def test_attention_queue_prioritization(admin_client):
    r = admin_client.post(f"{API}/clients", json={
        "name": "TEST_iter12_attn", "industry": "Technology", "status": "active",
    })
    cid = r.json()["client_id"]
    try:
        past = _iso(datetime.now(timezone.utc) - timedelta(days=1))
        soon = _iso(datetime.now(timezone.utc) + timedelta(days=10))
        # Overdue critical finding — should rank first
        admin_client.post(f"{API}/findings", json={
            "title": "TEST_iter12_attn_crit_overdue", "client_id": cid,
            "severity": "critical", "status": "open", "due_date": past, "owner_id": "u_owner1",
        })
        # Non-overdue high finding
        admin_client.post(f"{API}/findings", json={
            "title": "TEST_iter12_attn_high_soon", "client_id": cid,
            "severity": "high", "status": "open", "due_date": soon, "owner_id": "u_owner1",
        })
        # Overdue medium item
        admin_client.post(f"{API}/findings", json={
            "title": "TEST_iter12_attn_med_overdue", "client_id": cid,
            "severity": "medium", "status": "open", "due_date": past, "owner_id": "u_owner1",
        })

        payload = _get_directory(admin_client)
        # Queue is trimmed to top 15 across all tenants; preview DB has many prior
        # criticals, so only the highest-ranked one from our client is guaranteed
        # to appear. Verify: (a) size cap, (b) our critical-overdue made the cut,
        # (c) queue is sorted non-decreasing by rank order (crit > high > med etc.)
        assert len(payload["attention_queue"]) <= 15
        our = [a for a in payload["attention_queue"] if a["client_id"] == cid]
        assert any(a["title"] == "TEST_iter12_attn_crit_overdue" for a in our), \
            f"critical-overdue finding for our client should be in top-15: {our}"

        # Verify global ordering by priority bucket rank (critical -> high -> due_soon -> ...)
        rank_order = {"critical": 0, "high": 1, "overdue": 2, "due_soon": 3}
        ranks = [rank_order.get(a["priority"], 9) for a in payload["attention_queue"]]
        assert ranks == sorted(ranks), f"attention_queue not sorted by priority bucket: {ranks}"
    finally:
        admin_client.patch(f"{API}/clients/{cid}", json={"status": "archived"})


# ---------------- Team workload ----------------
def test_team_workload_only_admin_users(admin_client):
    payload = _get_directory(admin_client)
    for w in payload["team_workload"]:
        assert w.get("role") in ("super_admin", "platform_admin"), \
            f"non-admin appeared in team_workload: {w}"
        for k in ("user_id", "name", "clients", "past_due", "due_30d", "critical_high", "open_actions"):
            assert k in w, f"team_workload missing key {k}"


# ---------------- Client row shape ----------------
def test_client_row_shape(admin_client, test_client_id):
    payload = _get_directory(admin_client)
    row = _find_client(payload, test_client_id)
    assert row is not None
    for k in ("grc_lead_id", "grc_lead", "past_due", "due_30d", "due_31_90d",
              "critical_high_open", "unassigned", "next_major_item", "program_status"):
        assert k in row, f"client row missing {k}"
    # next_major_item is dict|None; if dict, has expected fields
    nmi = row["next_major_item"]
    if nmi is not None:
        for k in ("title", "due_date", "review_type", "review_id"):
            assert k in nmi, f"next_major_item missing {k}"


# ---------------- Regression: weekly digest ----------------
def test_weekly_digest_regression(admin_client):
    r = admin_client.post(f"{API}/reminders/send-weekly-now")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True, body
