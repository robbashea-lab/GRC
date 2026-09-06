"""Iteration 4 tests: Bulk actions, Calendar view, Board Report PDF.

Covers:
 - POST /api/bulk auth+RBAC (close / delete / set-status / set-owner / cross-tenant)
 - GET  /api/calendar (shape, date filter)
 - GET  /api/reports/board (PDF for allowed user, 403 for others)
"""
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
CONTRIB = (os.environ.get("GRC_TEST_ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))
READONLY = (os.environ.get("GRC_TEST_ACME_READONLY_EMAIL", "acme-readonly@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))
GLOBEX_CONTRIB = (os.environ.get("GRC_TEST_GLOBEX_CONTRIBUTOR_EMAIL", "globex-contributor@example.test"), os.environ.get("GRC_TEST_DEMO_PASSWORD", "TEST_ONLY_PASSWORD"))


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
def globex_contrib():
    return _login(*GLOBEX_CONTRIB)


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
def globex_token(globex_contrib):
    return globex_contrib["access_token"]


@pytest.fixture(scope="module")
def acme_cid(admin_token):
    r = requests.get(f"{API}/clients", headers=_hdr(admin_token))
    for c in r.json():
        if c["name"] == "Acme Corp":
            return c["client_id"]
    pytest.skip("Acme not found")


@pytest.fixture(scope="module")
def globex_cid(admin_token):
    r = requests.get(f"{API}/clients", headers=_hdr(admin_token))
    for c in r.json():
        if c["name"] == "Globex Ltd":
            return c["client_id"]
    pytest.skip("Globex not found")


def _get_one(token, kind, cid, id_field, item_id):
    r = requests.get(f"{API}/{kind}", headers=_hdr(token), params={"client_id": cid})
    if r.status_code != 200:
        return None
    for it in r.json():
        if it.get(id_field) == item_id:
            return it
    return None


def _create_review(token, cid, title):
    r = requests.post(f"{API}/reviews", headers=_hdr(token),
                      json={"title": title, "client_id": cid, "status": "planned",
                            "review_type": "control", "recurrence": "one_time",
                            "due_date": "2026-06-15T00:00:00Z"})
    assert r.status_code == 200, r.text
    return r.json()["review_id"]


# ---------- Bulk ----------
class TestBulkAuth:
    def test_bulk_close_reviews_as_admin(self, admin_token, acme_cid):
        r1 = _create_review(admin_token, acme_cid, "TEST_iter4_bulk_close_1")
        r2 = _create_review(admin_token, acme_cid, "TEST_iter4_bulk_close_2")
        r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                          json={"kind": "reviews", "ids": [r1, r2], "action": "close"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["ok"] is True
        assert j["count"] == 2
        # Verify persistence
        for rid in (r1, r2):
            doc = _get_one(admin_token, "reviews", acme_cid, "review_id", rid)
            assert doc is not None
            assert doc["status"] == "completed"

    def test_bulk_readonly_forbidden(self, admin_token, readonly_token, acme_cid):
        r1 = _create_review(admin_token, acme_cid, "TEST_iter4_bulk_ro")
        r = requests.post(f"{API}/bulk", headers=_hdr(readonly_token),
                          json={"kind": "reviews", "ids": [r1], "action": "close"})
        assert r.status_code == 403, r.text

    def test_bulk_contributor_delete_forbidden(self, admin_token, contrib_token, acme_cid):
        r1 = _create_review(admin_token, acme_cid, "TEST_iter4_bulk_deldeny")
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                          json={"kind": "reviews", "ids": [r1], "action": "delete"})
        assert r.status_code == 403, r.text
        # Verify still there
        doc = _get_one(admin_token, "reviews", acme_cid, "review_id", r1)
        assert doc is not None

    def test_bulk_admin_delete(self, admin_token, acme_cid):
        r1 = _create_review(admin_token, acme_cid, "TEST_iter4_bulk_delok")
        r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                         json={"kind": "reviews", "ids": [r1], "action": "delete"})
        assert r.status_code == 200
        j = r.json()
        assert j["ok"] is True and j["count"] >= 1
        doc = _get_one(admin_token, "reviews", acme_cid, "review_id", r1)
        assert doc is None


class TestBulkActions:
    def test_close_status_mappings(self, admin_token, acme_cid):
        # tasks -> done, findings -> closed, policies -> retired, exceptions -> revoked
        # Create one of each
        # Task
        t = requests.post(f"{API}/tasks", headers=_hdr(admin_token),
                          json={"title": "TEST_iter4_bulk_task", "client_id": acme_cid, "status": "open"})
        assert t.status_code == 200
        tid = t.json()["task_id"]
        # Finding
        f = requests.post(f"{API}/findings", headers=_hdr(admin_token),
                          json={"title": "TEST_iter4_bulk_finding", "client_id": acme_cid,
                                "severity": "low", "status": "open"})
        assert f.status_code == 200
        fid = f.json()["finding_id"]
        # Policy
        p = requests.post(f"{API}/policies", headers=_hdr(admin_token),
                          json={"title": "TEST_iter4_bulk_policy", "client_id": acme_cid, "status": "draft"})
        pid = p.json()["policy_id"]
        # Exception
        e = requests.post(f"{API}/exceptions", headers=_hdr(admin_token),
                          json={"title": "TEST_iter4_bulk_exc", "client_id": acme_cid, "status": "approved"})
        eid = e.json()["exception_id"]

        cases = [
            ("tasks", [tid], "done", "task_id"),
            ("findings", [fid], "closed", "finding_id"),
            ("policies", [pid], "retired", "policy_id"),
            ("exceptions", [eid], "revoked", "exception_id"),
        ]
        for kind, ids, expected, idf in cases:
            r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                              json={"kind": kind, "ids": ids, "action": "close"})
            assert r.status_code == 200, f"{kind}: {r.text}"
            doc = _get_one(admin_token, kind, acme_cid, idf, ids[0])
            assert doc is not None, f"{kind}: not found"
            assert doc["status"] == expected, f"{kind}: got {doc.get('status')}"

    def test_set_status_reviews(self, admin_token, acme_cid):
        r1 = _create_review(admin_token, acme_cid, "TEST_iter4_setstatus_1")
        r2 = _create_review(admin_token, acme_cid, "TEST_iter4_setstatus_2")
        r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                          json={"kind": "reviews", "ids": [r1, r2],
                                "action": "set-status", "payload": {"status": "in_progress"}})
        assert r.status_code == 200, r.text
        assert r.json()["count"] == 2
        for rid in (r1, r2):
            doc = _get_one(admin_token, "reviews", acme_cid, "review_id", rid)
            assert doc["status"] == "in_progress"

    def test_set_owner_reviews(self, admin_token, contrib, acme_cid):
        cuser = contrib["user"]["user_id"]
        r1 = _create_review(admin_token, acme_cid, "TEST_iter4_setowner_1")
        r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                          json={"kind": "reviews", "ids": [r1],
                                "action": "set-owner", "payload": {"owner_id": cuser}})
        assert r.status_code == 200, r.text
        doc = _get_one(admin_token, "reviews", acme_cid, "review_id", r1)
        assert doc.get("owner_id") == cuser

    def test_set_owner_tasks_uses_assignee(self, admin_token, contrib, acme_cid):
        cuser = contrib["user"]["user_id"]
        t = requests.post(f"{API}/tasks", headers=_hdr(admin_token),
                          json={"title": "TEST_iter4_bulk_task_owner",
                                "client_id": acme_cid, "status": "open"})
        tid = t.json()["task_id"]
        r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                          json={"kind": "tasks", "ids": [tid],
                                "action": "set-owner", "payload": {"owner_id": cuser}})
        assert r.status_code == 200, r.text
        doc = _get_one(admin_token, "tasks", acme_cid, "task_id", tid)
        assert doc.get("assignee_id") == cuser

    def test_bulk_cross_tenant_forbidden(self, admin_token, contrib_token,
                                        acme_cid, globex_cid):
        # Admin creates a review in Globex
        gr = _create_review(admin_token, globex_cid, "TEST_iter4_bulk_globex")
        ar = _create_review(admin_token, acme_cid, "TEST_iter4_bulk_acme")
        # Acme contributor tries to close both
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                          json={"kind": "reviews", "ids": [ar, gr], "action": "close"})
        assert r.status_code == 403, r.text


