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
import base64
import asyncio
import inspect
from functools import wraps
import bcrypt
import jwt
import httpx
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict, Tuple

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query, Path, Header, Body
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
from pydantic import BaseModel, Field, EmailStr, ValidationError
from pymongo.errors import DuplicateKeyError
from grc_rules import RULES, CLOSED, is_open, assessed_risk, risk_level, risk_due, represented_finding
import action_items
import assignment_eligibility
import client_relationships
import remediation
import risk_ids
import policy_reviews
import policy_approval
import policy_provenance
import risk_lifecycle
import vendor_governance
import review_occurrences
import ai_governance
import framework_governance
import evidence_context
import json
import create_requests

# ---------------- DB ----------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="GRC Platform")
api = APIRouter(prefix="/api")


def risk_mutation(fn):
    """Serialize Risk decisions with linked Review execution across workers."""
    signature = inspect.signature(fn)
    @wraps(fn)
    async def wrapped(*args, **kwargs):
        values = signature.bind_partial(*args, **kwargs).arguments
        rid = values.get("risk_id") or (values.get("item_id") if values.get("kind") == "risks" else None)
        if values.get("kind") == "tasks":
            data = values.get("body") or {}
            task = await db.tasks.find_one({"task_id":values.get("item_id")}) if values.get("item_id") else data
            rid = (task or {}).get("risk_id") or (data.get("source_id") if data.get("source_type") == "risk" else None)
        review_id = values.get("review_id") or (values.get("item_id") if values.get("kind") == "reviews" else None)
        if review_id:
            review = await _authorized_parent("reviews", review_id, values["user"], write=True)
            rid = review.get("risk_id")
        if not rid:
            return await fn(*args, **kwargs)
        risk = await _authorized_parent("risks", rid, values["user"], write=True)
        if review_id and risk.get("status") in risk_lifecycle.CLOSED:
            raise HTTPException(409, "Closed Risks have no active Review operations")
        token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
        acquired = await db.risks.update_one({"risk_id":rid,"$or":[{"_governance_lock":None},{"_governance_lock.until":{"$lt":now.isoformat()}}]},
            {"$set":{"_governance_lock":{"token":token,"until":(now+timedelta(seconds=120)).isoformat()}}})
        if not acquired.modified_count:
            raise HTTPException(409, "Another Risk action is being saved; please retry")
        try:
            linked = await db.reviews.find_one({"risk_id":rid,"client_id":risk["client_id"]},{"_id":0})
            if linked:
                await risk_lifecycle.sync_completion(db, linked)
            return await asyncio.wait_for(fn(*args, **kwargs), timeout=90)
        finally:
            await db.risks.update_one({"risk_id":rid,"_governance_lock.token":token},{"$unset":{"_governance_lock":""}})
    return wrapped


def finding_mutation(fn):
    """Serialize validation with remediation edits using the existing lease pattern."""
    signature = inspect.signature(fn)
    @wraps(fn)
    async def wrapped(*args, **kwargs):
        values = signature.bind_partial(*args, **kwargs).arguments
        fid = values.get('finding_id') or (values.get('item_id') if values.get('kind') == 'findings' else None)
        if values.get('kind') == 'tasks':
            data = values.get('body') or {}
            row = await db.tasks.find_one({'task_id':values['item_id']}) if values.get('item_id') else data
            fid = (row or {}).get('finding_id') or (data.get('source_id') if data.get('source_type') == 'finding' else None)
        if not fid:
            return await fn(*args, **kwargs)
        await _authorized_parent('findings', fid, values['user'], write=True)
        token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
        acquired = await db.findings.update_one({'finding_id':fid,'$or':[
            {'_remediation_lock':None},{'_remediation_lock.until':{'$lt':now.isoformat()}}]},
            {'$set':{'_remediation_lock':{'token':token,'until':(now+timedelta(seconds=120)).isoformat()}}})
        if not acquired.modified_count:
            raise HTTPException(409,'Another remediation action is being saved; reload before retrying')
        try:
            result = await asyncio.wait_for(fn(*args, **kwargs), timeout=90)
            if isinstance(result, dict):
                result.pop('_remediation_lock', None)
            return result
        finally:
            await db.findings.update_one({'finding_id':fid,'_remediation_lock.token':token},{'$unset':{'_remediation_lock':''}})
    return wrapped


def configuration_mutation(fn):
    """Serialize client configuration and its existing reconciliation steps."""
    signature = inspect.signature(fn)
    @wraps(fn)
    async def wrapped(*args, **kwargs):
        values = signature.bind_partial(*args, **kwargs).arguments
        body, user = values['body'], values['user']
        cid = body.client_id
        if not _can_access_client(user, cid) or not _writable(user):
            raise HTTPException(403, 'Forbidden for this client')
        token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
        acquired = await db.clients.update_one({'client_id':cid,'$or':[
            {'_configuration_lock':None},{'_configuration_lock.until':{'$lt':now.isoformat()}}]},
            {'$set':{'_configuration_lock':{'token':token,'until':(now+timedelta(seconds=120)).isoformat()}}})
        if not acquired.modified_count:
            if not await db.clients.find_one({'client_id':cid}):raise HTTPException(404,'Client not found')
            raise HTTPException(409,'Another configuration change is being saved; reload before retrying')
        try:
            return await asyncio.wait_for(fn(*args, **kwargs), timeout=90)
        finally:
            await db.clients.update_one({'client_id':cid,'_configuration_lock.token':token},{'$unset':{'_configuration_lock':''}})
    return wrapped


def vendor_mutation(fn):
    """Serialize Vendor configuration and linked Review completion across workers."""
    signature = inspect.signature(fn)
    @wraps(fn)
    async def wrapped(*args, **kwargs):
        values = signature.bind_partial(*args, **kwargs).arguments
        vid = values.get("vendor_id") or (values.get("item_id") if values.get("kind") == "vendors" else None)
        rid = values.get("review_id") or (values.get("item_id") if values.get("kind") == "reviews" else None)
        if rid:
            review = await _authorized_parent("reviews", rid, values["user"], write=True)
            vid = review.get("vendor_id")
        if not vid:
            return await fn(*args, **kwargs)
        vendor = await _authorized_parent("vendors", vid, values["user"], write=True)
        if rid and vendor.get("status") == "inactive" and review.get("vendor_purpose") != "offboarding":
            raise HTTPException(409, "Inactive Vendors have no active recurring Reviews")
        token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
        acquired = await db.vendors.update_one({"vendor_id":vid,"$or":[{"_governance_lock":None},{"_governance_lock.until":{"$lt":now.isoformat()}}]},
            {"$set":{"_governance_lock":{"token":token,"until":(now+timedelta(seconds=120)).isoformat()}}})
        if not acquired.modified_count:
            raise HTTPException(409, "Another Vendor action is being saved; please retry")
        try:
            linked = await db.reviews.find({"vendor_id":vid,"client_id":vendor["client_id"]},{"_id":0}).to_list(None)
            for item in linked:
                if item.get("occurrences"):
                    await vendor_governance.sync_completion(db,item)
            return await asyncio.wait_for(fn(*args, **kwargs), timeout=90)
        finally:
            await db.vendors.update_one({"vendor_id":vid,"_governance_lock.token":token},{"$unset":{"_governance_lock":""}})
    return wrapped


def review_mutation(fn):
    """Serialize occurrence writes across workers; abandoned leases expire safely."""
    signature = inspect.signature(fn)
    @wraps(fn)
    async def wrapped(*args, **kwargs):
        values = signature.bind_partial(*args, **kwargs).arguments
        body = values.get("body")
        data = body.model_dump() if isinstance(body, BaseModel) else body or {}
        review_id = values.get("review_id")
        if values.get("kind") == "reviews":
            review_id = values.get("item_id")
        if data.get("linked_type") in ("review", "reviews"):
            review_id = data.get("linked_id")
        if data.get("entity_type") in ("review", "reviews"):
            review_id = data.get("entity_id")
        if not review_id:
            return await fn(*args, **kwargs)
        linked_review = await _authorized_parent("reviews", review_id, values["user"], write=True)
        token = uuid.uuid4().hex
        now = datetime.now(timezone.utc)
        acquired = await db.reviews.update_one({"review_id": review_id, "$or": [
            {"_execution_lock": None}, {"_execution_lock.until": {"$lt": now.isoformat()}}]},
            {"$set": {"_execution_lock": {"token": token, "until": (now + timedelta(seconds=90)).isoformat()}}})
        if not acquired.modified_count:
            raise HTTPException(409, "Another occurrence action is being saved; please retry")
        try:
            async with ai_governance.lease(db, linked_review.get('ai_system_id')):
                if linked_review.get('ai_system_id'):
                    ai_parent = await _authorized_parent('ai_systems', linked_review['ai_system_id'], values['user'])
                    if ai_parent.get('status') == 'retired' and (linked_review.get('status') != 'in_progress' or values.get('kind') == 'reviews' and set(data) - {'notes','expected_occurrence_id','expected_updated_at'}):
                        raise HTTPException(409, 'Retired AI only permits completion of already-started closure work')
                return await asyncio.wait_for(fn(*args, **kwargs), timeout=60)
        finally:
            await db.reviews.update_one({"review_id": review_id, "_execution_lock.token": token}, {"$unset": {"_execution_lock": ""}})
    return wrapped

JWT_ALGORITHM = "HS256"


def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def _uid(prefix: str = "id") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_write_time(previous: Optional[str]) -> str:
    """Keep optimistic edit tokens distinct when the system clock repeats."""
    current = datetime.fromisoformat(_now())
    if previous:
        prior = datetime.fromisoformat(previous.replace("Z", "+00:00"))
        if prior.tzinfo is None:
            prior = prior.replace(tzinfo=timezone.utc)
        if prior >= current:
            current = prior + timedelta(microseconds=1)
    return current.isoformat()


def _require_snapshot(incoming, existing, field="updated_at"):
    """Require the version the editor actually loaded, including legacy null."""
    key = "expected_" + field
    if key not in incoming:
        raise HTTPException(428, "Reload the record before saving; an edit version is required")
    if incoming[key] != existing.get(field):
        label = "Assessment" if field == "last_assessed" else "Record"
        raise HTTPException(409, label + " changed since it was opened; reload before saving")


async def _save_snapshot(collection, identity, existing, incoming, updates):
    """Conditional writes shared by legacy multi-record onboarding editors."""
    _require_snapshot(incoming, existing)
    updates = {**updates, "updated_at": _next_write_time(existing.get("updated_at"))}
    changed = await collection.update_one({**identity, "updated_at": existing.get("updated_at")}, {"$set": updates})
    if changed.matched_count != 1:
        raise HTTPException(409, "Record changed during save; reload before saving. Earlier records may have been saved.")


# ---------------- Password ----------------
def hash_password(p: str) -> str:
    # Match the existing minimum used by password reset; bcrypt 5 rejects
    # inputs above 72 bytes. Validate before hashing on every credential path.
    if len(p) < 8 or len(p.encode("utf-8")) > 72:
        raise HTTPException(422, "Password must contain at least 8 characters and no more than 72 UTF-8 bytes")
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
               "iat": now.timestamp(), "exp": now + timedelta(days=7)}
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


async def _get_user_from_token(token: str) -> Optional[Dict]:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user or user.get("status", "active") != "active":
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
                iat_dt = datetime.fromtimestamp(float(iat), tz=timezone.utc)
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
    return user if user and user.get("status", "active") == "active" else None


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


class PrimaryContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    title: Optional[str] = Field(default=None, max_length=200)


class ClientIn(BaseModel):
    name: str
    industry: Optional[str] = None
    environment: Optional[str] = "Production"
    status: Optional[str] = "onboarding"  # onboarding, active, inactive, archived
    primary_contact: Optional[str] = None
    primary_contact_details: Optional[PrimaryContactIn] = None
    assigned_owner_id: Optional[str] = None
    logo_url: Optional[str] = None


class ClientPatchIn(BaseModel):
    expected_updated_at: Optional[str] = Field(default=None, max_length=100)
    name: Optional[str] = None
    industry: Optional[str] = None
    environment: Optional[str] = None
    status: Optional[str] = None
    primary_contact: Optional[str] = None
    primary_contact_id: Optional[str] = Field(default=None, max_length=100)
    assigned_owner_id: Optional[str] = None
    logo_url: Optional[str] = None


class ReviewIn(BaseModel):
    ai_system_id: Optional[str] = None
    risk_id: Optional[str] = None
    title: str
    review_type: str  # asset, software, access, vendor, policy, risk, vulnerability, bcp_dr, incident, awareness
    client_id: str
    policy_id: Optional[str] = None
    vendor_id: Optional[str] = None
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
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    finding_id: Optional[str] = None
    vendor_id: Optional[str] = None
    review_id: Optional[str] = None
    assessment_id: Optional[str] = None
    review_cadence: Optional[str] = "annual"
    custom_recurrence_days: Optional[int] = None
    assessment_rationale: Optional[str] = None
    likelihood_rationale: Optional[str] = None
    impact_rationale: Optional[str] = None
    date_identified: Optional[str] = None
    last_reviewed: Optional[str] = None
    next_review: Optional[str] = None
    accepted: Optional[bool] = False
    accepted_by: Optional[str] = None
    acceptance_date: Optional[str] = None
    acceptance_rationale: Optional[str] = None
    compensating_controls: Optional[str] = None
    acceptance_expires_at: Optional[str] = None
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
    status: str = "onboarding"  # onboarding, under_review, active, offboarding, inactive
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
    custom_recurrence_days: Optional[int] = None
    assurance_required: bool = False
    assurance_records: List[Dict[str, Any]] = Field(default_factory=list)
    assurance_window_days: int = 90
    separate_assurance_review: bool = False
    assurance_review_date: Optional[str] = None
    assurance_cadence: str = "annual"
    contract_review_enabled: bool = False
    contract_lead_days: int = 90
    contract_evidence_ids: List[str] = Field(default_factory=list)
    dpa_present: Optional[str] = None
    baa_present: Optional[str] = None
    security_addendum_present: Optional[str] = None
    contract_notes: Optional[str] = None
    termination_requirements: Optional[str] = None
    dependency_notes: Optional[str] = None
    offboarding_review_date: Optional[str] = None


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
    source: Optional[str] = None  # legacy provenance label, preserved
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    risk_id: Optional[str] = None
    vendor_id: Optional[str] = None
    assessment_id: Optional[str] = None


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
    occurrence_id: Optional[str] = None
    filename: str
    client_id: str
    content_base64: str  # data URI or raw base64
    mime_type: Optional[str] = "application/octet-stream"
    linked_type: Optional[str] = None  # review | finding | risk | policy | vendor | asset
    linked_id: Optional[str] = None
    notes: Optional[str] = None


class CommentIn(BaseModel):
    occurrence_id: Optional[str] = None
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
    document = {
        "log_id": _uid("log"),
        "at": _now(),
        "user_id": user.get("user_id"),
        "user_email": user.get("email"),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "client_id": client_id,
        "meta": meta or {},
    }
    intent = create_requests.current.get()
    if intent:
        # Replaying a partially completed create repairs its audit without duplicates.
        identity = create_requests.digest([intent, action, entity_type, entity_id, client_id, meta])
        await db.create_requests.update_one({"_id": intent}, {"$set": {"pending_audits." + identity: document}})
        await db.audit_logs.update_one({"_id": "create:" + identity}, {"$setOnInsert": document}, upsert=True)
    else:
        await db.audit_logs.insert_one(document)


# ---------------- Notifications helpers (defined early so they're in scope everywhere) ----------------
ID_FIELD_MAP = {
    'framework_assessments':'framework_assessment_id',
    "ai_systems": "ai_system_id",
    "reviews": "review_id", "findings": "finding_id", "risks": "risk_id",
    "policies": "policy_id", "vendors": "vendor_id", "assets": "asset_id",
    "tasks": "task_id", "exceptions": "exception_id",
    "requirements": "requirement_id", "contacts": "contact_id",
}


