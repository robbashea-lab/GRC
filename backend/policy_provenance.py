"""Immutable approval metadata for a specific uploaded or external document."""
from copy import deepcopy
from typing import Optional
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

CONTENT_FIELDS = {"title", "version", "summary"}
PROTECTED = {"approval_source", "approval_subject"}


class SourceIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: str = Field(min_length=1, max_length=100)
    evidence_id: Optional[str] = Field(None, max_length=100)
    external_reference: Optional[str] = Field(None, max_length=2000)
    external_version: Optional[str] = Field(None, max_length=200)

    @model_validator(mode="after")
    def one_basis(self):
        if bool(self.evidence_id) == bool(self.external_reference):
            raise ValueError("Choose one uploaded document or external reference")
        if self.external_reference and not self.external_version:
            raise ValueError("An external document/version identifier is required")
        if self.evidence_id and self.external_version:
            raise ValueError("External identifiers do not apply to uploaded Evidence")
        return self


async def snapshot(s, policy):
    raw = policy.get("approval_source")
    if not raw:
        raise HTTPException(422, "Record an approval document or external reference and version first")
    source = SourceIn(**raw)
    if policy.get("version") != source.version:
        raise HTTPException(422, "Update the approval basis to match the current Policy version")
    if source.evidence_id:
        evidence = await s.db.evidence.find_one({"evidence_id": source.evidence_id,
            "client_id": policy["client_id"], "archived_at": None, '$or':[
                {'linked_type':{'$in':['policy','policies']},'linked_id':policy['policy_id']},
                {'relationships':{'$elemMatch':{'kind':'policies','id':policy['policy_id']}}}]}, {"_id": 0, "content_base64": 0})
        if not evidence or not evidence.get("sha256"):
            raise HTTPException(422, "Choose available hashed Evidence linked to this Policy")
        basis = {"type": "evidence", **{k: evidence.get(k) for k in ("evidence_id", "filename", "version", "sha256")}}
    else:
        basis = {"type": "external", "reference": source.external_reference,
                 "document_version": source.external_version, "verification": "Reference recorded; external bytes not verified"}
    contact = await s.db.contacts.find_one({"contact_id": policy.get("approver_contact_id"), "client_id": policy["client_id"]}) if policy.get("approver_contact_id") else None
    return {"subject_id": s.uuid.uuid4().hex, "captured_at": s._now(),
            **{k: deepcopy(policy.get(k)) for k in ("client_id", "policy_id", "title", "version", "summary", "owner_id")},
            "named_approver": {"contact_id": contact["contact_id"], "name": contact["name"]} if contact else None,
            "basis": basis}


def invalidate(changes, previous):
    if previous.get("status") == "approved" and CONTENT_FIELDS.intersection(changes):
        return {**changes, "status": "draft", "approved_at": None, "approval_subject": None}
    return changes
