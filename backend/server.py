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
from typing import List, Optional, Any, Dict

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
    likelihood: str = "medium"  # low, medium, high
    impact: str = "medium"  # low, medium, high
    status: str = "identified"  # identified, assessed, treated, accepted, closed
    owner_id: Optional[str] = None
    description: Optional[str] = None
    treatment: Optional[str] = None
    accepted: Optional[bool] = False


class PolicyIn(BaseModel):
    title: str
    client_id: str
    version: str = "1.0"
    status: str = "draft"  # draft, in_review, approved, retired
    owner_id: Optional[str] = None
    approver_id: Optional[str] = None
    approved_at: Optional[str] = None
    next_review_date: Optional[str] = None
    summary: Optional[str] = None


class VendorIn(BaseModel):
    name: str
    client_id: str
    criticality: str = "medium"  # low, medium, high, critical
    status: str = "active"  # active, under_review, terminated
    contact_email: Optional[str] = None
    services: Optional[str] = None
    contract_end: Optional[str] = None


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


class BaselineIn(BaseModel):
    client_id: str
    policies: List[str] = []      # list of policy titles to seed
    risks: List[str] = []         # list of risk titles to seed
    reviews: List[Dict[str, Any]] = []  # [{title, review_type, recurrence, due_days}]


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
    token = create_access_token(u["user_id"], email)
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
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        # Auto-create with readonly role by default; admin email keeps super_admin if configured
        role = "super_admin" if email == os.environ.get("ADMIN_EMAIL", "").lower() else "client_readonly"
        user_id = _uid("user")
        user = {
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "role": role,
            "client_ids": [],
            "auth_provider": "google",
            "created_at": _now(),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one({"email": email}, {"$set": {"picture": data.get("picture"), "auth_provider": user.get("auth_provider") or "google"}})
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
async def list_clients(user: Dict = Depends(get_current_user)):
    role = user.get("role")
    q = {} if role in ("super_admin", "platform_admin") else {"client_id": {"$in": user.get("client_ids") or []}}
    docs = await db.clients.find(q, {"_id": 0}).to_list(500)
    return docs


@api.post("/clients")
async def create_client(body: ClientIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform admins can create clients")
    cid = _uid("cli")
    doc = {"client_id": cid, "name": body.name, "industry": body.industry,
           "environment": body.environment, "created_at": _now()}
    await db.clients.insert_one(doc)
    await audit(user, "create", "client", cid, cid)
    doc.pop("_id", None)
    return doc


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
}


def _coll_for(kind: str) -> str:
    return kind  # collection name equals plural


KIND_REGEX = "^(reviews|findings|risks|policies|vendors|assets|tasks|exceptions)$"
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
@api.get("/audit-logs")
async def list_audit(client_id: Optional[str] = Query(None), user: Dict = Depends(get_current_user)):
    role = user.get("role")
    if role in ("super_admin", "platform_admin"):
        q = {"client_id": client_id} if client_id else {}
    else:
        allowed = user.get("client_ids") or []
        q = {"client_id": client_id} if (client_id and client_id in allowed) else {"client_id": {"$in": allowed}}
    docs = await db.audit_logs.find(q, {"_id": 0}).sort("at", -1).limit(500).to_list(500)
    return docs


# ---------------- Users (admin) ----------------
@api.get("/users")
async def list_users(user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Forbidden")
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return docs


# ---------------- Dashboard ----------------
@api.get("/dashboard")
async def dashboard(client_id: Optional[str] = Query(None), user: Dict = Depends(get_current_user)):
    scope = _scope_filter(user, client_id)
    now_iso = _now()
    horizon = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    # Fetch minimal working sets once, filter in Python — saves round-trips.
    reviews = await db.reviews.find(scope, {"_id": 0}).sort("due_date", 1).to_list(2000)
    findings = await db.findings.find(scope, {"_id": 0}).sort("created_at", -1).to_list(2000)
    risks = await db.risks.find(scope, {"_id": 0}).sort("created_at", -1).to_list(2000)
    policies = await db.policies.find(scope, {"_id": 0}).to_list(1000)
    vendors = await db.vendors.find(scope, {"_id": 0}).to_list(1000)
    tasks = await db.tasks.find(scope, {"_id": 0}).sort("due_date", 1).to_list(1000)
    exceptions = await db.exceptions.find(scope, {"_id": 0}).to_list(500)

    def is_overdue(item, date_field="due_date", closed_statuses=("completed", "done", "closed", "remediated", "retired", "cancelled")):
        d = item.get(date_field)
        return bool(d and d < now_iso and item.get("status") not in closed_statuses)

    overdue_reviews = [r for r in reviews if is_overdue(r)]
    overdue_findings = [f for f in findings if is_overdue(f)]
    overdue_tasks = [t for t in tasks if is_overdue(t)]
    open_findings = [f for f in findings if f.get("status") in ("open", "in_remediation")]
    critical_high = [f for f in open_findings if f.get("severity") in ("high", "critical")]
    significant_risks = [r for r in risks if r.get("impact") == "high" and r.get("status") != "closed"]

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

    # Your Actions — items owned/assigned to me and still open
    me = user["user_id"]
    def mine(items, open_statuses):
        return [i for i in items if (i.get("owner_id") == me or i.get("assignee_id") == me) and i.get("status") in open_statuses]
    your_actions = (
        [{**_brief(x, "finding", "finding_id"), "action": "Respond"} for x in mine(findings, ("open", "in_remediation"))]
        + [{**_brief(x, "task", "task_id"), "action": "Continue"} for x in mine(tasks, ("open", "in_progress", "blocked"))]
        + [{**_brief(x, "review", "review_id"), "action": "Start review"} for x in mine(reviews, ("upcoming", "in_progress"))]
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
        "needs_attention": needs,
        "priority_findings": priority_findings,
        "your_actions": your_actions,
        "watch_items": watch,
        "program_status": program_status,
        "recent_activity": logs,
        "upcoming_reviews": [_brief(r, "review", "review_id") for r in upcoming_reviews[:8]],
        "recent_findings": [_brief(f, "finding", "finding_id") for f in open_findings[:8]],
        "top_risks": [_brief(r, "risk", "risk_id") for r in significant_risks[:6]],
    }


# ---------------- Startup: seed ----------------
async def seed():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("client_id", unique=True)
    for coll in ["reviews", "findings", "risks", "policies", "vendors", "assets", "tasks", "evidence"]:
        await db[coll].create_index("client_id")
    await db.password_resets.create_index("token_hash", unique=True)
    await db.sessions.create_index("session_token", unique=True)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    # Tenants
    acme = await db.clients.find_one({"name": "Acme Corp"}, {"_id": 0})
    if not acme:
        acme = {"client_id": _uid("cli"), "name": "Acme Corp", "industry": "Manufacturing", "environment": "Production", "created_at": _now()}
        await db.clients.insert_one(acme)
    globex = await db.clients.find_one({"name": "Globex Ltd"}, {"_id": 0})
    if not globex:
        globex = {"client_id": _uid("cli"), "name": "Globex Ltd", "industry": "Fintech", "environment": "Production", "created_at": _now()}
        await db.clients.insert_one(globex)

    async def ensure_user(email, name, role, client_ids, password=None):
        u = await db.users.find_one({"email": email})
        if u:
            # Keep role/tenants aligned + rehash pw if provided and different
            update = {"role": role, "client_ids": client_ids, "name": name}
            if password and not verify_password(password, u.get("password_hash") or ""):
                update["password_hash"] = hash_password(password)
            await db.users.update_one({"email": email}, {"$set": update})
            return u["user_id"]
        uid = _uid("user")
        doc = {"user_id": uid, "email": email, "name": name, "role": role,
               "client_ids": client_ids, "auth_provider": "password",
               "password_hash": hash_password(password) if password else None,
               "created_at": _now()}
        await db.users.insert_one(doc)
        return uid

    admin_uid = await ensure_user(admin_email, "Rob Bashea", "super_admin", [acme["client_id"], globex["client_id"]], admin_password)
    pa_uid = await ensure_user("platform.admin@grc.demo", "Platform Admin", "platform_admin", [acme["client_id"], globex["client_id"]], "Demo@2026")
    c_acme = await ensure_user("contributor@acme.demo", "Alicia Rivera", "client_contributor", [acme["client_id"]], "Demo@2026")
    r_acme = await ensure_user("readonly@acme.demo", "Ravi Kumar", "client_readonly", [acme["client_id"]], "Demo@2026")
    c_glob = await ensure_user("contributor@globex.demo", "Chen Wei", "client_contributor", [globex["client_id"]], "Demo@2026")

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


# ---------------- Baseline assessment ----------------
BASELINE_TEMPLATES = {
    "policies": [
        "Information Security Policy", "Access Control Policy", "Acceptable Use Policy",
        "Incident Response Plan", "Business Continuity Plan", "Vendor Management Policy",
        "Data Classification & Handling Policy", "Change Management Policy",
    ],
    "risks": [
        "Ransomware disruption to core systems", "Phishing leading to account compromise",
        "Third-party vendor outage", "Insider misuse of privileged access",
        "Data loss due to unencrypted device", "Regulatory non-compliance",
    ],
    "review_templates": [
        {"title": "Quarterly Access Review", "review_type": "access", "recurrence": "quarterly", "due_days": 30},
        {"title": "Vendor Risk Review", "review_type": "vendor", "recurrence": "annual", "due_days": 45},
        {"title": "Patch & Vulnerability Review", "review_type": "vulnerability", "recurrence": "monthly", "due_days": 15},
        {"title": "Policy Review — Information Security Policy", "review_type": "policy", "recurrence": "annual", "due_days": 60},
        {"title": "BCP / DR Tabletop Exercise", "review_type": "bcp_dr", "recurrence": "semiannual", "due_days": 90},
        {"title": "Security Awareness Training Review", "review_type": "awareness", "recurrence": "quarterly", "due_days": 30},
    ],
}


@api.get("/baseline/templates")
async def baseline_templates(user: Dict = Depends(get_current_user)):
    return BASELINE_TEMPLATES


@api.post("/baseline")
async def create_baseline(body: BaselineIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden for this client")
    created = {"policies": 0, "risks": 0, "reviews": 0}
    for title in body.policies:
        doc = {"policy_id": _uid("pol"), "title": title, "client_id": body.client_id,
               "version": "1.0", "status": "draft", "owner_id": user["user_id"],
               "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"]}
        await db.policies.insert_one(doc)
        created["policies"] += 1
    for title in body.risks:
        doc = {"risk_id": _uid("rsk"), "title": title, "client_id": body.client_id,
               "category": "operational", "likelihood": "medium", "impact": "medium",
               "status": "identified", "owner_id": user["user_id"],
               "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"]}
        await db.risks.insert_one(doc)
        created["risks"] += 1
    for rv in body.reviews:
        due_days = int(rv.get("due_days", 30))
        doc = {
            "review_id": _uid("rev"),
            "title": rv.get("title") or "Review",
            "review_type": rv.get("review_type") or "asset",
            "client_id": body.client_id,
            "status": "upcoming",
            "recurrence": rv.get("recurrence") or "quarterly",
            "owner_id": user["user_id"],
            "due_date": (datetime.now(timezone.utc) + timedelta(days=due_days)).isoformat(),
            "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"],
        }
        await db.reviews.insert_one(doc)
        created["reviews"] += 1
    await audit(user, "baseline", "client", body.client_id, body.client_id, meta=created)
    return {"ok": True, "created": created}


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