async def create_notification(*, user_id: str, title: str, kind: str,
                              entity_type: Optional[str] = None, entity_id: Optional[str] = None,
                              client_id: Optional[str] = None) -> None:
    recipient = await db.users.find_one({"user_id": user_id, "status": "active"})
    if not recipient or (client_id and not _can_access_client(recipient, client_id)):
        return
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
    if role == "super_admin" or (role == "platform_admin" and not user.get("client_ids")):
        return True
    return client_id in (user.get("client_ids") or [])


def _writable(user: Dict) -> bool:
    return user.get("role") in ("super_admin", "platform_admin", "client_contributor")


def _scope_filter(user: Dict, client_id: Optional[str] = None) -> Dict:
    role = user.get("role")
    if role == "super_admin" or (role == "platform_admin" and not user.get("client_ids")):
        return {"client_id": client_id} if client_id else {}
    allowed = user.get("client_ids") or []
    if client_id:
        if client_id not in allowed:
            raise HTTPException(403, "Forbidden for this client")
        return {"client_id": client_id}
    return {"client_id": {"$in": allowed}}


async def _authorized_parent(kind: str, item_id: str, user: Dict, write: bool = False) -> Dict:
    collection = kind if kind in ID_FIELD_MAP else {"policy": "policies"}.get(kind, kind + "s")
    if collection not in ID_FIELD_MAP:
        raise HTTPException(422, "Unsupported parent record type")
    parent = await db[collection].find_one({ID_FIELD_MAP[collection]: item_id}, {"_id": 0})
    if not parent:
        raise HTTPException(404, "Parent record not found")
    if not _can_access_client(user, parent.get("client_id")) or (write and not _writable(user)):
        raise HTTPException(403, "Forbidden")
    return parent


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
        "status": "active",
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
    email = body.email.strip().lower()
    u = await db.users.find_one({"email": email})
    if not u or not u.get("password_hash") or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if u.get("status", "active") != "active":
        raise HTTPException(403, "This account is not active. Contact your administrator.")
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
    if not u or not u.get("password_hash") or u.get("status", "active") != "active":
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
        f'<h2 style="margin:0 0 12px 0;color:#0f172a">Reset your Omnisciente password</h2>'
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
    await send_email(to=email, subject="Reset your Omnisciente password", html=html)
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
    account = await db.users.find_one({"user_id": rec["user_id"]})
    if not account or account.get("status", "active") not in ("active", "invited"):
        raise HTTPException(400, "Invalid or expired reset link")
    password_hash = hash_password(body.new_password)
    if exp <= datetime.now(timezone.utc):
        raise HTTPException(400, "Invalid or expired reset link")
    # Atomic claim: concurrent submissions cannot both use this credential.
    claimed = await db.password_resets.update_one(
        {"token_hash": token_hash, "used": False},
        {"$set": {"used": True, "used_at": _now()}},
    )
    if claimed.modified_count != 1:
        raise HTTPException(400, "Invalid or expired reset link")
    # Recheck account state in the write itself so a concurrent disable wins.
    changed = await db.users.update_one(
        {"user_id": rec["user_id"], "status": account.get("status"),
         "password_changed_at": account.get("password_changed_at")},
        {"$set": {"password_hash": password_hash, "password_changed_at": _now(),
                  "status": "active"}},
    )
    if changed.matched_count != 1:
        raise HTTPException(400, "Account state changed. Request a new link.")
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
    expected_updated_at: Optional[str] = None
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
    _require_snapshot(body.model_dump(exclude_unset=True), user)
    updates = {k: v for k, v in body.model_dump(exclude={'expected_updated_at'}).items() if v is not None}
    if not updates:
        return user
    await _save_snapshot(db.users, {"user_id": user["user_id"]}, user, body.model_dump(exclude_unset=True), updates)
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
    changed = await db.users.update_one(
        {"user_id": user["user_id"], "password_hash": full["password_hash"]},
        {"$set": {"password_hash": hash_password(body.new_password), "password_changed_at": _now()}},
    )
    if changed.matched_count != 1:
        raise HTTPException(409, "Password changed during this request; sign in again before retrying")
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
    expected_updated_at: Optional[str] = Field(default=None, max_length=100)
    name: Optional[str] = None
    role: Optional[str] = None
    client_ids: Optional[List[str]] = None
    status: Optional[str] = None  # active | disabled | invited


class ContactLinkIn(BaseModel):
    user_id: Optional[str] = None
    expected_linked_user_id: Optional[str] = None
    confirmed: bool = False


class ContactInviteIn(BaseModel):
    role: str
    client_id: str
    confirmed: bool = False


class ClientMembershipIn(BaseModel):
    client_ids: List[str]
    expected_updated_at: Optional[str] = Field(default=None, max_length=100)


def _account_summary(account, actor):
    fields = ("user_id", "name", "email", "role", "status", "last_login_at", "orphaned", "updated_at")
    row = {field: account[field] for field in fields if field in account}
    row["client_ids"] = [cid for cid in (account.get("client_ids") or []) if _can_access_client(actor, cid)]
    return row


def _identity_admin(user, client_id):
    if user.get("role") not in ("super_admin", "platform_admin") or not _can_access_client(user, client_id):
        raise HTTPException(403, "Not authorized to manage accounts for this client")


@api.get("/clients/{client_id}/contact-accounts")
async def contact_accounts(client_id: str, user: Dict = Depends(get_current_user)):
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden for this client")
    linked = await db.contacts.distinct("linked_user_id", {"client_id": client_id})
    rows = await db.users.find({"user_id": {"$in": [uid for uid in linked if uid]}}, {
        "_id": 0, "user_id": 1, "name": 1, "email": 1, "status": 1,
        "role": 1, "client_ids": 1,
    }).to_list(1000)
    return [{"user_id": row["user_id"], "name": row.get("name"), "email": row.get("email"),
             "status": row.get("status"), "has_client_access": _can_access_client(row, client_id)} for row in rows]


@api.get("/contacts/{contact_id}/account-candidates")
async def contact_account_candidates(contact_id: str, search: str = Query("", max_length=100),
                                     user: Dict = Depends(get_current_user)):
    contact = await db.contacts.find_one({"contact_id": contact_id})
    if not contact:
        raise HTTPException(404, "Contact not found")
    _identity_admin(user, contact["client_id"])
    # Deliberately bounded to existing client-authorized active accounts, not a global directory.
    return await assignment_eligibility.candidates(db, contact["client_id"], search)


@api.post("/contacts/{contact_id}/account-link")
async def link_contact_account(contact_id: str, body: ContactLinkIn, user: Dict = Depends(get_current_user)):
    contact = await db.contacts.find_one({"contact_id": contact_id})
    if not contact:
        raise HTTPException(404, "Contact not found")
    _identity_admin(user, contact["client_id"])
    _require_snapshot(body.model_dump(exclude_unset=True), contact, "linked_user_id")
    if not body.confirmed:
        raise HTTPException(422, "Confirm this identity association; access will not change")
    if body.user_id:
        target = await db.users.find_one({"user_id": body.user_id})
        if not target or not _can_access_client(target, contact["client_id"]) or target.get("status") != "active":
            raise HTTPException(422, "Choose an active account already authorized for this client")
    changed = await db.contacts.update_one(
        {"contact_id": contact_id, "linked_user_id": contact.get("linked_user_id")},
        {"$set": {"linked_user_id": body.user_id, "updated_at": _next_write_time(contact.get("updated_at"))}},
    )
    if changed.matched_count != 1:
        raise HTTPException(409, "Account link changed; reload before retrying")
    await audit(user, "link-account" if body.user_id else "unlink-account", "contact", contact_id,
                contact["client_id"], meta={"previous_user_id": contact.get("linked_user_id"), "user_id": body.user_id})
    return await db.contacts.find_one({"contact_id": contact_id}, {"_id": 0})


def _admin_can_manage_role(actor: Dict, target_role: str) -> bool:
    """Only super_admin can assign super_admin; platform_admin can assign platform_admin/client_* roles."""
    actor_role = actor.get("role")
    if actor_role == "super_admin":
        return target_role in ("super_admin", "platform_admin", "client_contributor", "client_readonly")
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
    if target.get("role") == "super_admin" or (target.get("role") == "platform_admin" and not target.get("client_ids")):
        return False
    # platform_admin: must share at least one client with target OR be scoped to a client they can access
    if client_scope and not _can_access_client(actor, client_scope):
        return False
    actor_clients = set(actor.get("client_ids") or [])
    target_clients = set(target.get("client_ids") or [])
    return bool(actor_clients & target_clients) or (client_scope in actor_clients if client_scope else False)


@api.post("/contacts/{contact_id}/invite")
async def contact_invite(contact_id: str, body: ContactInviteIn, user: Dict = Depends(get_current_user)):
    """Explicitly invite with a confirmed client role; never match-and-link an account."""
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only admins can invite contacts")
    contact = await db.contacts.find_one({"contact_id": contact_id}, {"_id": 0})
    if not contact:
        raise HTTPException(404, "Contact not found")
    if not _can_access_client(user, contact["client_id"]):
        raise HTTPException(403, "Forbidden for this client")
    if body.client_id != contact["client_id"] or not body.confirmed or body.role not in ("client_contributor", "client_readonly"):
        raise HTTPException(422, "Confirm the Contact's client and a permitted client role")
    if contact.get("linked_user_id"):
        raise HTTPException(400, "Contact already linked to a platform user")
    email = (contact.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "Contact needs an email address before invite")
    existing = await db.users.find_one({"email": {"$regex": "^" + re.escape(email) + "$", "$options": "i"}})
    if existing:
        raise HTTPException(409, "Account already exists. Use explicit account linking and authorized client membership management.")
    try:
        invite_body = UserCreateIn(
            email=email, name=contact.get("name") or email,
            role=body.role, client_ids=[contact["client_id"]], password=None,
        )
    except ValidationError:
        raise HTTPException(422, "Contact needs a valid invitation email address")
    result = await admin_create_user(invite_body, user=user)
    linked = await db.contacts.update_one({"contact_id": contact_id, "linked_user_id": contact.get("linked_user_id")},
        {"$set": {"linked_user_id": result["user"]["user_id"], "updated_at": _now()}})
    if linked.matched_count != 1:
        raise HTTPException(409, "Invitation created, but the Contact association changed. Reload and explicitly link the account if needed.")
    await audit(user, "invite-contact", "contact", contact_id, contact["client_id"],
                meta={"email": email, "new_user_id": result["user"]["user_id"]})
    return result


async def _issue_invitation(account, actor):
    """Use the existing mail transport; never return bearer credentials to administrators."""
    raw = secrets.token_urlsafe(32)
    timestamp = _now()
    await db.password_resets.update_many(
        {"user_id": account["user_id"], "used": False},
        {"$set": {"used": True, "used_at": timestamp, "superseded": True}},
    )
    await db.password_resets.insert_one({
        "user_id": account["user_id"], "token_hash": hashlib.sha256(raw.encode()).hexdigest(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "purpose": "invitation", "used": False, "created_at": timestamp,
    })
    base = (os.environ.get("APP_BASE_URL") or "").rstrip("/")
    delivery = "unavailable"
    if urlparse(base).scheme == "https" and urlparse(base).netloc:
        link = f"{base}/reset-password?token={raw}"
        html = (f'<p>Hi {escape(account.get("name") or account["email"])}, '
                 f'{escape(actor.get("name") or "Your administrator")} invited you to Omnisciente.</p>'
                 f'<p><a href="{escape(link, quote=True)}">Set your password</a></p>'
                 '<p>This link expires in 7 days. Account activation does not change your assigned role.</p>')
        try:
            receipt = await send_email(to=account["email"], subject="You're invited to Omnisciente", html=html)
            delivery = "sent" if receipt else "unavailable"
        except ValueError:
            # Mail validation errors can contain the secret URL. Never log their payload.
            logging.warning("Invitation email rejected by configured mail safety checks")
    await db.users.update_one({"user_id": account["user_id"]}, {"$set": {
        "invitation_delivery": delivery, "invitation_requested_at": timestamp,
    }})
    return delivery


@api.post("/users")
async def admin_create_user(body: UserCreateIn, user: Dict = Depends(get_current_user)):
    if not _admin_can_manage_role(user, body.role):
        raise HTTPException(403, "Not authorized to create an account with this role")
    client_ids = list(dict.fromkeys(body.client_ids))
    if body.role == "platform_admin" and not client_ids and user.get("role") != "super_admin":
        raise HTTPException(403, "Only a Super Admin can authorize global internal scope")
    for cid in client_ids:
        if not _can_access_client(user, cid):
            raise HTTPException(403, "Not authorized for the requested client")
        if not await db.clients.find_one({"client_id": cid}):
            raise HTTPException(422, "Choose an existing client")
    email = body.email.strip().lower()
    if await db.users.find_one({"email": {"$regex": "^" + re.escape(email) + "$", "$options": "i"}}):
        raise HTTPException(409, "Account already exists. Use explicit account linking and authorized client membership management.")
    doc = {
        "user_id": _uid("user"), "email": email, "name": body.name, "role": body.role,
        "client_ids": client_ids, "status": "active" if body.password else "invited",
        "created_at": _now(), "created_by": user["user_id"],
    }
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        doc["password_hash"] = hash_password(body.password)
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "Account already exists")
    delivery = None if body.password else await _issue_invitation(doc, user)
    await audit(user, "create-account" if body.password else "invite", "user", doc["user_id"],
                meta={"role": body.role, "client_ids": client_ids, "delivery": delivery})
    for cid in client_ids:
        await audit(user, "membership-granted", "user", doc["user_id"], cid)
    out = await db.users.find_one({"user_id": doc["user_id"]}, {"_id": 0, "password_hash": 0})
    return {"user": out, "delivery": delivery}


@api.patch("/users/{user_id}")
async def admin_update_user(user_id: str, body: UserPatchIn, user: Dict = Depends(get_current_user)):
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if not _admin_can_manage_user(user, target):
        raise HTTPException(403, "Not authorized to manage this user")
    _require_snapshot(body.model_dump(exclude_unset=True),target)
    if user.get("role") == "platform_admin":
        foreign = set(target.get("client_ids") or []) - set(user.get("client_ids") or [])
        if foreign and any(getattr(body, field) is not None for field in ("name", "role", "status")):
            raise HTTPException(403, "Account-wide changes require authority over all client memberships")
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
            for cid in set(body.client_ids) ^ set(target.get("client_ids") or []):
                if not _can_access_client(user, cid):
                    raise HTTPException(403, f"You cannot assign client {cid}")
        updates["client_ids"] = body.client_ids
    if body.status is not None:
        if body.status not in ("active", "invited", "disabled"):
            raise HTTPException(400, "Invalid status")
        updates["status"] = body.status
        if body.status == "active" and not target.get("password_hash") and target.get("auth_provider") != "google":
            raise HTTPException(409, "The account must complete its invitation before activation")
    if updates.get("role", target.get("role")) == "platform_admin" and not updates.get("client_ids", target.get("client_ids")) and user.get("role") != "super_admin":
        raise HTTPException(403, "Only a Super Admin can authorize global internal scope")
    # Guardrail: users cannot demote or disable themselves via this endpoint.
    if user_id == user["user_id"] and ("role" in updates or updates.get("status") == "disabled"):
        raise HTTPException(400, "You cannot change your own role or disable yourself")
    if not updates:
        return _account_summary(target, user)
    updates["updated_at"] = _next_write_time(target.get("updated_at"))
    changed = await db.users.update_one({"user_id": user_id, "updated_at":target.get("updated_at"), "role": target.get("role"),
        "status": target.get("status"), "client_ids": target.get("client_ids")}, {"$set": updates})
    if changed.matched_count != 1:
        raise HTTPException(409, "Account state changed; reload before retrying")
    # If disabling: revoke all sessions.
    if updates.get("status") == "disabled":
        await db.sessions.delete_many({"user_id": user_id})
        await db.users.update_one({"user_id": user_id}, {"$set": {"password_changed_at": _now()}})
        await db.password_resets.update_many(
            {"user_id": user_id, "used": False},
            {"$set": {"used": True, "used_at": _now()}},
        )
    await audit(user, "update", "user", user_id, meta={"fields": list(updates.keys()), "new": {k: v for k, v in updates.items() if k != "updated_at"}})
    if "client_ids" in updates:
        old_ids, new_ids = set(target.get("client_ids") or []), set(updates["client_ids"])
        for cid in old_ids ^ new_ids:
            await audit(user, "membership-granted" if cid in new_ids else "membership-removed", "user", user_id, cid)
    if "status" in updates and updates["status"] != target.get("status"):
        await audit(user, "account-disabled" if updates["status"] == "disabled" else "account-status-changed", "user", user_id,
                    meta={"previous": target.get("status"), "status": updates["status"]})
    fresh = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return _account_summary(fresh, user)


