"""Iteration 3 tests: notifications, policy approvals, CSV exports, evidence-in-drawer."""
import os
import base64
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
CONTRIB = (os.environ.get("GRC_TEST_ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))
READONLY = (os.environ.get("GRC_TEST_ACME_READONLY_EMAIL", "acme-readonly@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))
PLATFORM = (os.environ.get("GRC_TEST_PLATFORM_EMAIL", "platform-admin@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def admin():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def contrib():
    return _login(*CONTRIB)


@pytest.fixture(scope="module")
def readonly():
    return _login(*READONLY)


@pytest.fixture(scope="module")
def admin_token(admin):
    return admin["access_token"]


@pytest.fixture(scope="module")
def contrib_token(contrib):
    return contrib["access_token"]


@pytest.fixture(scope="module")
def readonly_token(readonly):
    return readonly["access_token"]


@pytest.fixture(scope="module")
def acme_cid(admin_token):
    r = requests.get(f"{API}/clients", headers=_hdr(admin_token))
    for c in r.json():
        if c["name"] == "Acme Corp":
            return c["client_id"]
    pytest.skip("Acme not found")


# ---------- Notifications ----------
class TestNotifications:
    def test_list_shape(self, admin_token):
        r = requests.get(f"{API}/notifications", headers=_hdr(admin_token))
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)
        assert "unread" in j and isinstance(j["unread"], int)

    def test_mention_creates_notification(self, admin_token, contrib_token, acme_cid):
        # Need a review to comment on
        rv = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": acme_cid})
        assert rv.status_code == 200
        rid = rv.json()[0]["review_id"]
        # get contributor unread before
        before = requests.get(f"{API}/notifications", headers=_hdr(contrib_token)).json()["unread"]
        # post @mention comment
        r = requests.post(f"{API}/comments", headers=_hdr(admin_token),
                          json={"entity_type": "reviews", "entity_id": rid,
                                "body": "TEST_mention hi @acme-contributor@example.test please review"})
        assert r.status_code == 200, r.text
        # contributor should have a new mention notification
        after = requests.get(f"{API}/notifications", headers=_hdr(contrib_token)).json()
        assert after["unread"] >= before + 1
        assert any(n["kind"] == "mention" and "mentioned" in n["title"].lower() for n in after["items"])

    def test_finding_assigned_notification(self, admin_token, contrib, contrib_token, acme_cid):
        # Admin creates a review-finding assigned to contributor => contributor gets finding_assigned
        rv = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": acme_cid})
        rid = rv.json()[0]["review_id"]
        cuser_id = contrib["user"]["user_id"]
        before = requests.get(f"{API}/notifications", headers=_hdr(contrib_token)).json()["unread"]
        r = requests.post(f"{API}/reviews/{rid}/create-finding", headers=_hdr(admin_token),
                          json={"title": "TEST_iter3_finding", "severity": "high", "owner_id": cuser_id})
        assert r.status_code == 200, r.text
        fid = r.json()["finding_id"]
        after = requests.get(f"{API}/notifications", headers=_hdr(contrib_token)).json()
        assert after["unread"] >= before + 1
        assert any(n["kind"] == "finding_assigned" and n["entity_id"] == fid for n in after["items"])

        # And finding->task assigned back to admin: contributor creates a task assigned to admin
        # admin_uid
        me = requests.get(f"{API}/auth/me", headers=_hdr(admin_token)).json()
        admin_uid = me["user_id"]
        adm_before = requests.get(f"{API}/notifications", headers=_hdr(admin_token)).json()["unread"]
        rt = requests.post(f"{API}/findings/{fid}/create-task", headers=_hdr(contrib_token),
                           json={"title": "TEST_iter3_task", "assignee_id": admin_uid})
        assert rt.status_code == 200, rt.text
        tid = rt.json()["task_id"]
        adm_after = requests.get(f"{API}/notifications", headers=_hdr(admin_token)).json()
        assert adm_after["unread"] >= adm_before + 1
        assert any(n["kind"] == "task_assigned" and n["entity_id"] == tid for n in adm_after["items"])

    def test_mark_read_and_read_all(self, contrib_token):
        n = requests.get(f"{API}/notifications", headers=_hdr(contrib_token)).json()
        if n["unread"] == 0:
            # trigger a mention to guarantee
            pass
        # Find an unread one
        unread = [x for x in n["items"] if not x["read"]]
        if unread:
            nid = unread[0]["notification_id"]
            r = requests.post(f"{API}/notifications/{nid}/read", headers=_hdr(contrib_token))
            assert r.status_code == 200
        # read-all
        r2 = requests.post(f"{API}/notifications/read-all", headers=_hdr(contrib_token))
        assert r2.status_code == 200
        after = requests.get(f"{API}/notifications", headers=_hdr(contrib_token)).json()
        assert after["unread"] == 0


# ---------- Policy approvals ----------
class TestPolicyApproval:
    @pytest.fixture(scope="class")
    def policy_id(self, admin_token, acme_cid):
        # Create a fresh draft policy owned by contributor
        # first get contributor uid
        # Create policy via generic entity endpoint
        r = requests.post(f"{API}/policies", headers=_hdr(admin_token),
                          json={"title": "TEST_iter3_policy_A", "client_id": acme_cid,
                                "status": "draft"})
        assert r.status_code == 200, r.text
        return r.json()["policy_id"]

    def test_submit_review_happy(self, admin_token, policy_id):
        r = requests.post(f"{API}/policies/{policy_id}/submit-review", headers=_hdr(admin_token))
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "in_review"
        assert any(h.get("action") == "submitted" for h in p.get("approval_history", []))

    def test_approve_happy(self, admin_token, policy_id):
        r = requests.post(f"{API}/policies/{policy_id}/approve", headers=_hdr(admin_token),
                          json={"comment": "LGTM"})
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["status"] == "approved"
        assert p.get("approved_at")
        assert p.get("approver_id")
        assert any(h.get("action") == "approved" and h.get("comment") == "LGTM"
                   for h in p.get("approval_history", []))

    def test_reject_flow(self, admin_token, acme_cid):
        # Create a fresh policy for reject flow
        r = requests.post(f"{API}/policies", headers=_hdr(admin_token),
                          json={"title": "TEST_iter3_policy_reject", "client_id": acme_cid,
                                "status": "draft"})
        pid = r.json()["policy_id"]
        requests.post(f"{API}/policies/{pid}/submit-review", headers=_hdr(admin_token))
        rr = requests.post(f"{API}/policies/{pid}/reject", headers=_hdr(admin_token),
                           json={"reason": "insufficient"})
        assert rr.status_code == 200, rr.text
        p = rr.json()
        assert p["status"] == "draft"
        assert any(h.get("action") == "rejected" and h.get("reason") == "insufficient"
                   for h in p.get("approval_history", []))

    def test_rbac_readonly_cannot_submit(self, readonly_token, acme_cid, admin_token):
        # create a policy as admin
        r = requests.post(f"{API}/policies", headers=_hdr(admin_token),
                          json={"title": "TEST_iter3_policy_rbac", "client_id": acme_cid, "status": "draft"})
        pid = r.json()["policy_id"]
        r2 = requests.post(f"{API}/policies/{pid}/submit-review", headers=_hdr(readonly_token))
        assert r2.status_code == 403

    def test_rbac_contributor_cannot_approve_or_reject(self, contrib_token, admin_token, acme_cid):
        r = requests.post(f"{API}/policies", headers=_hdr(admin_token),
                          json={"title": "TEST_iter3_policy_rbac2", "client_id": acme_cid, "status": "draft"})
        pid = r.json()["policy_id"]
        requests.post(f"{API}/policies/{pid}/submit-review", headers=_hdr(admin_token))
        a = requests.post(f"{API}/policies/{pid}/approve", headers=_hdr(contrib_token), json={"comment": "x"})
        assert a.status_code == 403
        rj = requests.post(f"{API}/policies/{pid}/reject", headers=_hdr(contrib_token), json={"reason": "no"})
        assert rj.status_code == 403

    def test_rbac_readonly_cannot_approve(self, readonly_token, admin_token, acme_cid):
        r = requests.post(f"{API}/policies", headers=_hdr(admin_token),
                          json={"title": "TEST_iter3_policy_rbac3", "client_id": acme_cid, "status": "draft"})
        pid = r.json()["policy_id"]
        a = requests.post(f"{API}/policies/{pid}/approve", headers=_hdr(readonly_token), json={"comment": "x"})
        assert a.status_code == 403


# ---------- CSV export ----------
class TestExportCSV:
    def test_export_reviews(self, admin_token, acme_cid):
        r = requests.get(f"{API}/export/reviews", headers=_hdr(admin_token),
                         params={"client_id": acme_cid})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        assert "attachment" in r.headers.get("Content-Disposition", "").lower()
        # First line = header
        first = r.text.splitlines()[0].split(",")
        for c in ("review_id", "title", "status", "review_type", "recurrence", "due_date"):
            assert c in first, f"{c} missing in {first}"
        # body has at least 1 data row
        assert len(r.text.splitlines()) >= 2

    def test_export_findings(self, admin_token, acme_cid):
        r = requests.get(f"{API}/export/findings", headers=_hdr(admin_token),
                         params={"client_id": acme_cid})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        first = r.text.splitlines()[0].split(",")
        assert "finding_id" in first

    def test_export_exceptions(self, admin_token, acme_cid):
        r = requests.get(f"{API}/export/exceptions", headers=_hdr(admin_token),
                         params={"client_id": acme_cid})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        first = r.text.splitlines()[0].split(",")
        assert "exception_id" in first


# ---------- Evidence linked to record ----------
class TestEvidenceLinked:
    def test_upload_and_list_linked(self, admin_token, acme_cid):
        rv = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": acme_cid})
        rid = rv.json()[0]["review_id"]
        content = base64.b64encode(b"hello iteration3").decode()
        payload = {
            "filename": "TEST_iter3_ev.txt",
            "client_id": acme_cid,
            "content_base64": content,
            "linked_type": "review",
            "linked_id": rid,
        }
        r = requests.post(f"{API}/evidence", headers=_hdr(admin_token), json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["linked_type"] == "review"
        assert r.json()["linked_id"] == rid
        # list scoped
        r2 = requests.get(f"{API}/evidence", headers=_hdr(admin_token),
                         params={"client_id": acme_cid, "linked_type": "review", "linked_id": rid})
        assert r2.status_code == 200
        assert any(x["filename"] == "TEST_iter3_ev.txt" for x in r2.json())


# ---------- Regression sanity ----------
class TestRegression:
    def test_dashboard(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert "kpis" in r.json()

    def test_related(self, admin_token, acme_cid):
        rv = requests.get(f"{API}/reviews", headers=_hdr(admin_token), params={"client_id": acme_cid})
        rid = rv.json()[0]["review_id"]
        r = requests.get(f"{API}/related", headers=_hdr(admin_token),
                        params={"entity_type": "reviews", "entity_id": rid})
        assert r.status_code == 200
        for k in ("reviews", "findings", "tasks", "risks", "exceptions", "evidence"):
            assert k in r.json()
