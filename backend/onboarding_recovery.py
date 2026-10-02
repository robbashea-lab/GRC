"""Frozen onboarding writes, resumed through the existing durable create receipt.

This is deliberately limited to onboarding's two intake endpoints. A plan is
saved before the first business write; it never guesses a new target on retry.
The receipt and record marker cover failures on either side of a write's reply.
"""
from fastapi import HTTPException

import create_requests


class OnboardingPlan:
    def __init__(self, identity, client_id):
        self.identity = identity
        self.client_id = client_id
        self.rows = []
        self.audits = []

    def new_id(self, prefix):
        return prefix + '_' + create_requests.digest([self.identity, len(self.rows)])[:32]

    def insert(self, kind, id_field, document):
        self.rows.append({'kind': kind, 'id_field': id_field, 'values': document, 'insert': True})

    def update(self, kind, id_field, old, values, version_field='updated_at'):
        self.rows.append({'kind': kind, 'id_field': id_field, 'id': old[id_field],
                          'version_field': version_field,
                          'expected_version': old.get('updated_at'), 'values': values})

    def audit(self, action, kind, identity, meta=None):
        self.audits.append({'action': action, 'entity_type': kind, 'entity_id': identity, 'meta': meta or {}})

    def document(self, result, **context):
        return {'client_id': self.client_id, 'rows': self.rows, 'audits': self.audits,
                'result': result, **context}


async def apply_rows(db, identity, rows, client_id, offset=0):
    receipt = await db.create_requests.find_one({'_id': identity})
    completed = set(receipt.get('onboarding_completed_rows', []))
    for index, row in enumerate(rows, start=offset):
        if index in completed:
            continue
        collection = db[row['kind']]
        values = {**row['values'], '_onboarding_request': identity}
        record_id = values[row['id_field']] if row.get('insert') else row['id']
        query = {row['id_field']: record_id, 'client_id': client_id}
        current = await collection.find_one(query)
        if current and current.get('_onboarding_request') == identity:
            # The write committed but its acknowledgement/checkpoint was lost.
            # A later register edit can retain this marker; never replay over it.
            pass
        elif row.get('insert'):
            if current:
                raise HTTPException(409, 'An onboarding target changed; reload before starting another submission')
            await collection.update_one({'_id': record_id}, {'$setOnInsert': values}, upsert=True)
        else:
            query[row['version_field']] = row['expected_version']
            changed = await collection.update_one(query, {'$set': values})
            if not changed.matched_count:
                raise HTTPException(409, 'An onboarding record changed before its pending write; reload to reconcile it')
        await db.create_requests.update_one({'_id': identity}, {'$addToSet': {'onboarding_completed_rows': index}})


async def run(db, key, user, client_id, route, payload, prepare, audit, finish=None):
    async def execute(identity):
        receipt = await db.create_requests.find_one({'_id': identity})
        plan = receipt.get('onboarding_plan')
        if plan is None:
            try:
                plan = await prepare(identity)
            except HTTPException as error:
                # No business write can precede preparation. Let the editor
                # correct invalid/stale input instead of retaining a dead intent.
                error.headers = {**(error.headers or {}), 'X-Create-Rejected': 'true'}
                raise
            await db.create_requests.update_one({'_id': identity}, {'$set': {'onboarding_plan': plan}})
        await db.create_requests.update_one({'_id': identity}, {'$set': {'primary_started': True}})
        await apply_rows(db, identity, plan['rows'], client_id)
        if finish:
            await finish(identity, plan)
        for event in plan['audits']:
            await audit(user, client_id=client_id, **event)
        return plan['result']

    return await create_requests.run(db, key, user['user_id'], client_id, route, payload, execute)
