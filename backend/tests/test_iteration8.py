"""
Iteration 8 — Client Directory (portfolio view for internal admins).

Covers:
- GET /api/clients/directory: admin 200; contributor/readonly 403
- Row shape: client_id, name, industry, program_status, open_actions,
  open_findings, significant_risks, upcoming_reviews, last_activity, client_status
- ?include_archived= toggles archived clients (via PATCH status=archived)
- GET /api/clients default hides archived, include_archived=true shows them
- PATCH /api/clients/{id}: admin can update fields; contributor/readonly 403
- POST /api/clients: admin OK (default onboarding, created_at/updated_at); c/r 403
- program_status computation: healthy w/ active + none; action_required w/ critical open finding
- last_activity reflects auditable action
- Tenant isolation regression (contributor@acme cannot access Globex)
"""
import os
import time
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
    return r.json()["access_token"], r.json().get("user", {})


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin():
    tok, u = _login("robbashea@gmail.com", "Admin@2026")
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def platform_admin():
    tok, u = _login("platform.admin@grc.demo", "Demo@2026")
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def contrib():
    tok, u = _login("contributor@acme.demo", "Demo@2026")
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def readonly():
    tok, u = _login("readonly@acme.demo", "Demo@2026")
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def globex_contrib():
    tok, u = _login("contributor@globex.demo", "Demo@2026")
    return {"token": tok, "user": u}


@pytest.fixture(scope="module")
def acme_cid(admin):
    r = requests.get(f"{BASE_URL}/api/clients", headers=_h(admin["token"]), timeout=20)
    for c in r.json():
        if "acme" in (c.get("name") or "").lower():
            return c["client_id"]
    pytest.skip("Acme not found")


@pytest.fixture(scope="module")
def globex_cid(admin):
    r = requests.get(f"{BASE_URL}/api/clients", headers=_h(admin["token"]), timeout=20)
    for c in r.json():
        if "globex" in (c.get("name") or "").lower():
            return c["client_id"]
    pytest.skip("Globex not found")


# ---------- Directory access control ----------

def test_directory_admin_200(admin):
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(admin["token"]), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "clients" in data and "portfolio" in data
    assert isinstance(data["clients"], list)
    p = data["portfolio"]
    for k in ("total_clients", "action_required", "needs_attention",
              "total_overdue_reviews", "total_critical_high",
              "total_significant_risks", "upcoming_reviews_30d"):
        assert k in p, f"portfolio missing {k}"


def test_directory_row_shape(admin):
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(admin["token"]), timeout=30)
    rows = r.json()["clients"]
    assert len(rows) >= 1
    row = rows[0]
    for k in ("client_id", "name", "industry", "program_status",
              "open_actions", "open_findings", "significant_risks",
              "upcoming_reviews", "last_activity", "client_status"):
        assert k in row, f"row missing {k}"


def test_directory_platform_admin_200(platform_admin):
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(platform_admin["token"]), timeout=30)
    assert r.status_code == 200


def test_directory_contributor_403(contrib):
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(contrib["token"]), timeout=20)
    assert r.status_code == 403


def test_directory_readonly_403(readonly):
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(readonly["token"]), timeout=20)
    assert r.status_code == 403


# ---------- POST /api/clients ----------

