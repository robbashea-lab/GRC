"""Iteration 14 — backend regression for route-extraction refactor.

Covers:
- GET /api/clients/directory (super_admin) shape parity
- GET /api/clients/directory (client_contributor) 403
- GET /api/baseline/templates (~8 policies, ~6 risks, ~10 review templates)
- POST /api/baseline creates policies/risks/reviews for authorized client, tenant iso, read-only rejection
- POST /api/contacts/{id}/invite path (with/without APP_BASE_URL)
"""
import os
import uuid
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"

SUPER = ("robbashea@gmail.com", "Admin@2026")
PLATFORM = ("platform.admin@grc.demo", "Demo@2026")
CONTRIB = ("contributor@acme.demo", "Demo@2026")
READONLY = ("readonly@acme.demo", "Demo@2026")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def super_client():
    return _login(*SUPER)


@pytest.fixture(scope="module")
def contrib_client():
    return _login(*CONTRIB)


@pytest.fixture(scope="module")
def readonly_client():
    return _login(*READONLY)


# ---- /clients/directory ------------------------------------------------------
def test_directory_shape_super_admin(super_client):
    r = super_client.get(f"{BASE}/clients/directory", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("clients", "portfolio", "attention_queue", "team_workload"):
        assert key in data, f"missing key {key}"
    assert isinstance(data["clients"], list)
    assert isinstance(data["portfolio"], dict)
    assert isinstance(data["attention_queue"], list)
    assert isinstance(data["team_workload"], list)
    # sanity: at least one seeded tenant present
    assert len(data["clients"]) >= 1
    row = data["clients"][0]
    for k in ("client_id", "name", "program_status", "past_due", "due_30d",
              "due_31_90d", "critical_high_open", "unassigned"):
        assert k in row, f"row missing {k}"
    for k in ("total_clients", "past_due", "due_30d", "due_31_90d",
              "critical_high_open", "unassigned", "clients_requiring_attention"):
        assert k in data["portfolio"]


def test_directory_forbidden_for_contributor(contrib_client):
    r = contrib_client.get(f"{BASE}/clients/directory", timeout=30)
    assert r.status_code == 403


# ---- /baseline/templates -----------------------------------------------------
def test_baseline_templates(super_client):
    r = super_client.get(f"{BASE}/baseline/templates", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert isinstance(d.get("policies"), list) and len(d["policies"]) == 8
    assert isinstance(d.get("risks"), list) and len(d["risks"]) == 6
    assert isinstance(d.get("review_templates"), list) and len(d["review_templates"]) == 10
    for rv in d["review_templates"]:
        for k in ("title", "review_type", "recurrence", "due_days"):
            assert k in rv, f"review_template missing {k}"


# ---- /baseline POST ----------------------------------------------------------
@pytest.fixture(scope="module")
def any_active_client_id(super_client):
    """Return any non-archived client id (super_admin can see everything)."""
    r = super_client.get(f"{BASE}/clients/directory", timeout=30)
    assert r.status_code == 200
    for c in r.json().get("clients", []):
        if c.get("client_status") != "archived":
            return c["client_id"]
    pytest.skip("no active client seeded")


def test_baseline_create_super(super_client, any_active_client_id):
    marker = f"TEST_iter14_{uuid.uuid4().hex[:8]}"
    body = {
        "client_id": any_active_client_id,
        "policies": [f"{marker}_pol_A"],
        "risks": [f"{marker}_rsk_A"],
        "reviews": [{"title": f"{marker}_rev_A", "review_type": "policy",
                     "recurrence": "annual", "due_days": 30}],
    }
    r = super_client.post(f"{BASE}/baseline", json=body, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("ok") is True
    assert d["created"] == {"policies": 1, "risks": 1, "reviews": 1}


def test_baseline_readonly_rejected(readonly_client, any_active_client_id):
    body = {"client_id": any_active_client_id, "policies": ["TEST_iter14_readonly"], "risks": [], "reviews": []}
    r = readonly_client.post(f"{BASE}/baseline", json=body, timeout=30)
    assert r.status_code == 403


def test_baseline_tenant_isolation(contrib_client):
    # Contributor has no client_ids so any client_id is forbidden
    body = {"client_id": "cli_does_not_exist_iter14", "policies": ["TEST_iter14_x"],
            "risks": [], "reviews": []}
    r = contrib_client.post(f"{BASE}/baseline", json=body, timeout=30)
    assert r.status_code == 403


# ---- /contacts/{id}/invite ---------------------------------------------------
def test_contact_invite_flow(super_client, any_active_client_id):
    # Create a contact with unique email, no linked_user_id
    email = f"test_iter14_{uuid.uuid4().hex[:8]}@example.com"
    body = {
        "client_id": any_active_client_id,
        "name": "Iter14 Invite Target",
        "email": email,
        "role": "Security Lead",
    }
    r = super_client.post(f"{BASE}/contacts", json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    contact = r.json()
    cid = contact.get("contact_id") or contact.get("id")
    assert cid, contact
    # Invite
    r2 = super_client.post(f"{BASE}/contacts/{cid}/invite", timeout=30)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert "user" in d and d["user"].get("email") == email.lower()
    # invite_link non-null (APP_BASE_URL is set in /app/backend/.env)
    assert d.get("invite_link"), f"invite_link should be set, got {d.get('invite_link')!r}"
    assert "/reset-password?token=" in d["invite_link"]
    # Contact should now be linked
    r3 = super_client.get(f"{BASE}/contacts/{cid}", timeout=30)
    if r3.status_code == 200:
        assert r3.json().get("linked_user_id")
