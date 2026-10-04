"""Replayable Review → Finding → Action commands using durable create receipts."""
import uuid

from fastapi import HTTPException

import action_items
import assignment_eligibility
import authorization
import create_requests
import remediation
import iso_audit


async def create_finding(s, review_id, body, user):
    review = await s._authorized_parent("reviews", review_id, user, write=True)
    request_id = body.get("request_id")
    if not isinstance(request_id, str) or not 1 <= len(request_id) <= 128:
        raise HTTPException(422, "A request ID is required for Finding creation", headers={"X-Create-Rejected": "true"})
    if not isinstance(body.get("occurrence_id"), str) or not body["occurrence_id"]:
        raise HTTPException(422, "Select the Review occurrence before raising a Finding", headers={"X-Create-Rejected": "true"})

    async def execute(identity):
        scope = {'client_id': review['client_id'], 'review_id': review_id,
                 'occurrence_id': body['occurrence_id'], 'created_by': user['user_id']}
        # A persisted primary wins during upgrades; new identities include the actor.
        doc = await s.db.findings.find_one({'_id': 'create:' + identity, **scope}, {'_id': 0})
        if not doc:
            legacy_id = 'fnd_' + uuid.uuid5(uuid.NAMESPACE_URL, review_id + ':' + body['occurrence_id'] + ':' + request_id).hex
            # Old records did not store request_id; its deterministic ID proves that part.
            doc = await s.db.findings.find_one({'finding_id': legacy_id, **scope,
                '$or': [{'request_id': request_id}, {'request_id': {'$exists': False}}]}, {'_id': 0})
        fid = doc['finding_id'] if doc else 'fnd_' + uuid.uuid5(uuid.NAMESPACE_URL, identity).hex
        if doc:
            await s.db.create_requests.update_one({'_id': identity}, {'$set': {'primary_started': True}})
        if not doc:
            await s._review_selection(review, body["occurrence_id"], write=True)
            if body.get('audit_item_key'):
                s._require_snapshot(body, review)
                state = review.get('iso_audit') or {}
                package = iso_audit.PACKAGES.get(state.get('package_key'), {})
                if body['audit_item_key'] not in {i['key'] for i in package.get('items', [])}:
                    raise HTTPException(422, 'Select an item from this audit package')
            for field, label in (("title", "Finding title"), ("remediation_title", "Remediation action")):
                if not isinstance(body.get(field), str) or not body[field].strip() or len(body[field]) > 1000:
                    raise HTTPException(422, label + " is required (maximum 1000 characters)")
            if body.get("severity", "medium") not in ("low", "medium", "high", "critical"):
                raise HTTPException(422, "Invalid severity")
            allowed = {"request_id", "occurrence_id", "title", "remediation_title", "severity", "description",
                       "owner_id", "due_date", "remediation_plan", "audit_item_key", "expected_updated_at"}
            if set(body) - allowed:
                raise HTTPException(422, "Unsupported Finding fields")
            doc = {"finding_id": fid, "client_id": review["client_id"], "status": "open",
                   "title": body["title"].strip(), "severity": body.get("severity", "medium"),
                   "description": body.get("description") or "", "owner_id": body.get("owner_id", review.get("owner_id")) or None,
                   "due_date": body.get("due_date") or None, "review_id": review_id,
                   "occurrence_id": body["occurrence_id"], "source": review["title"], "vendor_id": review.get("vendor_id"),
                   "identified_at": s._now(), "remediation_plan": body.get("remediation_plan") or "",
                   "remediation_title": body["remediation_title"].strip(), "request_id": request_id,
                   "created_at": s._now(), "updated_at": s._now(), "created_by": user["user_id"]}
            if body.get('audit_item_key'):
                doc['audit_item_key'] = body['audit_item_key']
            # Reuse boundary validation without accepting caller-controlled parent or lifecycle fields.
            fields = ('client_id', 'title', 'description', 'severity', 'owner_id', 'due_date', 'remediation_plan')
            checked = {k: body.get(k, doc[k]) for k in fields}
            doc.update(s._editable_patch('findings', checked, user=user))
            await authorization.require_creation_assignee(s.db, user, doc['client_id'], doc.get('owner_id'))
            await assignment_eligibility.validate(s.db, "findings", doc, s._can_access_client)
            doc = await create_requests.insert_primary(s.db, "findings", doc, identity)
        if doc.get('audit_item_key'):
            # Only the source relationship is saved, never unrelated workpaper drafts.
            current = await s.db.reviews.find_one({'review_id':review_id, 'client_id':review['client_id']})
            path = 'iso_audit.items.' + doc['audit_item_key'] + '.finding_ids'
            import review_occurrences
            source=current if review_occurrences.occurrence_id(current)==body['occurrence_id'] else next(
                (o for o in current.get('occurrences',[]) if o.get('occurrence_id')==body['occurrence_id']),{})
            linked = source.get('iso_audit',{}).get('items', {}).get(doc['audit_item_key'], {}).get('finding_ids', [])
            if fid not in linked:
                await s._review_selection(current, body['occurrence_id'], write=True)
                await s.db.reviews.update_one({'review_id':review_id, 'client_id':review['client_id']},
                    {'$addToSet':{path:fid}, '$set':{'updated_at':s._next_write_time(current.get('updated_at'))}})
            await s._review_event(user, review, 'Audit item Finding linked', body['occurrence_id'],
                finding_id=fid, audit_item_key=doc['audit_item_key'])
        await s.audit(user, "create", "finding", fid, review["client_id"], meta={"from_review": review_id})
        await s.finding_create_task(fid, {"title": doc.get("remediation_title") or doc["title"]}, user)
        await s._review_event(user, review, "Finding raised", body["occurrence_id"], finding_id=fid, title=doc["title"])
        if doc.get("owner_id") and doc["owner_id"] != user["user_id"]:
            await s.create_notification(user_id=doc["owner_id"], title=f"New finding assigned: {doc['title']}",
                                        kind="finding_assigned", entity_type="findings", entity_id=fid, client_id=doc["client_id"])
        return await s.db.findings.find_one({"finding_id": fid, "client_id": review["client_id"]}, {"_id": 0})

    # Scope includes actor, tenant and route; changing the occurrence/body under the same key conflicts.
    return await create_requests.run(s.db, create_requests.digest(request_id), user["user_id"], review["client_id"],
                                     "reviews/" + review_id + "/create-finding", body, execute)


