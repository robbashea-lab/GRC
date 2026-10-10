"""Serialize SOC interview/native writes using the existing Mongo lease pattern."""
import asyncio
from datetime import datetime, timedelta, timezone
import uuid

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

LEASE_SECONDS = 120
SAVE_TIMEOUT_SECONDS = 90


class SocGuidedLease:
    def __init__(self, collection, identity, token):
        self.collection = collection
        self.owner = {**identity, 'token': token}

    async def check(self):
        if not await self.collection.find_one(
                {**self.owner, 'until': {'$gt': datetime.now(timezone.utc).isoformat()}}, {'_id': 1}):
            raise HTTPException(409, 'SOC save lease expired; reload before retrying')


async def run(s, row, operation):
    """Call only after normal write authorization; no lease data enters public records."""
    if row['framework_key'] != 'soc-2':
        raise ValueError('SOC save lease applies only to SOC 2')
    # Keep leases off assessment records, which have several outward read paths.
    collection = s.db.soc_guided_locks
    identity = {'_id': row['framework_assessment_id'], 'client_id': row['client_id'], 'framework_key': 'soc-2'}
    try:
        await collection.update_one({'_id': identity['_id']}, {'$setOnInsert': {**identity, 'until': ''}}, upsert=True)
    except DuplicateKeyError:
        # Concurrent first-use initialization still competes through the same CAS.
        pass
    token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
    acquired = await collection.update_one(
        {**identity, 'until': {'$lt': now.isoformat()}},
        {'$set': {'token': token, 'until': (now + timedelta(seconds=LEASE_SECONDS)).isoformat()}})
    if not acquired.modified_count:
        raise HTTPException(409, 'Another SOC interview or assessment save is in progress; reload before retrying')
    lease = SocGuidedLease(collection, identity, token)
    try:
        # Finish/cancel before expiry, leaving the same safety margin as other leases.
        return await asyncio.wait_for(operation(lease), timeout=SAVE_TIMEOUT_SECONDS)
    except asyncio.TimeoutError as error:
        raise HTTPException(503, 'SOC save timed out; reload to confirm the saved state before retrying') from error
    finally:
        # An expired holder must never release a successor's lease.
        await collection.update_one(lease.owner, {'$set': {'until': ''}, '$unset': {'token': ''}})