# ---------- Calendar ----------
class TestCalendar:
    def test_calendar_shape(self, admin_token, acme_cid):
        r = requests.get(f"{API}/calendar", headers=_hdr(admin_token),
                        params={"client_id": acme_cid})
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("reviews", "findings", "tasks"):
            assert k in j and isinstance(j[k], dict)
        # If any items, verify structure
        for kind_map in j.values():
            for date_key, items in kind_map.items():
                assert len(date_key) == 10 and date_key[4] == "-" and date_key[7] == "-"
                for it in items:
                    for f in ("id", "kind", "title", "status"):
                        assert f in it

    def test_calendar_date_filter(self, admin_token, acme_cid):
        # Create a review with a known future date
        rid = _create_review(admin_token, acme_cid, "TEST_iter4_cal_narrow")
        # Update due_date via PATCH
        upd = requests.patch(f"{API}/reviews/{rid}", headers=_hdr(admin_token),
                             json={"due_date": "2027-03-15T00:00:00Z"})
        assert upd.status_code == 200
        # Query with narrow window that includes it
        r = requests.get(f"{API}/calendar", headers=_hdr(admin_token),
                        params={"client_id": acme_cid,
                                "start": "2027-03-01T00:00:00Z",
                                "end": "2027-03-31T23:59:59Z"})
        assert r.status_code == 200
        j = r.json()
        found = False
        for date_key, items in j["reviews"].items():
            if any(it["id"] == rid for it in items):
                found = True
                assert date_key.startswith("2027-03-")
        assert found, "review not present in narrow calendar window"

        # Query with window excluding it
        r2 = requests.get(f"{API}/calendar", headers=_hdr(admin_token),
                         params={"client_id": acme_cid,
                                 "start": "2025-01-01T00:00:00Z",
                                 "end": "2025-01-31T00:00:00Z"})
        j2 = r2.json()
        for items in j2["reviews"].values():
            assert not any(it["id"] == rid for it in items)


