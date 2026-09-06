from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import uuid
import logging
import secrets
import hashlib
import bcrypt
import jwt
import httpx
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict, Tuple

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, Path
from fastapi.responses import StreamingResponse
import csv
import io
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors as rl_colors
from reportlab.lib.units import inch
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------------- DB ----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="GRC Platform")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def _uid(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Password ----------------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


# ---------------- JWT ----------------
def create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "email": email, "type": "access",
               "iat": now, "exp": now + timedelta(days=7)}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


async def _get_user_from_token(token: str) -> Optional[Dict]:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            return None
        # Invalidate tokens issued before the last password change.
        pca = user.get("password_changed_at")
        if pca:
            if isinstance(pca, str):
                try:
                    pca_dt = datetime.fromisoformat(pca)
                except ValueError:
                    pca_dt = None
            else:
                pca_dt = pca
            iat = payload.get("iat")
            if pca_dt and iat is not None:
                if pca_dt.tzinfo is None:
                    pca_dt = pca_dt.replace(tzinfo=timezone.utc)
                iat_dt = datetime.fromtimestamp(int(iat), tz=timezone.utc)
                if iat_dt <= pca_dt:
                    return None
        return user
    except jwt.PyJWTError:
        return None


async def _get_user_from_session(token: str) -> Optional[Dict]:
    sess = await db.sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0, "password_hash": 0})
    return user


async def get_current_user(request: Request) -> Dict:
    # Try session_token (Emergent OAuth) then access_token (JWT) then Authorization header
    session_token = request.cookies.get("session_token")
    if session_token:
        u = await _get_user_from_session(session_token)
        if u:
            return u
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            access_token = auth[7:]
    if access_token:
        u = await _get_user_from_token(access_token)
        if u:
            return u
        u = await _get_user_from_session(access_token)
        if u:
            return u
    raise HTTPException(401, "Not authenticated")


# ---------------- Models (Pydantic input) ----------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ClientIn(BaseModel):
    name: str
    industry: Optional[str] = None
    environment: Optional[str] = "Production"
    status: Optional[str] = "onboarding"  # onboarding, active, inactive, archived
    primary_contact: Optional[str] = None
    assigned_owner_id: Optional[str] = None
    logo_url: Optional[str] = None


class ClientPatchIn(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    environment: Optional[str] = None
    status: Optional[str] = None
    primary_contact: Optional[str] = None
    assigned_owner_id: Optional[str] = None
    logo_url: Optional[str] = None


class ReviewIn(BaseModel):
    title: str
    review_type: str  # asset, software, access, vendor, policy, risk, vulnerability, bcp_dr, incident, awareness
    client_id: str
    period: Optional[str] = None
    due_date: Optional[str] = None
    owner_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    status: Optional[str] = "upcoming"  # upcoming, in_progress, completed, cancelled (overdue is computed)
    scope: Optional[str] = None
    notes: Optional[str] = None
    recurrence: Optional[str] = "none"  # none, monthly, quarterly, semiannual, annual, custom
    custom_recurrence_days: Optional[int] = None
    next_review_date: Optional[str] = None
    completion_date: Optional[str] = None
    parent_review_id: Optional[str] = None
    follow_up: Optional[str] = None


class FindingIn(BaseModel):
    title: str
    client_id: str
    severity: str = "medium"  # low, medium, high, critical
    status: str = "open"  # open, in_remediation, remediated, closed, accepted
    description: Optional[str] = None
    owner_id: Optional[str] = None
    due_date: Optional[str] = None
    review_id: Optional[str] = None
    risk_id: Optional[str] = None
    remediation_plan: Optional[str] = None


class RiskIn(BaseModel):
    title: str
    client_id: str
    category: Optional[str] = "operational"
    # Legacy string ratings (kept for backwards compat with existing records).
    likelihood: Optional[str] = None
    impact: Optional[str] = None
    # New numeric 1-5 ratings — drive risk_score and risk_level.
    likelihood_score: Optional[int] = None
    impact_score: Optional[int] = None
    risk_score: Optional[int] = None
    risk_level: Optional[str] = None
    status: str = "open"  # open, in_progress, accepted, escalated, closed
    treatment: Optional[str] = None  # mitigate, accept, transfer, avoid, monitor
    owner_id: Optional[str] = None
    description: Optional[str] = None
    impact_description: Optional[str] = None
    source: Optional[str] = None
    date_identified: Optional[str] = None
    last_reviewed: Optional[str] = None
    next_review: Optional[str] = None
    accepted: Optional[bool] = False
    accepted_by: Optional[str] = None
    acceptance_date: Optional[str] = None
    acceptance_rationale: Optional[str] = None
    notes: Optional[str] = None


class PolicyIn(BaseModel):
    title: str
    client_id: str
    version: Optional[str] = None  # No fabricated default until verified.
    status: str = "draft"  # draft, in_review, approved, retired, needs_verification, needs_creation, not_applicable
    presence: Optional[str] = None  # reported_existing, verified_existing, reported_missing, needs_confirmation, not_applicable
    category: Optional[str] = None  # Core Governance, Security Operations, Business Resilience, ...
    applicability_rationale: Optional[str] = None  # required when presence == not_applicable
    onboarding_note: Optional[str] = None  # short client note captured during onboarding
    is_client_reported: Optional[bool] = None  # true if presence came from a client onboarding response
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None
    owner_id: Optional[str] = None
    approver_id: Optional[str] = None
    approved_at: Optional[str] = None
    last_reviewed_at: Optional[str] = None
    next_review_date: Optional[str] = None
    summary: Optional[str] = None


class VendorIn(BaseModel):
    name: str
    client_id: str
    service: Optional[str] = None  # short description of what they provide
    category: Optional[str] = "SaaS"
    criticality: str = "medium"  # low, medium, high, critical
    status: str = "active"  # onboarding, under_review, active, offboarding, inactive
    data_types: Optional[List[str]] = None
    data_relationship: Optional[List[str]] = None  # stores/processes/transmits/accesses/hosts/none
    business_owner_id: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    website: Optional[str] = None
    services: Optional[str] = None  # legacy free-text; kept for backwards compat
    review_frequency: Optional[str] = "annual"  # quarterly, semiannual, annual, biennial, as_needed, custom
    last_review: Optional[str] = None
    next_review: Optional[str] = None
    contract_start: Optional[str] = None
    contract_renewal: Optional[str] = None
    contract_expiration: Optional[str] = None
    contract_end: Optional[str] = None  # legacy
    auto_renewal: Optional[str] = None  # yes / no / unknown
    assurance_status: Optional[str] = None  # current, expiring, expired, requested, missing, under_review
    assurance_expires_at: Optional[str] = None  # ISO date — next SOC2/ISO/DPA renewal cutoff
    notes: Optional[str] = None
    related_risk_ids: Optional[List[str]] = None


class AssetIn(BaseModel):
    name: str
    client_id: str
    asset_type: str = "server"  # server, workstation, database, application, network, saas
    owner_id: Optional[str] = None
    criticality: str = "medium"
    location: Optional[str] = None
    status: str = "active"


class TaskIn(BaseModel):
    title: str
    client_id: str
    status: str = "open"  # open, in_progress, done, blocked
    priority: str = "medium"
    assignee_id: Optional[str] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    finding_id: Optional[str] = None
    review_id: Optional[str] = None
    policy_id: Optional[str] = None  # link back to Policy Register row (for onboarding-generated tasks)
    source: Optional[str] = None  # e.g. "GRC Program Onboarding"


class ContactIn(BaseModel):
    client_id: str
    role: Optional[str] = None
    grc_roles: Optional[List[str]] = None
    name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linked_user_id: Optional[str] = None
    status: Optional[str] = "active"
    notes: Optional[str] = None
    not_applicable: Optional[bool] = False


class RequirementIn(BaseModel):
    title: str
    client_id: str
    category: Optional[str] = None  # Assurance, Legal/Regulatory, Contractual, Insurance, Other
    applicability: Optional[str] = None  # applicable, potentially_applicable, needs_review, not_applicable
    status: Optional[str] = "active"  # active, retired, under_review
    owner_id: Optional[str] = None
    next_review_date: Optional[str] = None
    source: Optional[str] = None
    note: Optional[str] = None
    is_client_reported: Optional[bool] = None
    rationale: Optional[str] = None  # required when applicability == not_applicable
    verified_at: Optional[str] = None
    verified_by: Optional[str] = None


class ExceptionIn(BaseModel):
    title: str
    client_id: str
    status: str = "requested"  # requested, approved, expired, revoked
    justification: Optional[str] = None
    owner_id: Optional[str] = None
    approver_id: Optional[str] = None
    expires_at: Optional[str] = None
    risk_id: Optional[str] = None
    finding_id: Optional[str] = None
    compensating_controls: Optional[str] = None


class EvidenceIn(BaseModel):
    filename: str
    client_id: str
    content_base64: str  # data URI or raw base64
    mime_type: Optional[str] = "application/octet-stream"
    linked_type: Optional[str] = None  # review | finding | risk | policy | vendor | asset
    linked_id: Optional[str] = None
    notes: Optional[str] = None


class CommentIn(BaseModel):
    entity_type: str
    entity_id: str
    body: str


class GoogleSessionIn(BaseModel):
    session_id: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str


# ---------------- Audit ----------------
async def audit(user: Dict, action: str, entity_type: str, entity_id: str, client_id: Optional[str] = None, meta: Optional[Dict] = None):
    await db.audit_logs.insert_one({
        "log_id": _uid("log"),
        "at": _now(),
        "user_id": user.get("user_id"),
        "user_email": user.get("email"),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "client_id": client_id,
        "meta": meta or {},
    })


# ---------------- Notifications helpers (defined early so they're in scope everywhere) ----------------
ID_FIELD_MAP = {
    "reviews": "review_id", "findings": "finding_id", "risks": "risk_id",
    "policies": "policy_id", "vendors": "vendor_id", "assets": "asset_id",
    "tasks": "task_id", "exceptions": "exception_id",
}


async def create_notification(*, user_id: str, title: str, kind: str,
                              entity_type: Optional[str] = None, entity_id: Optional[str] = None,
                              client_id: Optional[str] = None) -> None:
    doc = {
        "notification_id": _uid("ntf"),
        "user_id": user_id,
        "title": title,
        "kind": kind,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "client_id": client_id,
        "read": False,
        "created_at": _now(),
    }
    await db.notifications.insert_one(doc)


# ---------------- Tenant scoping ----------------
def _can_access_client(user: Dict, client_id: str) -> bool:
    role = user.get("role")
    if role in ("super_admin", "platform_admin"):
        return True
    return client_id in (user.get("client_ids") or [])


def _writable(user: Dict) -> bool:
    return user.get("role") in ("super_admin", "platform_admin", "client_contributor")


def _scope_filter(user: Dict, client_id: Optional[str] = None) -> Dict:
    role = user.get("role")
    if role in ("super_admin", "platform_admin"):
        return {"client_id": client_id} if client_id else {}
    allowed = user.get("client_ids") or []
    if client_id:
        if client_id not in allowed:
            raise HTTPException(403, "Forbidden for this client")
        return {"client_id": client_id}
    return {"client_id": {"$in": allowed}}


# ---------------- Auth endpoints ----------------
def _set_auth_cookie(resp: Response, token: str, key: str = "access_token", max_age: int = 7 * 24 * 3600):
    resp.set_cookie(key=key, value=token, httponly=True, secure=True, samesite="none", max_age=max_age, path="/")


def _google_admin_emails() -> set[str]:
    """Return the explicitly configured Google identities allowed platform access.

    GOOGLE_ADMIN_EMAILS supports a comma-separated allowlist.  ADMIN_EMAIL is
    retained as a backwards-compatible single-address fallback for existing
    deployments; no personal or operational address is embedded in source.
    """
    raw = os.environ.get("GOOGLE_ADMIN_EMAILS") or os.environ.get("ADMIN_EMAIL", "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user_id = _uid("user")
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "client_readonly",
        "client_ids": [],
        "auth_provider": "password",
        "created_at": _now(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    _set_auth_cookie(response, token)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return {"user": doc, "access_token": token}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    u = await db.users.find_one({"email": email})
    if not u or not u.get("password_hash") or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if u.get("status") == "disabled":
        raise HTTPException(403, "This account has been disabled. Contact your administrator.")
    token = create_access_token(u["user_id"], email)
    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"last_login_at": _now()}})
    _set_auth_cookie(response, token)
    u.pop("password_hash", None)
    u.pop("_id", None)
    return {"user": u, "access_token": token}


# ---------------- Password reset ----------------
@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn):
    email = body.email.lower()
    u = await db.users.find_one({"email": email}, {"_id": 0})
    # Always return ok to avoid user-enumeration.
    if not u or not u.get("password_hash"):
        return {"ok": True}
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    # Invalidate any prior unused tokens for this user so a leaked older link becomes unusable.
    await db.password_resets.update_many(
        {"user_id": u["user_id"], "used": False},
        {"$set": {"used": True, "used_at": _now(), "superseded": True}},
    )
    await db.password_resets.insert_one({
        "user_id": u["user_id"],
        "token_hash": token_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
        "used": False,
        "created_at": _now(),
    })
    base = (os.environ.get("APP_BASE_URL") or "").rstrip("/")
    if not base:
        return {"ok": True}
    link = f"{base}/reset-password?token={raw}"
    from html import escape as _esc
    name = _esc(u.get("name") or email)
    safe_link = _esc(link)
    html = (
        '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">'
        f'<h2 style="margin:0 0 12px 0;color:#0f172a">Reset your Northstar GRC password</h2>'
        f'<p style="color:#334155;font-size:14px">Hi {name}, we received a request to reset your password. '
        f'Use the link below within the next 2 hours to choose a new one.</p>'
        f'<p style="margin:20px 0"><a href="{safe_link}" '
        'style="background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;display:inline-block">Choose a new password</a></p>'
        f'<p style="color:#64748b;font-size:12px">If the button doesn\'t work, open this link: <br />'
        f'<span style="word-break:break-all">{safe_link}</span></p>'
        f'<p style="color:#94a3b8;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email. '
        'We never ask for passwords or codes by email.</p>'
        '</div>'
    )
    await send_email(to=email, subject="Reset your Northstar GRC password", html=html)
    return {"ok": True}


@api.post("/auth/reset-password")
async def reset_password_endpoint(body: ResetIn):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    rec = await db.password_resets.find_one({"token_hash": token_hash, "used": False}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "Invalid or expired reset link")
    exp = rec["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired reset link")
    await db.users.update_one({"user_id": rec["user_id"]},
                              {"$set": {"password_hash": hash_password(body.new_password),
                                        "password_changed_at": _now()}})
    await db.password_resets.update_one({"token_hash": token_hash}, {"$set": {"used": True, "used_at": _now()}})
    # Kill all existing OAuth sessions for this user so any stolen cookie stops working.
    sessions_del = await db.sessions.delete_many({"user_id": rec["user_id"]})
    return {"ok": True, "sessions_revoked": sessions_del.deleted_count}


@api.post("/auth/logout")
async def logout(response: Response, user: Dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------------- My Account (self-service) ----------------
class MeProfileIn(BaseModel):
    name: Optional[str] = None
    job_title: Optional[str] = None
    phone: Optional[str] = None


class MePasswordIn(BaseModel):
    current_password: str
    new_password: str


class MePreferencesIn(BaseModel):
    weekly_digest_optout: Optional[bool] = None
    favorite_client_ids: Optional[List[str]] = None


@api.patch("/me")
async def update_me(body: MeProfileIn, user: Dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return user
    updates["updated_at"] = _now()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    await audit(user, "update", "user", user["user_id"], meta={"self": True, "fields": list(updates.keys())})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return fresh


@api.patch("/me/password")
async def update_me_password(body: MePasswordIn, user: Dict = Depends(get_current_user)):
    if user.get("auth_provider") == "google" and not user.get("password_hash"):
        raise HTTPException(400, "Authentication is managed by your identity provider")
    full = await db.users.find_one({"user_id": user["user_id"]})
    if not full or not full.get("password_hash"):
        raise HTTPException(400, "No local password to change")
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": _now()}},
    )
    revoked = await db.sessions.delete_many({"user_id": user["user_id"]})
    await audit(user, "password_change", "user", user["user_id"], meta={"self": True})
    return {"ok": True, "sessions_revoked": revoked.deleted_count}


@api.patch("/me/preferences")
async def update_me_preferences(body: MePreferencesIn, user: Dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    # Filter favorite_client_ids to only tenants the user is authorized for.
    if "favorite_client_ids" in updates:
        role = user.get("role")
        if role in ("super_admin", "platform_admin"):
            authorized = {c["client_id"] for c in await db.clients.find(
                {"status": {"$ne": "archived"}}, {"_id": 0, "client_id": 1}).to_list(1000)}
            if role == "platform_admin":
                authorized &= set(user.get("client_ids") or [])
        else:
            authorized = set(user.get("client_ids") or [])
        updates["favorite_client_ids"] = [c for c in updates["favorite_client_ids"] if c in authorized]
    updates["updated_at"] = _now()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "user": fresh}


@api.post("/me/favorites/{client_id}")
async def add_favorite_client(client_id: str, user: Dict = Depends(get_current_user)):
    """Toggle-on: add a client to the current user's Favorites. Server-side
    verifies the caller is authorized for that tenant AND the client exists +
    is not archived — prevents polluting the profile with arbitrary strings."""
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Not authorized for this client")
    exists = await db.clients.find_one(
        {"client_id": client_id, "status": {"$ne": "archived"}},
        {"_id": 0, "client_id": 1},
    )
    if not exists:
        raise HTTPException(404, "Client not found")
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$addToSet": {"favorite_client_ids": client_id},
                               "$set": {"updated_at": _now()}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "favorite_client_ids": fresh.get("favorite_client_ids") or []}


@api.delete("/me/favorites/{client_id}")
async def remove_favorite_client(client_id: str, user: Dict = Depends(get_current_user)):
    """Toggle-off: remove a client from the current user's Favorites."""
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$pull": {"favorite_client_ids": client_id},
                               "$set": {"updated_at": _now()}})
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"ok": True, "favorite_client_ids": fresh.get("favorite_client_ids") or []}


# ---------------- User administration ----------------
class UserCreateIn(BaseModel):
    email: EmailStr
    name: str
    role: str  # super_admin, platform_admin, client_contributor, client_readonly
    client_ids: List[str] = []
    password: Optional[str] = None  # if not provided, admin can trigger reset separately


class UserPatchIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    client_ids: Optional[List[str]] = None
    status: Optional[str] = None  # active | disabled | invited


