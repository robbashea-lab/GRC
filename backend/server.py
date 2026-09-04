from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import bcrypt
import jwt
import httpx
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, Path
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
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


async def _get_user_from_token(token: str) -> Optional[Dict]:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
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
    status: Optional[str] = "planned"  # planned, in_progress, blocked, completed, overdue
    scope: Optional[str] = None
    notes: Optional[str] = None
    recurrence: Optional[str] = "none"  # none, monthly, quarterly, semiannual, annual
    next_review_date: Optional[str] = None
    completion_date: Optional[str] = None


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
    """Exchange Emergent Google OAuth session_id for a session."""
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
}


def _coll_for(kind: str) -> str:
    return kind  # collection name equals plural


KIND_REGEX = "^(reviews|findings|risks|policies|vendors|assets|tasks)$"
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
    overdue_reviews = await db.reviews.count_documents({**scope, "status": {"$nin": ["completed"]}, "due_date": {"$lt": now_iso}})
    open_findings = await db.findings.count_documents({**scope, "status": {"$in": ["open", "in_remediation"]}})
    critical_findings = await db.findings.count_documents({**scope, "severity": {"$in": ["high", "critical"]}, "status": {"$in": ["open", "in_remediation"]}})
    significant_risks = await db.risks.count_documents({**scope, "impact": {"$in": ["high"]}, "status": {"$nin": ["closed"]}})
    # Upcoming reviews (next 30 days)
    horizon = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    upcoming = await db.reviews.find({**scope, "due_date": {"$gte": now_iso, "$lte": horizon}}, {"_id": 0}).sort("due_date", 1).limit(10).to_list(10)
    recent_findings = await db.findings.find({**scope, "status": {"$in": ["open", "in_remediation"]}}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)
    top_risks = await db.risks.find({**scope, "status": {"$nin": ["closed"]}}, {"_id": 0}).sort("created_at", -1).limit(6).to_list(6)
    return {
        "kpis": {
            "overdue_reviews": overdue_reviews,
            "open_findings": open_findings,
            "critical_findings": critical_findings,
            "significant_risks": significant_risks,
        },
        "upcoming_reviews": upcoming,
        "recent_findings": recent_findings,
        "top_risks": top_risks,
    }


# ---------------- Startup: seed ----------------
async def seed():
    await db.users.create_index("email", unique=True)
    await db.clients.create_index("client_id", unique=True)
    for coll in ["reviews", "findings", "risks", "policies", "vendors", "assets", "tasks", "evidence"]:
        await db[coll].create_index("client_id")

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
               owner_id=own, reviewer_id=pa_uid, status="overdue", scope="All privileged accounts",
               recurrence="quarterly", next_review_date=isod(90)),
            mk("reviews", "rev", "review_id", title=f"Vendor Review — Primary SaaS providers",
               review_type="vendor", client_id=tenant["client_id"], due_date=isod(12), owner_id=own,
               status="in_progress", recurrence="annual"),
            mk("reviews", "rev", "review_id", title="Patch & Vulnerability Review",
               review_type="vulnerability", client_id=tenant["client_id"], due_date=isod(21),
               owner_id=own, status="planned", recurrence="monthly"),
            mk("reviews", "rev", "review_id", title="Policy Review — Information Security Policy",
               review_type="policy", client_id=tenant["client_id"], due_date=isod(45),
               owner_id=own, status="planned", recurrence="annual"),
            mk("reviews", "rev", "review_id", title="BCP / DR Tabletop Exercise",
               review_type="bcp_dr", client_id=tenant["client_id"], due_date=isod(60),
               owner_id=own, status="planned", recurrence="semiannual"),
            mk("reviews", "rev", "review_id", title="Security Awareness Training Review",
               review_type="awareness", client_id=tenant["client_id"], due_date=isod(-10),
               owner_id=own, status="overdue", recurrence="quarterly"),
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


app.include_router(api)

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