@api.get("/users/{user_id}/open_assignments")
async def user_open_assignments(user_id: str, client_id: Optional[str] = Query(None),
                                user: Dict = Depends(get_current_user)):
    """Read-only, scoped active ownership report; never rewrites ownership or actors."""
    if user.get("role") not in ("super_admin", "platform_admin") and user["user_id"] != user_id:
        raise HTTPException(403, "Not authorized")
    scope = _scope_filter(user, client_id)
    counts, items = {}, []
    for kind, fields in assignment_eligibility.FIELDS.items():
        references = [{field: user_id} for field in fields]
        if kind == "tasks":
            references.append({"owner_id": user_id, "$or": [{"assignee_id": None}, {"assignee_id": ""}]})
        terminal = list(CLOSED.get(kind, []))
        terminal += {
            "vendors": ["inactive", "terminated"], "policies": ["retired", "not_applicable"],
            "framework_assessments": ["not_applicable"], "ai_systems": ["retired"],
        }.get(kind, [])
        query = {"$and": [scope, {"$or": references}, {"status": {"$nin": terminal}}]}
        counts[kind] = await db[kind].count_documents(query)
        id_field = ENTITY_MAP[kind][2] if kind in ENTITY_MAP else {
            "framework_assessments": "framework_assessment_id", "ai_systems": "ai_system_id",
        }[kind]
        rows = await db[kind].find(query, {"_id": 0, id_field: 1, "client_id": 1,
            "title": 1, "name": 1, "status": 1, "due_date": 1, "definition_id": 1, "framework_key": 1}).sort(id_field, 1).to_list(100)
        items.extend({"kind": kind, "id": row.get(id_field), "client_id": row["client_id"],
                      "title": row.get("title") or row.get("name") or framework_governance.definition_for(row.get("framework_key"), row.get("definition_id")).get("title") or "Untitled record",
                      "status": row.get("status"), "due_date": row.get("due_date")} for row in rows)
    return {**counts, "total": sum(counts.values()), "items": items,
            "truncated": sum(counts.values()) > len(items)}


@api.patch("/users/{user_id}/client-memberships")
async def update_client_memberships(user_id: str, body: ClientMembershipIn, user: Dict = Depends(get_current_user)):
    target = await db.users.find_one({"user_id": user_id})
    if not target or not _admin_can_manage_user(user, target):
        raise HTTPException(403, "Not authorized to manage this user")
    _require_snapshot(body.model_dump(exclude_unset=True),target)
    desired = set(body.client_ids)
    for cid in desired:
        if not _can_access_client(user, cid):
            raise HTTPException(403, "Not authorized for the requested client")
        if not await db.clients.find_one({"client_id": cid}):
            raise HTTPException(422, "Choose an existing client")
    previous = set(target.get("client_ids") or [])
    # The client UI sends only visible memberships. Preserve all other tenants.
    desired |= {cid for cid in previous if not _can_access_client(user, cid)}
    if target.get("role") == "platform_admin" and not desired and user.get("role") != "super_admin":
        raise HTTPException(403, "Removing the last membership would grant global internal scope")
    at=_next_write_time(target.get('updated_at'))
    changed = await db.users.update_one({"user_id": user_id, "updated_at":target.get("updated_at"), "role": target.get("role"), "client_ids": target.get("client_ids")},
        {"$set": {"client_ids": sorted(desired), "updated_at": at}})
    if changed.matched_count != 1:
        raise HTTPException(409, "Membership changed; reload before retrying")
    for cid in previous ^ desired:
        await audit(user, "membership-granted" if cid in desired else "membership-removed", "user", user_id, cid)
    return _account_summary({**target, "client_ids": sorted(desired), "updated_at":at}, user)


