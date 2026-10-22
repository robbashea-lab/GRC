"""Leased deletion receipts preserve genuine activity across interrupted writes.

The caller applies the native delete/authorization contract. A source claim token
fences expired handlers, and a claimed receipt becomes eligible only after its
source is absent. Source histories and write timestamps are never changed here.
"""
import asyncio
from datetime import timedelta
import re
import uuid

from fastapi import HTTPException
from pymongo.results import DeleteResult
from create_requests import digest
import portfolio_activity


SOURCE_KEYS = {'reviews': 'review_id', 'findings': 'finding_id', 'risks': 'risk_id',
    'policies': 'policy_id', 'vendors': 'vendor_id', 'assets': 'asset_id', 'tasks': 'task_id',
    'exceptions': 'exception_id', 'requirements': 'requirement_id', 'contacts': 'contact_id',
    'evidence': 'evidence_id'}


def _clock(now):
    return portfolio_activity._time(now())


def _native(predicate, source, key):
    return {'$and': [predicate, {key: source[key], 'client_id': source['client_id']}]}


async def _owned(db, identity, token, now):
    receipt = await db.portfolio_deletions.find_one({'_id': identity, 'lease.token': token,
        'lease.until': {'$gt': _clock(now).isoformat()}})
    if not receipt:
        raise HTTPException(409, 'Deletion ownership changed; reload before deleting')
    return receipt


async def _complete(db, identity, token, event):
    if event:
        await portfolio_activity.persist_event(db, event)
    completed = await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token},
        {'$set': {'state': 'complete'}})
    if not completed.matched_count:
        raise HTTPException(409, 'Deletion ownership changed; retry the original deletion')
    return DeleteResult({'n': 1}, True), event


async def _execute(db, identity, token, kind, key, source, predicate, now):
    receipt = await _owned(db, identity, token, now)
    base = {key: source[key], 'client_id': source['client_id']}
    current = await db[kind].find_one(base)
    if current is None:
        if receipt['state'] == 'claimed':
            return await _complete(db, identity, token, receipt.get('event'))
        raise HTTPException(409, 'Source record is unavailable; this deletion was not committed')
    if not await db[kind].find_one(_native(predicate, source, key), {'_id': 1}):
        await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token},
                                               {'$set': {'state': 'failed'}})
        raise HTTPException(409, 'Record changed; reload before deleting')

    previous = current.get('_portfolio_delete_receipt')
    old = await db.portfolio_deletions.find_one({'_id': previous}) if previous and previous != identity else None
    if old:
        if old.get('state') == 'complete':
            raise HTTPException(409, 'A completed deletion has an existing source; reload before deleting')
        old_lease = old.get('lease') or {}
        if old.get('state') not in {'failed', 'abandoned'} and old_lease.get('until', '') > _clock(now).isoformat():
            raise HTTPException(409, 'An earlier deletion is still being processed', headers={'Retry-After': '2'})
    replaced = list(dict.fromkeys([*receipt.get('replaced_receipts', []),
        *([previous, *(old or {}).get('replaced_receipts', [])] if previous and previous != identity else [])]))
    replaced = [value for value in replaced if value != identity]
    if any(not isinstance(value, str) or not re.fullmatch(r'[a-f0-9]{64}', value) for value in replaced):
        raise HTTPException(503, 'Deletion recovery contains an invalid source claim')
    # Retain predecessors before moving the source fence. Recovery must retire
    # every superseded intent before deleting, even after another interruption.
    saved = await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token},
        {'$set': {'replaced_receipts': replaced}})
    if not saved.matched_count:
        raise HTTPException(409, 'Deletion ownership changed; reload before deleting')
    claimed = await db[kind].update_one({'$and': [_native(predicate, source, key),
        {'_portfolio_delete_receipt': previous, '_portfolio_delete_token': current.get('_portfolio_delete_token')}]},
        {'$set': {'_portfolio_delete_receipt': identity, '_portfolio_delete_token': token}})
    if not claimed.matched_count:
        raise HTTPException(409, 'Record changed; reload before deleting')
    for superseded in replaced:
        await _owned(db, identity, token, now)
        target = await db.portfolio_deletions.find_one({'_id': superseded})
        if not target or target.get('state') == 'abandoned':
            continue
        if target.get('state') == 'complete':
            raise HTTPException(409, 'Deletion recovery changed; reload before deleting')
        retired = await db.portfolio_deletions.update_one({'_id': superseded, 'state': target['state'],
            'lease.token': (target.get('lease') or {}).get('token')},
            {'$set': {'state': 'abandoned'}, '$unset': {'lease': ''}})
        if not retired.matched_count:
            raise HTTPException(409, 'Deletion recovery changed; retry the original deletion')

    current = await db[kind].find_one({**base, '_portfolio_delete_receipt': identity,
                                     '_portfolio_delete_token': token})
    if current is None:
        raise HTTPException(409, 'Deletion source ownership changed; reload before deleting')
    for event_id, event in (current.get('_portfolio_activity_pending') or {}).items():
        if (event.get('event_id') != event_id or event.get('source_kind') != kind
                or event.get('source_id') != source[key] or event.get('client_id') != source['client_id']):
            raise HTTPException(503, 'Source activity needs recovery before deleting')
        await portfolio_activity.persist_event(db, event)
    # Existing source means an earlier attempt did not commit. New dispatch gets
    # a new time; absent-source recovery retains the original event and actor.
    event = portfolio_activity.project_committed_change(kind, source[key], source['client_id'],
        receipt['actor'], current, None, now(), 'delete')
    staged = await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token},
        {'$set': {'state': 'claimed', 'event': event}})
    if not staged.matched_count:
        raise HTTPException(409, 'Deletion ownership changed; reload before deleting')
    await _owned(db, identity, token, now)
    result = await db[kind].delete_one({'$and': [_native(predicate, source, key),
        {'_portfolio_delete_receipt': identity, '_portfolio_delete_token': token}]})
    if not result.deleted_count:
        await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token},
                                               {'$set': {'state': 'failed'}})
        await db[kind].update_one({**base, '_portfolio_delete_receipt': identity, '_portfolio_delete_token': token},
            {'$unset': {'_portfolio_delete_receipt': '', '_portfolio_delete_token': ''}})
        return result, None
    return await _complete(db, identity, token, event)


