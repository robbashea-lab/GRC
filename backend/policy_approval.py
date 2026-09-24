"""Policy-scoped delegation; Contacts never confer authorization."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from copy import deepcopy
import policy_provenance

INTERNAL = {"super_admin", "platform_admin"}
PROTECTED = {"approval_account_id", "approver_contact_id", "approval_request_id"} | policy_provenance.PROTECTED


class AuthorityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_updated_at: Optional[str] = Field(None,max_length=100)
    approver_contact_id: Optional[str] = Field(None, max_length=100)
    approval_account_id: Optional[str] = Field(None, max_length=100)


class DecisionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    approval_request_id: str = Field(min_length=1, max_length=100)
    comment: str = Field("", max_length=4000)


class SourceEdit(policy_provenance.SourceIn):
    expected_updated_at: Optional[str] = Field(None,max_length=100)


class SubmissionIn(BaseModel):
    expected_updated_at: Optional[str] = Field(None,max_length=100)


def may_decide(s, user, policy):
    return (user.get("status") == "active" and s._can_access_client(user, policy["client_id"])
            and user.get("role") in INTERNAL)


def guard_patch(changes, previous):
    if PROTECTED.intersection(changes) or changes.get("status") == "in_review":
        raise HTTPException(422, "Use the dedicated approval action")
    if previous.get("status") == "in_review" and changes:
        raise HTTPException(409, "Return the pending submission to Draft before editing")


def router_for(s):
    router = APIRouter(prefix="/api")

    @router.get("/policies/pending-decisions")
    async def pending(client_id: str = Query(...), user=Depends(s.get_current_user)):
        if not s._can_access_client(user, client_id):
            raise HTTPException(403, "Forbidden for this client")
        if user.get("role") not in INTERNAL:
            return []
        query = {"client_id": client_id, "status": "in_review"}
        if user.get("role") not in INTERNAL:
            query["approval_account_id"] = user["user_id"]
        rows = await s.db.policies.find(query, {"_id": 0, "policy_id": 1, "title": 1}).to_list(501)
        if len(rows) > 500:
            raise HTTPException(413, "Too many pending decisions; no partial results shown")
        return rows

    @router.get("/policies/{policy_id}/approval-context")
    async def context(policy_id: str, user=Depends(s.get_current_user)):
        p = await s._authorized_parent("policies", policy_id, user)
        cid = p["client_id"]
        contact = await s.db.contacts.find_one({"contact_id": p.get("approver_contact_id"), "client_id": cid}, {"_id": 0}) if p.get("approver_contact_id") else None

        async def account(ident):
            if not ident:
                return None
            row = await s.db.users.find_one({"user_id": ident}, {"_id": 0})
            if not row:
                return {"state": "unavailable", "eligible": False}
            access = s._can_access_client(row, cid)
            # A prior link must not become an unrelated-user directory lookup.
            return {"user_id": ident, "name": row.get("name") if access else "Account without client access",
                    "state": row.get("status"), "has_client_access": access,
                    "eligible": row.get("status") == "active" and access}

        return {"policy_id": policy_id, "status": p.get("status"), "updated_at":p.get('updated_at'),
                "approval_request_id": p.get("approval_request_id"),
                "named_approver": {"contact_id": contact["contact_id"], "name": contact["name"]} if contact else None,
                "linked_account": await account(contact.get("linked_user_id")) if contact else None,
                "authorized_account": await account(p.get("approval_account_id")),
                "can_configure": user.get("role") in INTERNAL,
                "can_submit": s._writable(user),
                "can_decide": may_decide(s, user, p),
                "internal_approval": user.get("role") in INTERNAL,
                "history": p.get("approval_history", []),
                "external_history": p.get("decision_history", []),
                "source": p.get("approval_source"), "subject": p.get("approval_subject")}

    @router.post("/policies/{policy_id}/approval-subject")
    async def source(policy_id: str, body: SourceEdit, user=Depends(s.get_current_user)):
        p = await s._authorized_parent("policies", policy_id, user, write=True)
        s._require_snapshot(body.model_dump(exclude_unset=True),p)
        if p.get("status") == "in_review":
            raise HTTPException(409, "Return the pending submission to Draft before changing the approval basis")
        patch = {"approval_source": body.model_dump(exclude={'expected_updated_at'}), "version": body.version}
        await policy_provenance.snapshot(s, {**p, **patch})
        if patch["approval_source"] == p.get("approval_source") and patch["version"] == p.get("version"):
            return p
        entry = {"at": s._now(), "action": "approval_basis_updated", "by": user["user_id"],
                 "by_name": user.get("name"), "by_email": user.get("email")}
        patch.update({"status": "draft", "approved_at": None, "approval_subject": None, "updated_at": entry["at"]})
        result = await change(p, patch, entry)
        await s.audit(user, "policy-basis", "policy", policy_id, p["client_id"])
        return result

    @router.post("/policies/{policy_id}/approval-authority")
    async def authority(policy_id: str, body: AuthorityIn, user=Depends(s.get_current_user)):
        p = await s._authorized_parent("policies", policy_id, user)
        if user.get("role") not in INTERNAL:
            raise HTTPException(403, "Only scoped internal administrators can delegate approval")
        s._require_snapshot(body.model_dump(exclude_unset=True),p)
        if p.get("status") == "in_review":
            raise HTTPException(409, "Return the pending submission to Draft before changing authority")
        if body.approver_contact_id and not await s.db.contacts.find_one({"contact_id": body.approver_contact_id, "client_id": p["client_id"]}):
            raise HTTPException(422, "Choose a Contact from this client")
        if body.approval_account_id:
            account = await s.db.users.find_one({"user_id": body.approval_account_id})
            if not account or account.get("status") != "active" or not s._can_access_client(account, p["client_id"]):
                raise HTTPException(422, "Choose an active account with access to this client")
        entry = {"at": s._now(), "action": "authority_updated", "by": user["user_id"],
                 "by_name": user.get("name"), "by_email": user.get("email"), **body.model_dump(exclude={'expected_updated_at'})}
        await change(p, {**body.model_dump(exclude={'expected_updated_at'}), "updated_at": entry["at"]}, entry)
        await s.audit(user, "policy-authority", "policy", policy_id, p["client_id"], meta=body.model_dump(exclude={'expected_updated_at'}))
        return await context(policy_id, user)

    async def change(p, patch, entry):
        patch['updated_at']=s._next_write_time(p.get('updated_at'))
        query = {"policy_id": p["policy_id"], "client_id": p["client_id"],
                 "status": p.get("status"), "updated_at": p.get("updated_at"),
                 "approval_request_id": p.get("approval_request_id")}
        result = await s.db.policies.update_one(query, {"$set": patch, "$push": {"approval_history": entry}})
        if not result.matched_count:
            raise HTTPException(409, "Policy changed; reload before making this decision")
        return await s.db.policies.find_one({"policy_id": p["policy_id"]}, {"_id": 0})

    @router.post("/policies/{policy_id}/submit-review")
    async def submit(policy_id: str, body: SubmissionIn, user=Depends(s.get_current_user)):
        p = await s._authorized_parent("policies", policy_id, user, write=True)
        s._require_snapshot(body.model_dump(exclude_unset=True),p)
        if p.get("status") not in ("draft", "approved") and not (p.get("status") == "in_review" and not p.get("approval_request_id")):
            raise HTTPException(409, "Only Draft or Approved policies can be submitted")
        request_id = s.uuid.uuid4().hex
        subject = await policy_provenance.snapshot(s, p)
        at = s._now()
        entry = {"at": at, "action": "submitted", "by": user["user_id"], "by_name": user.get("name"),
                 "by_email": user.get("email"), "approval_request_id": request_id, "subject": subject}
        result = await change(p, {"status": "in_review", "approval_request_id": request_id, "approval_subject": subject, "updated_at": at}, entry)
        await s.audit(user, "submit-review", "policy", policy_id, p["client_id"], meta={"approval_request_id": request_id})
        if p.get("approval_account_id"):
            await s.create_notification(user_id=p["approval_account_id"], title=f"Policy submitted for your approval: {p['title']}",
                                        kind="policy_review", entity_type="policies", entity_id=policy_id, client_id=p["client_id"])
        return result

    @router.post("/policies/{policy_id}/approve")
    async def approve(policy_id: str, body: DecisionIn, user=Depends(s.get_current_user)):
        return await decide(policy_id, body, user, "approved")

    @router.post("/policies/{policy_id}/reject")
    async def reject(policy_id: str, body: DecisionIn, user=Depends(s.get_current_user)):
        if not body.comment.strip():
            raise HTTPException(422, "A return reason is required")
        return await decide(policy_id, body, user, "rejected")

    @router.post("/policies/{policy_id}/return-draft")
    async def withdraw(policy_id: str, body: DecisionIn, user=Depends(s.get_current_user)):
        p = await s._authorized_parent("policies", policy_id, user, write=True)
        if p.get("status") != "in_review" or body.approval_request_id != (p.get("approval_request_id") or "legacy"):
            raise HTTPException(409, "This submission is no longer pending")
        entry = {"at": s._now(), "action": "submission_withdrawn", "by": user["user_id"],
                 "by_name": user.get("name"), "by_email": user.get("email"), "subject": p.get("approval_subject")}
        result = await change(p, {"status": "draft", "updated_at": entry["at"]}, entry)
        await s.audit(user, "withdraw-submission", "policy", policy_id, p["client_id"])
        return result

    async def decide(policy_id, body, user, decision):
        p = await s._authorized_parent("policies", policy_id, user)
        if not may_decide(s, user, p):
            raise HTTPException(403, "This account is not authorized to approve this Policy")
        if p.get("status") != "in_review" or p.get("approval_request_id") != body.approval_request_id:
            raise HTTPException(409, "This submission is no longer pending; reload the Policy")
        if decision == "approved" and not p.get("approval_subject"):
            raise HTTPException(409, "Legacy submission has no approval basis; return it for a new documented submission")
        at = s._now()
        entry = {"at": at, "action": decision, "by": user["user_id"], "by_name": user.get("name"),
                 "by_email": user.get("email"), "comment": body.comment.strip(),
                 "authority": "internal_administrative" if user.get("role") in INTERNAL else "delegated_policy",
                 "approval_request_id": body.approval_request_id, "subject": deepcopy(p.get("approval_subject"))}
        patch = {"status": "approved" if decision == "approved" else "draft", "updated_at": at}
        if decision == "approved":
            patch["approved_at"] = at
        result = await change(p, patch, entry)
        await s.audit(user, decision, "policy", policy_id, p["client_id"], meta=entry)
        if p.get("owner_id"):
            await s.create_notification(user_id=p["owner_id"], title=f"Policy {decision}: {p['title']}",
                                        kind="policy_decision", entity_type="policies", entity_id=policy_id, client_id=p["client_id"])
        return result

    return router