def _admin_can_manage_role(actor: Dict, target_role: str) -> bool:
    """Only super_admin can assign super_admin; platform_admin can assign platform_admin/client_* roles."""
    actor_role = actor.get("role")
    if actor_role == "super_admin":
        return True
    if actor_role == "platform_admin":
        return target_role in ("platform_admin", "client_contributor", "client_readonly")
    return False


def _admin_can_manage_user(actor: Dict, target: Dict, client_scope: Optional[str] = None) -> bool:
    """Client-scoped: platform admins can manage users of clients they belong to; super_admin manages all."""
    actor_role = actor.get("role")
    if actor_role == "super_admin":
        return True
    if actor_role != "platform_admin":
        return False
    # platform_admin: must share at least one client with target OR be scoped to a client they can access
    if client_scope and not _can_access_client(actor, client_scope):
        return False
    actor_clients = set(actor.get("client_ids") or [])
    target_clients = set(target.get("client_ids") or [])
    return bool(actor_clients & target_clients) or (client_scope in actor_clients if client_scope else False)


@api.post("/contacts/{contact_id}/invite")
async def contact_invite(contact_id: str, user: Dict = Depends(get_current_user)):
    """Invite a Contact to become a platform user (client_contributor by default)
    using the same flow as Users & Access. Requires an email and no existing linked user.
    """
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only admins can invite contacts")
    contact = await db.contacts.find_one({"contact_id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    if not _can_access_client(user, contact["client_id"]):
        raise HTTPException(403, "Forbidden for this client")
    if contact.get("linked_user_id"):
        raise HTTPException(400, "Contact already linked to a platform user")
    email = (contact.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "Contact needs an email address before invite")
    existing = await db.users.find_one({"email": email})
    if existing:
        await db.contacts.update_one({"contact_id": contact_id},
                                     {"$set": {"linked_user_id": existing["user_id"], "updated_at": _now()}})
        return {"user": {k: existing[k] for k in existing if k not in ("_id", "password_hash")},
                "linked": True, "invite_link": None}
    invite_body = UserCreateIn(
        email=email, name=contact.get("name") or email,
        role="client_contributor", client_ids=[contact["client_id"]], password=None,
    )
    # Build tenant + role context so the invite email references the specific client
    # and the GRC role(s) the contact holds (falls back to legacy single 'role' field).
    tenant = await db.clients.find_one({"client_id": contact["client_id"]},
                                       {"_id": 0, "name": 1}) or {}
    grc_roles = contact.get("grc_roles") or ([contact["role"]] if contact.get("role") else [])
    invite_context = {
        "client_name": tenant.get("name"),
        "grc_roles": [r for r in grc_roles if r],
    }
    result = await admin_create_user(invite_body, user=user, invite_context=invite_context)
    await db.contacts.update_one({"contact_id": contact_id},
                                 {"$set": {"linked_user_id": result["user"]["user_id"], "updated_at": _now()}})
    await audit(user, "invite-contact", "contact", contact_id, contact["client_id"],
                meta={"email": email, "new_user_id": result["user"]["user_id"]})
    return result


@api.post("/users")
async def admin_create_user(body: UserCreateIn, user: Dict = Depends(get_current_user),
                            invite_context: Optional[Dict[str, Any]] = None):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only admins can create users")
    if not _admin_can_manage_role(user, body.role):
        raise HTTPException(403, f"You cannot assign role '{body.role}'")
    email = body.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(400, "Email already exists")
    # Platform admin can only invite into clients they can access.
    if user.get("role") == "platform_admin":
        for cid in body.client_ids:
            if not _can_access_client(user, cid):
                raise HTTPException(403, f"You cannot assign client {cid}")
    uid = _uid("user")
    status = "active" if body.password else "invited"
    doc = {
        "user_id": uid,
        "email": email,
        "name": body.name,
        "role": body.role,
        "client_ids": body.client_ids,
        "status": status,
        "created_at": _now(),
        "created_by": user["user_id"],
    }
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        doc["password_hash"] = hash_password(body.password)
    await db.users.insert_one(doc)
    await audit(user, "invite", "user", uid, meta={"email": email, "role": body.role, "client_ids": body.client_ids})
    # If no password given, generate a password-reset token so the invitee can set their own.
    invite_link = None
    if not body.password:
        raw = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw.encode()).hexdigest()
        await db.password_resets.insert_one({
            "user_id": uid, "token_hash": token_hash,
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            "used": False, "created_at": _now(),
        })
        base = (os.environ.get("APP_BASE_URL") or "").rstrip("/")
        if base:
            invite_link = f"{base}/reset-password?token={raw}"
            # Fire-and-forget invitation email; failures don't block user creation.
            try:
                from html import escape as _esc
                actor_name = user.get("name") or user.get("email") or "Your GRC team"
                ctx = invite_context or {}
                client_name = (ctx.get("client_name") or "").strip() or None
                grc_roles = [r for r in (ctx.get("grc_roles") or []) if r]
                role_phrase = ""
                if grc_roles:
                    label = grc_roles[0] if len(grc_roles) == 1 else (
                        ", ".join(grc_roles[:-1]) + f", and {grc_roles[-1]}"
                    )
                    role_phrase = f" as the <strong>{_esc(label)}</strong>"
                tenant_phrase = f" for <strong>{_esc(client_name)}</strong>" if client_name else ""
                subject = (
                    f"You're invited to Northstar GRC — {client_name}"
                    if client_name else "You're invited to Northstar GRC"
                )
                context_line = ""
                if client_name or grc_roles:
                    context_line = (
                        f'<p style="margin:0 0 16px 0;color:#334155">'
                        f'You have been invited{role_phrase}{tenant_phrase} to collaborate on '
                        f'their governance, risk, and compliance program.'
                        f'</p>'
                    )
                html = (
                    f'<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px">'
                    f'<h2 style="margin:0 0 12px 0;color:#0f172a">Welcome to Northstar GRC</h2>'
                    f'<p style="margin:0 0 12px 0;color:#334155">'
                    f'Hi {_esc(body.name)}, {_esc(actor_name)} has invited you to join Northstar GRC.'
                    f'</p>'
                    f'{context_line}'
                    f'<p style="margin:0 0 20px 0"><a href="{_esc(invite_link)}" '
                    f'style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;'
                    f'border-radius:6px;display:inline-block">Set your password</a></p>'
                    f'<p style="color:#94a3b8;font-size:12px;margin:0">'
                    f'This link expires in 7 days. We never ask for passwords or codes by email.'
                    f'</p>'
                    f'</div>'
                )
                await send_email(to=email, subject=subject, html=html)
            except Exception:
                pass
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    out = await db.users.find_one({"user_id": uid}, {"_id": 0, "password_hash": 0})
    return {"user": out, "invite_link": invite_link}


@api.patch("/users/{user_id}")
async def admin_update_user(user_id: str, body: UserPatchIn, user: Dict = Depends(get_current_user)):
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if not _admin_can_manage_user(user, target):
        raise HTTPException(403, "Not authorized to manage this user")
    updates: Dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.role is not None:
        if not _admin_can_manage_role(user, body.role):
            raise HTTPException(403, f"You cannot assign role '{body.role}'")
        updates["role"] = body.role
    if body.client_ids is not None:
        if user.get("role") == "platform_admin":
            # Platform admin cannot add clients they themselves cannot access.
            for cid in body.client_ids:
                if not _can_access_client(user, cid):
                    raise HTTPException(403, f"You cannot assign client {cid}")
        updates["client_ids"] = body.client_ids
    if body.status is not None:
        if body.status not in ("active", "invited", "disabled"):
            raise HTTPException(400, "Invalid status")
        updates["status"] = body.status
    # Guardrail: users cannot demote or disable themselves via this endpoint.
    if user_id == user["user_id"] and ("role" in updates or updates.get("status") == "disabled"):
        raise HTTPException(400, "You cannot change your own role or disable yourself")
    if not updates:
        target.pop("password_hash", None); target.pop("_id", None)
        return target
    updates["updated_at"] = _now()
    await db.users.update_one({"user_id": user_id}, {"$set": updates})
    # If disabling: revoke all sessions.
    if updates.get("status") == "disabled":
        await db.sessions.delete_many({"user_id": user_id})
        await db.users.update_one({"user_id": user_id}, {"$set": {"password_changed_at": _now()}})
    await audit(user, "update", "user", user_id, meta={"fields": list(updates.keys()), "new": {k: v for k, v in updates.items() if k != "updated_at"}})
    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return fresh


@api.get("/users/{user_id}/open_assignments")
async def user_open_assignments(user_id: str, user: Dict = Depends(get_current_user)):
    """Preview open records this user still owns — used before disabling/removing them."""
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if user.get("role") not in ("super_admin", "platform_admin") and user["user_id"] != user_id:
        raise HTTPException(403, "Not authorized")
    findings = await db.findings.count_documents({"owner_id": user_id, "status": {"$in": ["open", "in_remediation"]}})
    reviews = await db.reviews.count_documents({"$or": [{"owner_id": user_id}, {"reviewer_id": user_id}], "status": {"$nin": ["completed", "cancelled"]}})
    tasks = await db.tasks.count_documents({"$or": [{"assignee_id": user_id}, {"owner_id": user_id}], "status": {"$nin": ["done", "cancelled"]}})
    risks = await db.risks.count_documents({"owner_id": user_id, "status": {"$ne": "closed"}, "impact": "high"})
    return {"findings": findings, "reviews": reviews, "tasks": tasks, "significant_risks": risks}


@api.post("/users/{user_id}/resend-invite")
async def admin_resend_invite(user_id: str, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Not authorized")
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if not _admin_can_manage_user(user, target):
        raise HTTPException(403, "Not authorized to manage this user")
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    await db.password_resets.update_many({"user_id": user_id, "used": False}, {"$set": {"used": True, "used_at": _now()}})
    await db.password_resets.insert_one({
        "user_id": user_id, "token_hash": token_hash,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "used": False, "created_at": _now(),
    })
    base = (os.environ.get("APP_BASE_URL") or "").rstrip("/")
    invite_link = f"{base}/reset-password?token={raw}" if base else None
    await audit(user, "resend_invite", "user", user_id)
    return {"ok": True, "invite_link": invite_link}


# ---------------- Auth logout end ----------------


@api.get("/auth/me")
async def me(user: Dict = Depends(get_current_user)):
    return user


@api.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    async with httpx.AsyncClient(timeout=15) as hx:
        r = await hx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(401, "Invalid Google session")
        data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(400, "Google session missing email")
    google_admin = email in _google_admin_emails()
    admin_client_ids = []
    if google_admin:
        clients = await db.clients.find({"status": {"$ne": "archived"}}, {"_id": 0, "client_id": 1}).to_list(500)
        admin_client_ids = [client["client_id"] for client in clients]
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        # New Google identities are read-only unless explicitly allowlisted.
        role = "super_admin" if google_admin else "client_readonly"
        user_id = _uid("user")
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "role": role,
            "client_ids": admin_client_ids,
            "auth_provider": "google",
            "created_at": _now(),
        }
        await db.users.insert_one(user)
    else:
        updates = {"picture": data.get("picture"), "auth_provider": user.get("auth_provider") or "google"}
        if google_admin:
            # Repair identities that were auto-created as read-only before the
            # administrator allowlist was configured.
            updates.update({"role": "super_admin", "client_ids": admin_client_ids})
        await db.users.update_one({"email": email}, {"$set": updates})
        user.update(updates)
    # Create session
    session_token = data.get("session_token") or _uid("sess")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.sessions.insert_one({
        "session_token": session_token,
        "user_id": user["user_id"],
        "created_at": _now(),
        "expires_at": expires_at.isoformat(),
    })
    _set_auth_cookie(response, session_token, key="session_token")
    user.pop("password_hash", None)
    user.pop("_id", None)
    return {"user": user, "session_token": session_token}


# ---------------- Clients (tenants) ----------------
@api.get("/clients")
async def list_clients(
    include_archived: bool = Query(False),
    user: Dict = Depends(get_current_user),
):
    role = user.get("role")
    q: Dict = {} if role in ("super_admin", "platform_admin") else {"client_id": {"$in": user.get("client_ids") or []}}
    if not include_archived:
        q["status"] = {"$ne": "archived"}
    docs = await db.clients.find(q, {"_id": 0}).to_list(500)
    return docs


@api.post("/clients")
async def create_client(body: ClientIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform admins can create clients")
    cid = _uid("cli")
    doc = {
        "client_id": cid,
        "name": body.name,
        "industry": body.industry,
        "environment": body.environment or "Production",
        "status": body.status or "onboarding",
        "primary_contact": body.primary_contact,
        "assigned_owner_id": body.assigned_owner_id,
        "logo_url": body.logo_url,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.clients.insert_one(doc)
    await audit(user, "create", "client", cid, cid, meta={"name": body.name})
    doc.pop("_id", None)
    return doc


@api.patch("/clients/{client_id}")
async def update_client(client_id: str, body: ClientPatchIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform admins can edit clients")
    existing = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Client not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return existing
    updates["updated_at"] = _now()
    await db.clients.update_one({"client_id": client_id}, {"$set": updates})
    await audit(user, "update", "client", client_id, client_id, meta=updates)
    doc = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    return doc


@api.get("/clients/{client_id}/members")
async def client_members(client_id: str, user: Dict = Depends(get_current_user)):
    """Users associated with the tenant. Client users see only their client members; internal admins additionally see 'orphaned' users who still own records but are not formal members."""
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden")
    members = await db.users.find({"client_ids": client_id}, {"_id": 0, "password_hash": 0}).to_list(1000)
    known_ids = {u["user_id"] for u in members}
    if user.get("role") in ("super_admin", "platform_admin"):
        owner_ids: set = set()
        for coll in ("reviews", "findings", "risks", "tasks", "policies", "vendors", "assets", "exceptions"):
            for field in ("owner_id", "assignee_id"):
                docs = await db[coll].find(
                    {"client_id": client_id, field: {"$nin": [None, ""]}},
                    {field: 1, "_id": 0},
                ).to_list(20000)
                for d in docs:
                    v = d.get(field)
                    if v:
                        owner_ids.add(v)
        orphan_ids = owner_ids - known_ids
        if orphan_ids:
            orphans = await db.users.find(
                {"user_id": {"$in": list(orphan_ids)}},
                {"_id": 0, "password_hash": 0},
            ).to_list(500)
            for u in orphans:
                u["orphaned"] = True
            members.extend(orphans)
    members.sort(key=lambda u: (u.get("name") or u.get("email") or "").lower())
    return members

# ---------------- Generic list/create/update/delete factory ----------------
ENTITY_MAP = {
    "reviews": ("review", ReviewIn, "review_id", "rev"),
    "findings": ("finding", FindingIn, "finding_id", "fnd"),
    "risks": ("risk", RiskIn, "risk_id", "rsk"),
    "policies": ("policy", PolicyIn, "policy_id", "pol"),
    "vendors": ("vendor", VendorIn, "vendor_id", "ven"),
    "assets": ("asset", AssetIn, "asset_id", "ast"),
    "tasks": ("task", TaskIn, "task_id", "tsk"),
    "exceptions": ("exception", ExceptionIn, "exception_id", "exc"),
    "requirements": ("requirement", RequirementIn, "requirement_id", "req"),
    "contacts": ("contact", ContactIn, "contact_id", "cnt"),
}


def _coll_for(kind: str) -> str:
    return kind  # collection name equals plural


KIND_REGEX = "^(reviews|findings|risks|policies|vendors|assets|tasks|exceptions|requirements|contacts)$"
# Generic entity routes are registered at the END of the file so literal routes
# like /dashboard, /audit-logs, /users, /evidence, /comments take precedence.


# ---------------- Evidence ----------------
@api.get("/evidence")
async def list_evidence(client_id: Optional[str] = Query(None), linked_type: Optional[str] = None,
                        linked_id: Optional[str] = None, user: Dict = Depends(get_current_user)):
    q = _scope_filter(user, client_id)
    if linked_type: q["linked_type"] = linked_type
    if linked_id: q["linked_id"] = linked_id
    docs = await db.evidence.find(q, {"_id": 0, "content_base64": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api.post("/evidence")
async def create_evidence(body: EvidenceIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden")
    ev_id = _uid("ev")
    doc = {"evidence_id": ev_id, **body.model_dump(), "version": 1,
           "uploaded_by": user["user_id"], "uploaded_by_email": user["email"],
           "created_at": _now()}
    await db.evidence.insert_one(doc)
    await audit(user, "upload", "evidence", ev_id, body.client_id, meta={"filename": body.filename})
    doc.pop("_id", None)
    doc.pop("content_base64", None)
    return doc


@api.get("/evidence/{ev_id}/download")
async def download_evidence(ev_id: str, user: Dict = Depends(get_current_user)):
    doc = await db.evidence.find_one({"evidence_id": ev_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    if not _can_access_client(user, doc["client_id"]):
        raise HTTPException(403, "Forbidden")
    return {"filename": doc["filename"], "mime_type": doc.get("mime_type"),
            "content_base64": doc["content_base64"]}


@api.delete("/evidence/{ev_id}")
async def delete_evidence(ev_id: str, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Destructive action restricted")
    doc = await db.evidence.find_one({"evidence_id": ev_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    await db.evidence.delete_one({"evidence_id": ev_id})
    await audit(user, "delete", "evidence", ev_id, doc.get("client_id"))
    return {"ok": True}


# ---------------- Comments ----------------
@api.get("/comments")
async def list_comments(entity_type: str, entity_id: str, user: Dict = Depends(get_current_user)):
    docs = await db.comments.find({"entity_type": entity_type, "entity_id": entity_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs


@api.post("/comments")
async def create_comment(body: CommentIn, user: Dict = Depends(get_current_user)):
    cid = _uid("cmt")
    doc = {"comment_id": cid, **body.model_dump(),
           "user_id": user["user_id"], "user_email": user["email"], "user_name": user.get("name"),
           "created_at": _now()}
    await db.comments.insert_one(doc)
    doc.pop("_id", None)
    # Detect @mentions and notify — supports @email and @name (case-insensitive).
    import re as _re
    mentioned = set(m.lstrip("@").lower() for m in _re.findall(r"@[\w.+\-@]+", body.body or ""))
    if mentioned:
        parent = None
        try:
            parent_coll = body.entity_type if body.entity_type.endswith("s") else body.entity_type + "s"
            id_field = ID_FIELD_MAP.get(parent_coll)
            if id_field:
                parent = await db[parent_coll].find_one({id_field: body.entity_id}, {"_id": 0})
        except Exception:
            parent = None
        users_cur = db.users.find({}, {"_id": 0, "password_hash": 0})
        async for u in users_cur:
            keys = {(u.get("email") or "").lower(), (u.get("name") or "").lower()}
            if keys & mentioned:
                await create_notification(
                    user_id=u["user_id"],
                    title=f"{user.get('name') or user['email']} mentioned you on a {body.entity_type[:-1] if body.entity_type.endswith('s') else body.entity_type}",
                    kind="mention",
                    entity_type=body.entity_type,
                    entity_id=body.entity_id,
                    client_id=(parent or {}).get("client_id"),
                )
    return doc


# ---------------- Audit log ----------------
# Human-readable labels are computed on the frontend so the raw event codes stay
# intact in the DB for immutability/traceability.

_AUDIT_ACTION_BUCKETS: Dict[str, List[str]] = {
    # user-facing category -> list of raw action codes it collapses to
    "create": ["create"],
    "update": ["update"],
    "delete": ["delete"],
    "assign": ["assign", "bulk-assign"],
    "approve": ["approve", "policy-approve"],
    "complete": ["complete", "review-complete", "onboarding-complete"],
    "upload": ["upload", "evidence-upload"],
    "invite": ["invite", "invite-contact", "resend_invite"],
    "auth": ["login", "logout", "password_change", "password_reset"],
    "permission": ["role_change", "client_access_change", "disable", "enable"],
    "onboarding": [
        "onboarding-response", "onboarding-contact", "onboarding-assessment",
        "onboarding-known-issue", "onboarding-review", "onboarding-complete", "baseline",
    ],
}


def _audit_actions_for_bucket(bucket: str) -> List[str]:
    return _AUDIT_ACTION_BUCKETS.get(bucket, [])


async def _audit_scope_for(user: Dict) -> Optional[List[str]]:
    """Return the list of client_ids the viewer may see audit events for, or
    None if the viewer can see ALL clients (super_admin only). Non-admins get
    an empty list — the endpoint should 403 before calling this."""
    role = user.get("role")
    if role == "super_admin":
        return None
    if role == "platform_admin":
        return list(user.get("client_ids") or [])
    return []


@api.get("/audit-logs")
async def list_audit(
    client_id: Optional[str] = Query(None, description="Client tenant id, 'platform' for platform-only, or omit for all."),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None, description="User-facing bucket (create/update/…/onboarding) OR a raw event code."),
    entity_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None, description="ISO date/datetime lower bound (inclusive)."),
    end_date: Optional[str] = Query(None, description="ISO date/datetime upper bound (inclusive)."),
    q: Optional[str] = Query(None, description="Free-text search over action/entity/user/id."),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: Dict = Depends(get_current_user),
):
    """Unified, authoritative audit log endpoint. Admins only.

    Filters: client_id ('platform' means null client_id), user_id, action (bucket
    or raw code), entity_type, start_date/end_date (ISO), q (search).
    Server-side paginated. Returns `{items, total, page, page_size}` with
    every item enriched with user_name + client_name.
    """
    role = user.get("role")
    if role not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Audit Log is restricted to internal administrators")

    scope = await _audit_scope_for(user)
    mongo_q: Dict[str, Any] = {}

    # Client filter
    if client_id == "platform":
        mongo_q["$or"] = [{"client_id": None}, {"client_id": {"$exists": False}}]
    elif client_id:
        if scope is not None and client_id not in scope:
            raise HTTPException(403, "Not authorized for this client")
        mongo_q["client_id"] = client_id
    else:
        # No explicit client filter — restrict platform_admin to their allowed clients
        # PLUS platform-scope (null) events. Super admin sees everything.
        if scope is not None:
            mongo_q["$or"] = [
                {"client_id": {"$in": scope}},
                {"client_id": None},
                {"client_id": {"$exists": False}},
            ]

    if user_id:
        mongo_q["user_id"] = user_id
    if entity_type:
        mongo_q["entity_type"] = entity_type
    if action:
        codes = _audit_actions_for_bucket(action)
        mongo_q["action"] = {"$in": codes} if codes else action
    if start_date or end_date:
        rng: Dict[str, Any] = {}
        if start_date: rng["$gte"] = start_date
        if end_date: rng["$lte"] = end_date
        mongo_q["at"] = rng
    if q:
        needle = re.escape(q.strip())
        rex = {"$regex": needle, "$options": "i"}
        mongo_q.setdefault("$and", []).append({"$or": [
            {"action": rex}, {"entity_type": rex}, {"entity_id": rex},
            {"user_email": rex}, {"user_name": rex}, {"client_id": rex},
        ]})

    total = await db.audit_logs.count_documents(mongo_q)
    skip = (page - 1) * page_size
    docs = await db.audit_logs.find(mongo_q, {"_id": 0}).sort("at", -1).skip(skip).limit(page_size).to_list(page_size)

    # Enrich with user_name + client_name via bulk lookups (bounded by page_size).
    uids = list({d.get("user_id") for d in docs if d.get("user_id")})
    cids = list({d.get("client_id") for d in docs if d.get("client_id")})
    users_map = {}
    clients_map = {}
    if uids:
        for u in await db.users.find({"user_id": {"$in": uids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(len(uids)):
            users_map[u["user_id"]] = u
    if cids:
        for c in await db.clients.find({"client_id": {"$in": cids}}, {"_id": 0, "client_id": 1, "name": 1}).to_list(len(cids)):
            clients_map[c["client_id"]] = c
    for d in docs:
        u = users_map.get(d.get("user_id")) or {}
        c = clients_map.get(d.get("client_id")) or {}
        d["user_name"] = d.get("user_name") or u.get("name") or u.get("email") or d.get("user_email")
        d["client_name"] = c.get("name") if c else None
    return {"items": docs, "total": total, "page": page, "page_size": page_size}


@api.get("/audit-logs/facets")
async def audit_facets(user: Dict = Depends(get_current_user)):
    """Return the filter options (clients, users, entity_types) the viewer is
    authorized to see. Actions are a static bucket list rendered on the client."""
    role = user.get("role")
    if role not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Audit Log is restricted to internal administrators")

    scope = await _audit_scope_for(user)
    client_q: Dict[str, Any] = {"status": {"$ne": "archived"}}
    if scope is not None:
        client_q["client_id"] = {"$in": scope}
    clients = await db.clients.find(client_q, {"_id": 0, "client_id": 1, "name": 1}).sort("name", 1).to_list(500)

    audit_scope_q: Dict[str, Any] = {}
    if scope is not None:
        audit_scope_q["$or"] = [
            {"client_id": {"$in": scope}},
            {"client_id": None},
            {"client_id": {"$exists": False}},
        ]
    entity_types = sorted([e for e in await db.audit_logs.distinct("entity_type", audit_scope_q) if e])

    # Actor list — restrict to users who have logged at least one event within the
    # viewer's authorized scope (keeps the dropdown practical).
    actor_ids = [x for x in await db.audit_logs.distinct("user_id", audit_scope_q) if x]
    actors: List[Dict[str, Any]] = []
    if actor_ids:
        actor_docs = await db.users.find({"user_id": {"$in": actor_ids}}, {"_id": 0, "user_id": 1, "name": 1, "email": 1}).to_list(1000)
        by_id = {a["user_id"]: a for a in actor_docs}
        for uid in actor_ids:
            u = by_id.get(uid, {})
            actors.append({
                "user_id": uid,
                "name": u.get("name") or u.get("email") or uid,
                "email": u.get("email"),
            })
        actors.sort(key=lambda a: (a["name"] or "").lower())

    action_buckets = [{"value": k, "codes": v} for k, v in _AUDIT_ACTION_BUCKETS.items()]
    return {"clients": clients, "users": actors, "entity_types": entity_types, "action_buckets": action_buckets}


@api.get("/audit-logs/export.csv")
async def export_audit_csv(
    client_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    entity_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    user: Dict = Depends(get_current_user),
):
    """Export the currently filtered audit view as CSV. Applies the same
    scoping/authorization as the list endpoint. Capped at 10k rows."""
    # Reuse the list endpoint's filter machinery to avoid drift.
    result = await list_audit(  # type: ignore[arg-type]
        client_id=client_id, user_id=user_id, action=action, entity_type=entity_type,
        start_date=start_date, end_date=end_date, q=q,
        page=1, page_size=200, user=user,
    )
    total = min(result.get("total", 0), 10000)
    rows = list(result.get("items", []))
    # Additional pages
    fetched = len(rows)
    page = 2
    while fetched < total and page <= 50:  # 50 * 200 = 10000
        r = await list_audit(  # type: ignore[arg-type]
            client_id=client_id, user_id=user_id, action=action, entity_type=entity_type,
            start_date=start_date, end_date=end_date, q=q,
            page=page, page_size=200, user=user,
        )
        rows.extend(r.get("items", []))
        fetched = len(rows)
        page += 1

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Timestamp", "Client", "Client ID", "User", "Email", "Action",
        "Entity Type", "Entity ID", "Meta",
    ])
    for r in rows:
        writer.writerow([
            r.get("at") or "",
            r.get("client_name") or ("Platform" if not r.get("client_id") else ""),
            r.get("client_id") or "",
            r.get("user_name") or r.get("user_email") or "",
            r.get("user_email") or "",
            r.get("action") or "",
            r.get("entity_type") or "",
            r.get("entity_id") or "",
            (r.get("meta") and __import__("json").dumps(r.get("meta"))) or "",
        ])
    csv_bytes = buf.getvalue().encode("utf-8")
    await audit(user, "export", "audit-log", "csv", meta={
        "rows": len(rows),
        "filters": {"client_id": client_id, "user_id": user_id, "action": action,
                     "entity_type": entity_type, "start_date": start_date,
                     "end_date": end_date, "q": q},
    })
    return StreamingResponse(iter([csv_bytes]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'})


# ---------------- Users (admin) ----------------
@api.get("/users")
async def list_users(user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Forbidden")
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return docs


# ---------------- Dashboard ----------------
_PRIMARY_OWNER_FIELDS = {
    "reviews": ("owner_id", "reviewer_id"),
    "findings": ("owner_id",),
    "risks": ("owner_id",),
    "tasks": ("assignee_id", "owner_id"),
    "policies": ("owner_id", "approver_id"),
    "vendors": ("owner_id",),
    "assets": ("owner_id",),
    "exceptions": ("owner_id", "approver_id"),
}


def _owner_match(item: Dict, kind: str, uid: str) -> bool:
    for f in _PRIMARY_OWNER_FIELDS.get(kind, ("owner_id", "assignee_id")):
        if item.get(f) == uid:
            return True
    return False


def _is_unassigned(item: Dict, kind: str) -> bool:
    for f in _PRIMARY_OWNER_FIELDS.get(kind, ("owner_id", "assignee_id")):
        if item.get(f):
            return False
    return True


@api.get("/dashboard")
async def dashboard(
    client_id: Optional[str] = Query(None),
    scope: Optional[str] = Query("org"),  # org | mine | user | unassigned
    user_id: Optional[str] = Query(None),
    user: Dict = Depends(get_current_user),
):
    scope = (scope or "org").lower()
    if scope not in ("org", "mine", "user", "unassigned"):
        raise HTTPException(400, "Invalid scope")

    # Resolve target user for the person filter.
    target_uid: Optional[str] = None
    target_user: Optional[Dict] = None
    if scope == "mine":
        target_uid = user["user_id"]
        target_user = {"user_id": user["user_id"], "name": user.get("name"), "email": user.get("email")}
    elif scope == "user":
        if not user_id:
            raise HTTPException(400, "user_id required for scope=user")
        target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        if not target:
            raise HTTPException(404, "User not found")
        # Enforce: target must be a member of the client being viewed (or be an internal admin).
        if client_id:
            if target.get("role") not in ("super_admin", "platform_admin"):
                if client_id not in (target.get("client_ids") or []):
                    raise HTTPException(403, "User is not a member of this client")
        # Client users may only view assignments for members of their own client, and only themselves
        # unless their role explicitly permits viewing others (contributor/read-only can see themselves).
        if user.get("role") in ("client_contributor", "client_readonly") and user_id != user["user_id"]:
            raise HTTPException(403, "Not authorized to view another user's assignments")
        target_uid = user_id
        target_user = target
    elif scope == "unassigned":
        # Only internal admins can view unassigned records portfolio-wide.
        if user.get("role") not in ("super_admin", "platform_admin"):
            raise HTTPException(403, "Unassigned view is restricted to internal admins")

    scope_filter = _scope_filter(user, client_id)
    now_iso = _now()
    horizon = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    # Fetch minimal working sets once, filter in Python — saves round-trips.
    reviews = await db.reviews.find(scope_filter, {"_id": 0}).sort("due_date", 1).to_list(2000)
    findings = await db.findings.find(scope_filter, {"_id": 0}).sort("created_at", -1).to_list(2000)
    risks = await db.risks.find(scope_filter, {"_id": 0}).sort("created_at", -1).to_list(2000)
    policies = await db.policies.find(scope_filter, {"_id": 0}).to_list(1000)
    vendors = await db.vendors.find(scope_filter, {"_id": 0}).to_list(1000)
    tasks = await db.tasks.find(scope_filter, {"_id": 0}).sort("due_date", 1).to_list(1000)
    exceptions = await db.exceptions.find(scope_filter, {"_id": 0}).to_list(500)

    # Apply person / unassigned filter to each collection so all downstream KPIs are naturally scoped.
    if scope == "unassigned":
        reviews = [r for r in reviews if _is_unassigned(r, "reviews") and r.get("status") not in ("completed", "cancelled")]
        findings = [f for f in findings if _is_unassigned(f, "findings") and f.get("status") in ("open", "in_remediation")]
        risks = [r for r in risks if _is_unassigned(r, "risks") and r.get("status") != "closed"]
        tasks = [t for t in tasks if _is_unassigned(t, "tasks") and t.get("status") not in ("done", "cancelled")]
        policies = [p for p in policies if _is_unassigned(p, "policies")]
        vendors = [v for v in vendors if _is_unassigned(v, "vendors")]
        exceptions = [e for e in exceptions if _is_unassigned(e, "exceptions")]
    elif target_uid:
        reviews = [r for r in reviews if _owner_match(r, "reviews", target_uid)]
        findings = [f for f in findings if _owner_match(f, "findings", target_uid)]
        risks = [r for r in risks if _owner_match(r, "risks", target_uid)]
        tasks = [t for t in tasks if _owner_match(t, "tasks", target_uid)]
        policies = [p for p in policies if _owner_match(p, "policies", target_uid)]
        vendors = [v for v in vendors if _owner_match(v, "vendors", target_uid)]
        exceptions = [e for e in exceptions if _owner_match(e, "exceptions", target_uid)]

    def is_overdue(item, date_field="due_date", closed_statuses=("completed", "done", "closed", "remediated", "retired", "cancelled")):
        d = item.get(date_field)
        return bool(d and d < now_iso and item.get("status") not in closed_statuses)

    overdue_reviews = [r for r in reviews if is_overdue(r)]
    overdue_findings = [f for f in findings if is_overdue(f)]
    overdue_tasks = [t for t in tasks if is_overdue(t)]
    open_findings = [f for f in findings if f.get("status") in ("open", "in_remediation")]
    critical_high = [f for f in open_findings if f.get("severity") in ("high", "critical")]
    significant_risks = [r for r in risks if (r.get("impact") == "high" or (r.get("risk_level") in ("high", "critical"))) and r.get("status") != "closed"]

    # Risks needing reassessment: last_reviewed older than 12 months, or never reviewed and identified >12 months ago.
    twelve_months_ago = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
    def _stale(r):
        if r.get("status") in ("closed",):
            return False
        lr = r.get("last_reviewed") or r.get("date_identified") or r.get("created_at")
        return bool(lr and lr < twelve_months_ago)
    stale_risks = [r for r in risks if _stale(r)]

    upcoming_reviews = [r for r in reviews
                        if r.get("due_date") and now_iso <= r["due_date"] <= horizon
                        and r.get("status") not in ("completed", "cancelled")]
    upcoming_tasks_30 = [t for t in tasks if t.get("due_date") and now_iso <= t["due_date"] <= horizon and t.get("status") != "done"]
    policies_due_30 = [p for p in policies if p.get("next_review_date") and now_iso <= p["next_review_date"] <= horizon]
    due_next_30_count = len(upcoming_reviews) + len(upcoming_tasks_30) + len(policies_due_30)

    def _brief(item, kind, id_field, title_field="title"):
        return {
            "id": item.get(id_field), "kind": kind,
            "title": item.get(title_field), "status": item.get("status"),
            "severity": item.get("severity"), "priority": item.get("priority"),
            "due_date": item.get("due_date"),
            "owner_id": item.get("owner_id") or item.get("assignee_id"),
            "review_type": item.get("review_type"),
        }

    # Needs Your Attention — prioritized composite
    needs: List[Dict] = []
    # Priority 1: critical findings (overdue first)
    crit_overdue = [f for f in critical_high if is_overdue(f) and f.get("severity") == "critical"]
    crit_other = [f for f in critical_high if f.get("severity") == "critical" and f not in crit_overdue]
    high_overdue = [f for f in critical_high if is_overdue(f) and f.get("severity") == "high"]
    high_other = [f for f in critical_high if f.get("severity") == "high" and f not in high_overdue]
    for f in crit_overdue + crit_other:
        needs.append({**_brief(f, "finding", "finding_id"), "priority_tone": "critical", "action": "View finding"})
    for r in overdue_reviews:
        needs.append({**_brief(r, "review", "review_id"), "priority_tone": "critical", "action": "Start review"})
    for f in high_overdue + high_other:
        needs.append({**_brief(f, "finding", "finding_id"), "priority_tone": "high", "action": "View finding"})
    for t in overdue_tasks:
        needs.append({**_brief(t, "task", "task_id"), "priority_tone": "high", "action": "Continue"})
    # Stale risks: not reviewed in >12 months → surface for reassessment.
    for r in stale_risks[:5]:
        needs.append({**_brief(r, "risk", "risk_id"), "priority_tone": "info", "action": "Mark reviewed"})
    for p in policies:
        if p.get("status") == "in_review":
            needs.append({**_brief(p, "policy", "policy_id"), "priority_tone": "info", "action": "Approve"})
    for e in exceptions:
        if e.get("status") == "requested":
            needs.append({**_brief(e, "exception", "exception_id"), "priority_tone": "info", "action": "Review"})
    needs = needs[:10]

    # Priority Findings — critical/high/overdue/due-soon
    horizon14 = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    priority_findings = [
        _brief(f, "finding", "finding_id") for f in open_findings
        if f.get("severity") in ("high", "critical")
        or is_overdue(f)
        or (f.get("due_date") and f["due_date"] <= horizon14)
    ][:8]

    # Your Actions — items owned/assigned to the scope target (defaults to viewer for org/unassigned).
    # When the dashboard is scoped to a user (mine/user), all collections above are already pre-filtered
    # to that person's assignments, so this becomes their action queue. For scope=unassigned we return
    # an empty list because there is no owner to attribute actions to.
    actions_uid = target_uid if target_uid else user["user_id"]
    def mine(items, open_statuses, kind):
        if scope == "unassigned":
            return []
        return [i for i in items if _owner_match(i, kind, actions_uid) and i.get("status") in open_statuses]
    your_actions = (
        [{**_brief(x, "finding", "finding_id"), "action": "Respond"} for x in mine(findings, ("open", "in_remediation"), "findings")]
        + [{**_brief(x, "task", "task_id"), "action": "Continue"} for x in mine(tasks, ("open", "in_progress", "blocked"), "tasks")]
        + [{**_brief(x, "review", "review_id"), "action": "Start review"} for x in mine(reviews, ("upcoming", "in_progress"), "reviews")]
    )
    your_actions.sort(key=lambda x: x.get("due_date") or "9999")
    your_actions = your_actions[:8]

    # Upcoming & Watch — future obligations that don't need action yet
    watch: List[Dict] = []
    horizon60 = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
    horizon90 = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    for p in policies:
        d = p.get("next_review_date")
        if d and now_iso <= d <= horizon90:
            watch.append({"id": p["policy_id"], "kind": "policy", "title": f"Policy review · {p['title']}", "due_date": d, "status": p.get("status")})
    for v in vendors:
        d = v.get("contract_end")
        if d and now_iso <= d <= horizon90:
            watch.append({"id": v["vendor_id"], "kind": "vendor", "title": f"Vendor contract end · {v['name']}", "due_date": d, "status": v.get("status")})
    for r in reviews:
        d = r.get("next_review_date")
        if d and horizon <= d <= horizon90 and r.get("recurrence") not in (None, "none"):
            watch.append({"id": r["review_id"], "kind": "review", "title": f"Next {r.get('review_type','')} review · {r['title']}", "due_date": d, "status": r.get("status")})
    for e in exceptions:
        d = e.get("expires_at")
        if d and now_iso <= d <= horizon60 and e.get("status") == "approved":
            watch.append({"id": e["exception_id"], "kind": "exception", "title": f"Exception expires · {e['title']}", "due_date": d, "status": e.get("status")})
    watch.sort(key=lambda x: x.get("due_date") or "9999")
    watch = watch[:8]

    # Program Status
    program_status = [
        {"area": "Reviews", "detail": f"{len(overdue_reviews)} overdue"},
        {"area": "Findings", "detail": f"{len(overdue_findings)} overdue · {len(critical_high)} critical/high"},
        {"area": "Risks", "detail": f"{len(significant_risks)} significant"},
        {"area": "Policies", "detail": f"{len([p for p in policies if p.get('next_review_date') and p['next_review_date'] <= horizon])} reviews due"},
        {"area": "Vendors", "detail": f"{len([v for v in vendors if v.get('status') == 'under_review'])} under review"},
        {"area": "Tasks", "detail": f"{len([t for t in tasks if t.get('status') in ('open','in_progress','blocked')])} open"},
    ]

    # Recent activity — from audit_logs, filtered to meaningful entities
    activity_scope = {"client_id": {"$in": (user.get("client_ids") or [])}} if user.get("role") not in ("super_admin", "platform_admin") else ({"client_id": client_id} if client_id else {})
    logs = await db.audit_logs.find({**activity_scope, "action": {"$nin": ["update"]}}, {"_id": 0}).sort("at", -1).limit(10).to_list(10)

    # Human-friendly scope label used by the dashboard header.
    if scope == "org":
        scope_label = None
    elif scope == "unassigned":
        scope_label = "Unassigned records"
    elif scope == "mine":
        scope_label = "Your assigned work"
    else:
        who = (target_user or {}).get("name") or (target_user or {}).get("email") or "user"
        scope_label = f"GRC items assigned to {who}"

    return {
        "kpis": {
            # legacy keys (kept for regression)
            "overdue_reviews": len(overdue_reviews),
            "open_findings": len(open_findings),
            "critical_findings": len(critical_high),
            "significant_risks": len(significant_risks),
            # new keys
            "overdue_actions": len(overdue_reviews) + len(overdue_findings) + len(overdue_tasks),
            "critical_high_findings": len(critical_high),
            "due_next_30": due_next_30_count,
        },
        "scope": scope,
        "scope_label": scope_label,
        "target_user": (
            {"user_id": target_user.get("user_id"), "name": target_user.get("name"), "email": target_user.get("email")}
            if target_user else None
        ),
        "needs_attention": needs,
        "priority_findings": priority_findings,
        "your_actions": your_actions,
        "watch_items": watch,
        "program_status": program_status,
        "recent_activity": logs,
        "upcoming_reviews": [_brief(r, "review", "review_id") for r in upcoming_reviews[:8]],
        "recent_findings": [_brief(f, "finding", "finding_id") for f in open_findings[:8]],
        "top_risks": [_brief(r, "risk", "risk_id") for r in significant_risks[:6]],
        "assurance_alerts": _assurance_alerts_for(vendors),
    }


_ASSURANCE_ISSUE_STATUSES = ("expired", "expiring", "missing", "requested")


def _assurance_alerts_for(vendors: List[Dict], within_days: int = 60) -> List[Dict]:
    """Vendors whose SOC2/ISO/DPA assurance is expiring within `within_days`
    OR whose assurance_status flags a concern (missing/expired/requested).
    Returned sorted by soonest-expiring first."""
    horizon = (datetime.now(timezone.utc) + timedelta(days=within_days)).isoformat()
    now_iso = _now()
    out: List[Dict] = []
    for v in vendors:
        if (v.get("status") or "active") in ("inactive", "offboarding", "terminated"):
            continue
        expires_at = v.get("assurance_expires_at")
        status_flag = (v.get("assurance_status") or "").lower() in _ASSURANCE_ISSUE_STATUSES
        expiring_soon = bool(expires_at and expires_at <= horizon)
        overdue = bool(expires_at and expires_at < now_iso)
        if not (expiring_soon or status_flag):
            continue
        out.append({
            "vendor_id": v.get("vendor_id"),
            "name": v.get("name"),
            "criticality": v.get("criticality"),
            "assurance_status": v.get("assurance_status"),
            "assurance_expires_at": expires_at,
            "business_owner_id": v.get("business_owner_id"),
            "overdue": overdue,
        })
    out.sort(key=lambda x: (0 if x.get("overdue") else 1, x.get("assurance_expires_at") or "9999"))
    return out[:8]


# ---------------- Startup: seed ----------------
async def seed():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("client_id", unique=True)
    for coll in ["reviews", "findings", "risks", "policies", "vendors", "assets", "tasks", "evidence"]:
        await db[coll].create_index("client_id")
    await db.password_resets.create_index("token_hash", unique=True)
    await db.sessions.create_index("session_token", unique=True)

    # Seed credentials are environment-controlled.  The fallback values are
    # intentionally non-production placeholders and must never be used as
    # operational credentials.
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.test").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "TEST_ONLY_ADMIN_PASSWORD")
    demo_password = os.environ.get("DEMO_USER_PASSWORD", "TEST_ONLY_PASSWORD")
    platform_admin_email = os.environ.get("PLATFORM_ADMIN_EMAIL", "platform-admin@example.test").lower()
    acme_contributor_email = os.environ.get("ACME_CONTRIBUTOR_EMAIL", "acme-contributor@example.test").lower()
    acme_readonly_email = os.environ.get("ACME_READONLY_EMAIL", "acme-readonly@example.test").lower()
    globex_contributor_email = os.environ.get("GLOBEX_CONTRIBUTOR_EMAIL", "globex-contributor@example.test").lower()

    # Tenants
    acme = await db.clients.find_one({"name": "Acme Corp"}, {"_id": 0})
    if not acme:
        acme = {"client_id": _uid("cli"), "name": "Acme Corp", "industry": "Manufacturing", "environment": "Production", "status": "active", "created_at": _now()}
        await db.clients.insert_one(acme)
    globex = await db.clients.find_one({"name": "Globex Ltd"}, {"_id": 0})
    if not globex:
        globex = {"client_id": _uid("cli"), "name": "Globex Ltd", "industry": "Fintech", "environment": "Production", "status": "active", "created_at": _now()}
        await db.clients.insert_one(globex)

    # Backfill status for legacy tenants (any client without a status → active).
    await db.clients.update_many({"status": {"$in": [None, ""]}}, {"$set": {"status": "active"}})
    await db.clients.update_many({"status": {"$exists": False}}, {"$set": {"status": "active"}})

    async def ensure_user(email, name, role, client_ids, password=None):
        u = await db.users.find_one({"email": email})
        if u:
            # Keep demo role/tenant assignments aligned without undoing profile
            # edits or password changes made through the account settings.
            update = {"role": role, "client_ids": client_ids}
            await db.users.update_one({"email": email}, {"$set": update})
            return u["user_id"]
        uid = _uid("user")
        doc = {"user_id": uid, "email": email, "name": name, "role": role,
               "client_ids": client_ids, "auth_provider": "password",
               "password_hash": hash_password(password) if password else None,
               "created_at": _now()}
        await db.users.insert_one(doc)
        return uid

    admin_uid = await ensure_user(admin_email, os.environ.get("ADMIN_NAME", "Robb Shea"), "super_admin", [acme["client_id"], globex["client_id"]], admin_password)
    pa_uid = await ensure_user(platform_admin_email, "Platform Admin", "platform_admin", [acme["client_id"], globex["client_id"]], demo_password)
    c_acme = await ensure_user(acme_contributor_email, "Alicia Rivera", "client_contributor", [acme["client_id"]], demo_password)
    r_acme = await ensure_user(acme_readonly_email, "Ravi Kumar", "client_readonly", [acme["client_id"]], demo_password)
    c_glob = await ensure_user(globex_contributor_email, "Chen Wei", "client_contributor", [globex["client_id"]], demo_password)

    # Migration: normalize legacy review statuses (planned/blocked/overdue → upcoming)
    await db.reviews.update_many({"status": {"$in": ["planned", "blocked", "overdue"]}}, {"$set": {"status": "upcoming"}})

    # Seed data only once
    if await db.reviews.count_documents({}) > 0:
        return

    def isod(days_offset=0):
        return (datetime.now(timezone.utc) + timedelta(days=days_offset)).isoformat()

    def mk(kind, id_prefix, id_field, **fields):
        doc = {id_field: _uid(id_prefix), **fields, "created_at": _now(), "updated_at": _now(), "created_by": admin_uid}
        return doc

    # Reviews (mix of types, statuses, due dates)
    reviews = []
    for tenant, own in [(acme, c_acme), (globex, c_glob)]:
        reviews += [
            mk("reviews", "rev", "review_id", title=f"Quarterly Access Review — {tenant['name']}",
               review_type="access", client_id=tenant["client_id"], period="Q1", due_date=isod(-3),
               owner_id=own, reviewer_id=pa_uid, status="upcoming", scope="All privileged accounts",
               recurrence="quarterly", next_review_date=isod(90)),
            mk("reviews", "rev", "review_id", title=f"Vendor Review — Primary SaaS providers",
               review_type="vendor", client_id=tenant["client_id"], due_date=isod(12), owner_id=own,
               status="in_progress", recurrence="annual"),
            mk("reviews", "rev", "review_id", title="Patch & Vulnerability Review",
               review_type="vulnerability", client_id=tenant["client_id"], due_date=isod(21),
               owner_id=own, status="upcoming", recurrence="monthly"),
            mk("reviews", "rev", "review_id", title="Policy Review — Information Security Policy",
               review_type="policy", client_id=tenant["client_id"], due_date=isod(45),
               owner_id=own, status="upcoming", recurrence="annual"),
            mk("reviews", "rev", "review_id", title="BCP / DR Tabletop Exercise",
               review_type="bcp_dr", client_id=tenant["client_id"], due_date=isod(60),
               owner_id=own, status="upcoming", recurrence="semiannual"),
            mk("reviews", "rev", "review_id", title="Security Awareness Training Review",
               review_type="awareness", client_id=tenant["client_id"], due_date=isod(-10),
               owner_id=own, status="upcoming", recurrence="quarterly"),
        ]
    await db.reviews.insert_many(reviews)

    # Findings
    findings = []
    for tenant, own in [(acme, c_acme), (globex, c_glob)]:
        findings += [
            mk("findings", "fnd", "finding_id", title="Stale privileged accounts found in AD",
               client_id=tenant["client_id"], severity="high", status="open", owner_id=own, due_date=isod(14),
               description="7 privileged accounts inactive > 90 days.",
               remediation_plan="Disable and remove after owner confirmation."),
            mk("findings", "fnd", "finding_id", title="Vendor SOC 2 report missing",
               client_id=tenant["client_id"], severity="medium", status="in_remediation",
               owner_id=own, due_date=isod(20)),
            mk("findings", "fnd", "finding_id", title="Critical CVE patch overdue on payroll server",
               client_id=tenant["client_id"], severity="critical", status="open", owner_id=own, due_date=isod(-2)),
            mk("findings", "fnd", "finding_id", title="Policy not signed by three department heads",
               client_id=tenant["client_id"], severity="low", status="open", owner_id=own, due_date=isod(30)),
        ]
    await db.findings.insert_many(findings)

    # Risks
    risks = []
    for tenant, own in [(acme, c_acme), (globex, c_glob)]:
        risks += [
            mk("risks", "rsk", "risk_id", title="Ransomware disruption to core systems",
               client_id=tenant["client_id"], category="cybersecurity", likelihood="medium", impact="high",
               status="assessed", owner_id=own, treatment="Immutable backups + EDR + tabletop"),
            mk("risks", "rsk", "risk_id", title="Third-party payroll processor outage",
               client_id=tenant["client_id"], category="vendor", likelihood="low", impact="high",
               status="treated", owner_id=own),
            mk("risks", "rsk", "risk_id", title="Insider misuse of admin credentials",
               client_id=tenant["client_id"], category="operational", likelihood="medium", impact="medium",
               status="identified", owner_id=own),
        ]
    await db.risks.insert_many(risks)

    # Policies
    policies = []
    for tenant, own in [(acme, c_acme), (globex, c_glob)]:
        policies += [
            mk("policies", "pol", "policy_id", title="Information Security Policy",
               client_id=tenant["client_id"], version="2.3", status="approved", owner_id=own,
               approver_id=pa_uid, approved_at=isod(-120), next_review_date=isod(245)),
            mk("policies", "pol", "policy_id", title="Access Control Policy",
               client_id=tenant["client_id"], version="1.4", status="in_review", owner_id=own,
               next_review_date=isod(40)),
            mk("policies", "pol", "policy_id", title="Incident Response Plan",
               client_id=tenant["client_id"], version="1.0", status="approved", owner_id=own,
               approved_at=isod(-60), next_review_date=isod(305)),
        ]
    await db.policies.insert_many(policies)

    # Vendors
    vendors = []
    for tenant in [acme, globex]:
        vendors += [
            mk("vendors", "ven", "vendor_id", name="CloudCore SaaS", client_id=tenant["client_id"],
               criticality="high", status="active", contact_email="security@cloudcore.example",
               services="Primary CRM & data storage", contract_end=isod(200)),
            mk("vendors", "ven", "vendor_id", name="PayrollPro", client_id=tenant["client_id"],
               criticality="critical", status="active", services="Payroll processing", contract_end=isod(90)),
            mk("vendors", "ven", "vendor_id", name="MailerX", client_id=tenant["client_id"],
               criticality="medium", status="under_review", services="Transactional email"),
        ]
    await db.vendors.insert_many(vendors)

    # Assets
    assets = []
    for tenant in [acme, globex]:
        assets += [
            mk("assets", "ast", "asset_id", name="prod-db-01", client_id=tenant["client_id"],
               asset_type="database", criticality="critical", location="us-east-1", status="active"),
            mk("assets", "ast", "asset_id", name="finance-app-web", client_id=tenant["client_id"],
               asset_type="application", criticality="high", status="active"),
            mk("assets", "ast", "asset_id", name="edr-workstation-fleet", client_id=tenant["client_id"],
               asset_type="workstation", criticality="medium", status="active"),
        ]
    await db.assets.insert_many(assets)

    # Tasks
    tasks = []
    for tenant, own in [(acme, c_acme), (globex, c_glob)]:
        tasks += [
            mk("tasks", "tsk", "task_id", title="Disable stale AD accounts", client_id=tenant["client_id"],
               status="in_progress", priority="high", assignee_id=own, due_date=isod(7)),
            mk("tasks", "tsk", "task_id", title="Request SOC 2 from CloudCore", client_id=tenant["client_id"],
               status="open", priority="medium", assignee_id=own, due_date=isod(14)),
            mk("tasks", "tsk", "task_id", title="Patch CVE-2026-1000 on payroll server", client_id=tenant["client_id"],
               status="open", priority="critical", assignee_id=own, due_date=isod(-1)),
        ]
    await db.tasks.insert_many(tasks)


@app.on_event("startup")
async def _on_start():
    try:
        await seed()
    except Exception as e:
        logging.exception("Seed failed: %s", e)


# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"service": "grc-platform", "status": "ok"}


# ---------------- Generic entity routes (registered last, so literals win) ----------------
entity_router = APIRouter(prefix="/api")


def _risk_level_from_score(score: Optional[int]) -> Optional[str]:
    if score is None:
        return None
    if score >= 15:
        return "critical"
    if score >= 10:
        return "high"
    if score >= 5:
        return "moderate"
    return "low"


def _apply_risk_scoring(doc: Dict) -> Dict:
    """When numeric likelihood_score and impact_score are present on a risk,
    compute the derived risk_score and risk_level so they cannot drift out of sync."""
    ls = doc.get("likelihood_score")
    is_ = doc.get("impact_score")
    if isinstance(ls, int) and isinstance(is_, int) and 1 <= ls <= 5 and 1 <= is_ <= 5:
        doc["risk_score"] = ls * is_
        doc["risk_level"] = _risk_level_from_score(doc["risk_score"])
    return doc


@entity_router.get("/{kind}")
async def list_entities(kind: str = Path(..., pattern=KIND_REGEX), client_id: Optional[str] = Query(None), user: Dict = Depends(get_current_user)):
    q = _scope_filter(user, client_id)
    docs = await db[_coll_for(kind)].find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@entity_router.post("/{kind}")
async def create_entity(kind: str = Path(..., pattern=KIND_REGEX), body: Dict[str, Any] = None, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    entity_type, Model, id_field, prefix = ENTITY_MAP[kind]
    parsed = Model(**(body or {})).model_dump()
    if not _can_access_client(user, parsed["client_id"]):
        raise HTTPException(403, "Forbidden for this client")
    if kind == "risks":
        parsed = _apply_risk_scoring(parsed)
        if not parsed.get("date_identified"):
            parsed["date_identified"] = _now()
    new_id = _uid(prefix)
    doc = {id_field: new_id, **parsed, "created_at": _now(), "updated_at": _now(),
           "created_by": user["user_id"]}
    await db[_coll_for(kind)].insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", entity_type, new_id, parsed.get("client_id"))
    return doc


@entity_router.patch("/{kind}/{item_id}")
async def update_entity(kind: str = Path(..., pattern=KIND_REGEX), item_id: str = Path(...), body: Dict[str, Any] = None, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    entity_type, _Model, id_field, _pfx = ENTITY_MAP[kind]
    existing = await db[_coll_for(kind)].find_one({id_field: item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not _can_access_client(user, existing["client_id"]):
        raise HTTPException(403, "Forbidden")
    body = body or {}
    body.pop(id_field, None)
    if kind == "risks":
        # Merge with existing so partial patches still compute a consistent score.
        merged = {**existing, **body}
        # Track rating history when likelihood/impact numeric values actually change.
        prev_ls, prev_is = existing.get("likelihood_score"), existing.get("impact_score")
        new_ls = body.get("likelihood_score", prev_ls)
        new_is = body.get("impact_score", prev_is)
        if (new_ls, new_is) != (prev_ls, prev_is) and (isinstance(new_ls, int) or isinstance(new_is, int)):
            history = list(existing.get("rating_history") or [])
            history.append({
                "at": _now(),
                "by": user["user_id"],
                "by_name": user.get("name") or user.get("email"),
                "prev_likelihood": prev_ls,
                "prev_impact": prev_is,
                "new_likelihood": new_ls,
                "new_impact": new_is,
                "prev_score": existing.get("risk_score"),
            })
            body["rating_history"] = history
            body["last_reviewed"] = _now()
        computed = _apply_risk_scoring(merged)
        for k in ("risk_score", "risk_level"):
            if k in computed:
                body[k] = computed[k]
    body["updated_at"] = _now()
    await db[_coll_for(kind)].update_one({id_field: item_id}, {"$set": body})
    doc = await db[_coll_for(kind)].find_one({id_field: item_id}, {"_id": 0})
    await audit(user, "update", entity_type, item_id, existing.get("client_id"), meta={"changed_fields": list(body.keys())})
    return doc


@entity_router.delete("/{kind}/{item_id}")
async def delete_entity(kind: str = Path(..., pattern=KIND_REGEX), item_id: str = Path(...), user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Destructive action restricted")
    entity_type, _M, id_field, _p = ENTITY_MAP[kind]
    existing = await db[_coll_for(kind)].find_one({id_field: item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    await db[_coll_for(kind)].delete_one({id_field: item_id})
    await audit(user, "delete", entity_type, item_id, existing.get("client_id"))
    return {"ok": True}


# ---------------- Email (Resend via Emergent proxy) ----------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} ≠ real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str) -> Optional[str]:
    _assert_safe_email(subject, html)
    email_key = os.environ.get("EMERGENT_EMAIL_KEY")
    from_name = os.environ.get("EMAIL_FROM_NAME", "Northstar GRC")
    if not email_key:
        logging.warning("EMERGENT_EMAIL_KEY not set; skipping email to %s", to)
        return None
    payload = {"to": [to], "subject": subject, "html": html, "from_name": from_name}
    reply_to = os.environ.get("EMAIL_REPLY_TO")
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as hx:
            resp = await hx.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": email_key},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logging.error("Email send error: %s", e)
        return None


def _digest_html(user_name: str, overdue_reviews: List[Dict], overdue_findings: List[Dict]) -> str:
    def row(item, kind):
        title = escape(item.get("title", ""))
        due = escape(item.get("due_date", "")[:10] if item.get("due_date") else "—")
        return f'<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px">{escape(kind)}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px">{title}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:#b91c1c">{due}</td></tr>'
    rows = "".join([row(r, "Review") for r in overdue_reviews] + [row(f, "Finding") for f in overdue_findings])
    total = len(overdue_reviews) + len(overdue_findings)
    return (
        f'<table role="presentation" width="100%" style="max-width:640px;margin:auto">'
        f'<tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2 style="margin:0 0 8px 0;font-family:Arial,sans-serif;color:#0f172a">Overdue in your GRC program</h2>'
        f'<p style="margin:0 0 16px 0;color:#475569;font-size:14px">Hi {escape(user_name)}, you have {total} overdue item(s) that need attention.</p>'
        f'<table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb">'
        f'<thead><tr style="background:#f8fafc"><th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Type</th><th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Title</th><th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Due</th></tr></thead>'
        f'<tbody>{rows}</tbody></table>'
        f'<p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8">Sent by Northstar GRC. We never ask for passwords or codes by email.</p>'
        f'</td></tr></table>'
    )


# ---------------- Cron: overdue reminders ----------------
@app.post("/api/cron/overdue-reminders")
async def cron_overdue_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != secret:
        raise HTTPException(401, "Unauthorized")
    import asyncio
    asyncio.create_task(_send_overdue_digest())
    return {"ok": True}


async def _send_overdue_digest():
    now_iso = _now()
    reviews = await db.reviews.find({"status": {"$nin": ["completed", "cancelled"]}, "due_date": {"$lt": now_iso}}, {"_id": 0}).to_list(5000)
    findings = await db.findings.find({"status": {"$in": ["open", "in_remediation"]}, "due_date": {"$lt": now_iso}}, {"_id": 0}).to_list(5000)
    # Group by owner
    by_owner: Dict[str, Dict[str, List]] = {}
    for r in reviews:
        oid = r.get("owner_id")
        if not oid:
            continue
        by_owner.setdefault(oid, {"reviews": [], "findings": []})["reviews"].append(r)
    for f in findings:
        oid = f.get("owner_id")
        if not oid:
            continue
        by_owner.setdefault(oid, {"reviews": [], "findings": []})["findings"].append(f)
    for owner_id, buckets in by_owner.items():
        u = await db.users.find_one({"user_id": owner_id}, {"_id": 0})
        if not u or not u.get("email"):
            continue
        html = _digest_html(u.get("name") or u["email"], buckets["reviews"], buckets["findings"])
        total = len(buckets["reviews"]) + len(buckets["findings"])
        await send_email(to=u["email"], subject=f"Northstar GRC: {total} overdue item(s) need attention", html=html)


# Manual trigger for testing (admin only)
@api.post("/reminders/send-now")
async def reminders_send_now(user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Forbidden")
    await _send_overdue_digest()
    return {"ok": True}


# ---------------- Risks: quick actions ----------------
_SEV_TO_L = {"critical": 5, "high": 4, "medium": 3, "moderate": 3, "low": 2}
_SEV_TO_I = {"critical": 5, "high": 4, "medium": 3, "moderate": 3, "low": 2}


class RiskAcceptIn(BaseModel):
    rationale: str
    expiry_date: Optional[str] = None  # ISO date, becomes next_review
    approver_id: Optional[str] = None
    compensating_controls: Optional[str] = None


@api.post("/risks/{risk_id}/accept")
async def risk_accept(risk_id: str, body: RiskAcceptIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    risk = await db.risks.find_one({"risk_id": risk_id}, {"_id": 0})
    if not risk:
        raise HTTPException(404, "Risk not found")
    if not _can_access_client(user, risk["client_id"]):
        raise HTTPException(403, "Forbidden")
    updates = {
        "status": "accepted",
        "treatment": "accept",
        "accepted": True,
        "accepted_by": body.approver_id or user["user_id"],
        "acceptance_date": _now(),
        "acceptance_rationale": body.rationale,
        "next_review": body.expiry_date,
        "last_reviewed": _now(),
        "updated_at": _now(),
    }
    if body.compensating_controls:
        updates["compensating_controls"] = body.compensating_controls
    await db.risks.update_one({"risk_id": risk_id}, {"$set": updates})
    await audit(user, "accept", "risk", risk_id, risk["client_id"], meta={"expiry": body.expiry_date})
    return await db.risks.find_one({"risk_id": risk_id}, {"_id": 0})


class VendorScheduleReviewIn(BaseModel):
    due_date: Optional[str] = None  # ISO date
    owner_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    recurrence: Optional[str] = None  # if omitted, fall back to vendor.review_frequency
    title: Optional[str] = None
    scope: Optional[str] = None


_VENDOR_FREQ_TO_RECUR = {
    "quarterly": "quarterly", "semiannual": "semiannual", "annual": "annual",
    "biennial": "custom", "as_needed": "none", "custom": "custom", "monthly": "monthly",
}


@api.post("/vendors/{vendor_id}/schedule-review")
async def vendor_schedule_review(vendor_id: str, body: VendorScheduleReviewIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    vendor = await db.vendors.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if not _can_access_client(user, vendor["client_id"]):
        raise HTTPException(403, "Forbidden")
    freq = (body.recurrence or _VENDOR_FREQ_TO_RECUR.get(vendor.get("review_frequency") or "annual", "annual"))
    custom_days = 730 if (vendor.get("review_frequency") == "biennial" and freq == "custom") else None
    # Default due date: user-provided > vendor.next_review > +1 year from today
    due_iso = body.due_date or vendor.get("next_review") or (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    if due_iso and len(due_iso) == 10:
        due_iso = f"{due_iso}T00:00:00+00:00"
    rev_id = _uid("rev")
    doc = {
        "review_id": rev_id,
        "title": body.title or f"Vendor review · {vendor.get('name')}",
        "review_type": "vendor",
        "client_id": vendor["client_id"],
        "status": "upcoming",
        "recurrence": freq,
        "custom_recurrence_days": custom_days,
        "owner_id": body.owner_id or vendor.get("business_owner_id") or user["user_id"],
        "reviewer_id": body.reviewer_id,
        "scope": body.scope or f"Assurance & risk review for {vendor.get('name')}",
        "due_date": due_iso,
        "next_review_date": _next_due_for_recurrence(due_iso, freq, custom_days),
        "vendor_id": vendor_id,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user["user_id"],
    }
    await db.reviews.insert_one(doc)
    await db.vendors.update_one({"vendor_id": vendor_id},
                                {"$set": {"next_review": due_iso, "updated_at": _now()}})
    await audit(user, "schedule-review", "vendor", vendor_id, vendor["client_id"], meta={"review_id": rev_id})
    if doc["owner_id"] and doc["owner_id"] != user["user_id"]:
        await create_notification(
            user_id=doc["owner_id"],
            title=f"Vendor review scheduled: {vendor.get('name')}",
            kind="review_scheduled",
            entity_type="reviews",
            entity_id=rev_id,
            client_id=vendor["client_id"],
        )
    doc.pop("_id", None)
    return {"review": doc, "vendor_id": vendor_id}


@api.post("/risks/{risk_id}/mark-reviewed")
async def risk_mark_reviewed(risk_id: str, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    risk = await db.risks.find_one({"risk_id": risk_id}, {"_id": 0})
    if not risk:
        raise HTTPException(404, "Risk not found")
    if not _can_access_client(user, risk["client_id"]):
        raise HTTPException(403, "Forbidden")
    # Push out next review 12 months from today by default.
    next_review = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    await db.risks.update_one({"risk_id": risk_id},
                              {"$set": {"last_reviewed": _now(), "next_review": next_review, "updated_at": _now()}})
    await audit(user, "mark_reviewed", "risk", risk_id, risk["client_id"])
    return await db.risks.find_one({"risk_id": risk_id}, {"_id": 0})


@api.post("/findings/{finding_id}/raise-risk")
async def finding_raise_risk(finding_id: str, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    finding = await db.findings.find_one({"finding_id": finding_id}, {"_id": 0})
    if not finding:
        raise HTTPException(404, "Finding not found")
    if not _can_access_client(user, finding["client_id"]):
        raise HTTPException(403, "Forbidden")
    if finding.get("risk_id"):
        raise HTTPException(400, "Risk already linked to this finding")
    sev = (finding.get("severity") or "medium").lower()
    ls = _SEV_TO_L.get(sev, 3)
    is_ = _SEV_TO_I.get(sev, 3)
    short_id = finding_id.split("_")[-1][-6:].upper()
    new_risk_id = _uid("rsk")
    risk_doc = {
        "risk_id": new_risk_id,
        "title": f"Risk raised from finding: {finding.get('title')}",
        "client_id": finding["client_id"],
        "category": "Compliance",
        "likelihood_score": ls,
        "impact_score": is_,
        "risk_score": ls * is_,
        "risk_level": _risk_level_from_score(ls * is_),
        "status": "open",
        "treatment": "mitigate",
        "owner_id": finding.get("owner_id"),
        "description": finding.get("description"),
        "source": f"Finding {short_id}",
        "related_finding_ids": [finding_id],
        "date_identified": _now(),
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user["user_id"],
    }
    await db.risks.insert_one(risk_doc)
    await db.findings.update_one({"finding_id": finding_id}, {"$set": {"risk_id": new_risk_id, "updated_at": _now()}})
    await audit(user, "raise-risk", "risk", new_risk_id, finding["client_id"], meta={"from_finding": finding_id})
    risk_doc.pop("_id", None)
    return {"risk": risk_doc}


# ---------------- Weekly "My Work" digest ----------------
def _weekly_html(user_name: str, buckets: Dict[str, Dict[str, List[Dict]]], app_base_url: str) -> str:
    """buckets = {'overdue': {...}, 'due_soon': {...}} where each inner dict has
    'reviews' / 'tasks' / 'findings' lists."""
    def row(item, kind, tone):
        title = escape(item.get("title") or item.get("name") or "")
        due = escape(item.get("due_date", "")[:10] if item.get("due_date") else "—")
        color = "#b91c1c" if tone == "overdue" else "#b45309"
        return (
            f'<tr>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:#0f172a">{escape(kind)}</td>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:#0f172a">{title}</td>'
            f'<td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:13px;color:{color};white-space:nowrap">{due}</td>'
            f'</tr>'
        )

    def section(title: str, items_map: Dict[str, List[Dict]], tone: str) -> str:
        total = sum(len(v) for v in items_map.values())
        if total == 0:
            return ""
        rows = "".join(
            [row(x, "Review", tone) for x in items_map.get("reviews", [])]
            + [row(x, "Task", tone) for x in items_map.get("tasks", [])]
            + [row(x, "Finding", tone) for x in items_map.get("findings", [])]
            + [row(x, "Risk", tone) for x in items_map.get("risks", [])]
            + [row(x, "Vendor assurance", tone) for x in items_map.get("vendors", [])]
        )
        return (
            f'<h3 style="margin:18px 0 8px 0;font-family:Arial,sans-serif;font-size:14px;color:#0f172a">{escape(title)} <span style="color:#94a3b8;font-weight:normal">· {total}</span></h3>'
            f'<table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid #e5e7eb">'
            f'<thead><tr style="background:#f8fafc">'
            f'<th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Type</th>'
            f'<th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Title</th>'
            f'<th align="left" style="padding:8px 12px;font-family:Arial,sans-serif;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.06em">Due</th>'
            f'</tr></thead><tbody>{rows}</tbody></table>'
        )

    overdue_total = sum(len(v) for v in buckets["overdue"].values())
    duesoon_total = sum(len(v) for v in buckets["due_soon"].values())
    reassess_total = sum(len(v) for v in buckets.get("reassess", {}).values())
    assurance_total = sum(len(v) for v in buckets.get("assurance", {}).values())
    total = overdue_total + duesoon_total + reassess_total + assurance_total
    dashboard_link = f'{app_base_url}/dashboard' if app_base_url else "https://app.example.com/dashboard"
    return (
        f'<table role="presentation" width="100%" style="max-width:640px;margin:auto">'
        f'<tr><td style="padding:24px;font-family:Arial,sans-serif">'
        f'<h2 style="margin:0 0 4px 0;font-family:Arial,sans-serif;color:#0f172a;font-size:20px">Your GRC work this week</h2>'
        f'<p style="margin:0 0 16px 0;color:#475569;font-size:14px">Good morning {escape(user_name)}. You have <strong>{total}</strong> item(s) that need attention this week: <strong>{overdue_total}</strong> overdue, <strong>{duesoon_total}</strong> due in the next 7 days, and <strong>{reassess_total}</strong> risk(s) to reassess.</p>'
        f'{section("Overdue", buckets["overdue"], "overdue")}'
        f'{section("Due in the next 7 days", buckets["due_soon"], "duesoon")}'
        f'{section("Risks to reassess (>12 months since last review)", buckets.get("reassess", {}), "duesoon")}'
        f'{section("Vendor assurance expiring in the next 60 days", buckets.get("assurance", {}), "duesoon")}'
        f'<p style="margin:20px 0 0 0;font-size:13px;color:#475569">Open your dashboard: <a href="{escape(dashboard_link)}" style="color:#0f172a;text-decoration:underline">{escape(dashboard_link)}</a></p>'
        f'<p style="margin:12px 0 0 0;font-size:11px;color:#94a3b8">Sent by Northstar GRC. We never ask for passwords or codes by email. To stop receiving this digest, ask your admin to update your notification preferences.</p>'
        f'</td></tr></table>'
    )


async def _send_weekly_digest() -> Dict:
    """Iterate all users; for each, compute their primary-owned overdue + due-soon items and email
    a personalized digest. Skips users with no open work or opted out via weekly_digest_optout."""
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()
    horizon_iso = (now_dt + timedelta(days=7)).isoformat()
    closed_review = ("completed", "cancelled")
    closed_task = ("done", "cancelled")
    open_finding = ("open", "in_remediation")

    users = await db.users.find(
        {"weekly_digest_optout": {"$ne": True}},
        {"_id": 0, "password_hash": 0},
    ).to_list(5000)

    app_base_url = (os.environ.get("APP_BASE_URL") or "").rstrip("/")
    stats = {"users_considered": len(users), "emails_sent": 0, "users_empty": 0, "errors": 0}

    for u in users:
        uid = u.get("user_id")
        email = u.get("email")
        if not uid or not email:
            continue

        reviews_od = await db.reviews.find({
            "$or": [{"owner_id": uid}, {"reviewer_id": uid}],
            "status": {"$nin": list(closed_review)},
            "due_date": {"$lt": now_iso},
        }, {"_id": 0, "review_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        reviews_ds = await db.reviews.find({
            "$or": [{"owner_id": uid}, {"reviewer_id": uid}],
            "status": {"$nin": list(closed_review)},
            "due_date": {"$gte": now_iso, "$lte": horizon_iso},
        }, {"_id": 0, "review_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        tasks_od = await db.tasks.find({
            "$or": [{"assignee_id": uid}, {"owner_id": uid}],
            "status": {"$nin": list(closed_task)},
            "due_date": {"$lt": now_iso},
        }, {"_id": 0, "task_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        tasks_ds = await db.tasks.find({
            "$or": [{"assignee_id": uid}, {"owner_id": uid}],
            "status": {"$nin": list(closed_task)},
            "due_date": {"$gte": now_iso, "$lte": horizon_iso},
        }, {"_id": 0, "task_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        findings_od = await db.findings.find({
            "owner_id": uid,
            "status": {"$in": list(open_finding)},
            "due_date": {"$lt": now_iso},
        }, {"_id": 0, "finding_id": 1, "title": 1, "due_date": 1, "status": 1, "severity": 1}).sort("due_date", 1).to_list(50)

        findings_ds = await db.findings.find({
            "owner_id": uid,
            "status": {"$in": list(open_finding)},
            "due_date": {"$gte": now_iso, "$lte": horizon_iso},
        }, {"_id": 0, "finding_id": 1, "title": 1, "due_date": 1, "status": 1, "severity": 1}).sort("due_date", 1).to_list(50)

        # Reassess digest: risks owned by this user with last_reviewed (fallback to date_identified)
        # older than 12 months and still open.
        twelve_months_ago = (now_dt - timedelta(days=365)).isoformat()
        candidate_risks = await db.risks.find({
            "owner_id": uid,
            "status": {"$nin": ["closed"]},
        }, {"_id": 0, "risk_id": 1, "title": 1, "risk_level": 1, "last_reviewed": 1, "date_identified": 1, "created_at": 1}).to_list(200)
        stale_risks = [r for r in candidate_risks
                       if (r.get("last_reviewed") or r.get("date_identified") or r.get("created_at") or "") < twelve_months_ago]
        for r in stale_risks:
            r["due_date"] = r.get("last_reviewed") or r.get("date_identified") or r.get("created_at")

        # Vendor assurance expiring in the next 60 days for vendors this user owns.
        sixty_out = (now_dt + timedelta(days=60)).isoformat()
        vendors_owned = await db.vendors.find({
            "business_owner_id": uid,
            "status": {"$nin": ["inactive", "offboarding", "terminated"]},
        }, {"_id": 0, "vendor_id": 1, "name": 1, "assurance_status": 1,
             "assurance_expires_at": 1, "criticality": 1}).to_list(200)
        assurance_alerts: List[Dict] = []
        for v in vendors_owned:
            expires_at = v.get("assurance_expires_at")
            status_flag = (v.get("assurance_status") or "").lower() in _ASSURANCE_ISSUE_STATUSES
            expiring_soon = bool(expires_at and expires_at <= sixty_out)
            if not (expiring_soon or status_flag):
                continue
            v = {**v}
            v["title"] = f"{v.get('name')} · {v.get('assurance_status') or 'assurance review'}"
            v["due_date"] = expires_at
            assurance_alerts.append(v)

        buckets = {
            "overdue": {"reviews": reviews_od, "tasks": tasks_od, "findings": findings_od},
            "due_soon": {"reviews": reviews_ds, "tasks": tasks_ds, "findings": findings_ds},
            "reassess": {"risks": stale_risks},
            "assurance": {"vendors": assurance_alerts},
        }
        total = sum(len(v) for section in buckets.values() for v in section.values())
        if total == 0:
            stats["users_empty"] += 1
            continue

        try:
            html = _weekly_html(u.get("name") or email, buckets, app_base_url)
            overdue_total = sum(len(v) for v in buckets["overdue"].values())
            subject = (
                f"Northstar GRC: {overdue_total} overdue and {total - overdue_total} due-soon this week"
                if overdue_total else f"Northstar GRC: {total} item(s) due this week"
            )
            await send_email(to=email, subject=subject, html=html)
            stats["emails_sent"] += 1
        except Exception as e:
            stats["errors"] += 1
            logging.error("weekly digest failed for %s: %s", email, e)

    logging.info("weekly digest: %s", stats)
    return stats


@app.post("/api/cron/weekly-my-work")
async def cron_weekly_my_work(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth = request.headers.get("Authorization", "")
    if not secret or not auth.startswith("Bearer ") or auth[7:] != secret:
        raise HTTPException(401, "Unauthorized")
    import asyncio
    asyncio.create_task(_send_weekly_digest())
    return {"ok": True}


# Manual trigger for testing (admin only). Runs synchronously so the response includes stats.
@api.post("/reminders/send-weekly-now")
async def reminders_send_weekly_now(user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Forbidden")
    stats = await _send_weekly_digest()
    return {"ok": True, "stats": stats}


# ---------------- Reviews: recurrence helpers + complete endpoint ----------------
_RECUR_MONTHS = {"monthly": 1, "quarterly": 3, "semiannual": 6, "annual": 12}


def _shift_iso(base_iso: str, months: int = 0, days: int = 0) -> str:
    try:
        d = datetime.fromisoformat(base_iso)
    except Exception:
        d = datetime.now(timezone.utc)
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    if months:
        # calendar-aware month math
        month0 = d.month - 1 + months
        year = d.year + month0 // 12
        month = month0 % 12 + 1
        # clamp day to end-of-month
        import calendar as _cal
        last_day = _cal.monthrange(year, month)[1]
        day = min(d.day, last_day)
        d = d.replace(year=year, month=month, day=day)
    if days:
        d = d + timedelta(days=days)
    return d.isoformat()


def _next_due_for_recurrence(base_due_iso: str, recurrence: str, custom_days: Optional[int] = None) -> Optional[str]:
    if not base_due_iso or recurrence in (None, "none", ""):
        return None
    if recurrence in _RECUR_MONTHS:
        return _shift_iso(base_due_iso, months=_RECUR_MONTHS[recurrence])
    if recurrence == "custom" and custom_days and custom_days > 0:
        return _shift_iso(base_due_iso, days=int(custom_days))
    return None


class ReviewCompleteIn(BaseModel):
    completion_notes: Optional[str] = None
    completion_date: Optional[str] = None
    spawn_next: Optional[bool] = True


@api.post("/reviews/{review_id}/complete")
async def complete_review(review_id: str, body: ReviewCompleteIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    review = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(404, "Review not found")
    if not _can_access_client(user, review["client_id"]):
        raise HTTPException(403, "Forbidden")
    if review.get("status") == "completed":
        raise HTTPException(400, "Review already completed")

    completion_iso = body.completion_date or _now()
    updates = {
        "status": "completed",
        "completion_date": completion_iso,
        "updated_at": _now(),
    }
    if body.completion_notes:
        # Append rather than overwrite so history isn't lost.
        existing_notes = (review.get("notes") or "").rstrip()
        stamp = f"\n\n— Completed by {user.get('name') or user['email']} on {completion_iso[:10]} —\n{body.completion_notes}"
        updates["notes"] = (existing_notes + stamp).strip()

    await db.reviews.update_one({"review_id": review_id}, {"$set": updates})
    await audit(user, "complete", "review", review_id, review.get("client_id"),
                meta={"recurrence": review.get("recurrence")})

    spawned = None
    recurrence = review.get("recurrence") or "none"
    if body.spawn_next and recurrence not in (None, "none", ""):
        base = review.get("next_review_date") or review.get("due_date")
        next_due = _next_due_for_recurrence(base, recurrence, review.get("custom_recurrence_days"))
        if next_due:
            new_id = _uid("rev")
            spawned = {
                "review_id": new_id,
                "title": review["title"],
                "review_type": review.get("review_type"),
                "client_id": review["client_id"],
                "status": "upcoming",
                "recurrence": recurrence,
                "custom_recurrence_days": review.get("custom_recurrence_days"),
                "owner_id": review.get("owner_id"),
                "reviewer_id": review.get("reviewer_id"),
                "scope": review.get("scope"),
                "period": review.get("period"),
                "due_date": next_due,
                "next_review_date": _next_due_for_recurrence(next_due, recurrence, review.get("custom_recurrence_days")),
                "parent_review_id": review_id,
                "created_at": _now(),
                "updated_at": _now(),
                "created_by": user["user_id"],
            }
            await db.reviews.insert_one(spawned)
            spawned.pop("_id", None)
            await db.reviews.update_one({"review_id": review_id}, {"$set": {"next_occurrence_id": new_id}})
            await audit(user, "spawn-next", "review", new_id, review["client_id"],
                        meta={"parent_review_id": review_id})
            if spawned.get("owner_id") and spawned["owner_id"] != user["user_id"]:
                await create_notification(
                    user_id=spawned["owner_id"],
                    title=f"Next {spawned.get('review_type') or 'review'} scheduled: {spawned['title']}",
                    kind="review_scheduled",
                    entity_type="reviews",
                    entity_id=new_id,
                    client_id=spawned["client_id"],
                )

    updated = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
    return {"review": updated, "spawned": spawned}


# ---------------- Quick actions: Review → Finding, Finding → Task ----------------
@api.post("/reviews/{review_id}/create-finding")
async def review_create_finding(review_id: str, body: Dict[str, Any], user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    review = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(404, "Review not found")
    if not _can_access_client(user, review["client_id"]):
        raise HTTPException(403, "Forbidden")
    fid = _uid("fnd")
    doc = {
        "finding_id": fid,
        "title": body.get("title") or f"Finding from: {review['title']}",
        "client_id": review["client_id"],
        "severity": body.get("severity", "medium"),
        "status": "open",
        "description": body.get("description") or "",
        "owner_id": body.get("owner_id") or review.get("owner_id"),
        "due_date": body.get("due_date"),
        "review_id": review_id,
        "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"],
    }
    await db.findings.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "finding", fid, review["client_id"], meta={"from_review": review_id})
    # Notify finding owner (if not self)
    if doc.get("owner_id") and doc["owner_id"] != user["user_id"]:
        await create_notification(
            user_id=doc["owner_id"],
            title=f"New finding assigned: {doc['title']}",
            kind="finding_assigned",
            entity_type="findings",
            entity_id=fid,
            client_id=doc["client_id"],
        )
    return doc


@api.post("/findings/{finding_id}/create-task")
async def finding_create_task(finding_id: str, body: Dict[str, Any], user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    finding = await db.findings.find_one({"finding_id": finding_id}, {"_id": 0})
    if not finding:
        raise HTTPException(404, "Finding not found")
    if not _can_access_client(user, finding["client_id"]):
        raise HTTPException(403, "Forbidden")
    tid = _uid("tsk")
    doc = {
        "task_id": tid,
        "title": body.get("title") or f"Remediate: {finding['title']}",
        "client_id": finding["client_id"],
        "status": "open",
        "priority": body.get("priority", finding.get("severity", "medium")),
        "assignee_id": body.get("assignee_id") or finding.get("owner_id"),
        "due_date": body.get("due_date") or finding.get("due_date"),
        "description": body.get("description") or finding.get("remediation_plan"),
        "finding_id": finding_id,
        "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"],
    }
    await db.tasks.insert_one(doc)
    # link back on the finding
    if finding.get("status") == "open":
        await db.findings.update_one({"finding_id": finding_id}, {"$set": {"status": "in_remediation", "updated_at": _now()}})
    doc.pop("_id", None)
    await audit(user, "create", "task", tid, finding["client_id"], meta={"from_finding": finding_id})
    if doc.get("assignee_id") and doc["assignee_id"] != user["user_id"]:
        await create_notification(
            user_id=doc["assignee_id"],
            title=f"New remediation task: {doc['title']}",
            kind="task_assigned",
            entity_type="tasks",
            entity_id=tid,
            client_id=doc["client_id"],
        )
    return doc


@api.get("/related")
async def related_items(entity_type: str, entity_id: str, user: Dict = Depends(get_current_user)):
    """Return records related to the given entity across collections."""
    out: Dict[str, List] = {"reviews": [], "findings": [], "tasks": [], "risks": [], "exceptions": [], "evidence": []}
    if entity_type == "reviews":
        out["findings"] = await db.findings.find({"review_id": entity_id}, {"_id": 0}).to_list(200)
    elif entity_type == "findings":
        out["tasks"] = await db.tasks.find({"finding_id": entity_id}, {"_id": 0}).to_list(200)
        f = await db.findings.find_one({"finding_id": entity_id}, {"_id": 0})
        if f and f.get("review_id"):
            r = await db.reviews.find_one({"review_id": f["review_id"]}, {"_id": 0})
            if r:
                out["reviews"] = [r]
        if f and f.get("risk_id"):
            r = await db.risks.find_one({"risk_id": f["risk_id"]}, {"_id": 0})
            if r:
                out["risks"] = [r]
        out["exceptions"] = await db.exceptions.find({"finding_id": entity_id}, {"_id": 0}).to_list(50)
    elif entity_type == "risks":
        out["findings"] = await db.findings.find({"risk_id": entity_id}, {"_id": 0}).to_list(200)
        out["exceptions"] = await db.exceptions.find({"risk_id": entity_id}, {"_id": 0}).to_list(50)
    elif entity_type == "tasks":
        t = await db.tasks.find_one({"task_id": entity_id}, {"_id": 0})
        if t and t.get("finding_id"):
            f = await db.findings.find_one({"finding_id": t["finding_id"]}, {"_id": 0})
            if f:
                out["findings"] = [f]
    out["evidence"] = await db.evidence.find({"linked_type": entity_type[:-1], "linked_id": entity_id}, {"_id": 0, "content_base64": 0}).to_list(200)
    return out


# ---------------- Policies & Governance onboarding ----------------
# Client-reported presence (what the client says) is deliberately kept separate
# from lifecycle status (draft/in_review/approved/etc.) and from verified metadata
# (version/owner/approval date/etc.). The GRC team verifies later — a client's
# "Yes" is never treated as evidence of a verified, approved policy.

POLICY_LIBRARY: List[Dict[str, Any]] = [
    # Core Governance
    {"category": "Core Governance", "name": "Information Security Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Risk Management Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Access Control & Identity Management Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Acceptable Use Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Change Management Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Vendor / Third-Party Risk Management Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Data Classification & Handling Policy", "applicability": "common_baseline"},
    {"category": "Core Governance", "name": "Data Retention & Secure Disposal Policy", "applicability": "common_baseline"},
    # Security Operations
    {"category": "Security Operations", "name": "Vulnerability & Patch Management Policy", "applicability": "common_baseline"},
    {"category": "Security Operations", "name": "Configuration Management Policy", "applicability": "common_baseline"},
    {"category": "Security Operations", "name": "Security Awareness & Training Policy", "applicability": "common_baseline"},
    {"category": "Security Operations", "name": "Backup & Restoration Policy", "applicability": "common_baseline"},
    {"category": "Security Operations", "name": "Cryptography & Key Management Policy", "applicability": "common_baseline"},
    {"category": "Security Operations", "name": "Logging & Monitoring Policy", "applicability": "common_baseline"},
    # Business Resilience / Incident Management
    {"category": "Business Resilience", "name": "Incident Response Plan", "applicability": "common_baseline"},
    {"category": "Business Resilience", "name": "Business Continuity Plan", "applicability": "common_baseline"},
    {"category": "Business Resilience", "name": "Disaster Recovery Plan", "applicability": "common_baseline"},
    {"category": "Business Resilience", "name": "Business Impact Analysis", "applicability": "common_baseline"},
    # Physical / Workforce / Technology
    {"category": "Physical, Workforce & Technology", "name": "Physical & Environmental Security Policy", "applicability": "consider_based_on_applicability"},
    {"category": "Physical, Workforce & Technology", "name": "Remote Work / Telework Policy", "applicability": "consider_based_on_applicability"},
    {"category": "Physical, Workforce & Technology", "name": "Mobile Device / BYOD Policy", "applicability": "consider_based_on_applicability"},
    {"category": "Physical, Workforce & Technology", "name": "Cloud Security Policy", "applicability": "consider_based_on_applicability"},
    {"category": "Physical, Workforce & Technology", "name": "Secure Development / SDLC Policy", "applicability": "consider_based_on_applicability"},
    # Privacy / Data Protection
    {"category": "Privacy & Data Protection", "name": "Privacy / Data Protection Policy", "applicability": "common_baseline"},
]


class OnboardingPolicyResponse(BaseModel):
    name: str  # matches POLICY_LIBRARY entry (case-insensitive)
    category: Optional[str] = None
    response: str  # yes | no | unsure | na
    note: Optional[str] = None
    applicability_rationale: Optional[str] = None  # required when response == na


class OnboardingPoliciesIn(BaseModel):
    client_id: str
    responses: List[OnboardingPolicyResponse]


def _presence_for_response(resp: str) -> str:
    m = {"yes": "reported_existing", "no": "reported_missing",
         "unsure": "needs_confirmation", "na": "not_applicable"}
    return m.get(resp, "needs_confirmation")


def _lifecycle_for_response(resp: str) -> str:
    m = {"yes": "needs_verification", "no": "needs_creation",
         "unsure": "needs_verification", "na": "not_applicable"}
    return m.get(resp, "needs_verification")


@api.get("/onboarding/policy-library")
async def onboarding_policy_library(
    client_id: str = Query(...),
    user: Dict = Depends(get_current_user),
):
    """Return the categorized policy library plus, for each library item,
    the current Policy Register row for this client (if one already exists).
    The frontend uses this to preselect the last known response so the
    onboarding step is idempotent and never duplicates records."""
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden for this client")
    # Load all existing policies for this tenant once.
    existing = await db.policies.find({"client_id": client_id}, {"_id": 0}).to_list(1000)
    by_name = {(p.get("title") or "").strip().lower(): p for p in existing}
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for item in POLICY_LIBRARY:
        row = {**item}
        match = by_name.get(item["name"].strip().lower())
        if match:
            row["existing_policy_id"] = match.get("policy_id")
            row["current_presence"] = match.get("presence")
            row["current_status"] = match.get("status")
            row["last_onboarding_note"] = match.get("onboarding_note")
            row["applicability_rationale"] = match.get("applicability_rationale")
        grouped.setdefault(item["category"], []).append(row)
    return {
        "categories": [
            {"name": name, "items": items}
            for name, items in grouped.items()
        ],
    }


@api.post("/onboarding/policy-responses")
async def onboarding_policy_responses(body: OnboardingPoliciesIn, user: Dict = Depends(get_current_user)):
    """Convert client-reported responses into Policy Register rows + optional Action Items.
    Never fabricates version/owner/approval_date/last_review/next_review — those stay blank
    until the GRC team verifies. Never duplicates: matches by title (case-insensitive)."""
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden for this client")

    # Preload existing policies for tenant to avoid duplicates.
    existing = await db.policies.find({"client_id": body.client_id}, {"_id": 0}).to_list(2000)
    existing_by_name = {(p.get("title") or "").strip().lower(): p for p in existing}
    # Preload open onboarding-sourced tasks per policy_id to avoid duplicate action items.
    open_tasks = await db.tasks.find(
        {"client_id": body.client_id, "source": "GRC Program Onboarding",
         "status": {"$nin": ["done"]}}, {"_id": 0}
    ).to_list(2000)
    task_by_policy = {t.get("policy_id"): t for t in open_tasks if t.get("policy_id")}

    counters = {"policies_created": 0, "policies_updated": 0, "tasks_created": 0}
    results: List[Dict[str, Any]] = []
    now = _now()

    for r in body.responses:
        resp = (r.response or "").lower().strip()
        if resp not in ("yes", "no", "unsure", "na"):
            continue
        if resp == "na" and not (r.applicability_rationale or "").strip():
            raise HTTPException(400, f"Rationale is required when marking '{r.name}' as Not Applicable")
        presence = _presence_for_response(resp)
        lifecycle = _lifecycle_for_response(resp)
        title_key = r.name.strip().lower()
        existing_row = existing_by_name.get(title_key)

        if existing_row:
            update = {
                "presence": presence,
                "onboarding_note": r.note or existing_row.get("onboarding_note"),
                "applicability_rationale": (r.applicability_rationale or existing_row.get("applicability_rationale")) if resp == "na" else existing_row.get("applicability_rationale"),
                "category": r.category or existing_row.get("category"),
                "is_client_reported": True,
                "updated_at": now,
            }
            # Only bump lifecycle status when the client hasn't verified yet, so we don't
            # trample a Verified/Approved policy just because a client re-runs onboarding.
            if existing_row.get("status") in (None, "", "draft", "needs_verification", "needs_creation", "not_applicable"):
                update["status"] = lifecycle
            await db.policies.update_one({"policy_id": existing_row["policy_id"]}, {"$set": update})
            counters["policies_updated"] += 1
            pol_id = existing_row["policy_id"]
            prev_presence = existing_row.get("presence")
        else:
            pol_id = _uid("pol")
            doc = {
                "policy_id": pol_id,
                "title": r.name,
                "client_id": body.client_id,
                "category": r.category,
                "presence": presence,
                "status": lifecycle,
                "onboarding_note": r.note or None,
                "applicability_rationale": (r.applicability_rationale or None) if resp == "na" else None,
                "is_client_reported": True,
                # Deliberately no version / owner / approver / approved_at / next_review_date —
                # those are populated only by /policies/{id}/verify.
                "created_at": now,
                "updated_at": now,
                "created_by": user["user_id"],
            }
            await db.policies.insert_one(doc)
            counters["policies_created"] += 1
            prev_presence = None

        await audit(user, "onboarding-response", "policy", pol_id, body.client_id,
                    meta={"response": resp, "presence": presence, "prev_presence": prev_presence,
                          "note": (r.note or None), "rationale": (r.applicability_rationale or None)})

        # Create Action Item where appropriate. Idempotent per policy_id.
        task_id = None
        if resp in ("no", "unsure") and pol_id not in task_by_policy:
            if resp == "no":
                task_title = f"Develop and approve {r.name}"
                task_desc = f"Onboarding recorded '{r.name}' as missing. Draft, review, and approve the document, then verify metadata on the Policy Register."
            else:
                task_title = f"Confirm whether {r.name} exists"
                task_desc = f"Onboarding recorded '{r.name}' as unconfirmed. Follow up with the client to determine whether the document exists, then either verify metadata or mark it missing."
            task_id = _uid("tsk")
            await db.tasks.insert_one({
                "task_id": task_id,
                "title": task_title,
                "description": task_desc,
                "client_id": body.client_id,
                "status": "open",
                "priority": "medium",
                # Owner + due date are deliberately left blank per onboarding rules.
                "policy_id": pol_id,
                "source": "GRC Program Onboarding",
                "created_at": now,
                "updated_at": now,
                "created_by": user["user_id"],
            })
            counters["tasks_created"] += 1
            await audit(user, "create", "task", task_id, body.client_id,
                        meta={"source": "GRC Program Onboarding", "policy_id": pol_id})

        results.append({
            "policy_id": pol_id, "name": r.name, "response": resp,
            "presence": presence, "status": lifecycle,
            "task_created": task_id,
        })

    return {"ok": True, "counters": counters, "results": results}


class PolicyVerifyIn(BaseModel):
    version: Optional[str] = None
    owner_id: Optional[str] = None
    approver_id: Optional[str] = None
    approved_at: Optional[str] = None
    last_reviewed_at: Optional[str] = None
    next_review_date: Optional[str] = None
    summary: Optional[str] = None
    # If provided, override lifecycle status (e.g. approved). Default keeps existing status.
    status: Optional[str] = None


@api.post("/policies/{policy_id}/verify")
async def policy_verify(policy_id: str, body: PolicyVerifyIn, user: Dict = Depends(get_current_user)):
    """Move a client-reported policy from 'Reported Existing' → 'Verified Existing' and
    populate the verified metadata. Only Platform / Super admins may verify."""
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform admins can verify policies")
    p = await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Policy not found")
    if not _can_access_client(user, p["client_id"]):
        raise HTTPException(403, "Forbidden for this client")
    update: Dict[str, Any] = {
        "presence": "verified_existing",
        "verified_at": _now(),
        "verified_by": user["user_id"],
        "updated_at": _now(),
    }
    for k in ("version", "owner_id", "approver_id", "approved_at", "last_reviewed_at",
              "next_review_date", "summary", "status"):
        v = getattr(body, k, None)
        if v not in (None, ""):
            update[k] = v
    await db.policies.update_one({"policy_id": policy_id}, {"$set": update})
    await audit(user, "verify", "policy", policy_id, p["client_id"],
                meta={"prev_presence": p.get("presence"), "verified_fields": [k for k in update.keys() if k not in ("updated_at", "verified_at", "verified_by")]})
    fresh = await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})
    return fresh


# ---------------- Notifications ----------------

# Onboarding routes have been extracted to routes/onboarding.py — see the
# `app.include_router(onboarding_router)` line at the bottom of this file.
# =========================================================================
# GRC Program Onboarding — Requirements, Contacts, Assessments, Known Issues
# =========================================================================
# LEGACY BLOCK (kept in file only for the constants list) — endpoints live in
# routes/onboarding.py now.
# Requirements & Obligations reuses the first-class `requirements` collection
# (ENTITY_MAP + generic CRUD). Contacts and Assessments are lightweight
# client-scoped collections with no standalone list page yet. Known Issues are
# NOT a separate permanent collection — during onboarding they are promoted
# into existing modules (Tasks for `reported`/`needs_review`, Findings for
# `verified_finding`). Everything is idempotent by (client_id + title).

KEY_ROLE_TEMPLATES: List[Dict[str, str]] = [
    {"role": "Primary GRC / Security Contact", "hint": "Day-to-day contact for the GRC program."},
    {"role": "Executive Sponsor", "hint": "Senior leader overseeing the program."},
    {"role": "IT Lead", "hint": "Primary IT / technology contact."},
    {"role": "Information Security Lead", "hint": "If different from IT."},
    {"role": "Risk Management Contact", "hint": "Coordinates organizational risk management."},
    {"role": "Vendor / Third-Party Contact", "hint": "Owns vendor relationships or vendor risk."},
    {"role": "Business Continuity / Disaster Recovery Lead", "hint": "Continuity & resilience lead."},
    {"role": "Incident Response Lead", "hint": "Client-side incident response lead."},
    {"role": "HR Contact", "hint": "Workforce / security process coordination."},
    {"role": "Legal / Privacy Contact", "hint": "Legal, privacy, or compliance counsel."},
]

ASSESSMENT_TYPES: List[str] = [
    "Penetration Test", "Risk Assessment", "SOC 2 Assessment / Audit",
    "ISO Audit / Assessment", "CMMC Assessment", "Vulnerability Assessment",
    "Internal Audit", "Customer Security Assessment", "Vendor Assessment",
    "Compliance Assessment", "BCP/DR Exercise", "Incident Response Exercise", "Other",
]


class OnboardingContact(BaseModel):
    role: str
    name: Optional[str] = None
    title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linked_user_id: Optional[str] = None
    notes: Optional[str] = None
    not_applicable: Optional[bool] = False


class OnboardingAssessment(BaseModel):
    name: str
    assessment_type: Optional[str] = None
    date: Optional[str] = None
    conducted_by: Optional[str] = None
    status: Optional[str] = None  # reported, verified, needs_review
    document_available: Optional[bool] = None
    open_findings: Optional[str] = None  # yes / no / unknown
    notes: Optional[str] = None
    evidence_ids: Optional[List[str]] = None


class OnboardingKnownIssue(BaseModel):
    title: str
    source: Optional[str] = None
    priority: Optional[str] = None  # low, medium, high, critical
    owner_id: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = None
    classification: str = "reported"  # reported, verified_finding, needs_review


class OnboardingRequirementResponse(BaseModel):
    name: str
    category: Optional[str] = None
    applicability: str  # applicable, potentially_applicable, needs_review, not_applicable
    note: Optional[str] = None
    rationale: Optional[str] = None  # required if not_applicable


class OnboardingRecurringReview(BaseModel):
    title: str
    review_type: str
    recurrence: Optional[str] = "annual"
    due_days: Optional[int] = 30
    owner_id: Optional[str] = None
    due_date: Optional[str] = None  # explicit ISO override


class OnboardingFinalizeIn(BaseModel):
    client_id: str
    policy_responses: Optional[List[OnboardingPolicyResponse]] = None
    requirement_responses: Optional[List[OnboardingRequirementResponse]] = None
    contacts: Optional[List[OnboardingContact]] = None
    assessments: Optional[List[OnboardingAssessment]] = None
    known_issues: Optional[List[OnboardingKnownIssue]] = None
    recurring_reviews: Optional[List[OnboardingRecurringReview]] = None


_APPLICABILITY_MAP = {
    "applicable": ("active", "applicable"),
    "potentially_applicable": ("under_review", "potentially_applicable"),
    "needs_review": ("under_review", "needs_review"),
    "not_applicable": ("retired", "not_applicable"),
}


# onboarding_requirements_library moved to routes/onboarding.py


# onboarding_state moved to routes/onboarding.py


# onboarding_finalize moved to routes/onboarding.py
async def _legacy_onboarding_finalize_removed(body, user):
    """Idempotent orchestrator for the six-step onboarding wizard.
    Creates or updates records across Policies, Requirements, Contacts,
    Assessments, Tasks (for Known Issues + missing policies), Findings
    (for verified existing findings), and Reviews.
    Never fabricates verified metadata. Never duplicates by (client_id + title).
    """
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden for this client")

    cid = body.client_id
    now = _now()
    counters = {
        "policies_created": 0, "policies_updated": 0,
        "requirements_created": 0, "requirements_updated": 0,
        "contacts_saved": 0,
        "assessments_created": 0,
        "known_issues_promoted": 0,
        "reviews_created": 0,
        "tasks_created": 0,
        "findings_created": 0,
    }
    validation_errors: List[str] = []

    # ---------- 1) Policy responses (reuse the same rules as /policy-responses) ----------
    if body.policy_responses:
        existing_pols = await db.policies.find({"client_id": cid}, {"_id": 0}).to_list(2000)
        by_title = {(p.get("title") or "").strip().lower(): p for p in existing_pols}
        open_pol_tasks = await db.tasks.find(
            {"client_id": cid, "source": "GRC Program Onboarding",
             "status": {"$nin": ["done"]}, "policy_id": {"$exists": True}},
            {"_id": 0}
        ).to_list(2000)
        task_by_policy = {t.get("policy_id"): t for t in open_pol_tasks}

        for r in body.policy_responses:
            resp = (r.response or "").lower().strip()
            if resp not in ("yes", "no", "unsure", "na"): continue
            if resp == "na" and not (r.applicability_rationale or "").strip():
                validation_errors.append(f"Rationale required for N/A policy '{r.name}'"); continue
            presence = _presence_for_response(resp)
            lifecycle = _lifecycle_for_response(resp)
            existing = by_title.get(r.name.strip().lower())
            if existing:
                update = {
                    "presence": presence, "onboarding_note": r.note or existing.get("onboarding_note"),
                    "applicability_rationale": (r.applicability_rationale or existing.get("applicability_rationale")) if resp == "na" else existing.get("applicability_rationale"),
                    "category": r.category or existing.get("category"),
                    "is_client_reported": True, "updated_at": now,
                }
                if existing.get("status") in (None, "", "draft", "needs_verification", "needs_creation", "not_applicable"):
                    update["status"] = lifecycle
                await db.policies.update_one({"policy_id": existing["policy_id"]}, {"$set": update})
                counters["policies_updated"] += 1
                pol_id = existing["policy_id"]
            else:
                pol_id = _uid("pol")
                await db.policies.insert_one({
                    "policy_id": pol_id, "title": r.name, "client_id": cid,
                    "category": r.category, "presence": presence, "status": lifecycle,
                    "onboarding_note": r.note or None,
                    "applicability_rationale": (r.applicability_rationale or None) if resp == "na" else None,
                    "is_client_reported": True,
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["policies_created"] += 1
            await audit(user, "onboarding-response", "policy", pol_id, cid,
                        meta={"response": resp, "presence": presence})
            if resp in ("no", "unsure") and pol_id not in task_by_policy:
                task_title = f"Develop and approve {r.name}" if resp == "no" else f"Confirm whether {r.name} exists"
                tid = _uid("tsk")
                await db.tasks.insert_one({
                    "task_id": tid, "title": task_title, "client_id": cid,
                    "status": "open", "priority": "medium",
                    "policy_id": pol_id, "source": "GRC Program Onboarding",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["tasks_created"] += 1

    # ---------- 2) Requirements ----------
    if body.requirement_responses:
        existing_reqs = await db.requirements.find({"client_id": cid}, {"_id": 0}).to_list(500)
        req_by_name = {(r.get("title") or "").strip().lower(): r for r in existing_reqs}
        for r in body.requirement_responses:
            app = (r.applicability or "").lower()
            if app not in _APPLICABILITY_MAP:
                validation_errors.append(f"Unknown applicability for '{r.name}'"); continue
            if app == "not_applicable" and not (r.rationale or "").strip():
                validation_errors.append(f"Rationale required for N/A requirement '{r.name}'"); continue
            status_val, app_val = _APPLICABILITY_MAP[app]
            existing = req_by_name.get(r.name.strip().lower())
            if existing:
                await db.requirements.update_one(
                    {"requirement_id": existing["requirement_id"]},
                    {"$set": {
                        "applicability": app_val, "status": status_val,
                        "category": r.category or existing.get("category"),
                        "note": r.note or existing.get("note"),
                        "rationale": r.rationale if app == "not_applicable" else existing.get("rationale"),
                        "is_client_reported": True, "updated_at": now,
                    }})
                counters["requirements_updated"] += 1
                req_id = existing["requirement_id"]
            else:
                req_id = _uid("req")
                await db.requirements.insert_one({
                    "requirement_id": req_id, "title": r.name, "client_id": cid,
                    "category": r.category, "applicability": app_val, "status": status_val,
                    "note": r.note or None,
                    "rationale": r.rationale if app == "not_applicable" else None,
                    "source": "GRC Program Onboarding", "is_client_reported": True,
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["requirements_created"] += 1
            await audit(user, "onboarding-response", "requirement", req_id, cid,
                        meta={"applicability": app_val})

    # ---------- 3) Key Roles & Contacts ----------
    if body.contacts:
        existing_contacts = await db.contacts.find({"client_id": cid}, {"_id": 0}).to_list(200)
        by_role = {(c.get("role") or "").strip().lower(): c for c in existing_contacts}
        for c in body.contacts:
            role_key = (c.role or "").strip().lower()
            if not role_key: continue
            if c.not_applicable:
                # Persist the N/A determination but skip email/name fields.
                doc_upsert = {
                    "role": c.role, "client_id": cid,
                    "not_applicable": True, "name": None, "email": None,
                    "notes": c.notes or None, "updated_at": now,
                }
            else:
                doc_upsert = {
                    "role": c.role, "client_id": cid,
                    "name": (c.name or None), "title": (c.title or None),
                    "email": (c.email or None), "phone": (c.phone or None),
                    "linked_user_id": (c.linked_user_id or None),
                    "notes": (c.notes or None),
                    "not_applicable": False,
                    "updated_at": now,
                }
            existing = by_role.get(role_key)
            if existing:
                await db.contacts.update_one({"contact_id": existing["contact_id"]}, {"$set": doc_upsert})
                contact_id = existing["contact_id"]
            else:
                contact_id = _uid("cnt")
                doc_upsert.update({
                    "contact_id": contact_id, "created_at": now, "created_by": user["user_id"],
                })
                await db.contacts.insert_one(doc_upsert)
            counters["contacts_saved"] += 1
            await audit(user, "onboarding-contact", "contact", contact_id, cid,
                        meta={"role": c.role, "not_applicable": bool(c.not_applicable)})

    # ---------- 4) Existing Assessments ----------
    if body.assessments:
        existing_ass = await db.assessments.find({"client_id": cid}, {"_id": 0}).to_list(500)
        # Idempotence key: title + date
        seen_key = {((a.get("name") or "").strip().lower(), a.get("date") or ""): a for a in existing_ass}
        for a in body.assessments:
            key = (a.name.strip().lower(), a.date or "")
            if key in seen_key:
                await db.assessments.update_one(
                    {"assessment_id": seen_key[key]["assessment_id"]},
                    {"$set": {
                        "assessment_type": a.assessment_type,
                        "conducted_by": a.conducted_by,
                        "status": a.status or "reported",
                        "document_available": bool(a.document_available),
                        "open_findings": a.open_findings,
                        "notes": a.notes,
                        "evidence_ids": a.evidence_ids or [],
                        "updated_at": now,
                    }},
                )
                assessment_id = seen_key[key]["assessment_id"]
            else:
                assessment_id = _uid("ass")
                await db.assessments.insert_one({
                    "assessment_id": assessment_id, "name": a.name, "client_id": cid,
                    "assessment_type": a.assessment_type, "date": a.date,
                    "conducted_by": a.conducted_by, "status": a.status or "reported",
                    "document_available": bool(a.document_available),
                    "open_findings": a.open_findings, "notes": a.notes,
                    "evidence_ids": a.evidence_ids or [],
                    "source": "GRC Program Onboarding",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["assessments_created"] += 1
            await audit(user, "onboarding-assessment", "assessment", assessment_id, cid,
                        meta={"type": a.assessment_type})

    # ---------- 5) Known Issues → promote to Tasks/Findings (no separate collection) ----------
    if body.known_issues:
        existing_tasks = await db.tasks.find(
            {"client_id": cid, "source": "GRC Program Onboarding · Known Issue"},
            {"_id": 0, "task_id": 1, "title": 1}
        ).to_list(500)
        existing_findings = await db.findings.find(
            {"client_id": cid, "source": "GRC Program Onboarding · Existing Finding"},
            {"_id": 0, "finding_id": 1, "title": 1}
        ).to_list(500)
        task_titles = {(t.get("title") or "").strip().lower() for t in existing_tasks}
        finding_titles = {(f.get("title") or "").strip().lower() for f in existing_findings}
        for issue in body.known_issues:
            title_key = issue.title.strip().lower()
            if issue.classification == "verified_finding":
                if title_key in finding_titles: continue
                fid = _uid("fnd")
                sev = (issue.priority or "medium").lower()
                await db.findings.insert_one({
                    "finding_id": fid, "title": issue.title, "client_id": cid,
                    "severity": sev if sev in ("critical", "high", "medium", "low", "info") else "medium",
                    "status": "open",
                    "owner_id": issue.owner_id, "due_date": issue.due_date,
                    "description": issue.notes,
                    "source": "GRC Program Onboarding · Existing Finding",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["findings_created"] += 1
                counters["known_issues_promoted"] += 1
                await audit(user, "onboarding-known-issue", "finding", fid, cid,
                            meta={"classification": "verified_finding"})
            else:
                if title_key in task_titles: continue
                tid = _uid("tsk")
                prio = (issue.priority or "medium").lower()
                await db.tasks.insert_one({
                    "task_id": tid, "title": issue.title, "client_id": cid,
                    "status": "open",
                    "priority": prio if prio in ("critical", "high", "medium", "low") else "medium",
                    "assignee_id": issue.owner_id, "due_date": issue.due_date,
                    "description": issue.notes,
                    "source": "GRC Program Onboarding · Known Issue",
                    "created_at": now, "updated_at": now, "created_by": user["user_id"],
                })
                counters["tasks_created"] += 1
                counters["known_issues_promoted"] += 1
                await audit(user, "onboarding-known-issue", "task", tid, cid,
                            meta={"classification": issue.classification})

    # ---------- 6) Recurring Reviews (dedup by title) ----------
    if body.recurring_reviews:
        existing_rev = await db.reviews.find(
            {"client_id": cid, "status": {"$nin": ["completed", "cancelled"]}},
            {"_id": 0, "title": 1}
        ).to_list(1000)
        seen_rev = {(r.get("title") or "").strip().lower() for r in existing_rev}
        for rv in body.recurring_reviews:
            if rv.title.strip().lower() in seen_rev: continue
            due_iso = rv.due_date or (datetime.now(timezone.utc) + timedelta(days=int(rv.due_days or 30))).isoformat()
            rid = _uid("rev")
            await db.reviews.insert_one({
                "review_id": rid, "title": rv.title, "review_type": rv.review_type,
                "client_id": cid, "status": "upcoming",
                "recurrence": rv.recurrence or "annual",
                "owner_id": rv.owner_id or user["user_id"],
                "due_date": due_iso,
                "next_review_date": _next_due_for_recurrence(due_iso, rv.recurrence or "annual", None),
                "source": "GRC Program Onboarding",
                "created_at": now, "updated_at": now, "created_by": user["user_id"],
            })
            counters["reviews_created"] += 1
            seen_rev.add(rv.title.strip().lower())
            await audit(user, "onboarding-review", "review", rid, cid,
                        meta={"review_type": rv.review_type})

    await audit(user, "onboarding-complete", "client", cid, cid, meta=counters)

    return {"ok": True, "counters": counters, "validation_errors": validation_errors}


# ---------------- Wire extracted routers (after all helpers defined) ----------------
from routes.onboarding import router as onboarding_router  # noqa: E402
from routes.portfolio import router as portfolio_router  # noqa: E402
from routes.baseline import router as baseline_router  # noqa: E402
app.include_router(onboarding_router)
app.include_router(portfolio_router)
app.include_router(baseline_router)


# ---------------- Notifications ----------------


@api.get("/notifications")
async def list_notifications(user: Dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({"user_id": user["user_id"], "read": False})
    return {"items": docs, "unread": unread}


@api.post("/notifications/{nid}/read")
async def read_notification(nid: str, user: Dict = Depends(get_current_user)):
    await db.notifications.update_one({"notification_id": nid, "user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all_notifications(user: Dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ---------------- Policy approval workflow ----------------
class PolicyApproveIn(BaseModel):
    comment: Optional[str] = None


class PolicyRejectIn(BaseModel):
    reason: str


async def _policy_history_push(policy_id: str, entry: Dict[str, Any]) -> None:
    entry = {"at": _now(), **entry}
    await db.policies.update_one({"policy_id": policy_id},
                                 {"$push": {"approval_history": entry},
                                  "$set": {"updated_at": _now()}})


@api.post("/policies/{policy_id}/submit-review")
async def policy_submit(policy_id: str, user: Dict = Depends(get_current_user)):
    p = await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    if not _can_access_client(user, p["client_id"]) or not _writable(user):
        raise HTTPException(403, "Forbidden")
    await db.policies.update_one({"policy_id": policy_id}, {"$set": {"status": "in_review", "updated_at": _now()}})
    await _policy_history_push(policy_id, {"action": "submitted",
                                           "by": user["user_id"], "by_email": user["email"]})
    await audit(user, "submit-review", "policy", policy_id, p["client_id"])
    if p.get("approver_id"):
        await create_notification(user_id=p["approver_id"],
                                  title=f"Policy submitted for your approval: {p['title']}",
                                  kind="policy_review", entity_type="policies",
                                  entity_id=policy_id, client_id=p["client_id"])
    return await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})


@api.post("/policies/{policy_id}/approve")
async def policy_approve(policy_id: str, body: PolicyApproveIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform-level roles can approve policies")
    p = await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    await db.policies.update_one({"policy_id": policy_id}, {"$set": {
        "status": "approved", "approver_id": user["user_id"],
        "approved_at": _now(), "updated_at": _now(),
    }})
    await _policy_history_push(policy_id, {"action": "approved",
                                           "by": user["user_id"], "by_email": user["email"],
                                           "comment": body.comment})
    await audit(user, "approve", "policy", policy_id, p["client_id"])
    if p.get("owner_id"):
        await create_notification(user_id=p["owner_id"],
                                  title=f"Policy approved: {p['title']}",
                                  kind="policy_approved", entity_type="policies",
                                  entity_id=policy_id, client_id=p["client_id"])
    return await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})


@api.post("/policies/{policy_id}/reject")
async def policy_reject(policy_id: str, body: PolicyRejectIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform-level roles can reject policies")
    p = await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Not found")
    await db.policies.update_one({"policy_id": policy_id}, {"$set": {"status": "draft", "updated_at": _now()}})
    await _policy_history_push(policy_id, {"action": "rejected",
                                           "by": user["user_id"], "by_email": user["email"],
                                           "reason": body.reason})
    await audit(user, "reject", "policy", policy_id, p["client_id"], meta={"reason": body.reason})
    if p.get("owner_id"):
        await create_notification(user_id=p["owner_id"],
                                  title=f"Policy sent back to draft: {p['title']}",
                                  kind="policy_rejected", entity_type="policies",
                                  entity_id=policy_id, client_id=p["client_id"])
    return await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})


# ---------------- CSV export ----------------
@api.get("/export/{kind}")
async def export_csv(kind: str = Path(..., pattern=KIND_REGEX),
                     client_id: Optional[str] = Query(None),
                     user: Dict = Depends(get_current_user)):
    q = _scope_filter(user, client_id)
    docs = await db[_coll_for(kind)].find(q, {"_id": 0}).sort("created_at", -1).to_list(10000)
    # Column order: id + core fields first, then everything else
    id_field = ID_FIELD_MAP.get(kind, "id")
    preferred = [id_field, "title", "name", "status", "severity", "criticality", "priority",
                 "review_type", "recurrence", "due_date", "next_review_date", "client_id",
                 "owner_id", "reviewer_id", "created_at", "updated_at"]
    seen: List[str] = []
    for d in docs:
        for k in d.keys():
            if k not in seen:
                seen.append(k)
    ordered = [c for c in preferred if c in seen] + [c for c in seen if c not in preferred]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=ordered, extrasaction="ignore")
    writer.writeheader()
    for d in docs:
        row = {}
        for k in ordered:
            v = d.get(k, "")
            row[k] = v if not isinstance(v, (list, dict)) else str(v)
        writer.writerow(row)
    output.seek(0)
    filename = f"{kind}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(iter([output.getvalue()]),
                             media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


# Register routers LAST so all @api.* and @entity_router.* routes are attached.
# NOTE: generic entity router has /{kind} which matches literal segments too, so
# it MUST be registered AFTER all literal /api/... endpoints below.


# ---------------- Bulk actions ----------------
CLOSE_STATUS = {
    "findings": "closed", "tasks": "done", "reviews": "completed",
    "risks": "closed", "exceptions": "revoked", "policies": "retired",
    "vendors": "terminated", "assets": "under_review",
}


class BulkIn(BaseModel):
    kind: str
    ids: List[str]
    action: str  # close | set-status | set-owner | assign | update | delete
    payload: Optional[Dict[str, Any]] = None


@app.post("/api/bulk")
async def bulk_action(body: BulkIn, user: Dict = Depends(get_current_user)):
    if body.kind not in ENTITY_MAP:
        raise HTTPException(404, "Unknown entity")
    if not body.ids:
        raise HTTPException(400, "No records selected")
    entity_type, _M, id_field, _p = ENTITY_MAP[body.kind]
    coll = db[body.kind]
    docs = await coll.find({id_field: {"$in": body.ids}}, {"_id": 0}).to_list(len(body.ids) + 1)
    if not docs:
        raise HTTPException(404, "No records found")
    for d in docs:
        if not _can_access_client(user, d["client_id"]):
            raise HTTPException(403, "Forbidden for one or more records")

    if body.action == "delete":
        if user.get("role") not in ("super_admin", "platform_admin"):
            raise HTTPException(403, "Destructive action restricted")
        await coll.delete_many({id_field: {"$in": body.ids}})
        for d in docs:
            await audit(user, "bulk-delete", entity_type, d[id_field], d["client_id"])
        return {"ok": True, "count": len(docs)}

    if not _writable(user):
        raise HTTPException(403, "Read-only role")

    payload = body.payload or {}
    if body.action == "close":
        updates = {"status": CLOSE_STATUS.get(body.kind, "closed")}
    elif body.action == "set-status":
        if "status" not in payload:
            raise HTTPException(400, "Missing status")
        updates = {"status": payload["status"]}
    elif body.action == "set-owner":
        owner_field = "assignee_id" if body.kind == "tasks" else "owner_id"
        v = payload.get("owner_id") or payload.get("assignee_id")
        updates = {owner_field: (None if v in (None, "", "__none__") else v)}
    elif body.action == "assign":
        v = payload.get("assignee_id") or payload.get("owner_id")
        updates = {"assignee_id": (None if v in (None, "", "__none__") else v)}
    elif body.action == "set-due-date":
        v = payload.get("due_date")
        if not v:
            raise HTTPException(400, "Missing due_date")
        updates = {"due_date": v}
    elif body.action == "update":
        updates = {k: v for k, v in payload.items() if k not in (id_field, "client_id", "created_at", "created_by")}
    else:
        raise HTTPException(400, "Unknown bulk action")

    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = _now()
    await coll.update_many({id_field: {"$in": body.ids}}, {"$set": updates})
    for d in docs:
        await audit(user, f"bulk-{body.action}", entity_type, d[id_field], d["client_id"], meta=updates)
    return {"ok": True, "count": len(docs), "updates": updates}


# ---------------- Calendar ----------------
@app.get("/api/calendar")
async def calendar_view(client_id: Optional[str] = Query(None),
                        start: Optional[str] = Query(None),
                        end: Optional[str] = Query(None),
                        user: Dict = Depends(get_current_user)):
    scope = _scope_filter(user, client_id)
    date_q: Dict[str, Any] = {"$exists": True, "$ne": None}
    if start:
        date_q["$gte"] = start
    if end:
        date_q["$lte"] = end
    reviews = await db.reviews.find({**scope, "due_date": date_q}, {"_id": 0}).to_list(5000)
    findings = await db.findings.find({**scope, "due_date": date_q}, {"_id": 0}).to_list(5000)
    tasks = await db.tasks.find({**scope, "due_date": date_q}, {"_id": 0}).to_list(5000)
    # Group by yyyy-mm-dd for easier client rendering
    def bucket(items, kind, title_key):
        out: Dict[str, List] = {}
        for it in items:
            d = (it.get("due_date") or "")[:10]
            if not d:
                continue
            out.setdefault(d, []).append({
                "id": it.get(kind + "_id"), "kind": kind,
                "title": it.get(title_key), "status": it.get("status"),
                "severity": it.get("severity"), "priority": it.get("priority"),
                "owner_id": it.get("owner_id") or it.get("assignee_id"),
                "review_type": it.get("review_type"),
                "due_date_iso": it.get("due_date"),
            })
        return out
    return {
        "reviews": bucket(reviews, "review", "title"),
        "findings": bucket(findings, "finding", "title"),
        "tasks": bucket(tasks, "task", "title"),
    }


# ---------------- Board Report (PDF) ----------------
async def _build_board_report(client_id: str, user: Dict) -> bytes:
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    now_iso = _now()
    horizon = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    overdue_reviews = await db.reviews.find(
        {"client_id": client_id, "status": {"$nin": ["completed", "cancelled"]}, "due_date": {"$lt": now_iso}},
        {"_id": 0}).sort("due_date", 1).to_list(50)
    upcoming = await db.reviews.find(
        {"client_id": client_id, "due_date": {"$gte": now_iso, "$lte": horizon}},
        {"_id": 0}).sort("due_date", 1).to_list(50)
    open_findings = await db.findings.find(
        {"client_id": client_id, "status": {"$in": ["open", "in_remediation"]}},
        {"_id": 0}).sort("severity", -1).to_list(50)
    critical_findings = [f for f in open_findings if f.get("severity") in ("high", "critical")]
    top_risks = await db.risks.find(
        {"client_id": client_id, "status": {"$nin": ["closed"]}, "impact": {"$in": ["high"]}},
        {"_id": 0}).sort("created_at", -1).to_list(50)
    approvals_cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
    recent_approvals = await db.policies.find(
        {"client_id": client_id, "approved_at": {"$gte": approvals_cutoff}}, {"_id": 0}).sort("approved_at", -1).to_list(20)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER, topMargin=0.5 * inch,
                            bottomMargin=0.5 * inch, leftMargin=0.6 * inch, rightMargin=0.6 * inch)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Mini", fontName="Helvetica", fontSize=8, textColor=rl_colors.HexColor("#64748B")))
    styles.add(ParagraphStyle(name="Section", fontName="Helvetica-Bold", fontSize=11,
                              textColor=rl_colors.HexColor("#0F172A"), spaceBefore=10, spaceAfter=4))
    styles["Title"].fontSize = 18
    styles["Title"].textColor = rl_colors.HexColor("#0F172A")
    styles["Title"].alignment = 0

    story: List = []
    story.append(Paragraph("Northstar GRC — Board Report", styles["Title"]))
    story.append(Paragraph(f"{client['name']} · {datetime.now(timezone.utc).strftime('%d %B %Y')}", styles["Mini"]))
    story.append(Spacer(1, 8))

    # KPIs
    kpi_data = [
        ["Overdue reviews", "Open findings", "High/critical findings", "Significant risks"],
        [str(len(overdue_reviews)), str(len(open_findings)), str(len(critical_findings)), str(len(top_risks))],
    ]
    kpi_table = Table(kpi_data, colWidths=[1.7 * inch] * 4)
    kpi_table.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, 0), "Helvetica", 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.HexColor("#64748B")),
        ("FONT", (0, 1), (-1, 1), "Helvetica-Bold", 20),
        ("TEXTCOLOR", (0, 1), (-1, 1), rl_colors.HexColor("#0F172A")),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
        ("TOPPADDING", (0, 1), (-1, 1), 0),
        ("LINEBELOW", (0, 1), (-1, 1), 0.5, rl_colors.HexColor("#E2E8F0")),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 8))

    def rows(items, cols):
        rowset = [cols[0]]
        for it in items[:8]:
            rowset.append([str(it.get(k) or "—")[:60] for k in cols[1]])
        return rowset

    def section(title, headers, keys, items, widths):
        story.append(Paragraph(title, styles["Section"]))
        if not items:
            story.append(Paragraph("None.", styles["Mini"]))
            return
        data = [headers] + [[str(it.get(k) or "—")[:80] if k != "due_date" and k != "approved_at" else
                             (str(it.get(k) or "")[:10] or "—") for k in keys] for it in items[:8]]
        t = Table(data, colWidths=widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
            ("BACKGROUND", (0, 0), (-1, 0), rl_colors.HexColor("#F8FAFC")),
            ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.HexColor("#64748B")),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
            ("TEXTCOLOR", (0, 1), (-1, -1), rl_colors.HexColor("#0F172A")),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, rl_colors.HexColor("#E2E8F0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t)

    section("Overdue reviews",
            ["Title", "Type", "Due", "Status"],
            ["title", "review_type", "due_date", "status"],
            overdue_reviews,
            [3.2 * inch, 1.2 * inch, 1.0 * inch, 1.1 * inch])

    section("Critical / high findings",
            ["Finding", "Severity", "Due", "Status"],
            ["title", "severity", "due_date", "status"],
            critical_findings or open_findings,
            [3.2 * inch, 1.0 * inch, 1.0 * inch, 1.3 * inch])

    section("Significant risks (high impact)",
            ["Risk", "Category", "Likelihood", "Impact", "Status"],
            ["title", "category", "likelihood", "impact", "status"],
            top_risks,
            [2.6 * inch, 1.0 * inch, 1.0 * inch, 0.7 * inch, 1.2 * inch])

    section("Policy approvals — last 90 days",
            ["Policy", "Version", "Approved on", "Status"],
            ["title", "version", "approved_at", "status"],
            recent_approvals,
            [3.2 * inch, 0.7 * inch, 1.3 * inch, 1.3 * inch])

    section("Upcoming reviews — next 30 days",
            ["Title", "Type", "Due"],
            ["title", "review_type", "due_date"],
            upcoming,
            [3.6 * inch, 1.3 * inch, 1.6 * inch])

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        f"Generated by {user.get('name') or user.get('email')} · {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · Confidential",
        styles["Mini"]))

    doc.build(story)
    return buf.getvalue()


@app.get("/api/reports/board")
async def reports_board(client_id: str = Query(...), user: Dict = Depends(get_current_user)):
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden")
    pdf_bytes = await _build_board_report(client_id, user)
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0}) or {}
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", (client.get("name") or "client")).strip("-").lower()
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"board-report-{slug}-{date_str}.pdf"
    await audit(user, "generate", "board-report", client_id, client_id)
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# Actually mount the routers now — after all literal routes are declared.
app.include_router(api)
app.include_router(entity_router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # cookies are cross-site secure=none but we also return token in body
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@app.on_event("shutdown")
async def _on_stop():
    client.close()
