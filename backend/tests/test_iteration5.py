"""Iteration 5 tests: Password reset + bulk set-due-date.

Covers:
 - POST /api/auth/forgot-password (known + unknown email; no enumeration)
 - POST /api/auth/reset-password (invalid token, short pw, happy path, replay)
 - POST /api/bulk action='set-due-date' (happy path, validation, RBAC)
"""
import os
import hashlib
import secrets
from datetime import datetime, timezone, timedelta

import bcrypt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("robbashea@gmail.com", "Admin@2026")
CONTRIB = ("contributor@acme.demo", "Demo@2026")
READONLY = ("readonly@acme.demo", "Demo@2026")

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "grc_platform")


def _login(email, pw):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = _login(*ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def contrib_token():
    r = _login(*CONTRIB)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def readonly_token():
    r = _login(*READONLY)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


# ---------------- Forgot password ----------------

class TestForgotPassword:
    def test_forgot_known_email_returns_ok_and_persists_row(self, db):
        before = db.password_resets.count_documents({})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "robbashea@gmail.com"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        after = db.password_resets.count_documents({})
        assert after == before + 1

    def test_forgot_unknown_email_returns_ok_no_enum(self, db):
        before = db.password_resets.count_documents({})
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nobody-xxxx@example.com"}, timeout=30)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        after = db.password_resets.count_documents({})
        assert after == before  # No row created


# ---------------- Reset password ----------------

class TestResetPassword:
    def test_reset_invalid_token(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "not-a-real-token", "new_password": "GoodPass1!"}, timeout=30)
        assert r.status_code == 400

    def test_reset_short_password(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "whatever", "new_password": "short"}, timeout=30)
        assert r.status_code == 400

    def test_reset_happy_path_and_replay(self, db):
        # Generate a valid token for contributor
        raw = secrets.token_urlsafe(32)
        h = hashlib.sha256(raw.encode()).hexdigest()
        u = db.users.find_one({"email": "contributor@acme.demo"})
        assert u is not None
        db.password_resets.insert_one({
            "user_id": u["user_id"],
            "token_hash": h,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        try:
            # Happy path
            r = requests.post(f"{API}/auth/reset-password", json={"token": raw, "new_password": "BrandNew2026!"}, timeout=30)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            assert "sessions_revoked" in body  # iter6 contract

            # Login old password fails
            r_old = _login("contributor@acme.demo", "Demo@2026")
            assert r_old.status_code == 401

            # Login new password succeeds
            r_new = _login("contributor@acme.demo", "BrandNew2026!")
            assert r_new.status_code == 200

            # Replay same token -> 400
            r_replay = requests.post(f"{API}/auth/reset-password", json={"token": raw, "new_password": "AnotherOne1!"}, timeout=30)
            assert r_replay.status_code == 400
        finally:
            # Restore password to Demo@2026
            new_hash = bcrypt.hashpw(b"Demo@2026", bcrypt.gensalt()).decode()
            db.users.update_one({"email": "contributor@acme.demo"}, {"$set": {"password_hash": new_hash}})
            # Verify restore
            r_rest = _login("contributor@acme.demo", "Demo@2026")
            assert r_rest.status_code == 200, "Restore of contributor password failed!"


# ---------------- Bulk set-due-date ----------------

@pytest.fixture(scope="module")
def acme_cid(admin_token):
    r = requests.get(f"{API}/clients", headers=_hdr(admin_token))
    for c in r.json():
        if c["name"] == "Acme Corp":
            return c["client_id"]
    pytest.skip("Acme not found")


def _list_reviews(token, client_id=None):
    p = {"client_id": client_id} if client_id else {}
    r = requests.get(f"{API}/reviews", headers=_hdr(token), params=p, timeout=30)
    assert r.status_code == 200
    return r.json()


def _create_review(token, title, client_id):
    body = {"title": title, "client_id": client_id, "status": "planned",
            "review_type": "control", "recurrence": "one_time",
            "due_date": "2026-01-15T09:00:00Z"}
    r = requests.post(f"{API}/reviews", headers=_hdr(token), json=body, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


class TestBulkSetDueDate:
    def test_set_due_date_happy_path(self, contrib_token, acme_cid):
        r1 = _create_review(contrib_token, "TEST_iter5_bulk_due_1", acme_cid)
        r2 = _create_review(contrib_token, "TEST_iter5_bulk_due_2", acme_cid)
        ids = [r1["review_id"], r2["review_id"]]
        new_due = "2027-06-15T09:00:00Z"
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                         json={"kind": "reviews", "ids": ids, "action": "set-due-date",
                               "payload": {"due_date": new_due}}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["count"] == 2

        # Verify via GET
        reviews = _list_reviews(contrib_token)
        by_id = {rv["review_id"]: rv for rv in reviews}
        for rid in ids:
            assert by_id[rid]["due_date"] == new_due

    def test_set_due_date_missing_payload_returns_400(self, contrib_token, acme_cid):
        r1 = _create_review(contrib_token, "TEST_iter5_bulk_due_bad", acme_cid)
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                         json={"kind": "reviews", "ids": [r1["review_id"]], "action": "set-due-date",
                               "payload": {}}, timeout=30)
        assert r.status_code == 400
        assert "due_date" in r.text.lower()

    def test_set_due_date_readonly_forbidden(self, contrib_token, readonly_token, acme_cid):
        r1 = _create_review(contrib_token, "TEST_iter5_bulk_due_ro", acme_cid)
        r = requests.post(f"{API}/bulk", headers=_hdr(readonly_token),
                         json={"kind": "reviews", "ids": [r1["review_id"]], "action": "set-due-date",
                               "payload": {"due_date": "2028-01-01T00:00:00Z"}}, timeout=30)
        assert r.status_code == 403


# ---------------- Regression: other bulk actions + PATCH ----------------

class TestBulkRegression:
    def test_bulk_close_and_set_status_and_set_owner_and_delete(self, contrib_token, admin_token, acme_cid):
        r1 = _create_review(contrib_token, "TEST_iter5_reg_close", acme_cid)
        r2 = _create_review(contrib_token, "TEST_iter5_reg_setstatus", acme_cid)
        r3 = _create_review(contrib_token, "TEST_iter5_reg_setowner", acme_cid)
        r4 = _create_review(contrib_token, "TEST_iter5_reg_del", acme_cid)

        # close
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                         json={"kind": "reviews", "ids": [r1["review_id"]], "action": "close"}, timeout=30)
        assert r.status_code == 200 and r.json()["ok"] is True

        # set-status
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                         json={"kind": "reviews", "ids": [r2["review_id"]], "action": "set-status",
                               "payload": {"status": "in_progress"}}, timeout=30)
        assert r.status_code == 200

        # set-owner (unassign)
        r = requests.post(f"{API}/bulk", headers=_hdr(contrib_token),
                         json={"kind": "reviews", "ids": [r3["review_id"]], "action": "set-owner",
                               "payload": {"owner_id": "__none__"}}, timeout=30)
        assert r.status_code == 200

        # delete (admin only)
        r = requests.post(f"{API}/bulk", headers=_hdr(admin_token),
                         json={"kind": "reviews", "ids": [r4["review_id"]], "action": "delete"}, timeout=30)
        assert r.status_code == 200

    def test_reviews_patch_still_works(self, contrib_token, acme_cid):
        r1 = _create_review(contrib_token, "TEST_iter5_patch", acme_cid)
        new_due = "2027-11-11T10:00:00Z"
        r = requests.patch(f"{API}/reviews/{r1['review_id']}", headers=_hdr(contrib_token),
                          json={"due_date": new_due}, timeout=30)
        assert r.status_code == 200, r.text
        # verify
        reviews = _list_reviews(contrib_token)
        found = next((rv for rv in reviews if rv["review_id"] == r1["review_id"]), None)
        assert found is not None
        assert found["due_date"] == new_due


