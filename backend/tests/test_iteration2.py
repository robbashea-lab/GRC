"""Iteration 2 tests: baseline, exceptions, quick actions, related, cron, reminders."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = (os.environ.get("GRC_TEST_ADMIN_EMAIL", "admin@example.test"), os.environ.get("GRC_TEST_ADMIN_PASSWORD", "TEST_ONLY_ADMIN_PASSWORD"))
ACME_R = (os.environ.get("GRC_TEST_ACME_READONLY_EMAIL", "acme-readonly@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))

# Supplied by the test environment; never hardcode the webhook secret.
CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin_token():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def acme_r_token():
    return _login(*ACME_R)


@pytest.fixture(scope="module")
def acme_cid(admin_token):
    r = requests.get(f"{API}/clients", headers=_hdr(admin_token))
    for c in r.json():
        if c["name"] == "Acme Corp":
            return c["client_id"]
    pytest.skip("Acme not found")


# ---------- Baseline ----------
class TestBaseline:
    def test_templates_shape(self, admin_token):
        r = requests.get(f"{API}/baseline/templates", headers=_hdr(admin_token))
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("policies"), list) and len(j["policies"]) >= 8
        assert isinstance(j.get("risks"), list) and len(j["risks"]) >= 6
        rt = j.get("review_templates")
        assert isinstance(rt, list) and len(rt) >= 6
        for item in rt:
            for k in ("title", "review_type", "recurrence", "due_days"):
                assert k in item, f"{k} missing in {item}"

    def test_create_baseline(self, admin_token, acme_cid):
        payload = {
            "client_id": acme_cid,
            "policies": ["TEST_Baseline Policy A", "TEST_Baseline Policy B"],
            "risks": ["TEST_Baseline Risk A"],
            "reviews": [
                {"title": "TEST_Baseline Review Q", "review_type": "access", "recurrence": "quarterly", "due_days": 30}
            ],
        }
        r = requests.post(f"{API}/baseline", headers=_hdr(admin_token), json=payload)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["created"] == {"policies": 2, "risks": 1, "reviews": 1}


# ---------- Exceptions ----------
class TestExceptions:
    def test_crud(self, admin_token, acme_cid):
        # CREATE
        payload = {
            "title": "TEST_Exception A",
            "client_id": acme_cid,
            "status": "requested",
            "justification": "Compensating controls in place",
            "expires_at": "2026-12-31T00:00:00+00:00",
        }
        r = requests.post(f"{API}/exceptions", headers=_hdr(admin_token), json=payload)
        assert r.status_code == 200, r.text
        eid = r.json()["exception_id"]
        assert r.json()["title"] == "TEST_Exception A"

        # LIST
        r2 = requests.get(f"{API}/exceptions", headers=_hdr(admin_token), params={"client_id": acme_cid})
        assert r2.status_code == 200
        assert any(x["exception_id"] == eid for x in r2.json())

        # PATCH
        r3 = requests.patch(f"{API}/exceptions/{eid}", headers=_hdr(admin_token), json={"status": "approved"})
        assert r3.status_code == 200
        assert r3.json()["status"] == "approved"

        # DELETE
        r4 = requests.delete(f"{API}/exceptions/{eid}", headers=_hdr(admin_token))
        assert r4.status_code == 200

    def test_tenant_isolation(self, admin_token, acme_cid):
        globex_token = _login(os.environ.get("GRC_TEST_GLOBEX_CONTRIBUTOR_EMAIL", "globex-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))
        r = requests.get(f"{API}/exceptions", headers=_hdr(globex_token), params={"client_id": acme_cid})
        assert r.status_code == 403


# ---------- Quick actions & Related ----------
class TestQuickActions:
    def test_review_to_finding_to_task_and_related(self, admin_token, acme_cid):
        # Get a review
        r = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": acme_cid})
        assert r.status_code == 200
        rid = r.json()[0]["review_id"]

        # Review -> Finding
        rc = requests.post(f"{API}/reviews/{rid}/create-finding", headers=_hdr(admin_token),
                           json={"severity": "high"})
        assert rc.status_code == 200, rc.text
        f = rc.json()
        assert f["review_id"] == rid
        assert f["severity"] == "high"
        fid = f["finding_id"]

        # Related after review->finding
        rel = requests.get(f"{API}/related", headers=_hdr(admin_token),
                          params={"entity_type": "reviews", "entity_id": rid})
        assert rel.status_code == 200
        rj = rel.json()
        for k in ("reviews", "findings", "tasks", "risks", "exceptions", "evidence"):
            assert k in rj
        assert any(x["finding_id"] == fid for x in rj["findings"])

        # Finding -> Task, expect finding.status flips open->in_remediation
        tc = requests.post(f"{API}/findings/{fid}/create-task", headers=_hdr(admin_token), json={})
        assert tc.status_code == 200, tc.text
        task = tc.json()
        assert task["finding_id"] == fid

        # Verify finding status
        fl = requests.get(f"{API}/findings", headers=_hdr(admin_token), params={"client_id": acme_cid})
        matching = [x for x in fl.json() if x["finding_id"] == fid]
        assert matching and matching[0]["status"] == "in_remediation"


# ---------- Cron & Reminders ----------
class TestCronAndReminders:
    def test_cron_no_auth_401(self):
        r = requests.post(f"{BASE_URL}/api/cron/overdue-reminders")
        assert r.status_code == 401

    def test_cron_wrong_secret_401(self):
        r = requests.post(f"{BASE_URL}/api/cron/overdue-reminders",
                          headers={"Authorization": "Bearer TEST_ONLY_WRONG_SECRET"})
        assert r.status_code == 401

    def test_cron_valid_secret_200(self):
        if not CRON_SECRET:
            pytest.skip("WEBHOOK_CRON_SECRET is not configured for this environment")
        r = requests.post(f"{BASE_URL}/api/cron/overdue-reminders",
                          headers={"Authorization": f"Bearer {CRON_SECRET}"})
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reminders_send_now_admin_200(self, admin_token):
        r = requests.post(f"{API}/reminders/send-now", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reminders_send_now_readonly_403(self, acme_r_token):
        r = requests.post(f"{API}/reminders/send-now", headers=_hdr(acme_r_token))
        assert r.status_code == 403
