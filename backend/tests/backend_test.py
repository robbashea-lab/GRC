"""GRC Platform backend tests - covers auth, tenants, CRUD, evidence, comments, audit, isolation."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # fallback for pytest run inside container - read frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

ADMIN = ("robbashea@gmail.com", "Admin@2026")
PLAT = ("platform.admin@grc.demo", "Demo@2026")
ACME_C = ("contributor@acme.demo", "Demo@2026")
ACME_R = ("readonly@acme.demo", "Demo@2026")
GLOB_C = ("contributor@globex.demo", "Demo@2026")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} => {r.status_code} {r.text}"
    return r.json()["access_token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="session")
def acme_c_token():
    return _login(*ACME_C)


@pytest.fixture(scope="session")
def acme_r_token():
    return _login(*ACME_R)


@pytest.fixture(scope="session")
def glob_c_token():
    return _login(*GLOB_C)


@pytest.fixture(scope="session")
def clients(admin_token):
    r = requests.get(f"{API}/clients", headers=_hdr(admin_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    m = {c["name"]: c["client_id"] for c in data}
    return m


# ---------- Auth ----------
class TestAuth:
    def test_login_admin_returns_super_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
        assert r.status_code == 200
        j = r.json()
        assert j["user"]["role"] == "super_admin"
        assert j["user"]["email"] == ADMIN[0]
        assert isinstance(j["access_token"], str) and len(j["access_token"]) > 10

    def test_me_returns_same_user(self, admin_token):
        r = requests.get(f"{API}/auth/me", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN[0]

    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN[0], "password": "wrong"})
        assert r.status_code == 401


# ---------- Tenants ----------
class TestClients:
    def test_admin_sees_two_clients(self, admin_token):
        r = requests.get(f"{API}/clients", headers=_hdr(admin_token))
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert {"Acme Corp", "Globex Ltd"} <= names

    def test_contributor_scoped_to_acme(self, acme_c_token):
        r = requests.get(f"{API}/clients", headers=_hdr(acme_c_token))
        assert r.status_code == 200
        names = {c["name"] for c in r.json()}
        assert names == {"Acme Corp"}


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard(self, admin_token, clients):
        cid = clients["Acme Corp"]
        r = requests.get(f"{API}/dashboard", headers=_hdr(admin_token), params={"client_id": cid})
        assert r.status_code == 200
        j = r.json()
        assert "kpis" in j and set(["overdue_reviews", "open_findings", "critical_findings", "significant_risks"]) <= set(j["kpis"].keys())
        assert "upcoming_reviews" in j and "recent_findings" in j and "top_risks" in j


# ---------- Reviews CRUD ----------
class TestReviews:
    created_id = None

    def test_list_reviews(self, admin_token, clients):
        r = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": clients["Acme Corp"]})
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_create_update_delete_review(self, admin_token, clients):
        cid = clients["Acme Corp"]
        payload = {
            "title": "TEST_Access Review",
            "review_type": "access",
            "client_id": cid,
            "status": "planned",
            "recurrence": "quarterly",
            "due_date": "2026-06-30T00:00:00+00:00",
        }
        r = requests.post(f"{API}/reviews", headers=_hdr(admin_token), json=payload)
        assert r.status_code == 200, r.text
        rid = r.json()["review_id"]
        # patch
        r2 = requests.patch(f"{API}/reviews/{rid}", headers=_hdr(admin_token), json={"status": "in_progress"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "in_progress"
        # get via list and verify persisted
        r3 = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": cid})
        assert any(x["review_id"] == rid and x["status"] == "in_progress" for x in r3.json())
        # delete
        r4 = requests.delete(f"{API}/reviews/{rid}", headers=_hdr(admin_token))
        assert r4.status_code == 200


# ---------- Generic entities smoke ----------
@pytest.mark.parametrize("kind,extra", [
    ("findings", {"title": "TEST_finding", "severity": "medium", "status": "open"}),
    ("risks", {"title": "TEST_risk", "likelihood": "medium", "impact": "high"}),
    ("policies", {"title": "TEST_policy"}),
    ("vendors", {"name": "TEST_vendor"}),
    ("assets", {"name": "TEST_asset"}),
    ("tasks", {"title": "TEST_task"}),
])
def test_entity_get_and_post(kind, extra, admin_token, clients):
    cid = clients["Acme Corp"]
    r = requests.get(f"{API}/{kind}", headers=_hdr(admin_token), params={"client_id": cid})
    assert r.status_code == 200
    payload = {**extra, "client_id": cid}
    r2 = requests.post(f"{API}/{kind}", headers=_hdr(admin_token), json=payload)
    assert r2.status_code == 200, f"{kind} => {r2.status_code} {r2.text}"


# ---------- Evidence ----------
class TestEvidence:
    def test_upload_list_download_delete(self, admin_token, clients):
        cid = clients["Acme Corp"]
        content = base64.b64encode(b"hello world").decode()
        payload = {"filename": "TEST_ev.txt", "client_id": cid, "content_base64": content, "mime_type": "text/plain"}
        r = requests.post(f"{API}/evidence", headers=_hdr(admin_token), json=payload)
        assert r.status_code == 200, r.text
        eid = r.json()["evidence_id"]
        assert "content_base64" not in r.json()

        r2 = requests.get(f"{API}/evidence", headers=_hdr(admin_token), params={"client_id": cid})
        assert r2.status_code == 200
        assert any(e["evidence_id"] == eid for e in r2.json())
        assert all("content_base64" not in e for e in r2.json())

        r3 = requests.get(f"{API}/evidence/{eid}/download", headers=_hdr(admin_token))
        assert r3.status_code == 200
        assert r3.json()["filename"] == "TEST_ev.txt"
        assert r3.json()["content_base64"] == content

        # readonly cannot delete
        rd = requests.delete(f"{API}/evidence/{eid}", headers=_hdr(_login(*ACME_R)))
        assert rd.status_code == 403

        # admin delete
        r4 = requests.delete(f"{API}/evidence/{eid}", headers=_hdr(admin_token))
        assert r4.status_code == 200


# ---------- Comments ----------
class TestComments:
    def test_create_and_list_comment(self, admin_token, clients):
        cid = clients["Acme Corp"]
        # Grab a review
        r = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": cid})
        rid = r.json()[0]["review_id"]
        body = {"entity_type": "reviews", "entity_id": rid, "body": "TEST_comment body"}
        rc = requests.post(f"{API}/comments", headers=_hdr(admin_token), json=body)
        assert rc.status_code == 200
        rl = requests.get(f"{API}/comments", headers=_hdr(admin_token), params={"entity_type": "reviews", "entity_id": rid})
        assert rl.status_code == 200
        assert any(c["body"] == "TEST_comment body" for c in rl.json())


# ---------- Audit ----------
class TestAudit:
    def test_audit_logs(self, admin_token, clients):
        cid = clients["Acme Corp"]
        r = requests.get(f"{API}/audit-logs", headers=_hdr(admin_token), params={"client_id": cid})
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Isolation & Roles ----------
class TestIsolation:
    def test_contributor_cannot_read_other_tenant(self, acme_c_token, clients):
        globex_cid = clients["Globex Ltd"]
        r = requests.get(f"{API}/reviews", headers=_hdr(acme_c_token), params={"client_id": globex_cid})
        assert r.status_code == 403

    def test_readonly_cannot_create_review(self, acme_r_token, clients):
        cid = clients["Acme Corp"]
        payload = {"title": "TEST_r", "review_type": "access", "client_id": cid, "status": "planned"}
        r = requests.post(f"{API}/reviews", headers=_hdr(acme_r_token), json=payload)
        assert r.status_code == 403

    def test_readonly_can_get(self, acme_r_token):
        r = requests.get(f"{API}/reviews", headers=_hdr(acme_r_token))
        assert r.status_code == 200

    def test_readonly_cannot_delete(self, acme_r_token, admin_token, clients):
        cid = clients["Acme Corp"]
        r = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": cid})
        rid = r.json()[0]["review_id"]
        rd = requests.delete(f"{API}/reviews/{rid}", headers=_hdr(acme_r_token))
        assert rd.status_code == 403