async def ensure_action(s, finding_id, body, user):
    finding = await s._authorized_parent("findings", finding_id, user, write=True)
    doc = await s.db.tasks.find_one({"finding_id": finding_id, "client_id": finding["client_id"]}, {"_id": 0})
    if create_requests.current.get() is not None:
        return await _ensure_action(s, finding, body, user, doc)

    # This legacy endpoint means "ensure an Action Item", not "create a new
    # intent". Keep header-free/empty-body callers and existing-record responses.
    route = 'findings/' + finding_id + '/create-task'
    key = create_requests.digest(route)
    identity = create_requests.digest([user['user_id'], finding['client_id'], route, key])
    receipt = await s.db.create_requests.find_one({'_id': identity})
    if doc and (not receipt or receipt['state'] == 'complete'):
        return doc

    async def execute(_identity):
        return await _ensure_action(s, finding, body, user, doc)

    # Retry bodies cannot change an accepted creation or strand its audit work.
    # Validation failures leave no frozen document, so corrected input can retry.
    return await create_requests.run(s.db, key, user['user_id'], finding['client_id'],
                                     route, {'finding_id': finding_id}, execute)


async def _ensure_action(s, finding, body, user, doc):
    finding_id = finding['finding_id']
    identity = create_requests.current.get()
    receipt = await s.db.create_requests.find_one({'_id': identity})
    original = (receipt or {}).get('action_document')
    creating = not doc
    if not doc:
        tid = "tsk_" + uuid.uuid5(uuid.NAMESPACE_URL, "finding-remediation:" + finding_id).hex
        doc = original
        if not doc:
            if set(body) - {'title', 'priority', 'assignee_id', 'due_date', 'description'}:
                raise HTTPException(422, 'Unsupported Action Item fields')
            # Validate raw values before fallback defaults can hide falsey wrong types.
            s._editable_patch('tasks', {'client_id': finding['client_id'], 'title': finding['title'], **body}, user=user)
            doc = {"task_id": tid, "title": body.get("title") or finding["title"], "title_generated": not bool(body.get("title")),
                   "client_id": finding["client_id"], "status": "open", "priority": body.get("priority", finding.get("severity", "medium")),
                   "assignee_id": body.get("assignee_id", finding.get("owner_id")), "due_date": body.get("due_date") or finding.get("due_date"),
                   "description": body.get("description") or finding.get("remediation_plan"), "finding_id": finding_id,
                   "review_id": finding.get("review_id"), "occurrence_id": finding.get("occurrence_id"),
                   "source": finding.get("source") or "Finding remediation", "created_at": s._now(), "updated_at": s._now(),
                   "created_by": user["user_id"], "source_type": "review" if finding.get("review_id") else "finding",
                   "source_id": finding.get("review_id") or finding_id}
            doc.update(s._editable_patch('tasks', {k: doc[k] for k in
                ('client_id', 'title', 'priority', 'assignee_id', 'due_date', 'description')}, user=user))
            await authorization.require_creation_assignee(s.db, user, doc['client_id'], doc.get('assignee_id'))
            doc = await action_items.prepare(s.db, doc, s._can_access_client)
            original = doc.copy()
            await s.db.create_requests.update_one({'_id': identity},
                {'$set': {'action_document': original, 'action_primary_new': True, 'primary_started': True}})
        await s.db.tasks.update_one({"_id": tid}, {"$setOnInsert": doc}, upsert=True)
        doc = await s.db.tasks.find_one({"_id": tid}, {"_id": 0})
    if creating or (receipt or {}).get('action_primary_new'):
        # Explicit for new pairs and their retries; never choose among legacy Actions.
        await s.db.findings.update_one({'finding_id':finding_id, 'client_id':finding['client_id'],
            'primary_task_id':{'$exists':False}}, {'$set':{'primary_task_id':doc['task_id']}})
    if not original:
        original = doc.copy()
        await s.db.create_requests.update_one({'_id': identity}, {'$set': {'action_document': original}})
    # Synchronization records its audit intent with the conditional transition;
    # replay after an acknowledged or uncertain insert must still finish this work.
    await remediation.synchronize(s.db, doc, user, s._now, s.audit)
    await s.audit(user, "create", "task", doc["task_id"], finding["client_id"], meta={"from_finding": finding_id})
    if finding.get("review_id"):
        review = await s.db.reviews.find_one({"review_id": finding["review_id"], "client_id": finding["client_id"]}, {"_id": 0})
        if review:
            await s._review_event(user, review, "Action Item created", finding.get("occurrence_id") or "occ_" + review["review_id"],
                                  task_id=doc["task_id"], title=original["title"], assignee_id=original.get("assignee_id"))
    if original.get("assignee_id") and original["assignee_id"] != user["user_id"]:
        await s.create_notification(user_id=original["assignee_id"], title=f"New remediation task: {original['title']}", kind="task_assigned",
                                    entity_type="tasks", entity_id=doc["task_id"], client_id=doc["client_id"])
    return doc