@api.post("/users/{user_id}/resend-invite")
async def admin_resend_invite(user_id: str, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Not authorized")
    target = await db.users.find_one({"user_id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if not _admin_can_manage_user(user, target):
        raise HTTPException(403, "Not authorized to manage this user")
    if target.get("status") != "invited":
        raise HTTPException(409, "Only pending invitations can be resent")
    if user.get("role") == "platform_admin" and set(target.get("client_ids") or []) - set(user.get("client_ids") or []):
        raise HTTPException(403, "Invitation administration requires authority over all client memberships")
    delivery = await _issue_invitation(target, user)
    await audit(user, "resend_invite", "user", user_id, meta={"delivery": delivery})
    return {"ok": True, "delivery": delivery}


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
    if user and user.get("status", "active") != "active":
        raise HTTPException(403, "This account is not active. Contact your administrator.")
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
            "status": "active",
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
    q: Dict = _scope_filter(user)
    if not include_archived:
        q["status"] = {"$ne": "archived"}
    docs = await db.clients.find(q, {"_id": 0}).to_list(500)
    return await client_relationships.project(db, docs)


@api.get("/clients/grc-leads")
async def grc_lead_candidates(client_id: Optional[str] = Query(None),
                              user: Dict = Depends(get_current_user)):
    if user.get("role") not in client_relationships.INTERNAL_ROLES:
        raise HTTPException(403, "Restricted to internal admins")
    if client_id and not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden for this client")
    if client_id and not await db.clients.find_one({"client_id": client_id}):
        raise HTTPException(404, "Client not found")
    # A new client has no memberships yet. Only already-global staff qualify.
    scope = {"$or": [{"role": "super_admin"}, {"role": "platform_admin", "$or": [
        {"client_ids": {"$size": 0}}, {"client_ids": None},
        *([{"client_ids": client_id}] if client_id else []),
    ]}]}
    rows = await db.users.find({"$and": [{"status": "active"}, scope]},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1}).sort("name", 1).to_list(201)
    if len(rows) > 200:
        raise HTTPException(422, "Too many eligible leads; contact your administrator")
    return rows


@api.post("/clients")
async def create_client(body: ClientIn, user: Dict = Depends(get_current_user), idempotency_key: Optional[str] = Header(None)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform admins can create clients")
    async def execute(identity):
        return await _create_client(body, user, identity)
    return await create_requests.run(db, idempotency_key, user["user_id"], None, "clients", body.model_dump(), execute)


async def _create_client(body, user, identity):
    cid = "cli_" + identity
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
    await client_relationships.validate(db, doc, None, _can_access_client)
    contact = None
    if body.primary_contact_details:
        details = body.primary_contact_details.model_dump()
        if not details["name"].strip():
            raise HTTPException(422, "Primary Contact name is required")
        contact = {**details, "name": details["name"].strip(), "contact_id": "cnt_" + identity,
                   "client_id": cid, "status": "active", "created_at": _now(), "updated_at": _now(),
                   "created_by": user["user_id"]}
        doc["primary_contact_id"] = contact["contact_id"]
        contact = await create_requests.insert_primary(db, "contacts", contact, identity)
    # Retain a partial Contact for same-intent recovery; never delete on an
    # uncertain database response, which may have committed the Client write.
    doc = await create_requests.insert_primary(db, "clients", doc, identity)
    if user.get("role") == "platform_admin" and user.get("client_ids"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$addToSet": {"client_ids": cid}})
    await audit(user, "create", "client", cid, cid, meta={"name": body.name})
    if contact:
        await audit(user, "create", "contact", contact["contact_id"], cid, meta={"source": "client_primary_contact"})
    doc.pop("_id", None)
    return (await client_relationships.project(db, [doc]))[0]


@api.patch("/clients/{client_id}")
async def update_client(client_id: str, body: ClientPatchIn, user: Dict = Depends(get_current_user)):
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden for this client")
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform admins can edit clients")
    existing = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Client not found")
    _require_snapshot(body.model_dump(exclude_unset=True), existing)
    updates = {k: v for k, v in body.model_dump(exclude={'expected_updated_at'}).items() if v is not None}
    if not updates:
        return (await client_relationships.project(db, [existing]))[0]
    await client_relationships.validate(db, {**existing, **updates}, existing, _can_access_client)
    updates["updated_at"] = _next_write_time(existing.get("updated_at"))
    changed = await db.clients.update_one({"client_id": client_id, "updated_at": existing.get("updated_at")}, {"$set": updates})
    if not changed.matched_count:
        raise HTTPException(409, "Record changed since it was opened; reload before saving")
    await audit(user, "update", "client", client_id, client_id, meta=updates)
    doc = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    return (await client_relationships.project(db, [doc]))[0]


@api.get("/clients/{client_id}/assignees")
async def eligible_assignees(client_id: str, search: str = Query("", max_length=100),
                             offset: int = Query(0, ge=0, le=10000),
                             limit: int = Query(50, ge=1, le=100),
                             user: Dict = Depends(get_current_user)):
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden")
    if not await db.clients.find_one({"client_id": client_id}, {"_id": 1}):
        raise HTTPException(404, "Client not found")
    return await assignment_eligibility.candidates(db, client_id, search, offset, limit)


@api.get("/clients/{client_id}/members")
async def client_members(client_id: str, user: Dict = Depends(get_current_user)):
    """Users associated with the tenant. Client users see only their client members; internal admins additionally see 'orphaned' users who still own records but are not formal members."""
    if not _can_access_client(user, client_id):
        raise HTTPException(403, "Forbidden")
    members = await db.users.find({"client_ids": client_id}, {"_id": 0, "password_hash": 0}).to_list(1000)
    known_ids = {u["user_id"] for u in members}
    if user.get("role") in ("super_admin", "platform_admin"):
        owner_ids: set = set()
        for coll, assignment_fields in assignment_eligibility.FIELDS.items():
            for field in (*assignment_fields, *(("owner_id",) if coll == "tasks" else ())):
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
    return [_account_summary(member, user) for member in members]

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
@api.get('/evidence/catalog')
async def evidence_catalog(client_id: str, entity_type: Optional[str] = None, entity_id: Optional[str] = None,
                           occurrence_id: Optional[str] = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                           state: str = Query('{}', max_length=12000), q: str = Query('', max_length=250),
                           today: Optional[str] = None, user: Dict = Depends(get_current_user)):
    _scope_filter(user, client_id)
    root_kind = evidence_context.ALIASES.get(entity_type)
    if bool(entity_type) != bool(entity_id) or entity_type and not root_kind:
        raise HTTPException(422, 'Select a supported Evidence source')
    root = await _authorized_parent(root_kind, entity_id, user) if root_kind else None
    if root and root['client_id'] != client_id: raise HTTPException(404, 'Source not found for this client')
    if root_kind == 'reviews': occurrence_id = await _review_selection(root, occurrence_id)
    try:
        filters = json.loads(state)
        if not isinstance(filters, dict) or not isinstance(filters.get('filters', {}), dict): raise ValueError()
        if filters.get('sort') is not None and not isinstance(filters['sort'], dict): raise ValueError()
        if any(not isinstance(v, list) or any(not isinstance(x, str) for x in v) for v in filters.get('filters', {}).values()): raise ValueError()
        day = evidence_context.date.fromisoformat(today) if today else None
    except (ValueError, TypeError): raise HTTPException(422, 'Invalid Evidence filter state')
    return await evidence_context.catalog_page(db, client_id, _can_access_client, root_kind=root_kind, root=root, oid=occurrence_id,
        page=page, page_size=page_size, state=filters, query=q.strip(), today=day)


@api.get("/evidence")
async def list_evidence(client_id: Optional[str] = Query(None), linked_type: Optional[str] = None,
                        linked_id: Optional[str] = None, user: Dict = Depends(get_current_user), occurrence_id: Optional[str] = None):
    q = _scope_filter(user, client_id)
    if linked_type: q["linked_type"] = linked_type
    if linked_id: q["linked_id"] = linked_id
    if linked_id and linked_type in ("review", "reviews"):
        review = await _authorized_parent("reviews", linked_id, user)
        selected = await _review_selection(review, occurrence_id)
        q.update({"client_id": review["client_id"], "linked_type": {"$in": ["review", "reviews"]},
                  **review_occurrences.occurrence_query(review, selected)})
        historical = next((o for o in review.get("occurrences", []) if o["occurrence_id"] == selected), None)
        if historical:
            return await db.evidence.find({"client_id": review["client_id"],
                "evidence_id": {"$in": [e["evidence_id"] for e in historical.get("evidence", [])]}},
                {"_id": 0, "content_base64": 0}).to_list(1000)
    docs = await db.evidence.find({**q, "archived_at": None}, {"_id": 0, "content_base64": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api.post("/evidence")
async def create_evidence(body: EvidenceIn, user: Dict = Depends(get_current_user), idempotency_key: Optional[str] = Header(None)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden")
    async def execute(identity):
        return await _create_evidence(body=body, user=user, identity=identity)
    return await create_requests.run(db, idempotency_key, user["user_id"], body.client_id, "evidence", body.model_dump(), execute)


@review_mutation
async def _create_evidence(body, user, identity=None):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, body.client_id):
        raise HTTPException(403, "Forbidden")
    if bool(body.linked_type) != bool(body.linked_id):
        raise HTTPException(422, "Evidence requires both parent type and ID")
    if body.linked_id:
        parent = await _authorized_parent(body.linked_type, body.linked_id, user, write=True)
        if parent["client_id"] != body.client_id:
            raise HTTPException(422, "Evidence and parent must belong to the same client")
        if parent.get("status") == "completed" and body.linked_type in ("review", "reviews"):
            raise HTTPException(409, "Completed review evidence is frozen")
        if body.linked_type in ("review", "reviews"):
            if not body.occurrence_id:
                raise HTTPException(422, "Select the Review occurrence before uploading")
            await _review_selection(parent, body.occurrence_id, write=True)
    try:
        file_bytes = base64.b64decode(body.content_base64.split(",")[-1], validate=True)
    except (ValueError, base64.binascii.Error):
        raise HTTPException(422, "Invalid base64 evidence content")
    ev_id = _uid("ev")
    doc = {"evidence_id": ev_id, **body.model_dump(), "version": 1, "sha256": hashlib.sha256(file_bytes).hexdigest(),
           "uploaded_by": user["user_id"], "uploaded_by_email": user["email"],
           "created_at": _now()}
    doc = await create_requests.insert_primary(db, "evidence", doc, identity)
    ev_id = doc["evidence_id"]
    await audit(user, "upload", "evidence", ev_id, body.client_id, meta={"filename": body.filename})
    if body.linked_type in ("framework_assessment", "framework_assessments"):
        await audit(user, "Evidence linked", "framework_assessment", body.linked_id, body.client_id, meta={"filename": body.filename, "evidence_id": ev_id})
    if body.linked_type in ("review", "reviews"):
        await _review_event(user, parent, "Evidence uploaded", body.occurrence_id, filename=body.filename, evidence_id=ev_id)
    if body.linked_type in ("vendor","vendors"):
        await audit(user,"Vendor evidence uploaded","vendor",body.linked_id,body.client_id,meta={"evidence_id":ev_id,"filename":body.filename})
    if body.linked_type in ("task", "tasks"):
        await audit(user, "Evidence uploaded", "task", body.linked_id, body.client_id, meta={"filename": body.filename, "evidence_id": ev_id})
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
    if not _can_access_client(user, doc["client_id"]):
        raise HTTPException(403, "Forbidden")
    if await db.reviews.find_one({"$or": [{"completion_snapshot.evidence.evidence_id": ev_id}, {"occurrences.evidence.evidence_id": ev_id}]}):
        raise HTTPException(409, "Evidence referenced by a completed review must be retained")
    if await db.vendors.find_one({"client_id":doc["client_id"],"$or":[{"contract_evidence_ids":ev_id},{"assurance_records.evidence_ids":ev_id},{"vendor_id":doc.get("linked_id"),"status":{"$in":["inactive","terminated"]}}]}):
        raise HTTPException(409,"Vendor assurance, contract and historical evidence must be retained")
    if doc.get("linked_type") in ("risk","risks") and await db.risks.find_one({"risk_id":doc.get("linked_id"),"client_id":doc["client_id"],"status":{"$in":["closed","retired"]}}):
        raise HTTPException(409,"Closed Risk evidence must be retained")
    if doc.get('linked_type') in ('ai_system','ai_systems') and await db.ai_systems.find_one({'ai_system_id':doc.get('linked_id'),'client_id':doc['client_id'],'status':'retired'}):
        raise HTTPException(409,'Retired AI evidence must be retained')
    if doc.get("linked_type") in ("task", "tasks") and await db.tasks.find_one({"task_id": doc.get("linked_id"), "client_id": doc["client_id"], "status": "done"}):
        raise HTTPException(409, "Completed Action Item evidence must be retained")
    # Retain bytes even if a completion races this removal. Only the inventory link is archived.
    await db.evidence.update_one({"evidence_id": ev_id}, {"$set": {"archived_at": _now()}})
    await audit(user, "delete", "evidence", ev_id, doc.get("client_id"))
    return {"ok": True}


# ---------------- Comments ----------------
@api.get("/comments")
async def list_comments(entity_type: str, entity_id: str, user: Dict = Depends(get_current_user), occurrence_id: Optional[str] = None):
    parent = await _authorized_parent(entity_type, entity_id, user)
    scope = {}
    if entity_type in ("review", "reviews"):
        selected = await _review_selection(parent, occurrence_id)
        scope = review_occurrences.occurrence_query(parent, selected)
    docs = await db.comments.find({"entity_type": entity_type, "entity_id": entity_id, "client_id": parent["client_id"], **scope}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs


@api.post("/comments")
@review_mutation
async def create_comment(body: CommentIn, user: Dict = Depends(get_current_user)):
    parent = await _authorized_parent(body.entity_type, body.entity_id, user, write=True)
    if body.entity_type in ("review", "reviews"):
        if not body.occurrence_id:
            raise HTTPException(422, "Select the Review occurrence before commenting")
        await _review_selection(parent, body.occurrence_id, write=True)
    if not body.body.strip():
        raise HTTPException(422, "Comment cannot be empty")
    cid = _uid("cmt")
    doc = {"comment_id": cid, **body.model_dump(), "client_id": parent["client_id"],
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
        return list(user["client_ids"]) if user.get("client_ids") else None
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
    query = {} if user.get("role") == "super_admin" or not user.get("client_ids") else {"client_ids": {"$in": user["client_ids"]}}
    docs = await db.users.find(query, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1,
                                      "status": 1, "client_ids": 1, "last_login_at": 1}).to_list(500)
    if user.get("role") == "platform_admin" and user.get("client_ids"):
        for doc in docs:
            doc["client_ids"] = [cid for cid in (doc.get("client_ids") or []) if cid in user["client_ids"]]
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
    detail: Optional[str] = Query(None, max_length=40),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
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

    from management_obligations import load_records, management_for_scope, calendar_day
    import dashboard_contract
    records = await load_records(db, scope_filter, dashboard_contract.PROJECTION)
    management = management_for_scope(records, today=now_iso, scope=scope, user_id=target_uid)
    groups = dashboard_contract.populations(management)
    if detail:
        if detail not in groups:
            raise HTTPException(422, 'Unknown dashboard detail')
        rows = groups[detail]
        return {'client_id':client_id,'as_of':management['as_of'],'items':[dashboard_contract.brief(r) for r in rows[offset:offset+limit]],
                'total':len(rows),'offset':offset,'limit':limit,'has_more':offset+limit<len(rows)}
    reviews, findings, risks, policies, vendors, tasks, exceptions = [records[k] for k in ('reviews','findings','risks','policies','vendors','tasks','exceptions')]

    # Apply person / unassigned filter to each collection so all downstream KPIs are naturally scoped.
    if scope == "unassigned":
        reviews = [r for r in reviews if _is_unassigned(r, "reviews") and r.get("status") not in ("completed", "cancelled")]
        findings = [f for f in findings if _is_unassigned(f, "findings") and is_open("findings", f)]
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

    risks = [assessed_risk(r) for r in risks]
    def is_overdue(item, date_field="due_date", closed_statuses=("completed", "done", "closed", "accepted", "retired", "cancelled")):
        d = calendar_day(item.get(date_field))
        return d is not None and d < calendar_day(now_iso) and item.get("status") not in closed_statuses

    overdue_reviews = [r['record'] for r in management['metrics']['past_due'] if r['kind']=='reviews']
    overdue_findings = [r['record'] for r in management['metrics']['past_due'] if r['kind']=='findings']
    overdue_tasks = [r['record'] for r in management['metrics']['past_due'] if r['kind']=='tasks']
    open_findings = management['activeRecords']['findings']
    critical_high = [r['record'] for r in management['materialFindings']]
    significant_risks = [assessed_risk(r['record']) for r in management['significantRisks']]

    # Risks needing reassessment: last_reviewed older than 12 months, or never reviewed and identified >12 months ago.
    twelve_months_ago = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
    def _stale(r):
        if r.get("status") in ("closed",):
            return False
        lr = r.get("last_reviewed") or r.get("date_identified") or r.get("created_at")
        return bool(lr and lr < twelve_months_ago)
    stale_risks = [r for r in risks if _stale(r)]

    upcoming_reviews = [r['record'] for r in management['metrics']['due_30d'] if r['kind']=='reviews']
    due_next_30_count = management['counts']['due_30d']

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
    crit_other = [f for f in critical_high if f.get("severity") == "critical" and not is_overdue(f)]
    high_overdue = [f for f in critical_high if is_overdue(f) and f.get("severity") == "high"]
    high_other = [f for f in critical_high if f.get("severity") == "high" and not is_overdue(f)]
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
    activity_scope = _scope_filter(user, client_id)
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
            "overdue_reviews": sum(r['kind']=='reviews' for r in management['metrics']['past_due']),
            "open_findings": len(management['activeRecords']['findings']),
            "critical_findings": len(management['materialFindings']),
            "significant_risks": len(management['significantRisks']),
            # new keys
            "overdue_actions": sum(r['kind']=='tasks' for r in management['metrics']['past_due']),
            "critical_high_findings": len(management['materialFindings']),
            "due_next_30": due_next_30_count,
            **management['counts'],
        },
        "contract_version": 2,
        "client_id": client_id,
        "posture": dashboard_contract.summary(groups),
        "applicable_requirements": [{'client_id':client_id,'baseline_key':key,'baseline_response':'applies'}
                                    for key in sorted({r['baseline_key'] for r in records['requirements']
                                                       if r.get('baseline_key') in {f['key'] for f in framework_governance.FRAMEWORKS}
                                                       and r.get('baseline_response')=='applies'})] if client_id else [],
        "management": {"as_of": management['as_of'], "counts": management['counts'],
                       "preview_limit":dashboard_contract.PREVIEW_LIMIT,
                       "metric_items":{key:[dashboard_contract.brief(r) for r in rows[:dashboard_contract.PREVIEW_LIMIT]] for key,rows in management['metrics'].items()}},
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
        "assurance_alerts": _assurance_alerts_for(vendors)[:8],
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


# ---------------- Startup: schema and standard account only ----------------
async def seed():
    """Compatibility entry point: never creates fictional operational data."""
    from initialization import initialize_standard
    await initialize_standard(db, _uid, _now)


@app.on_event("startup")
async def _on_start():
    # Fail startup if required database initialization fails.
    await seed()


# ---------------- Health ----------------
@api.get("/")
async def root():
    return {"service": "grc-platform", "status": "ok"}


# ---------------- Generic entity routes (registered last, so literals win) ----------------
entity_router = APIRouter(prefix="/api")


def _risk_level_from_score(score: Optional[int]) -> Optional[str]:
    return risk_level(score)


def _apply_risk_scoring(doc: Dict) -> Dict:
    """When numeric likelihood_score and impact_score are present on a risk,
    compute the derived risk_score and risk_level so they cannot drift out of sync."""
    doc.pop("_governance_lock", None)
    ls = doc.get("likelihood_score")
    is_ = doc.get("impact_score")
    if type(ls) is int and type(is_) is int and 1 <= ls <= 5 and 1 <= is_ <= 5:
        doc["risk_score"] = ls * is_
        doc["risk_level"] = _risk_level_from_score(doc["risk_score"])
    else:
        doc["risk_score"] = None
        doc["risk_level"] = None
    return doc


def _editable_patch(kind: str, body: Dict, existing: Optional[Dict] = None, user: Optional[Dict] = None) -> Dict:
    """One contract for normal and bulk writes; decisions have separate endpoints."""
    previous = existing or {}
    if 'framework_assessment_id' in body or any(k.startswith('framework_') for k in body):
        raise HTTPException(422,'Framework relationships are managed through the framework workspace')
    changes = {k: v for k, v in body.items() if v != previous.get(k) and not (v in (None, "") and previous.get(k) in (None, ""))}
    if kind == "policies":
        policy_approval.guard_patch(changes, previous)
    if kind == "contacts" and "linked_user_id" in changes:
        raise HTTPException(422, "Use the explicit account-link action to change a Contact identity association")
    if kind == "policies" and previous.get("schedule_from_reviews") and set(changes) & {"last_reviewed_at", "next_review_date"}:
        raise HTTPException(422, "Policy Review dates are controlled by linked Reviews")
    if kind == "vendors":
        if existing and set(changes) & {"next_review","review_frequency","custom_recurrence_days","separate_assurance_review","assurance_review_date","assurance_cadence","contract_review_enabled","contract_lead_days","offboarding_review_date"} and user and user.get("role") not in ("super_admin","platform_admin"):
            raise HTTPException(403, "Only platform administrators can change Review configuration")
        if "last_review" in changes or "assurance_status" in changes:
            raise HTTPException(422, "Review dates and assurance status are derived")
        if existing and previous.get("status") == "inactive" and changes:
            raise HTTPException(409, "Inactive Vendors remain historical records")
    if kind in ("findings", "tasks") and previous.get("occurrence_id") and set(changes) & {"review_id", "finding_id"}:
        raise HTTPException(422, "Review occurrence relationships must be retained")
    if kind == "reviews":
        if 'ai_system_id' in changes:
            raise HTTPException(422, 'Establish AI Reviews from AI Governance')
        if existing and existing.get('ai_system_id') and set(changes) & {'due_date','recurrence','custom_recurrence_days','status'}:
            if changes.get('recurrence') not in (None,'none') and existing.get('recurrence') == 'none' and existing.get('status') == 'cancelled':
                raise HTTPException(409, 'Cancelled AI Reviews remain historical')
        if existing and existing.get("vendor_purpose") == "contract" and set(changes) & {"due_date","recurrence","custom_recurrence_days"}:
            raise HTTPException(422, "Configure Contract Renewal Review through the Vendor contract dates and lead time")
        if "vendor_purpose" in changes or "vendor_id" in changes:
            raise HTTPException(422, "Establish Vendor Reviews from the Vendor schedule")
        if "risk_id" in changes:
            raise HTTPException(422, "Establish Risk Reviews from the Risk governance schedule")
        if user and user.get("role") not in ("super_admin", "platform_admin") and set(changes) - {"notes"}:
            raise HTTPException(403, "Only platform administrators can change Review configuration")
        if set(changes) & {"period", "next_review_date"} or changes.get("status") in ("in_progress", "completed"):
            raise HTTPException(422, "Occurrence, next date, and lifecycle transitions are system-controlled")
    if existing and kind == "reviews" and existing.get("status") == "completed" and changes:
        raise HTTPException(409, "Completed reviews are immutable; add an amendment")
    protected = {"created_at", "created_by", "updated_at", "completion_date", "parent_review_id", "completion_snapshot",
                 "next_occurrence_id", "rating_history", "approval_history", "decision_history", "validated_by", "validated_at",
                 "verified_at", "verified_by", "approved_at", "accepted", "accepted_by", "acceptance_date", "acceptance_rationale", "acceptance_expires_at"}
    protected |= {"current_occurrence_id", "occurrence_id", "occurrences", "schedule_anchor", "started_at", "started_by", "completed_at", "completed_by", "closed_at", "closed_by"}
    if protected.intersection(changes):
        raise HTTPException(422, "Decision and history fields cannot be edited directly")
    targets = {"policies": {"approved"}, "risks": {"accepted", "closed", "retired"}, "findings": {"closed", "accepted", "remediated"}, "reviews": {"completed"}, "exceptions": {"approved"}}
    if "status" in changes and (not isinstance(changes["status"], str) or kind in RULES["statuses"] and changes["status"] not in RULES["statuses"][kind]):
        raise HTTPException(422, "Invalid status")
    for field in ("title", "name"):
        if field in changes and (not isinstance(changes[field], str) or not changes[field].strip()):
            raise HTTPException(422, field.title() + " is required")
    if changes.get("due_date") and not review_occurrences.scheduled_date(changes["due_date"]):
        raise HTTPException(422, "Invalid due date")
    if "severity" in changes and changes["severity"] not in ["low", "medium", "high", "critical"]:
        raise HTTPException(422, "Invalid severity")
    if changes.get("status") in targets.get(kind, set()) or (kind == "policies" and changes.get("presence") == "verified_existing") or (kind == "risks" and changes.get("treatment") == "accept"):
        raise HTTPException(422, "Use the dedicated decision action")
    Model = ENTITY_MAP[kind][1]
    if set(changes) - set(Model.model_fields):
        raise HTTPException(422, "Unknown or read-only fields: " + ", ".join(sorted(set(changes) - set(Model.model_fields))))
    if kind == "risks":
        if existing and set(changes) & {"next_review","review_cadence","custom_recurrence_days"} and user and user.get("role") not in ("super_admin","platform_admin"):
            raise HTTPException(403, "Only platform administrators can change Review configuration")
        if "treatment" in changes and changes["treatment"] not in (None,"","mitigate","accept","transfer","avoid","monitor"):
            raise HTTPException(422, "Invalid treatment decision")
        if set(changes) & {"risk_score","risk_level","last_reviewed","date_identified"}:
            raise HTTPException(422, "Risk assessment results and review history dates are system-controlled")
        if not existing and changes.get("status") not in (None,"open","identified","assessed"):
            raise HTTPException(422, "New Risks start as Identified or Assessed")
        if existing and existing.get("status") in risk_lifecycle.CLOSED and changes:
            raise HTTPException(409, "Closed Risks are historical and cannot be edited")
        for key in ("likelihood_score", "impact_score"):
            if key in changes and changes[key] is not None and (type(changes[key]) is not int or not 1 <= changes[key] <= 5):
                raise HTTPException(422, "Risk ratings must be whole numbers from 1 to 5")
    try:
        validated = Model(**{**previous, **changes}).model_dump()
    except ValidationError as exc:
        raise HTTPException(422, str(exc))
    return {k: validated[k] for k in changes}


@entity_router.get("/{kind}")
async def list_entities(kind: str = Path(..., pattern=KIND_REGEX), client_id: Optional[str] = Query(None), portfolio_significant: bool = Query(False), user: Dict = Depends(get_current_user)):
    q = _scope_filter(user, client_id)
    if portfolio_significant:
        if kind != 'risks' or not client_id:
            raise HTTPException(422, 'A client Risk Register is required')
        from management_obligations import active_record
        # Exact contributing population, independent of the normal register cap.
        # Do not initialize IDs or mutate source records from a portfolio drill-in.
        risks = await db.risks.find(q, {'_id': 0}).to_list(None)
        risks = [_apply_risk_scoring(r) for r in risks if active_record(r, 'risks')]
        return [r for r in risks if r.get('risk_level') in ('high', 'critical')]
    if kind == "risks":
        scoped_clients = await db.risks.distinct("client_id", q)
        for scoped_client in scoped_clients:
            await risk_ids.initialize(db, scoped_client)
    docs = await db[_coll_for(kind)].find(q, {"_id": 0, "_remediation_lock": 0}).sort("created_at", -1).to_list(1001)
    if len(docs) > 1000:
        raise HTTPException(413, "This register exceeds the current 1,000-record limit. Use an export or contact your administrator. No partial results shown.")
    if kind == "vendors":
        reviews = await db.reviews.find(q, {"_id":0}).to_list(None)
        return [vendor_governance.view(d,reviews) for d in docs]
    return [_apply_risk_scoring(d) for d in docs] if kind == "risks" else [review_occurrences.view(d) for d in docs] if kind == "reviews" else docs


@entity_router.get("/{kind}/{item_id}")
async def get_entity(kind: str = Path(..., pattern=KIND_REGEX), item_id: str = Path(...), user: Dict = Depends(get_current_user)):
    """Read the authoritative record for drill-ins using existing resource scope."""
    doc = await _authorized_parent(kind, item_id, user)
    doc.pop('_governance_lock', None)
    doc.pop('_remediation_lock', None)
    if kind == 'reviews':
        return review_occurrences.view(doc)
    if kind == 'risks':
        return _apply_risk_scoring(doc)
    if kind == 'vendors':
        reviews = await db.reviews.find({'client_id': doc['client_id'], 'vendor_id': item_id}, {'_id': 0}).to_list(None)
        return vendor_governance.view(doc, reviews)
    return doc


@entity_router.post("/{kind}")
async def create_entity(kind: str = Path(..., pattern=KIND_REGEX), body: Dict[str, Any] = None,
                        user: Dict = Depends(get_current_user), idempotency_key: Optional[str] = Header(None)):
    # Authorization is re-evaluated even when a completed response is replayed.
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    if not _can_access_client(user, (body or {}).get("client_id")):
        raise HTTPException(403, "Forbidden for this client")
    async def execute(identity):
        return await _create_entity(kind=kind, body=body, user=user, identity=identity)
    return await create_requests.run(db, idempotency_key, user["user_id"], (body or {}).get("client_id"),
                                     kind, body or {}, execute)


@risk_mutation
@finding_mutation
async def _create_entity(kind, body, user, identity=None):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    entity_type, Model, id_field, prefix = ENTITY_MAP[kind]
    if identity:
        existing = await db[_coll_for(kind)].find_one({"_id": "create:" + identity}, {"_id": 0})
        if existing:
            return await _finish_entity_create(kind, existing, user)
    checked = _editable_patch(kind, body or {}, user=user)
    parsed = Model(**checked).model_dump()
    if not _can_access_client(user, parsed["client_id"]):
        raise HTTPException(403, "Forbidden for this client")
    if kind == "tasks":
        parsed = await action_items.prepare(db, parsed, _can_access_client)
    await assignment_eligibility.validate(db, kind, parsed, _can_access_client)
    for related_kind, (_related_type, _related_model, related_key, _related_prefix) in ENTITY_MAP.items():
        if related_key == id_field or not parsed.get(related_key):
            continue
        if not await db[_coll_for(related_kind)].find_one({related_key: parsed[related_key], "client_id": parsed["client_id"]}):
            raise HTTPException(422, "Related record must belong to the same client")
    if kind == "risks":
        parsed = _apply_risk_scoring(parsed)
        parsed["display_id"] = await risk_ids.allocate(db, parsed["client_id"])
        parsed["status"] = "assessed" if parsed.get("risk_score") else "identified"
        risk_lifecycle.validate_schedule(parsed)
        parsed = await risk_lifecycle.prepare_source(db, parsed)
        if not parsed.get("date_identified"):
            parsed["date_identified"] = _now()
    if kind == "vendors":
        await vendor_governance.validate(db,parsed,_can_access_client)
        parsed["service"] = parsed.get("service") or parsed.get("services")
        for risk_id in parsed.get("related_risk_ids") or []:
            if not await db.risks.find_one({"risk_id":risk_id, "client_id":parsed["client_id"]}):
                raise HTTPException(422, "Related risk must belong to the same client")
    new_id = _uid(prefix)
    doc = {id_field: new_id, **parsed, "created_at": _now(), "updated_at": _now(),
           "created_by": user["user_id"]}
    if kind == "reviews":
        doc = review_occurrences.view(doc)
    doc = await create_requests.insert_primary(db, _coll_for(kind), doc, identity)
    return await _finish_entity_create(kind, doc, user)


async def _finish_entity_create(kind, doc, user):
    entity_type, _model, id_field, _prefix = ENTITY_MAP[kind]
    new_id = doc[id_field]
    if kind == "tasks":
        await remediation.synchronize(db, doc, user, _now, audit)
    if kind == "reviews":
        await policy_reviews.sync(db, doc)
    await audit(user, "Risk created" if kind == "risks" else "Vendor created" if kind == "vendors" else "create", entity_type, new_id, doc.get("client_id"))
    if kind == "vendors":
        await vendor_governance.ensure_reviews(db,doc,user,_now())
    if kind == "risks":
        await risk_lifecycle.ensure_review(db, doc, user, _now())
    if kind == "risks" and doc.get("vendor_id"):
        await audit(user,"Risk linked","vendor",doc["vendor_id"],doc["client_id"],meta={"risk_id":new_id})
    if kind == "tasks" and doc.get("vendor_id"):
        await audit(user,"Related Action Item created","vendor",doc["vendor_id"],doc["client_id"],meta={"task_id":new_id})
    if kind == "tasks" and doc.get("risk_id"):
        await db.risks.update_one({"risk_id":doc["risk_id"],"client_id":doc["client_id"],"status":{"$in":["assessed","open"]},"risk_score":{"$ne":None}}, {"$set":{"status":"in_progress","updated_at":_now()}})
        await audit(user, "Related Action Item created", "risk", doc["risk_id"], doc["client_id"], meta={"task_id":new_id})
    return doc


@entity_router.patch("/{kind}/{item_id}")
@risk_mutation
@vendor_mutation
@review_mutation
@finding_mutation
async def update_entity(kind: str = Path(..., pattern=KIND_REGEX), item_id: str = Path(...), body: Dict[str, Any] = None, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    entity_type, _Model, id_field, _pfx = ENTITY_MAP[kind]
    existing = await db[_coll_for(kind)].find_one({id_field: item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not _can_access_client(user, existing["client_id"]):
        raise HTTPException(403, "Forbidden")
    expected_occurrence = (body or {}).get("expected_occurrence_id")
    incoming = dict(body or {})
    _require_snapshot(incoming, existing)
    incoming.pop("expected_updated_at")
    if kind == "reviews":
        incoming.pop("expected_occurrence_id", None)
        if expected_occurrence:
            await _review_selection(existing, expected_occurrence, write=True)
        elif existing.get("occurrences") and incoming:
            raise HTTPException(409, "Reload this occurrence before editing")
    body = _editable_patch(kind, incoming, existing, user=user)
    if kind == "policies":
        body = policy_provenance.invalidate(body, existing)
    if kind == "tasks" and "assignee_id" in incoming and incoming["assignee_id"] in (None, "") and existing.get("owner_id"):
        body["assignee_id"] = None
    if kind == "tasks":
        await action_items.prepare(db, {**existing, **body}, _can_access_client, existing)
    await assignment_eligibility.validate(db, kind, {**existing, **body}, _can_access_client, existing)
    if kind == "vendors":
        await vendor_governance.validate(db,{**existing,**body},_can_access_client,existing)
        for risk_id in body.get("related_risk_ids") or []:
            if not await db.risks.find_one({"risk_id":risk_id, "client_id":existing["client_id"]}):
                raise HTTPException(422, "Related risk must belong to the same client")
    if "client_id" in body and body["client_id"] != existing["client_id"]:
        raise HTTPException(422, "A record cannot be moved to another client")
    for related_kind, (related_type, related_model, related_key, related_prefix) in ENTITY_MAP.items():
        if related_key == id_field or not body.get(related_key):
            continue
        linked_record = await db[_coll_for(related_kind)].find_one({related_key: body[related_key], "client_id": existing["client_id"]}, {"_id": 0})
        if not linked_record:
            raise HTTPException(422, "Related record must belong to the same client")
    if kind == "risks":
        # Merge with existing so partial patches still compute a consistent score.
        merged = {**existing, **body}
        risk_lifecycle.validate_schedule(merged)
        merged = await risk_lifecycle.prepare_source(db, merged)
        for key in ("review_id","finding_id","vendor_id","assessment_id"):
            if merged.get(key) != existing.get(key):
                body[key] = merged.get(key)
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
        computed = _apply_risk_scoring(merged)
        if existing.get("status") in ("open","identified") and computed.get("risk_score"):
            body["status"] = "assessed"
        for k in ("risk_score", "risk_level"):
            if k in computed:
                body[k] = computed[k]
    if kind == "reviews" and set(body) & {"due_date", "recurrence", "custom_recurrence_days"}:
        body.update(review_occurrences.schedule({**existing, **body}, reset_anchor="due_date" in body))
        body["status"] = review_occurrences.view({**existing, **body})["status"]
    if kind == "tasks" and "assignee_id" in body and "owner_id" in existing:
        body["owner_id"] = None  # assignee is authoritative after an explicit assignment
    if kind == "tasks" and body.get("status") == "in_progress" and not existing.get("started_at"):
        body.update({"started_at": _now(), "started_by": user["user_id"]})
    if kind == "tasks" and "status" in body:
        body.update({"completed_at": _now() if body["status"] == "done" else None,
                     "completed_by": user["user_id"] if body["status"] == "done" else None})
    body["updated_at"] = _next_write_time(existing.get("updated_at"))
    query = {id_field: item_id}
    if kind == "reviews":
        query["current_occurrence_id"] = existing.get("current_occurrence_id")
    # Also protect the read/validate/write window, independently of browser state.
    query["updated_at"] = existing.get("updated_at")
    result = await db[_coll_for(kind)].update_one(query, {"$set": body})
    if not result.matched_count:
        raise HTTPException(409, "Record changed; reload before saving")
    if kind == "tasks" and existing.get("finding_id"):
        await remediation.synchronize(db, existing, user, _now, audit)
    doc = await db[_coll_for(kind)].find_one({id_field: item_id}, {"_id": 0})
    if kind == "risks":
        await risk_lifecycle.ensure_review(db, doc, user, _now())
    if kind == "vendors":
        await vendor_governance.ensure_reviews(db,doc,user,_now())
    if kind == "reviews" and doc.get("vendor_id"):
        await vendor_governance.sync_completion(db,doc)
    if kind == "reviews":
        await policy_reviews.sync(db, doc)
    if kind == "reviews" and doc.get("risk_id"):
        await db.risks.update_one({"risk_id":doc["risk_id"],"client_id":doc["client_id"]}, {"$set":{
            "next_review":doc.get("due_date") if doc.get("status") not in ("completed","cancelled") else None,
            "review_cadence":doc.get("recurrence"),"custom_recurrence_days":doc.get("custom_recurrence_days")}})
    if kind == "reviews" and set(incoming) & {"due_date", "recurrence", "custom_recurrence_days", "owner_id"}:
        await _review_event(user, doc, "Review configuration changed", fields=list(incoming))
    if kind == "tasks":
        associated = await db.risks.find({"client_id":existing["client_id"],"$or":[{"risk_id":existing.get("risk_id")},{"related_task_ids":item_id}]},{"risk_id":1}).to_list(None)
        for associated_risk in associated:
            await audit(user, "Related Action Item completed" if doc.get("status") == "done" else "Related Action Item updated", "risk", associated_risk["risk_id"], existing["client_id"], meta={"task_id":item_id})
    if kind == "tasks" and doc.get("vendor_id"):
        await audit(user,"Related Action Item completed" if doc.get("status") == "done" else "Related Action Item updated","vendor",doc["vendor_id"],doc["client_id"],meta={"task_id":item_id})
    if kind == "tasks" and existing.get("review_id") and set(incoming) & {"status", "assignee_id"}:
        review = await db.reviews.find_one({"review_id": existing["review_id"], "client_id": existing["client_id"]}, {"_id": 0})
        if review:
            await _review_event(user, review, "Action Item completed" if doc.get("status") == "done" else "Action Item updated",
                existing.get("occurrence_id") or "occ_" + review["review_id"],
                task_id=item_id, title=doc["title"], status=doc.get("status"), assignee_id=doc.get("assignee_id"))
    event = "Action Item completed" if kind == "tasks" and body.get("status") == "done" else "Work started" if kind == "tasks" and body.get("status") == "in_progress" else "Assignment changed" if kind == "tasks" and "assignee_id" in body else "Action Item updated" if kind == "tasks" else "update"
    if kind == "vendors":
        event = "Vendor "+("moved to "+body["status"].replace("_"," ") if "status" in body else "criticality changed" if "criticality" in body else "Business Owner changed" if "business_owner_id" in body else "assurance updated" if "assurance_records" in body else "contract updated" if any(k.startswith("contract_") for k in body) else "Risk linked" if "related_risk_ids" in body else "updated")
    if kind == "risks":
        event = "Risk reassessed" if any(existing.get(k) != doc.get(k) for k in ("likelihood_score","impact_score")) else "Risk owner assigned" if "owner_id" in incoming else "Treatment updated" if "treatment" in incoming else "Next Risk Review scheduled" if set(incoming) & {"next_review","review_cadence","custom_recurrence_days"} else "Risk updated"
    await audit(user, event, entity_type, item_id, existing.get("client_id"), meta={"changed_fields": list(body.keys()), **({"previous_score":existing.get("risk_score"),"score":doc.get("risk_score"),"level":doc.get("risk_level"),"owner_id":doc.get("owner_id")} if kind == "risks" else {})})
    return review_occurrences.view(doc) if kind == "reviews" else doc


@entity_router.delete("/{kind}/{item_id}")
@finding_mutation
async def delete_entity(kind: str = Path(..., pattern=KIND_REGEX), item_id: str = Path(...), user: Dict = Depends(get_current_user), body: Optional[Dict[str, Any]] = Body(None)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Destructive action restricted")
    entity_type, _M, id_field, _p = ENTITY_MAP[kind]
    existing = await db[_coll_for(kind)].find_one({id_field: item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Not found")
    if not _can_access_client(user, existing["client_id"]):
        raise HTTPException(403, "Forbidden")
    if kind == "contacts" and await db.clients.find_one({"client_id": existing["client_id"], "primary_contact_id": item_id}):
        raise HTTPException(409, "This is the Primary Contact. Archive the Contact or change the client relationship before deleting it.")
    if kind == "policies" and (existing.get("approval_history") or existing.get("decision_history") or existing.get("status") in ("approved", "in_review")):
        raise HTTPException(409, "Policy approval history must be retained; retire the Policy instead")
    if kind in ("risks","vendors") or kind == "reviews" and (existing.get("risk_id") or existing.get("vendor_id") or existing.get('ai_system_id')):
        raise HTTPException(409, "Risks and their Review obligations must be retained")
    if kind == "reviews" and (existing.get("status") == "completed" or existing.get("occurrences")):
        raise HTTPException(409, "Completed reviews must be retained")
    if kind == "tasks" and (existing.get("status") == "done" or existing.get("completed_at")):
        raise HTTPException(409, "Completed Action Items must be retained")
    _require_snapshot(body or {}, existing)
    delete_query = {id_field: item_id, "updated_at": existing.get("updated_at")}
    if kind == "policies":
        delete_query.update({"updated_at": existing.get("updated_at"), "status": existing.get("status"),
                             "approval_history": existing.get("approval_history"), "decision_history": existing.get("decision_history")})
    deleted = await db[_coll_for(kind)].delete_one(delete_query)
    if not deleted.deleted_count:
        raise HTTPException(409, "Record changed; reload before deleting")
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
    from_name = os.environ.get("EMAIL_FROM_NAME", "Omnisciente")
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
        f'<p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8">Sent by Omnisciente. We never ask for passwords or codes by email.</p>'
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
        if not u or not u.get("email") or u.get("status") != "active":
            continue
        buckets = {k: [r for r in rows if _can_access_client(u, r["client_id"])] for k, rows in buckets.items()}
        if not any(buckets.values()):
            continue
        html = _digest_html(u.get("name") or u["email"], buckets["reviews"], buckets["findings"])
        total = len(buckets["reviews"]) + len(buckets["findings"])
        await send_email(to=u["email"], subject=f"Omnisciente: {total} overdue item(s) need attention", html=html)


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
    expected_updated_at: Optional[str] = Field(default=None,max_length=100)
    rationale: str
    expiry_date: Optional[str] = None  # ISO date, becomes next_review
    approver_id: Optional[str] = None
    compensating_controls: Optional[str] = None


@api.post("/risks/{risk_id}/accept")
@risk_mutation
async def risk_accept(risk_id: str, body: RiskAcceptIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform-level roles can accept risks")
    if not body.rationale.strip() or not body.expiry_date or body.expiry_date[:10] <= _now()[:10]:
        raise HTTPException(422, "Rationale and a future acceptance expiry are required")
    try:
        datetime.fromisoformat(body.expiry_date)
    except ValueError:
        raise HTTPException(422, "Invalid acceptance expiry date")
    if body.approver_id and body.approver_id != user["user_id"]:
        raise HTTPException(422, "You can only record your own acceptance decision")
    risk = await db.risks.find_one({"risk_id": risk_id}, {"_id": 0})
    if not risk:
        raise HTTPException(404, "Risk not found")
    if not _can_access_client(user, risk["client_id"]):
        raise HTTPException(403, "Forbidden")
    _require_snapshot(body.model_dump(exclude_unset=True),risk)
    if risk.get("status") in risk_lifecycle.CLOSED:
        raise HTTPException(409, "Closed Risks cannot be accepted")
    updates = {
        "status": "accepted",
        "treatment": "accept",
        "accepted": True,
        "accepted_by": user["user_id"],
        "acceptance_date": _now(),
        "acceptance_rationale": body.rationale,
        "acceptance_expires_at": body.expiry_date,
        "next_review": min(risk.get("next_review") or body.expiry_date, body.expiry_date),
        "updated_at": _next_write_time(risk.get('updated_at')),
    }
    if body.compensating_controls:
        updates["compensating_controls"] = body.compensating_controls
    risk_lifecycle.validate_schedule({**risk,**updates})
    await db.risks.update_one({"risk_id": risk_id}, {"$set": updates, "$push": {"decision_history": {
        "action": "accepted", "by": user["user_id"], "at": _now(), "rationale": body.rationale, "expires_at": body.expiry_date}}})
    await risk_lifecycle.ensure_review(db, {**risk,**updates}, user, _now())
    await audit(user, "accept", "risk", risk_id, risk["client_id"], meta={"expiry": body.expiry_date})
    return await db.risks.find_one({"risk_id": risk_id}, {"_id": 0})


class VendorScheduleReviewIn(BaseModel):
    expected_updated_at: Optional[str] = Field(default=None,max_length=100)
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
@vendor_mutation
async def vendor_schedule_review(vendor_id: str, body: VendorScheduleReviewIn, user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    vendor = await db.vendors.find_one({"vendor_id": vendor_id}, {"_id": 0})
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    if not _can_access_client(user, vendor["client_id"]):
        raise HTTPException(403, "Forbidden")
    if user.get("role") not in ("super_admin","platform_admin"):
        raise HTTPException(403, "Only platform administrators can change Review configuration")
    _require_snapshot(body.model_dump(exclude_unset=True),vendor)
    changes = {"next_review":body.due_date or vendor.get("next_review")}
    if not changes["next_review"]:
        raise HTTPException(422, "Select the first Review date")
    if body.recurrence:
        changes["review_frequency"] = "as_needed" if body.recurrence == "none" else body.recurrence
    candidate = {**vendor,**changes}
    await vendor_governance.validate(db,candidate,_can_access_client,vendor)
    reviews = await vendor_governance.ensure_reviews(db,candidate,user,_now())
    changes['updated_at']=_next_write_time(vendor.get('updated_at'))
    await db.vendors.update_one({"vendor_id":vendor_id},{"$set":changes})
    await audit(user,"Vendor Review scheduled","vendor",vendor_id,vendor["client_id"])
    return {"review":next((r for r in reviews if r.get("vendor_purpose") == "vendor"),None),"vendor_id":vendor_id,"vendor":{**vendor,**changes}}


@api.post("/risks/{risk_id}/mark-reviewed")
@api.post("/risks/{risk_id}/review")
@risk_mutation
async def risk_mark_reviewed(risk_id: str, user: Dict = Depends(get_current_user)):
    risk = await _authorized_parent("risks", risk_id, user, write=True)
    if risk.get("status") in risk_lifecycle.CLOSED:
        raise HTTPException(409, "Closed Risks have no active Review")
    await risk_ids.initialize(db, risk["client_id"])
    risk = await db.risks.find_one({"risk_id":risk_id},{"_id":0})
    review = await risk_lifecycle.ensure_review(db, risk, user, _now())
    if not review:
        raise HTTPException(422, "Set a Next Review date before reviewing this Risk")
    return {"review":review}


class RiskCloseIn(BaseModel):
    expected_updated_at: Optional[str] = Field(default=None,max_length=100)
    reason: str
    note: Optional[str] = None


@api.post("/risks/{risk_id}/close")
@risk_mutation
async def close_risk(risk_id: str, body: RiskCloseIn, user: Dict = Depends(get_current_user)):
    if user.get("role") not in ("super_admin","platform_admin"):
        raise HTTPException(403, "Only platform-level roles can close Risks")
    risk = await _authorized_parent("risks",risk_id,user,write=True)
    _require_snapshot(body.model_dump(exclude_unset=True),risk)
    if body.reason not in risk_lifecycle.CLOSURE_REASONS:
        raise HTTPException(422,"Choose a closure reason")
    if risk.get("status") in risk_lifecycle.CLOSED:
        await risk_lifecycle.ensure_review(db,risk,user,_now())
        return risk
    now = _next_write_time(risk.get('updated_at'))
    changes = {"status":"closed","closure_reason":body.reason,"closure_note":body.note,
               "closed_by":user["user_id"],"closed_at":now,"next_review":None,"updated_at":now}
    await db.risks.update_one({"risk_id":risk_id},{"$set":changes,"$push":{"decision_history":{
        "action":"closed","by":user["user_id"],"at":now,"reason":body.reason,"note":body.note}}})
    await risk_lifecycle.ensure_review(db,{**risk,**changes},user,now)
    await audit(user,"Risk closed","risk",risk_id,risk["client_id"],meta={"reason":body.reason})
    return {**risk,**changes}


@api.post("/risks/{risk_id}/link-action-item")
@risk_mutation
async def link_risk_task(risk_id: str, body: Dict[str, Any], user: Dict = Depends(get_current_user)):
    risk = await _authorized_parent("risks",risk_id,user,write=True)
    task = await _authorized_parent("tasks",body.get("task_id"),user,write=True)
    if risk["client_id"] != task["client_id"]:
        raise HTTPException(422,"Action Item must belong to this client")
    if risk.get("status") in risk_lifecycle.CLOSED:
        raise HTTPException(409,"Closed Risks are historical")
    result = await db.risks.update_one({"risk_id":risk_id},{"$addToSet":{"related_task_ids":task["task_id"]}})
    if result.modified_count:
        await audit(user,"Action Item linked","risk",risk_id,risk["client_id"],meta={"task_id":task["task_id"]})
    return task


@api.get("/vendors/{vendor_id}/activity")
async def vendor_activity(vendor_id: str, user: Dict = Depends(get_current_user)):
    vendor = await _authorized_parent("vendors",vendor_id,user)
    return await db.audit_logs.find({"client_id":vendor["client_id"],"entity_id":vendor_id,
        "entity_type":{"$in":["vendor","vendors"]}},{"_id":0}).sort("at",-1).to_list(500)


@api.get("/risks/{risk_id}/activity")
async def risk_activity(risk_id: str, user: Dict = Depends(get_current_user)):
    risk = await _authorized_parent("risks",risk_id,user)
    return await db.audit_logs.find({"client_id":risk["client_id"],"entity_id":risk_id,
        "entity_type":{"$in":["risk","risks"]}},{"_id":0}).sort("at",-1).to_list(500)


@api.get("/risks/{risk_id}/review-history")
async def risk_review_history(risk_id: str, user: Dict = Depends(get_current_user)):
    risk = await _authorized_parent("risks",risk_id,user)
    reviews = await db.reviews.find({"risk_id":risk_id,"client_id":risk["client_id"]},{"_id":0}).to_list(None)
    return [{"review_id":r["review_id"],**o} for r in reviews for o in r.get("occurrences",[])]


@api.post("/findings/{finding_id}/raise-risk")
@finding_mutation
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
        "display_id": await risk_ids.allocate(db, finding["client_id"]),
        "title": f"Risk raised from finding: {finding.get('title')}",
        "client_id": finding["client_id"],
        "category": "Compliance",
        "likelihood_score": None,
        "impact_score": None,
        "risk_score": None,
        "risk_level": None,
        "status": "identified",
        "treatment": "mitigate",
        "owner_id": finding.get("owner_id"),
        "description": finding.get("description"),
        "source": f"Finding {short_id}",
        "source_type": "finding", "source_id": finding_id, "finding_id": finding_id,
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
        f'<p style="margin:12px 0 0 0;font-size:11px;color:#94a3b8">Sent by Omnisciente. We never ask for passwords or codes by email. To stop receiving this digest, ask your admin to update your notification preferences.</p>'
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
    open_finding = ("open", "in_remediation", "remediated")

    users = await db.users.find(
        {"weekly_digest_optout": {"$ne": True}, "status": "active"},
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
            **_scope_filter(u),
            "$or": [{"owner_id": uid}, {"reviewer_id": uid}],
            "status": {"$nin": list(closed_review)},
            "due_date": {"$lt": now_iso},
        }, {"_id": 0, "review_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        reviews_ds = await db.reviews.find({
            **_scope_filter(u),
            "$or": [{"owner_id": uid}, {"reviewer_id": uid}],
            "status": {"$nin": list(closed_review)},
            "due_date": {"$gte": now_iso, "$lte": horizon_iso},
        }, {"_id": 0, "review_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        tasks_od = await db.tasks.find({
            **_scope_filter(u),
            "$or": [{"assignee_id": uid}, {"owner_id": uid}],
            "status": {"$nin": list(closed_task)},
            "due_date": {"$lt": now_iso},
        }, {"_id": 0, "task_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        tasks_ds = await db.tasks.find({
            **_scope_filter(u),
            "$or": [{"assignee_id": uid}, {"owner_id": uid}],
            "status": {"$nin": list(closed_task)},
            "due_date": {"$gte": now_iso, "$lte": horizon_iso},
        }, {"_id": 0, "task_id": 1, "title": 1, "due_date": 1, "status": 1}).sort("due_date", 1).to_list(50)

        findings_od = await db.findings.find({
            **_scope_filter(u),
            "owner_id": uid,
            "status": {"$in": list(open_finding)},
            "due_date": {"$lt": now_iso},
        }, {"_id": 0, "finding_id": 1, "title": 1, "due_date": 1, "status": 1, "severity": 1}).sort("due_date", 1).to_list(50)

        findings_ds = await db.findings.find({
            **_scope_filter(u),
            "owner_id": uid,
            "status": {"$in": list(open_finding)},
            "due_date": {"$gte": now_iso, "$lte": horizon_iso},
        }, {"_id": 0, "finding_id": 1, "title": 1, "due_date": 1, "status": 1, "severity": 1}).sort("due_date", 1).to_list(50)

        # Reassess digest: risks owned by this user with last_reviewed (fallback to date_identified)
        # older than 12 months and still open.
        twelve_months_ago = (now_dt - timedelta(days=365)).isoformat()
        candidate_risks = await db.risks.find({
            **_scope_filter(u),
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
            **_scope_filter(u),
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
                f"Omnisciente: {overdue_total} overdue and {total - overdue_total} due-soon this week"
                if overdue_total else f"Omnisciente: {total} item(s) due this week"
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
    occurrence_id: Optional[str] = None
    completion_notes: Optional[str] = None
    risk_assessment: Optional[Dict[str, Any]] = None
    risk_outcome: Optional[str] = None
    completion_date: Optional[str] = None
    spawn_next: Optional[bool] = True
    conclusion: Optional[str] = None
    tested_period: Optional[str] = None
    tested_scope: Optional[str] = None
    no_evidence_reason: Optional[str] = None
    checklist_confirmed: bool = False


class DecisionIn(BaseModel):
    rationale: str
    expected_updated_at: Optional[str] = Field(default=None,max_length=100)


@api.post("/exceptions/{exception_id}/approve")
async def approve_exception(exception_id: str, body: DecisionIn, user: Dict = Depends(get_current_user)):
    item = await _authorized_parent("exceptions", exception_id, user, write=True)
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform-level roles can approve exceptions")
    _require_snapshot(body.model_dump(exclude_unset=True),item)
    if not body.rationale.strip() or not item.get("expires_at") or item["expires_at"][:10] <= _now()[:10]:
        raise HTTPException(422, "Approval rationale and future exception expiry are required")
    decision = {"action":"approved", "by":user["user_id"], "at":_now(), "rationale":body.rationale.strip()}
    changed=await db.exceptions.update_one({"exception_id":exception_id,'updated_at':item.get('updated_at')}, {"$set":{"status":"approved", "approver_id":user["user_id"], "approved_at":decision["at"],'updated_at':_next_write_time(item.get('updated_at'))}, "$push":{"decision_history":decision}})
    if not changed.matched_count:raise HTTPException(409,'Record changed since it was opened; reload before saving')
    await audit(user, "approve", "exception", exception_id, item["client_id"], meta=decision)
    return await db.exceptions.find_one({"exception_id":exception_id}, {"_id":0})


@api.post("/findings/{finding_id}/accept")
@finding_mutation
async def accept_finding(finding_id: str, body: DecisionIn, user: Dict = Depends(get_current_user)):
    item = await _authorized_parent("findings", finding_id, user, write=True)
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform-level roles can accept findings")
    _require_snapshot(body.model_dump(exclude_unset=True),item)
    if not body.rationale.strip():
        raise HTTPException(422, "Acceptance rationale is required")
    decision = {"action":"accepted", "by":user["user_id"], "at":_now(), "rationale":body.rationale.strip()}
    changed=await db.findings.update_one({"finding_id":finding_id,'updated_at':item.get('updated_at')}, {"$set":{"status":"accepted", "updated_at":_next_write_time(item.get('updated_at'))}, "$push":{"decision_history":decision}})
    if not changed.matched_count:raise HTTPException(409,'Record changed since it was opened; reload before saving')
    await audit(user, "accept", "finding", finding_id, item["client_id"], meta=decision)
    return await db.findings.find_one({"finding_id":finding_id}, {"_id":0})


@api.post("/findings/{finding_id}/validate")
@finding_mutation
async def validate_finding(finding_id: str, body: DecisionIn, user: Dict = Depends(get_current_user)):
    finding = await _authorized_parent("findings", finding_id, user, write=True)
    if user.get("role") not in ("super_admin", "platform_admin"):
        raise HTTPException(403, "Only platform-level roles can validate remediation")
    if not body.rationale.strip():
        raise HTTPException(422, "Validation rationale is required")
    if finding.get("status") != "remediated":
        raise HTTPException(409, "Finding must be pending validation")
    if await db.tasks.find_one({"finding_id": finding_id, "client_id": finding["client_id"], "status": {"$nin": ["done", "cancelled"]}}):
        raise HTTPException(409, "Complete outstanding remediation first")
    decision = {"action": "validated", "by": user["user_id"], "at": _now(), "rationale": body.rationale.strip()}
    result = await db.findings.update_one({"finding_id": finding_id, "status": "remediated", "updated_at":finding.get('updated_at')}, {"$set": {
        "status": "closed", "validated_by": user["user_id"], "validated_at": decision["at"],
        "closed_by": user["user_id"], "closed_at": decision["at"], "updated_at": decision["at"]}, "$push": {"decision_history": decision}})
    if not result.modified_count:
        raise HTTPException(409, "Finding changed; reload before validating")
    await audit(user, "validate", "finding", finding_id, finding["client_id"], meta=decision)
    for task in await db.tasks.find({"finding_id": finding_id, "client_id": finding["client_id"]}, {"_id": 0}).to_list(2000):
        await audit(user, "Related Finding validated and closed", "task", task["task_id"], finding["client_id"], meta={"finding_id": finding_id})
    if finding.get("review_id"):
        review = await db.reviews.find_one({"review_id": finding["review_id"], "client_id": finding["client_id"]}, {"_id": 0})
        if review:
            await _review_event(user, review, "Finding validated and closed",
                finding.get("occurrence_id") or "occ_" + review["review_id"], finding_id=finding_id, title=finding["title"])
    return await db.findings.find_one({"finding_id": finding_id}, {"_id": 0})


@api.post("/reviews/{review_id}/amend")
async def amend_review(review_id: str, body: DecisionIn, user: Dict = Depends(get_current_user)):
    review = await _authorized_parent("reviews", review_id, user, write=True)
    if review.get("status") != "completed" or not body.rationale.strip():
        raise HTTPException(422, "A completed review and amendment explanation are required")
    amendment = {"by": user["user_id"], "at": _now(), "rationale": body.rationale.strip()}
    await db.reviews.update_one({"review_id": review_id}, {"$push": {"amendments": amendment}})
    await audit(user, "amend", "review", review_id, review["client_id"], meta=amendment)
    return await db.reviews.find_one({"review_id": review_id}, {"_id": 0})


async def _review_selection(review, selected=None, write=False):
    selected = selected or review_occurrences.occurrence_id(review)
    current = review_occurrences.occurrence_id(review)
    if selected != current:
        if write:
            raise HTTPException(409, "This occurrence has finished; reload the Review")
        if not any(o["occurrence_id"] == selected for o in review.get("occurrences", [])):
            raise HTTPException(404, "Occurrence not found")
    if write and review.get("status") in ("completed", "cancelled"):
        raise HTTPException(409, "This Review occurrence is closed")
    return selected


async def _review_event(user, review, action, occurrence=None, **meta):
    await audit(user, action, "review", review["review_id"], review["client_id"],
                meta={"occurrence_id": occurrence or review_occurrences.occurrence_id(review),
                      "by_name": user.get("name") or user.get("email"), **meta})


@api.get("/reviews/{review_id}/history")
async def review_history(review_id: str, user: Dict = Depends(get_current_user)):
    review = await _authorized_parent("reviews", review_id, user)
    history = list(review.get("occurrences", []))
    seen = set()
    cursor = review
    while cursor and cursor["review_id"] not in seen:
        seen.add(cursor["review_id"])
        if cursor.get("status") == "completed" and not cursor.get("occurrences"):
            snap = cursor.get("completion_snapshot") or {}
            history.append({**cursor, "occurrence_id": review_occurrences.occurrence_id(cursor),
                "period": cursor.get("period") or snap.get("tested_period") or review_occurrences.schedule(cursor)["period"],
                "completed_at": cursor.get("completion_date") or snap.get("at"),
                "completed_by": snap.get("by"), "legacy": True})
        parent = cursor.get("parent_review_id")
        cursor = await db.reviews.find_one({"review_id": parent, "client_id": review["client_id"]}, {"_id": 0}) if parent else None
    return sorted(history, key=lambda o: o.get("completed_at") or o.get("completion_date") or "", reverse=True)


@api.get("/reviews/{review_id}/activity")
async def review_activity(review_id: str, occurrence_id: Optional[str] = None, user: Dict = Depends(get_current_user)):
    review = await _authorized_parent("reviews", review_id, user)
    selected = await _review_selection(review, occurrence_id)
    query = {"client_id": review["client_id"], "entity_id": review_id,
             "action": {"$nin": ["update"]},
             "entity_type": {"$in": ["review", "reviews"]},
             **(review_occurrences.occurrence_query(review, selected, "meta.occurrence_id") if occurrence_id else {})}
    return await db.audit_logs.find(query, {"_id": 0}).sort("at", -1).to_list(500)


class ReviewOccurrenceAction(BaseModel):
    occurrence_id: str


@api.post("/reviews/{review_id}/start")
@risk_mutation
@vendor_mutation
@review_mutation
async def start_review(review_id: str, body: ReviewOccurrenceAction, user: Dict = Depends(get_current_user)):
    review = await _authorized_parent("reviews", review_id, user, write=True)
    await _review_selection(review, body.occurrence_id, write=True)
    if review_occurrences.view(review)["status"] == "needs_scheduling":
        raise HTTPException(422, "An administrator must schedule this Review first")
    if review.get("status") == "in_progress":
        return review_occurrences.view(review)
    updates = {"status": "in_progress", "current_occurrence_id": body.occurrence_id,
               "started_by": user["user_id"], "started_at": _now(), "updated_at": _now()}
    if review.get("risk_id"):
        risk = await _authorized_parent("risks", review["risk_id"], user, write=True)
        if risk["client_id"] != review["client_id"] or risk.get("status") in risk_lifecycle.CLOSED:
            raise HTTPException(409, "This Risk is no longer active")
        updates["risk_baseline"] = risk_lifecycle.snapshot(risk)
    result = await db.reviews.update_one({"review_id": review_id, "current_occurrence_id": review.get("current_occurrence_id"),
                                         "status": review.get("status")}, {"$set": updates})
    if not result.modified_count:
        raise HTTPException(409, "Review changed; reload before starting")
    if review.get("vendor_id") and (review.get("vendor_purpose") or "vendor") == "vendor":
        changed = await db.vendors.update_one({"vendor_id":review["vendor_id"],"client_id":review["client_id"],"status":"onboarding"},{"$set":{"status":"under_review","updated_at":_now()}})
        if changed.modified_count:
            await audit(user,"Vendor moved to under review","vendor",review["vendor_id"],review["client_id"])
    await _review_event(user, review, "Review started")
    return review_occurrences.view({**review, **updates})


@api.post("/reviews/{review_id}/complete")
@risk_mutation
@vendor_mutation
@review_mutation
async def complete_review(review_id: str, body: ReviewCompleteIn, user: Dict = Depends(get_current_user)):
    review = await _authorized_parent("reviews", review_id, user, write=True)
    if not body.occurrence_id:
        raise HTTPException(422, "An occurrence ID is required; reload the Review")
    prior = next((o for o in review.get("occurrences", []) if o["occurrence_id"] == body.occurrence_id), None)
    if prior:
        await risk_lifecycle.sync_completion(db, review)
        await vendor_governance.sync_completion(db, review)
        await policy_reviews.sync(db, review)
        return {"review": review_occurrences.view(review), "occurrence": prior, "spawned": None}
    await _review_selection(review, body.occurrence_id, write=True)
    current = review_occurrences.view(review)
    if current["status"] == "needs_scheduling":
        raise HTTPException(422, "An administrator must schedule this Review before completion")
    scope = review_occurrences.occurrence_query(review, body.occurrence_id)
    evidence = await db.evidence.find({"client_id": review["client_id"], "linked_type": {"$in": ["review", "reviews"]},
        "linked_id": review_id, "archived_at": None, **scope}, {"_id": 0, "content_base64": 0}).to_list(None)
    findings = await db.findings.count_documents({"client_id": review["client_id"], "review_id": review_id, **scope})
    completed = review_occurrences.snapshot(review, evidence, findings, user, _now())
    if body.completion_notes is not None:
        completed["notes"] = body.completion_notes
    if review.get("risk_id"):
        risk = await _authorized_parent("risks", review["risk_id"], user, write=True)
        if risk["client_id"] != review["client_id"] or risk.get("status") in risk_lifecycle.CLOSED:
            raise HTTPException(409, "This Risk is no longer active")
        changes = _editable_patch("risks", body.risk_assessment or {}, risk, user=user)
        if set(changes) - {"likelihood_score","impact_score","likelihood_rationale","impact_rationale","assessment_rationale","treatment","notes"}:
            raise HTTPException(422, "Use Risk governance actions for lifecycle or schedule changes")
        if body.risk_outcome not in (None,"Reviewed — No Change","Additional Action Required","Closure Recommended"):
            raise HTTPException(422, "Invalid Risk Review outcome")
        after = _apply_risk_scoring({**risk, **changes})
        completed["risk_review_recommendation"] = body.risk_outcome
        completed["risk_before"] = review.get("risk_baseline") or risk_lifecycle.snapshot(risk)
        completed["risk_after"] = risk_lifecycle.snapshot(after)
        completed["outcome"] = "Risk Accepted" if completed["risk_before"].get("acceptance_date") != after.get("acceptance_date") else "Assessment Updated" if any(completed["risk_before"].get(k) != after.get(k) for k in ("likelihood_score","impact_score","assessment_rationale","likelihood_rationale","impact_rationale")) else "Treatment Updated" if completed["risk_before"].get("treatment") != after.get("treatment") else body.risk_outcome or "Reviewed — No Change"
    next_due = current["next_review_date"]
    updates = {"updated_at": completed["completed_at"], "schedule_anchor": current["schedule_anchor"]}
    if next_due:
        updates.update({"due_date": next_due, "current_occurrence_id": _uid("occ"), "status": "upcoming",
                        "notes": None, "started_at": None, "started_by": None, "completion_date": None,
                        "completion_snapshot": None, "risk_baseline": None})
        updates.update(review_occurrences.schedule({**current, **updates}))
    else:
        updates.update({"current_occurrence_id": body.occurrence_id, "status": "completed",
                        "completion_date": completed["completed_at"], "notes": completed.get("notes"),
                        "next_review_date": None})
    # One atomic document update: history and advancement cannot become partially committed.
    result = await db.reviews.update_one({"review_id": review_id, "current_occurrence_id": review.get("current_occurrence_id"),
        "updated_at": review.get("updated_at"), "status": review.get("status")},
        {"$set": updates, "$push": {"occurrences": completed}})
    if not result.modified_count:
        raise HTTPException(409, "Review changed; reload before completing")
    await _review_event(user, review, "Review completed", body.occurrence_id,
                        period=completed["period"], outcome=completed["outcome"], finding_count=findings)
    if next_due:
        await _review_event(user, review, "Next occurrence scheduled", body.occurrence_id, due_date=next_due)
    updated = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
    await risk_lifecycle.sync_completion(db, updated)
    await vendor_governance.sync_completion(db, updated)
    await policy_reviews.sync(db, updated)
    if review.get("policy_id"):
        await audit(user, "Policy Review completed", "policy", review["policy_id"], review["client_id"], meta={"review_id":review_id,"occurrence_id":body.occurrence_id})
    if review.get("vendor_id"):
        await audit(user, "Vendor Review completed", "vendor", review["vendor_id"],review["client_id"],meta={"review_id":review_id,"occurrence_id":body.occurrence_id,"purpose":review.get("vendor_purpose") or "vendor"})
    if review.get("risk_id"):
        await audit(user, completed["outcome"], "risk", review["risk_id"], review["client_id"], meta={"review_id":review_id,"occurrence_id":body.occurrence_id})
    return {"review": review_occurrences.view(updated), "occurrence": completed, "spawned": None}


# ---------------- Quick actions: Review → Finding, Finding → Task ----------------
@api.post("/reviews/{review_id}/create-finding")
@review_mutation
async def review_create_finding(review_id: str, body: Dict[str, Any], user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    review = await db.reviews.find_one({"review_id": review_id}, {"_id": 0})
    if not review:
        raise HTTPException(404, "Review not found")
    if not _can_access_client(user, review["client_id"]):
        raise HTTPException(403, "Forbidden")
    if not isinstance(body.get("occurrence_id"), str) or not body["occurrence_id"]:
        raise HTTPException(422, "Select the Review occurrence before raising a Finding")
    request_id = body.get("request_id")
    if request_id is not None and (not isinstance(request_id, str) or not 1 <= len(request_id) <= 128):
        raise HTTPException(422, "Invalid request ID")
    fid = "fnd_" + uuid.uuid5(uuid.NAMESPACE_URL, review_id + ":" + body["occurrence_id"] + ":" + request_id).hex if request_id else _uid("fnd")
    prior = await db.findings.find_one({"finding_id": fid, "client_id": review["client_id"]}, {"_id": 0})
    if prior:
        await finding_create_task(fid, {"title": prior.get("remediation_title") or prior["title"]}, user)
        return prior
    await _review_selection(review, body["occurrence_id"], write=True)
    await assignment_eligibility.validate(db, "findings", {
        "client_id": review["client_id"], "owner_id": body.get("owner_id", review.get("owner_id")),
    }, _can_access_client)
    if not isinstance(body.get("title"), str) or not body["title"].strip():
        raise HTTPException(422, "Finding title is required")
    if not isinstance(body.get("remediation_title"), str) or not body["remediation_title"].strip():
        raise HTTPException(422, "Remediation action is required")
    if body.get("severity", "medium") not in ("low", "medium", "high", "critical"):
        raise HTTPException(422, "Invalid severity")
    doc = {
        "finding_id": fid,
        "title": body.get("title") or f"Finding from: {review['title']}",
        "client_id": review["client_id"],
        "severity": body.get("severity", "medium"),
        "status": "open",
        "description": body.get("description") or "",
        "owner_id": body.get("owner_id", review.get("owner_id")) or None,
        "due_date": body.get("due_date"),
        "review_id": review_id,
        "occurrence_id": body["occurrence_id"],
        "source": review["title"],
        "vendor_id": review.get("vendor_id"),
        "identified_at": _now(),
        "remediation_plan": body.get("remediation_plan") or "",
        "remediation_title": body["remediation_title"].strip(),
        "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"],
    }
    await db.findings.insert_one(doc)
    doc.pop("_id", None)
    await audit(user, "create", "finding", fid, review["client_id"], meta={"from_review": review_id})
    await finding_create_task(fid, {"title": body["remediation_title"].strip()}, user)
    await _review_event(user, review, "Finding raised", body["occurrence_id"], finding_id=fid, title=doc["title"])
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
    return await db.findings.find_one({"finding_id": fid, "client_id": review["client_id"]}, {"_id": 0})


@api.post("/findings/{finding_id}/create-task")
@finding_mutation
async def finding_create_task(finding_id: str, body: Dict[str, Any], user: Dict = Depends(get_current_user)):
    if not _writable(user):
        raise HTTPException(403, "Read-only role")
    finding = await db.findings.find_one({"finding_id": finding_id}, {"_id": 0})
    if not finding:
        raise HTTPException(404, "Finding not found")
    if not _can_access_client(user, finding["client_id"]):
        raise HTTPException(403, "Forbidden")
    existing = await db.tasks.find_one({"finding_id": finding_id, "client_id": finding["client_id"]}, {"_id": 0})
    if existing:
        return existing
    tid = "tsk_" + uuid.uuid5(uuid.NAMESPACE_URL, "finding-remediation:" + finding_id).hex
    doc = {
        "task_id": tid,
        "title": body.get("title") or f"Remediate: {finding['title']}",
        "client_id": finding["client_id"],
        "status": "open",
        "priority": body.get("priority", finding.get("severity", "medium")),
        "assignee_id": body.get("assignee_id", finding.get("owner_id")),
        "due_date": body.get("due_date") or finding.get("due_date"),
        "description": body.get("description") or finding.get("remediation_plan"),
        "finding_id": finding_id,
        "review_id": finding.get("review_id"),
        "occurrence_id": finding.get("occurrence_id"),
        "source": finding.get("source") or "Finding remediation",
        "created_at": _now(), "updated_at": _now(), "created_by": user["user_id"],
    }
    doc["source_type"] = "review" if doc.get("review_id") else "finding"
    doc["source_id"] = doc.get("review_id") or finding_id
    doc = await action_items.prepare(db, doc, _can_access_client)
    await db.tasks.update_one({"_id": tid}, {"$setOnInsert": doc}, upsert=True)
    # link back on the finding
    if finding.get("status") == "open":
        await db.findings.update_one({"finding_id": finding_id, "status":"open"}, {"$set": {"status": "in_remediation", "updated_at": _next_write_time(finding.get('updated_at'))}})
    doc.pop("_id", None)
    await audit(user, "create", "task", tid, finding["client_id"], meta={"from_finding": finding_id})
    if finding.get("review_id"):
        review = await db.reviews.find_one({"review_id": finding["review_id"], "client_id": finding["client_id"]}, {"_id": 0})
        if review:
            await _review_event(user, review, "Action Item created", finding.get("occurrence_id") or "occ_" + review["review_id"],
                                task_id=tid, title=doc["title"], assignee_id=doc.get("assignee_id"))
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


@api.get("/tasks/{task_id}/activity")
async def task_activity(task_id: str, user: Dict = Depends(get_current_user)):
    task = await _authorized_parent("tasks", task_id, user)
    return await db.audit_logs.find({"client_id": task["client_id"], "entity_id": task_id, "entity_type": {"$in": ["task", "tasks"]}}, {"_id": 0}).sort("at", -1).to_list(500)


@api.get("/related")
async def related_items(entity_type: str, entity_id: str, user: Dict = Depends(get_current_user), occurrence_id: Optional[str] = None):
    """Return records related to the given entity across collections."""
    keys = {"reviews": "review_id", "findings": "finding_id", "tasks": "task_id", "risks": "risk_id", "policies": "policy_id", "vendors": "vendor_id", "assets": "asset_id", "exceptions": "exception_id", "requirements": "requirement_id", "contacts": "contact_id", 'ai_systems':'ai_system_id', 'framework_assessments':'framework_assessment_id'}
    if entity_type=='evidence':
        keys['evidence']='evidence_id'
    if entity_type not in keys:
        raise HTTPException(400, "Unsupported record type")
    source = await db[entity_type].find_one({keys[entity_type]: entity_id}, {"_id": 0, "content_base64": 0})
    if not source:
        raise HTTPException(404, "Record not found")
    cid = source.get("client_id")
    if not cid or not _can_access_client(user, cid):
        raise HTTPException(403, "Forbidden")
    if entity_type == "reviews" and occurrence_id:
        await _review_selection(source, occurrence_id)
    linked = {}
    if entity_type == 'framework_assessments':
        return await framework_governance.related(sys.modules[__name__],source)
    ai_reviews = await db.reviews.find({'client_id':cid,'ai_system_id':entity_id},{'review_id':1}).to_list(None) if entity_type == 'ai_systems' else []
    for target, key in keys.items():
        relations = [{keys[entity_type]: entity_id}]
        if source.get(key):
            relations.append({key: source[key]})
        if entity_type == 'ai_systems':
            mapped = [x['id'] for x in source.get('related_links',[]) if x['kind']==target]
            if mapped: relations.append({key:{'$in':mapped}})
            if target in ('findings','tasks','risks') and ai_reviews: relations.append({'review_id':{'$in':[r['review_id'] for r in ai_reviews]}})
        if target == 'ai_systems':
            relations.append({'related_links':{'$elemMatch':{'kind':entity_type,'id':entity_id}}})
            if source.get('review_id'):
                ai_review = await db.reviews.find_one({'client_id':cid,'review_id':source['review_id']})
                if ai_review and ai_review.get('ai_system_id'): relations.append({'ai_system_id':ai_review['ai_system_id']})
        if entity_type == "risks" and target == "tasks" and source.get("related_task_ids"):
            relations.append({"task_id":{"$in":source["related_task_ids"]}})
        if entity_type == "vendors" and target == "risks" and source.get("related_risk_ids"):
            relations.append({"risk_id":{"$in":source["related_risk_ids"]}})
        if entity_type == "risks" and target == "vendors":
            relations.append({"related_risk_ids":entity_id})
        if entity_type == "tasks" and target == "risks":
            relations.append({"related_task_ids":entity_id})
        if target == entity_type:
            relations = []
            if target == "reviews":
                relations = [{"parent_review_id": entity_id}]
                for pointer in ("parent_review_id", "next_occurrence_id"):
                    if source.get(pointer):
                        relations.append({key: source[pointer]})
        scope = review_occurrences.occurrence_query(source, occurrence_id) if entity_type == "reviews" and occurrence_id and target in ("findings", "tasks") else {}
        # Remediation groups must not drop later Actions or Findings at a display cap.
        limit = None if entity_type in ("reviews", "findings") and target in ("findings", "tasks") else 200
        linked[target] = await db[target].find({"client_id": cid, "$or": relations, **scope}, {"_id": 0}).to_list(limit) if relations else []
    if entity_type in ("tasks","risks") and source.get("assessment_id"):
        linked["assessments"] = await db.assessments.find({"assessment_id": source["assessment_id"], "client_id": cid}, {"_id": 0}).to_list(1)
    if entity_type in ("tasks", "findings") and source.get("occurrence_id"):
        for review in linked.get("reviews", []):
            occurrence = next((o for o in review.get("occurrences", []) if o.get("occurrence_id") == source["occurrence_id"]), None)
            if occurrence:
                review["linked_occurrence"] = {"period": occurrence.get("period"), "status": occurrence.get("status")}
            elif review_occurrences.occurrence_id(review) == source["occurrence_id"]:
                review["linked_occurrence"] = {"period": review_occurrences.view(review).get("period"), "status": review.get("status")}
    singular = "policy" if entity_type == "policies" else entity_type[:-1]
    linked["evidence"] = await db.evidence.find({"client_id": cid, "linked_type": singular, "linked_id": entity_id}, {"_id": 0, "content_base64": 0}).to_list(200)
    if entity_type == "reviews":
        # Reuse the Evidence tab's current/history projection, including snapshots.
        linked["evidence"] = await list_evidence(client_id=cid, linked_type="review", linked_id=entity_id,
                                                 user=user, occurrence_id=occurrence_id)
    if entity_type == 'ai_systems' and ai_reviews:
        linked['evidence'] += await db.evidence.find({'client_id':cid,'linked_type':{'$in':['review','reviews']},'linked_id':{'$in':[r['review_id'] for r in ai_reviews]}},{'_id':0,'content_base64':0}).to_list(200)
    assessment_clauses=[{'related_links':{'$elemMatch':{'kind':entity_type,'id':entity_id}}}]
    if entity_type=='policies' and source.get('baseline_key'):
        for framework_key,catalog in framework_governance.CATALOGS.items():
            definitions=[did for mapping in catalog['policy_mappings'] if mapping['policy_key']==source['baseline_key'] for did in mapping['safeguards']]
            if definitions:assessment_clauses.append({'framework_key':framework_key,'definition_id':{'$in':definitions}})
    if entity_type=='evidence' and source.get('linked_type') in ('framework_assessment','framework_assessments'):
        assessment_clauses.append({'framework_assessment_id':source.get('linked_id')})
    if source.get('framework_assessment_id'):
        assessment_clauses.append({'framework_assessment_id':source['framework_assessment_id']})
    if source.get('finding_id'):
        finding=await db.findings.find_one({'finding_id':source['finding_id'],'client_id':cid})
        if finding and finding.get('framework_assessment_id'):
            assessment_clauses.append({'framework_assessment_id':finding['framework_assessment_id']})
    if entity_type=='reviews' and source.get('framework_key'):
        assessment_clauses.append({'framework_key':source['framework_key'],'definition_id':{'$in':source.get('framework_safeguards',[])}})
    linked['framework_assessments']=await db.framework_assessments.find({'client_id':cid,'$or':assessment_clauses},{'_id':0}).to_list(None)
    if entity_type=='evidence':
        linked['framework_assessments']=[a for a in linked['framework_assessments'] if entity_id not in a.get('unlinked_evidence_ids',[])]
    for assessment in linked['framework_assessments']:
        assessment['title']=framework_governance.assessment_title(assessment)
    return linked


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
    expected_updated_at: Optional[str] = None
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
            row["updated_at"] = match.get("updated_at")
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
@configuration_mutation
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
    for response in body.responses:
        row = existing_by_name.get(response.name.strip().lower())
        if row:
            _require_snapshot(response.model_dump(exclude_unset=True), row)
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
            await _save_snapshot(db.policies, {"policy_id": existing_row["policy_id"]}, existing_row, r.model_dump(exclude_unset=True), update)
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
    expected_updated_at: Optional[str] = Field(default=None,max_length=100)
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
    _require_snapshot(body.model_dump(exclude_unset=True),p)
    if p.get("status") == "in_review":
        raise HTTPException(409, "Return the pending submission to Draft before verifying metadata")
    update: Dict[str, Any] = {
        "presence": "verified_existing",
        "verified_at": _now(),
        "verified_by": user["user_id"],
        "updated_at": _next_write_time(p.get('updated_at')),
    }
    for k in ("version", "owner_id", "approver_id", "approved_at", "last_reviewed_at",
              "next_review_date", "summary", "status"):
        v = getattr(body, k, None)
        if v not in (None, ""):
            update[k] = v
    await assignment_eligibility.validate(db, "policies", {**p, **update}, _can_access_client, p)
    changed = {k: v for k, v in update.items() if v != p.get(k)}
    if body.status != "approved":
        update = policy_provenance.invalidate(changed, p)
    operation = {"$set": update}
    if body.status == "approved":
        subject = await policy_provenance.snapshot(sys.modules[__name__], {**p, **update})
        update["approval_subject"] = subject
        operation["$push"] = {"decision_history": {
            "action": "external_approval_recorded", "recorded_by": user["user_id"],
            "recorded_by_name": user.get("name"), "recorded_at": _now(),
            "reported_approver_id": body.approver_id, "reported_approved_at": body.approved_at,
            "provenance": "Verified metadata; not an in-app approval", "subject": subject}}
    result = await db.policies.update_one({"policy_id": policy_id, "updated_at": p.get("updated_at"), "status": p.get("status")}, operation)
    if not result.matched_count:
        raise HTTPException(409, "Policy changed; reload before verifying")
    await audit(user, "verify", "policy", policy_id, p["client_id"], meta={"prev_presence": p.get("presence"), "verified_fields": list(update)})
    return await db.policies.find_one({"policy_id": policy_id}, {"_id": 0})


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
                    # Identity associations are changed only through explicit account linking.
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
    scope = _scope_filter(user)
    query = {"user_id": user["user_id"], "$or": [scope, {"client_id": None}]} if scope else {"user_id": user["user_id"]}
    docs = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    unread = await db.notifications.count_documents({**query, "read": False})
    return {"items": docs, "unread": unread}


@api.post("/notifications/{nid}/read")
async def read_notification(nid: str, user: Dict = Depends(get_current_user)):
    await db.notifications.update_one({"notification_id": nid, "user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def read_all_notifications(user: Dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["user_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# Policy decisions and delegation live in policy_approval.py.


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
    expected_versions: Dict[str, Optional[str]] = Field(default_factory=dict)


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
        if body.kind == "policies" and any(d.get("approval_history") or d.get("decision_history") or d.get("status") in ("approved", "in_review") for d in docs):
            raise HTTPException(409, "Policy approval history must be retained; retire the Policy instead")
        if body.kind == "contacts" and await db.clients.find_one({"client_id": {"$in": [d["client_id"] for d in docs]}, "primary_contact_id": {"$in": body.ids}}):
            raise HTTPException(409, "A selected Contact is a Primary Contact. Archive it or change the client relationship before deleting it.")
        if body.kind in ("risks","vendors") or body.kind == "reviews" and any(d.get("risk_id") or d.get("vendor_id") or d.get('ai_system_id') for d in docs):
            raise HTTPException(409, "Risks and their Review obligations must be retained")
        if body.kind == "reviews" and any(d.get("status") == "completed" or d.get("occurrences") for d in docs):
            raise HTTPException(409, "Completed reviews must be retained")
        if body.kind == "tasks" and any(d.get("status") == "done" or d.get("completed_at") for d in docs):
            raise HTTPException(409, "Completed Action Items must be retained")
        for d in docs:
            if d[id_field] not in body.expected_versions:
                raise HTTPException(428, "Reload selected records before deleting; edit versions are required")
            _require_snapshot({'expected_updated_at':body.expected_versions[d[id_field]]},d)
        for d in docs:
            await delete_entity(body.kind, d[id_field], user, {'expected_updated_at':body.expected_versions[d[id_field]]})
        for d in docs:
            await audit(user, "bulk-delete", entity_type, d[id_field], d["client_id"])
        return {"ok": True, "count": len(docs)}

    if not _writable(user):
        raise HTTPException(403, "Read-only role")

    payload = body.payload or {}
    for d in docs:
        if d[id_field] not in body.expected_versions:
            raise HTTPException(428, "Reload selected records before saving; edit versions are required")
        _require_snapshot({'expected_updated_at':body.expected_versions[d[id_field]]},d)
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
    for d in docs:
        checked = _editable_patch(body.kind, dict(updates), d, user=user)
        await assignment_eligibility.validate(db, body.kind, {**d, **checked}, _can_access_client, d)
        if body.kind == "tasks":
            await action_items.prepare(db, {**d, **checked}, _can_access_client, d)
    for d in docs:
        await update_entity(body.kind, d[id_field], {**updates, "expected_updated_at":d.get("updated_at"), **({"expected_occurrence_id": review_occurrences.occurrence_id(d)} if body.kind == "reviews" else {})}, user)
    for d in docs:
        await audit(user, f"bulk-{body.action}", entity_type, d[id_field], d["client_id"], meta=updates)
    return {"ok": True, "count": len(docs), "updates": updates}


# ---------------- Calendar ----------------
@app.get("/api/calendar")
async def calendar_view(client_id: Optional[str] = Query(None),
                        start: Optional[str] = Query(None),
                        end: Optional[str] = Query(None),
                        scope: str = Query('active', pattern='^(active|history|all)$'),
                        user: Dict = Depends(get_current_user)):
    import sys
    import calendar_view as calendar_projection
    return await calendar_projection.read(sys.modules[__name__], _scope_filter(user, client_id), user, start, end, scope)


# ---------------- Board Report (PDF) ----------------
async def _build_board_report(client_id: str, user: Dict) -> bytes:
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(404, "Client not found")
    from management_obligations import load_records, management_model
    management = management_model(await load_records(db, {'client_id': client_id}), client_id, today=_now())
    overdue_reviews = sorted([r['record'] for r in management['metrics']['past_due'] if r['kind']=='reviews'], key=lambda r:r.get('due_date') or '')
    upcoming = sorted([r['record'] for r in management['metrics']['due_30d'] if r['kind']=='reviews'], key=lambda r:r.get('due_date') or '')
    open_findings = management['activeRecords']['findings']
    critical_findings = [r['record'] for r in management['materialFindings']]
    top_risks = [assessed_risk(r['record']) for r in management['significantRisks']]
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
    story.append(Paragraph("Omnisciente — Board Report", styles["Title"]))
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
        if len(items) > 8:
            story.append(Paragraph(f"Showing 8 of {len(items)} records.", styles["Mini"]))
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
            critical_findings,
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
import sys
app.include_router(ai_governance.router_for(sys.modules[__name__]))
app.include_router(framework_governance.router_for(sys.modules[__name__]))
app.include_router(policy_approval.router_for(sys.modules[__name__]))
app.include_router(entity_router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()],
    allow_credentials=False,  # cookies are cross-site secure=none but we also return token in body
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Create-Rejected", "Retry-After"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


@app.on_event("shutdown")
async def _on_stop():
    client.close()