def test_create_client_admin_defaults(admin):
    payload = {"name": f"TEST_iter8_created_{int(time.time())}"}
    r = requests.post(f"{BASE_URL}/api/clients", headers=_h(admin["token"]), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["name"] == payload["name"]
    assert doc["status"] == "onboarding"
    assert doc.get("created_at") and doc.get("updated_at")
    # cleanup: archive it
    requests.patch(f"{BASE_URL}/api/clients/{doc['client_id']}",
                   headers=_h(admin["token"]), json={"status": "archived"}, timeout=20)


def test_create_client_contributor_403(contrib):
    r = requests.post(f"{BASE_URL}/api/clients", headers=_h(contrib["token"]),
                      json={"name": "TEST_iter8_forbidden"}, timeout=20)
    assert r.status_code == 403


def test_create_client_readonly_403(readonly):
    r = requests.post(f"{BASE_URL}/api/clients", headers=_h(readonly["token"]),
                      json={"name": "TEST_iter8_forbidden_ro"}, timeout=20)
    assert r.status_code == 403


# ---------- PATCH /api/clients/{id} ----------

@pytest.fixture(scope="module")
def scratch_client(admin):
    payload = {"name": f"TEST_iter8_scratch_{int(time.time())}"}
    r = requests.post(f"{BASE_URL}/api/clients", headers=_h(admin["token"]), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    doc = r.json()
    yield doc
    # teardown: archive
    try:
        requests.patch(f"{BASE_URL}/api/clients/{doc['client_id']}",
                       headers=_h(admin["token"]), json={"status": "archived"}, timeout=20)
    except Exception:
        pass


def test_patch_client_admin_updates(admin, scratch_client):
    cid = scratch_client["client_id"]
    patch = {"industry": "Fintech", "primary_contact": "cto@test.io",
             "assigned_owner_id": admin["user"].get("user_id"),
             "logo_url": "https://example.com/logo.png",
             "status": "active"}
    r = requests.patch(f"{BASE_URL}/api/clients/{cid}", headers=_h(admin["token"]),
                       json=patch, timeout=20)
    assert r.status_code == 200, r.text
    doc = r.json()
    for k, v in patch.items():
        assert doc.get(k) == v, f"{k}: expected {v}, got {doc.get(k)}"


def test_patch_client_contributor_403(contrib, scratch_client):
    r = requests.patch(f"{BASE_URL}/api/clients/{scratch_client['client_id']}",
                       headers=_h(contrib["token"]), json={"industry": "X"}, timeout=20)
    assert r.status_code == 403


def test_patch_client_readonly_403(readonly, scratch_client):
    r = requests.patch(f"{BASE_URL}/api/clients/{scratch_client['client_id']}",
                       headers=_h(readonly["token"]), json={"industry": "X"}, timeout=20)
    assert r.status_code == 403


# ---------- Archived filtering ----------

def test_list_clients_hides_archived_by_default(admin, scratch_client):
    cid = scratch_client["client_id"]
    requests.patch(f"{BASE_URL}/api/clients/{cid}", headers=_h(admin["token"]),
                   json={"status": "archived"}, timeout=20)
    r = requests.get(f"{BASE_URL}/api/clients", headers=_h(admin["token"]), timeout=20)
    ids = [c["client_id"] for c in r.json()]
    assert cid not in ids
    r2 = requests.get(f"{BASE_URL}/api/clients?include_archived=true",
                      headers=_h(admin["token"]), timeout=20)
    ids2 = [c["client_id"] for c in r2.json()]
    assert cid in ids2
    # restore for later tests
    requests.patch(f"{BASE_URL}/api/clients/{cid}", headers=_h(admin["token"]),
                   json={"status": "active"}, timeout=20)


def test_directory_include_archived(admin, scratch_client):
    cid = scratch_client["client_id"]
    requests.patch(f"{BASE_URL}/api/clients/{cid}", headers=_h(admin["token"]),
                   json={"status": "archived"}, timeout=20)
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(admin["token"]), timeout=30)
    ids = [c["client_id"] for c in r.json()["clients"]]
    assert cid not in ids
    r2 = requests.get(f"{BASE_URL}/api/clients/directory?include_archived=true",
                      headers=_h(admin["token"]), timeout=30)
    ids2 = [c["client_id"] for c in r2.json()["clients"]]
    assert cid in ids2
    # restore
    requests.patch(f"{BASE_URL}/api/clients/{cid}", headers=_h(admin["token"]),
                   json={"status": "active"}, timeout=20)


# ---------- program_status computation ----------

def _find_row(rows, cid):
    for r in rows:
        if r["client_id"] == cid:
            return r
    return None


def test_program_status_healthy_then_action_required_then_attention(admin, scratch_client):
    cid = scratch_client["client_id"]
    tok = admin["token"]
    # Ensure active + no data
    requests.patch(f"{BASE_URL}/api/clients/{cid}", headers=_h(tok),
                   json={"status": "active"}, timeout=20)

    # Verify healthy (no findings/risks/reviews yet)
    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(tok), timeout=30)
    row = _find_row(r.json()["clients"], cid)
    assert row is not None
    assert row["program_status"] == "healthy", f"expected healthy, got {row['program_status']}"

    # Add high-severity open finding -> needs_attention
    high_f = requests.post(f"{BASE_URL}/api/findings", headers=_h(tok), json={
        "title": "TEST_iter8_high", "client_id": cid, "severity": "high", "status": "open"
    }, timeout=20)
    assert high_f.status_code == 200, high_f.text
    high_fid = high_f.json()["finding_id"]

    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(tok), timeout=30)
    row = _find_row(r.json()["clients"], cid)
    assert row["program_status"] == "needs_attention", f"expected needs_attention, got {row['program_status']}"

    # Add critical open finding -> action_required
    crit_f = requests.post(f"{BASE_URL}/api/findings", headers=_h(tok), json={
        "title": "TEST_iter8_crit", "client_id": cid, "severity": "critical", "status": "open"
    }, timeout=20)
    assert crit_f.status_code == 200, crit_f.text
    crit_fid = crit_f.json()["finding_id"]

    r = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(tok), timeout=30)
    row = _find_row(r.json()["clients"], cid)
    assert row["program_status"] == "action_required", f"expected action_required, got {row['program_status']}"

    # cleanup: remediate findings
    for fid in (high_fid, crit_fid):
        requests.delete(f"{BASE_URL}/api/findings/{fid}", headers=_h(tok), timeout=20)