async def delete(db, kind, key, source, predicate, user, now):
    if SOURCE_KEYS.get(kind) != key or not source.get(key) or not source.get('client_id'):
        raise ValueError('Unsupported deletion source')
    identity = digest(['portfolio-delete-v1', kind, source['client_id'], source[key],
                       source.get('updated_at'), user['user_id']])
    clock = _clock(now)
    await db.portfolio_deletions.update_one({'_id': identity}, {'$setOnInsert': {
        'state': 'prepared', 'kind': kind, 'key': key, 'source_id': source[key],
        'client_id': source['client_id'], 'expected_updated_at': source.get('updated_at'),
        'actor_id': user['user_id'], 'actor': {'user_id': user['user_id'], 'name': user.get('name')},
        'created_at': clock.isoformat()}}, upsert=True)
    receipt = await db.portfolio_deletions.find_one({'_id': identity})
    if receipt['state'] == 'complete':
        if await db[kind].find_one({key: source[key], 'client_id': source['client_id']}, {'_id': 1}):
            raise HTTPException(409, 'A completed deletion has an existing source; reload before deleting')
        if receipt.get('event'):
            await portfolio_activity.persist_event(db, receipt['event'])
        return DeleteResult({'n': 1}, True), receipt.get('event')
    token = uuid.uuid4().hex
    acquired = await db.portfolio_deletions.update_one({'_id': identity,
        'state': {'$in': ['prepared', 'claimed', 'failed', 'abandoned']}, '$or': [
            {'lease': None}, {'lease.until': {'$lte': clock.isoformat()}}]},
        {'$set': {'lease': {'token': token, 'until': (clock + timedelta(seconds=120)).isoformat()}}})
    if not acquired.modified_count:
        raise HTTPException(409, 'This deletion is still being processed', headers={'Retry-After': '2'})
    try:
        if 'actor' not in receipt:
            # Legacy receipts retain actor identity without guessing a past name.
            await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token},
                {'$set': {'actor': {'user_id': receipt.get('actor_id'), 'name': None}}})
        return await asyncio.wait_for(_execute(db, identity, token, kind, key, source, predicate, now), timeout=90)
    except TimeoutError as error:
        raise HTTPException(503, 'Deletion needs recovery; retry the original deletion') from error
    finally:
        await db.portfolio_deletions.update_one({'_id': identity, 'lease.token': token}, {'$unset': {'lease': ''}})


async def reconcile(db, limit=500):
    if type(limit) is not int or not 1 <= limit <= 2000:
        raise ValueError('Deletion reconciliation limit must be 1 to 2000')
    processed = 0
    rows = db.portfolio_deletions.find({'state': 'claimed'}).limit(limit)
    async for prior in rows:
        receipt = await db.portfolio_deletions.find_one({'_id': prior['_id'], 'state': 'claimed'})
        if not receipt or SOURCE_KEYS.get(receipt['kind']) != receipt['key']:
            continue
        if await db[receipt['kind']].find_one({receipt['key']: receipt['source_id'], 'client_id': receipt['client_id']}, {'_id': 1}):
            continue
        # A takeover retires predecessors before deleting; an old scan must not
        # count their abandoned attempt after its new owner removes the source.
        receipt = await db.portfolio_deletions.find_one({'_id': receipt['_id'], 'state': 'claimed'})
        if not receipt:
            continue
        if receipt.get('event'):
            await portfolio_activity.persist_event(db, receipt['event'])
        completed = await db.portfolio_deletions.update_one({'_id': receipt['_id'], 'state': 'claimed'},
                                                          {'$set': {'state': 'complete'}})
        processed += completed.modified_count
    return processed
