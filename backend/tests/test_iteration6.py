"""Iteration 6 tests: Session invalidation on password reset.

Verifies:
 - password_changed_at ISO timestamp is written on reset
 - JWT minted BEFORE reset -> 401 on /api/auth/me after reset
 - Fresh JWT minted AFTER reset -> 200
 - OAuth-style session row is deleted (Bearer <session_token> works before, 401 after)
 - Response shape: {ok:true, sessions_revoked:<int>}
 - Restores contributor password + unsets password_changed_at at teardown.
"""
import os
import hashlib
import secrets
import time
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

CONTRIB_EMAIL = "contributor@acme.demo"
CONTRIB_PW = "Demo@2026"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "grc_platform")


def _login(email, pw):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


def _issue_reset_token(db, email):
    raw = secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode()).hexdigest()
    u = db.users.find_one({"email": email})
    assert u is not None
    db.password_resets.insert_one({
        "user_id": u["user_id"],
        "token_hash": h,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return raw, u["user_id"]


def _restore_contrib(db):
    new_hash = bcrypt.hashpw(CONTRIB_PW.encode(), bcrypt.gensalt()).decode()
    db.users.update_one(
        {"email": CONTRIB_EMAIL},
        {"$set": {"password_hash": new_hash}, "$unset": {"password_changed_at": ""}},
    )
    r = _login(CONTRIB_EMAIL, CONTRIB_PW)
    assert r.status_code == 200, f"Contributor restore failed: {r.text}"


class TestIter6SessionInvalidation:
    def test_full_session_invalidation_flow(self, db):
        try:
            # 1) Login as contributor -> get PRE-reset JWT
            r = _login(CONTRIB_EMAIL, CONTRIB_PW)
            assert r.status_code == 200, r.text
            pre_jwt = r.json()["access_token"]

            # Sanity: pre_jwt works
            me = requests.get(f"{API}/auth/me", headers=_hdr(pre_jwt), timeout=30)
            assert me.status_code == 200

            # 2) Insert a synthetic OAuth session row for contributor
            u = db.users.find_one({"email": CONTRIB_EMAIL})
            session_token = f"sess_iter6_{secrets.token_hex(6)}"
            db.sessions.insert_one({
                "session_token": session_token,
                "user_id": u["user_id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            })

            # Sanity: session_token accepted by /auth/me before reset
            me_sess = requests.get(f"{API}/auth/me", headers=_hdr(session_token), timeout=30)
            assert me_sess.status_code == 200, me_sess.text

            # 3) Issue reset token
            # Ensure iat < password_changed_at (JWT iat has 1-second resolution)
            time.sleep(2)
            raw_token, uid = _issue_reset_token(db, CONTRIB_EMAIL)

            # 4) POST /auth/reset-password
            new_pw = "Iter6Reset!2026"
            rr = requests.post(f"{API}/auth/reset-password",
                               json={"token": raw_token, "new_password": new_pw}, timeout=30)
            assert rr.status_code == 200, rr.text
            body = rr.json()
            assert body.get("ok") is True
            # sessions_revoked >= 1 (our synthetic row)
            assert "sessions_revoked" in body
            assert isinstance(body["sessions_revoked"], int)
            assert body["sessions_revoked"] >= 1

            # 5) password_changed_at is now set on the user doc
            u2 = db.users.find_one({"email": CONTRIB_EMAIL})
            assert u2.get("password_changed_at"), "password_changed_at missing"
            # ISO parseable
            pca = u2["password_changed_at"]
            if isinstance(pca, str):
                _ = datetime.fromisoformat(pca)

            # 6) db.sessions row removed
            still = db.sessions.find_one({"session_token": session_token})
            assert still is None, "session row should have been deleted"

            # 7) Old session_token now 401
            me_sess2 = requests.get(f"{API}/auth/me", headers=_hdr(session_token), timeout=30)
            assert me_sess2.status_code == 401

            # 8) Pre-reset JWT now 401
            me2 = requests.get(f"{API}/auth/me", headers=_hdr(pre_jwt), timeout=30)
            assert me2.status_code == 401, f"Expected 401 for pre-reset JWT, got {me2.status_code}"

            # 9) Fresh login with new password -> 200 + new JWT works
            time.sleep(2)  # ensure new iat > password_changed_at
            r_new = _login(CONTRIB_EMAIL, new_pw)
            assert r_new.status_code == 200, r_new.text
            post_jwt = r_new.json()["access_token"]
            me3 = requests.get(f"{API}/auth/me", headers=_hdr(post_jwt), timeout=30)
            assert me3.status_code == 200
            # Second call still 200
            me4 = requests.get(f"{API}/auth/me", headers=_hdr(post_jwt), timeout=30)
            assert me4.status_code == 200
        finally:
            _restore_contrib(db)

    def test_restore_state_final(self, db):
        # Explicit final restore check so earlier iterations' assumptions hold.
        _restore_contrib(db)
        u = db.users.find_one({"email": CONTRIB_EMAIL})
        assert "password_changed_at" not in u