# ---------------- Regression: other endpoints still green ----------------

class TestGeneralRegression:
    def test_dashboard(self, contrib_token):
        r = requests.get(f"{API}/dashboard", headers=_hdr(contrib_token), timeout=30)
        assert r.status_code == 200

    def test_calendar(self, contrib_token):
        r = requests.get(f"{API}/calendar", headers=_hdr(contrib_token), timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "reviews" in body and "findings" in body and "tasks" in body

    def test_board_report(self, admin_token):
        # get a client id from clients endpoint
        r = requests.get(f"{API}/clients", headers=_hdr(admin_token), timeout=30)
        assert r.status_code == 200
        clients = r.json()
        if not clients:
            pytest.skip("no clients")
        cid = clients[0].get("client_id") or clients[0].get("id")
        r = requests.get(f"{API}/reports/board", headers=_hdr(admin_token), params={"client_id": cid}, timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_notifications(self, contrib_token):
        r = requests.get(f"{API}/notifications", headers=_hdr(contrib_token), timeout=30)
        assert r.status_code == 200

    def test_export_reviews(self, contrib_token):
        r = requests.get(f"{API}/export/reviews", headers=_hdr(contrib_token), timeout=30)
        assert r.status_code == 200

    def test_exceptions_crud(self, contrib_token, acme_cid):
        # create
        r = requests.post(f"{API}/exceptions", headers=_hdr(contrib_token),
                         json={"title": "TEST_iter5_exc", "client_id": acme_cid, "status": "requested"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        eid = r.json().get("exception_id") or r.json().get("id")
        # list
        r = requests.get(f"{API}/exceptions", headers=_hdr(contrib_token), timeout=30)
        assert r.status_code == 200
        # patch
        r = requests.patch(f"{API}/exceptions/{eid}", headers=_hdr(contrib_token),
                          json={"status": "approved"}, timeout=30)
        assert r.status_code == 200
        # delete (may require admin; tolerate 403 in that case)
        r = requests.delete(f"{API}/exceptions/{eid}", headers=_hdr(contrib_token), timeout=30)
        assert r.status_code in (200, 204, 403)
