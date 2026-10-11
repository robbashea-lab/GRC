"""Serialize SOC interview/native writes using the existing Mongo lease pattern."""
import asyncio
from datetime import datetime, timedelta, timezone
import uuid

from fastapi import HTTPException
from pymongo import timeout
from pymongo.errors import ConnectionFailure, DuplicateKeyError, PyMongoError, WriteConcernError

LEASE_SECONDS = 120
SAVE_TIMEOUT_SECONDS = 90
DRIVER_TIMEOUT_SECONDS = 80


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
    release = True
    try:
        # Cancelling a Motor future does not stop its PyMongo executor thread.
        # Motor copies this deadline into that thread, including queued commands.
        with timeout(DRIVER_TIMEOUT_SECONDS):
            return await asyncio.wait_for(operation(lease), timeout=SAVE_TIMEOUT_SECONDS)
    except asyncio.CancelledError:
        release = False
        raise
    except asyncio.TimeoutError as error:
        release = False
        raise HTTPException(503, 'SOC save timed out; reload to confirm the saved state before retrying') from error
    except PyMongoError as error:
        if error.timeout or isinstance(error, (ConnectionFailure, WriteConcernError)) or error.has_error_label('RetryableWriteError'):
            release = False
            raise HTTPException(503, 'SOC save could not be confirmed; reload to confirm the saved state before retrying') from error
        raise
    finally:
        # An uncertain driver operation can outlive the request. Keep its lease
        # until expiry rather than admit a newer interview underneath that write.
        # Normal cleanup is outside CSOT and must not release a successor's token.
        if release:
            await collection.update_one(lease.owner, {'$set': {'until': ''}, '$unset': {'token': ''}})
