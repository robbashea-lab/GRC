"""Backend tests for the unified Audit Log endpoints (iteration 17)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://risk-review-ops.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def super_token():
    return _login(os.environ.get("GRC_TEST_ADMIN_EMAIL", "admin@example.test"), os.environ.get("GRC_TEST_ADMIN_PASSWORD", "TEST_ONLY_ADMIN_PASSWORD"))


@pytest.fixture(scope="module")
def platform_token():
    return _login(os.environ.get("GRC_TEST_PLATFORM_EMAIL", "platform-admin@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))


@pytest.fixture(scope="module")
def contributor_token():
    return _login(os.environ.get("GRC_TEST_GLOBEX_CONTRIBUTOR_EMAIL", "globex-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))


@pytest.fixture(scope="module")
def readonly_token():
    return _login(os.environ.get("GRC_TEST_ACME_READONLY_EMAIL", "acme-readonly@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))


def _h(t):
    return {"Authorization": f"Bearer {t}"}


# ---- List basic
def test_super_list_basic(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("items", "total", "page", "page_size"):
        assert k in body
    assert isinstance(body["items"], list)
    assert body["page"] == 1 and body["page_size"] == 50
    assert len(body["items"]) > 0
    for it in body["items"]:
        assert "user_name" in it
        assert "client_name" in it  # may be None


# ---- Platform-only filter
def test_platform_scope_filter(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"client_id": "platform"}, timeout=60)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert not it.get("client_id"), f"expected null client_id, got {it.get('client_id')}"


# ---- Globex-only filter
def test_globex_client_filter(super_token):
    # Find globex client id
    r = requests.get(f"{API}/audit-logs/facets", headers=_h(super_token), timeout=60)
    assert r.status_code == 200
    clients = r.json()["clients"]
    globex = next((c for c in clients if "globex" in (c["name"] or "").lower()), None)
    assert globex, f"globex client not present in facets: {clients}"
    gid = globex["client_id"]
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"client_id": gid, "page_size": 50}, timeout=60)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) > 0
    for it in items:
        assert it.get("client_id") == gid


# ---- Action bucket collapse
def test_action_bucket_invite(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"action": "invite", "page_size": 50}, timeout=60)
    assert r.status_code == 200
    allowed = {"invite", "invite-contact", "resend_invite"}
    for it in r.json()["items"]:
        assert it["action"] in allowed, f"unexpected action {it['action']}"


def test_action_bucket_onboarding(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"action": "onboarding", "page_size": 50}, timeout=60)
    assert r.status_code == 200
    allowed = {
        "onboarding-response", "onboarding-contact", "onboarding-assessment",
        "onboarding-known-issue", "onboarding-review", "onboarding-complete", "baseline",
    }
    for it in r.json()["items"]:
        assert it["action"] in allowed, f"unexpected action {it['action']}"


# ---- Entity type filter
def test_entity_type_filter(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"entity_type": "contact", "page_size": 20}, timeout=60)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["entity_type"] == "contact"


# ---- user_id filter
def test_user_id_filter(super_token):
    r0 = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"page_size": 20}, timeout=60)
    assert r0.status_code == 200
    uid = next((it["user_id"] for it in r0.json()["items"] if it.get("user_id")), None)
    if not uid:
        pytest.skip("no user_id in sample events")
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"user_id": uid, "page_size": 50}, timeout=60)
    assert r.status_code == 200
    for it in r.json()["items"]:
        assert it["user_id"] == uid


# ---- Date bounds
def test_date_bounds(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"start_date": "2020-01-01", "end_date": "2020-12-31"}, timeout=60)
    assert r.status_code == 200
    # Should return 0 or events strictly in that window; the seeded data is >2024 so expect 0
    for it in r.json()["items"]:
        assert "2020" in (it.get("at") or "")


# ---- Free-text q
def test_q_search(super_token):
    r = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"q": "globex", "page_size": 20}, timeout=60)
    assert r.status_code == 200
    for it in r.json()["items"]:
        hay = " ".join([
            (it.get(k) or "") for k in ("action", "entity_type", "entity_id", "user_email", "user_name", "client_id")
        ]).lower()
        assert "globex" in hay, f"no globex in {it}"


# ---- Pagination
def test_pagination(super_token):
    r1 = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"page": 1, "page_size": 10}, timeout=60)
    r2 = requests.get(f"{API}/audit-logs", headers=_h(super_token), params={"page": 2, "page_size": 10}, timeout=60)
    assert r1.status_code == 200 and r2.status_code == 200
    b1, b2 = r1.json(), r2.json()
    assert b2["page"] == 2 and b2["page_size"] == 10
    ids1 = [it.get("at") + str(it.get("entity_id")) for it in b1["items"]]
    ids2 = [it.get("at") + str(it.get("entity_id")) for it in b2["items"]]
    # No overlap
    assert not (set(ids1) & set(ids2))
    assert len(b2["items"]) <= 10


# ---- 403 for client users
@pytest.mark.parametrize("who", ["contributor", "readonly"])
def test_403_for_client_users(who, contributor_token, readonly_token):
    tok = contributor_token if who == "contributor" else readonly_token
    for path in ("/audit-logs", "/audit-logs/facets", "/audit-logs/export.csv"):
        r = requests.get(f"{API}{path}", headers=_h(tok), timeout=30)
        assert r.status_code == 403, f"{who} {path} => {r.status_code}"


# ---- Platform admin scoping
def test_platform_admin_unauthorized_client_403(super_token, platform_token):
    r = requests.get(f"{API}/audit-logs/facets", headers=_h(super_token), timeout=30)
    all_clients = r.json()["clients"]
    r2 = requests.get(f"{API}/audit-logs/facets", headers=_h(platform_token), timeout=30)
    pa_clients = {c["client_id"] for c in r2.json()["clients"]}
    # Find one client the platform admin is NOT scoped to
    other = next((c for c in all_clients if c["client_id"] not in pa_clients), None)
    if not other:
        pytest.skip("platform_admin has access to all clients; cannot test unauthorized")
    r = requests.get(f"{API}/audit-logs", headers=_h(platform_token), params={"client_id": other["client_id"]}, timeout=30)
    assert r.status_code == 403


def test_platform_admin_default_scope(platform_token):
    r = requests.get(f"{API}/audit-logs/facets", headers=_h(platform_token), timeout=30)
    pa_clients = {c["client_id"] for c in r.json()["clients"]}
    r2 = requests.get(f"{API}/audit-logs", headers=_h(platform_token), params={"page_size": 100}, timeout=60)
    assert r2.status_code == 200
    for it in r2.json()["items"]:
        cid = it.get("client_id")
        assert (cid is None) or (cid in pa_clients), f"leaked cid {cid}"


# ---- Facets shape
def test_facets_shape(super_token):
    r = requests.get(f"{API}/audit-logs/facets", headers=_h(super_token), timeout=30)
    assert r.status_code == 200
    body = r.json()
    for k in ("clients", "users", "entity_types", "action_buckets"):
        assert k in body
    assert isinstance(body["clients"], list) and len(body["clients"]) >= 1
    assert isinstance(body["users"], list)
    assert isinstance(body["entity_types"], list)
    assert len(body["action_buckets"]) == 11
    bucket_values = {b["value"] for b in body["action_buckets"]}
    expected = {"create", "update", "delete", "assign", "approve", "complete",
                "upload", "invite", "auth", "permission", "onboarding"}
    assert bucket_values == expected


# ---- CSV export
def test_csv_export(super_token):
    r = requests.get(f"{API}/audit-logs/export.csv", headers=_h(super_token), params={"page_size": 5}, timeout=120)
    assert r.status_code == 200
    ctype = r.headers.get("content-type", "")
    assert "text/csv" in ctype, ctype
    disp = r.headers.get("content-disposition", "")
    assert "attachment" in disp and "audit-log.csv" in disp
    text = r.text.splitlines()
    assert text[0] == "Timestamp,Client,Client ID,User,Email,Action,Entity Type,Entity ID,Meta"
    assert len(text) > 1  # at least one row