def test_last_activity_reflects_recent_audit(admin, scratch_client):
    cid = scratch_client["client_id"]
    tok = admin["token"]
    # create a review -> should generate an audit entry
    payload = {"title": f"TEST_iter8_activity_{int(time.time())}",
               "review_type": "asset", "client_id": cid,
               "due_date": (datetime.now(timezone.utc) + timedelta(days=60)).isoformat(),
               "status": "upcoming", "recurrence": "none"}
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(tok), json=payload, timeout=20)
    assert r.status_code == 200, r.text
    rid = r.json()["review_id"]
    time.sleep(1)
    d = requests.get(f"{BASE_URL}/api/clients/directory", headers=_h(tok), timeout=30)
    row = _find_row(d.json()["clients"], cid)
    assert row["last_activity"] is not None, "last_activity should be set after creating a review"
    assert row["last_activity"].get("at")
    assert row["last_activity"].get("action")
    # cleanup
    requests.delete(f"{BASE_URL}/api/reviews/{rid}", headers=_h(tok), timeout=20)


# ---------- Tenant isolation regression ----------

def test_contributor_cannot_get_globex_reviews(contrib, globex_cid):
    r = requests.get(f"{BASE_URL}/api/reviews?client_id={globex_cid}",
                     headers=_h(contrib["token"]), timeout=20)
    assert r.status_code == 403


def test_contributor_cannot_post_globex_review(contrib, globex_cid):
    payload = {"title": "TEST_iter8_cross", "review_type": "asset", "client_id": globex_cid,
               "due_date": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
               "status": "upcoming", "recurrence": "none"}
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(contrib["token"]),
                      json=payload, timeout=20)
    assert r.status_code == 403


def test_contributor_cannot_patch_globex_client(contrib, globex_cid):
    r = requests.patch(f"{BASE_URL}/api/clients/{globex_cid}", headers=_h(contrib["token"]),
                       json={"industry": "hax"}, timeout=20)
    assert r.status_code == 403
