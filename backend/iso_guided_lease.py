"""Serialize ISO interview and native (including SoA) writes in a private lease."""
import asyncio
from datetime import datetime, timedelta, timezone
import uuid

from fastapi import HTTPException
from pymongo import timeout
from pymongo.errors import ConnectionFailure, DuplicateKeyError, PyMongoError, WriteConcernError

LEASE_SECONDS = 120
SAVE_TIMEOUT_SECONDS = 90
DRIVER_TIMEOUT_SECONDS = 80


class IsoGuidedLease:
    def __init__(self, collection, identity, token):
        self.collection = collection
        self.owner = {**identity, 'token': token}

    async def check(self):
        if not await self.collection.find_one(
                {**self.owner, 'until': {'$gt': datetime.now(timezone.utc).isoformat()}}, {'_id': 1}):
            raise HTTPException(409, 'ISO save lease expired; reload before retrying')


async def run(s, row, operation):
    """Authorization precedes acquisition; this is not fencing after dispatch."""
    if row['framework_key'] != 'iso-27001':
        raise ValueError('ISO save lease applies only to ISO 27001')
    collection = s.db.iso_guided_locks
    identity = {'_id': row['framework_assessment_id'], 'client_id': row['client_id'], 'framework_key': 'iso-27001'}
    try:
        await collection.update_one({'_id': identity['_id']}, {'$setOnInsert': {**identity, 'until': ''}}, upsert=True)
    except DuplicateKeyError:
        pass
    token, now = uuid.uuid4().hex, datetime.now(timezone.utc)
    acquired = await collection.update_one(
        {**identity, 'until': {'$lt': now.isoformat()}},
        {'$set': {'token': token, 'until': (now + timedelta(seconds=LEASE_SECONDS)).isoformat()}})
    if not acquired.modified_count:
        raise HTTPException(409, 'Another ISO interview, SoA or assessment save is in progress; reload before retrying')
    lease = IsoGuidedLease(collection, identity, token)
    release = True
    try:
        # Motor cancellation alone cannot stop its driver executor thread.
        with timeout(DRIVER_TIMEOUT_SECONDS):
            return await asyncio.wait_for(operation(lease), timeout=SAVE_TIMEOUT_SECONDS)
    except asyncio.CancelledError:
        release = False
        raise
    except asyncio.TimeoutError as error:
        release = False
        raise HTTPException(503, 'ISO save timed out; reload to confirm the saved state before retrying') from error
    except PyMongoError as error:
        if error.timeout or isinstance(error, (ConnectionFailure, WriteConcernError)) or error.has_error_label('RetryableWriteError'):
            release = False
            raise HTTPException(503, 'ISO save could not be confirmed; reload to confirm the saved state before retrying') from error
        raise
    finally:
        # An uncertain operation may outlive the request; retain its lease until
        # expiry. Cleanup is outside CSOT and cannot release a successor's token.
        if release:
            await collection.update_one(lease.owner, {'$set': {'until': ''}, '$unset': {'token': ''}})