# ---------- Board Report PDF ----------
class TestBoardReport:
    def test_board_report_pdf_as_admin(self, admin_token, acme_cid):
        r = requests.get(f"{API}/reports/board", headers=_hdr(admin_token),
                        params={"client_id": acme_cid})
        assert r.status_code == 200, r.text[:400]
        assert "application/pdf" in r.headers.get("Content-Type", "")
        assert r.content.startswith(b"%PDF"), r.content[:20]
        assert len(r.content) > 2048, f"PDF too small: {len(r.content)} bytes"

    def test_board_report_403_for_other_tenant(self, globex_token, acme_cid):
        r = requests.get(f"{API}/reports/board", headers=_hdr(globex_token),
                        params={"client_id": acme_cid})
        assert r.status_code == 403, r.text[:200]


# ---------- Regression sanity ----------
class TestRegressionIter4:
    def test_dashboard(self, admin_token):
        r = requests.get(f"{API}/dashboard", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert "kpis" in r.json()

    def test_reviews_list(self, admin_token, acme_cid):
        r = requests.get(f"{API}/reviews", headers=_hdr(admin_token),
                        params={"client_id": acme_cid})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_export_csv(self, admin_token, acme_cid):
        r = requests.get(f"{API}/export/reviews", headers=_hdr(admin_token),
                        params={"client_id": acme_cid})
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")

    def test_notifications(self, admin_token):
        r = requests.get(f"{API}/notifications", headers=_hdr(admin_token))
        assert r.status_code == 200
        assert "items" in r.json() and "unread" in r.json()
