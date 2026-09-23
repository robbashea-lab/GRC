"""Client relationship references and read projections, never access grants."""
from fastapi import HTTPException

INTERNAL_ROLES = ("super_admin", "platform_admin")


def lead_eligible(account, client_id, can_access):
    return bool(account and account.get("role") in INTERNAL_ROLES
                and account.get("status") == "active" and can_access(account, client_id))


async def validate(db, row, previous, can_access):
    previous = previous or {}
    contact_id = row.get("primary_contact_id")
    if contact_id and contact_id != previous.get("primary_contact_id"):
        contact = await db.contacts.find_one({"contact_id": contact_id, "client_id": row["client_id"]})
        if not contact or contact.get("status") != "active" or contact.get("not_applicable"):
            raise HTTPException(422, "Choose an active Contact from this client's directory")
    lead_id = row.get("assigned_owner_id")
    if lead_id and lead_id != previous.get("assigned_owner_id"):
        account = await db.users.find_one({"user_id": lead_id})
        if not lead_eligible(account, row["client_id"], can_access):
            raise HTTPException(422, "Choose an active internal GRC user with access to this client")


async def project(db, clients):
    """Resolve references once per response; never rewrite records during reads."""
    contact_ids = [c["primary_contact_id"] for c in clients if c.get("primary_contact_id")]
    user_ids = [c["assigned_owner_id"] for c in clients if c.get("assigned_owner_id")]
    contacts = await db.contacts.find({"contact_id": {"$in": contact_ids},
        "client_id": {"$in": [c["client_id"] for c in clients]}},
        {"_id": 0, "contact_id": 1, "client_id": 1, "name": 1, "email": 1, "title": 1, "status": 1}).to_list(None) if contact_ids else []
    users = await db.users.find({"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "status": 1, "role": 1}).to_list(None) if user_ids else []
    contact_map = {(c["client_id"], c["contact_id"]): c for c in contacts}
    user_map = {u["user_id"]: u for u in users}
    return [{**{k:v for k,v in c.items() if k!='_configuration_lock'},
        "primary_contact_record": contact_map.get((c["client_id"], c.get("primary_contact_id"))),
        "grc_lead_id": c.get("assigned_owner_id"),
        "grc_lead": user_map.get(c.get("assigned_owner_id")),
    } for c in clients]
