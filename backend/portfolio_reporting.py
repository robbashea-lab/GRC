"""Additive portfolio reporting storage and automatic, sampled source capture.

Reports never initialize or modify assessments. A snapshot is an observation at
its actual read time, not proof of an unchanged state between observations.
"""
import asyncio
from contextlib import suppress
from datetime import datetime, timedelta, timezone
import logging
import uuid

from fastapi import HTTPException
from create_requests import digest
import portfolio_progress
import portfolio_activity
import portfolio_deletions

LOG = logging.getLogger(__name__)
INTERVAL_SECONDS = 300
VERSION = 1


def now():
    return datetime.now(timezone.utc).isoformat()


def date_time(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(422, 'An ISO timestamp with a timezone is required')


async def initialize(db):
    # Existing collections and records are untouched. _id provides replay safety
    # before secondary indexes exist; this migration is repeatable on restart.
    await db.portfolio_snapshots.create_index([('client_id', 1), ('program_key', 1), ('captured_at', 1)])
    await db.portfolio_snapshots.create_index([('client_id', 1), ('framework_key', 1), ('captured_at', 1)])
    await db.portfolio_events.create_index([('client_id', 1), ('at', -1), ('event_id', -1)])
    await db.portfolio_events.create_index([('client_id', 1), ('type', 1), ('at', -1), ('event_id', -1)])
    await db.portfolio_events.create_index([('client_id', 1), ('source_kind', 1), ('at', -1), ('event_id', -1)])
    await db.portfolio_deletions.create_index([('state', 1)])
    # Event authorization joins by native source identity. Reuse an existing
    # identity-prefix index; add a nonunique lookup index only where absent.
    for kind, (key, _category, _label) in portfolio_activity.SOURCES.items():
        indexes = await db[kind].index_information()
        if not any(index.get('key') and tuple(index['key'][0]) == (key, 1) for index in indexes.values()):
            await db[kind].create_index([(key, 1), ('client_id', 1)], name='portfolio_source_lookup_v1')
    await db.portfolio_reporting_state.update_one({'_id': 'schema'}, {'$setOnInsert': {
        'version': VERSION, 'started_at': now(), 'description': 'Prospective sampled positions and committed activity'}}, upsert=True)


def position_hash(position):
    current = position['current']
    return digest({k: current.get(k) for k in ('scope_signature', 'counts', 'implemented',
        'denominator', 'excluded', 'total', 'percentage', 'availability', 'components', 'source_references')})


async def capture_client(db, client):
    # Retry the next collection cycle if a write crosses the observation. Two
    # agreeing reads avoid publishing counts joined to a different configuration.
    first = await portfolio_progress.build_current_positions(db, client, as_of=now())
    refreshed = await db.clients.find_one({'client_id': client['client_id']}, {'_id': 0})
    if not refreshed:
        return 0
    second = await portfolio_progress.build_current_positions(db, refreshed, as_of=now())
    if any(p['current'].get('provenance', {}).get('cutoff_consistent') is False for p in [*first, *second]):
        raise RuntimeError('Portfolio source crosses capture cutoff; retry next cycle')
    if [(p['program_key'], position_hash(p)) for p in first] != [(p['program_key'], position_hash(p)) for p in second]:
        raise RuntimeError('Portfolio source changed during capture; retry next cycle')
    count = 0
    for position in second:
        current = position['current']
        at = current['captured_at']
        fingerprint = position_hash(position)
        previous = await db.portfolio_snapshots.find_one({
            'client_id': position['client_id'], 'framework_key': position['framework_key']},
            sort=[('captured_at', -1), ('observation_sequence', -1)])
        # Persist one unchanged observation per UTC day and every observed state
        # transition. Including the predecessor preserves A -> B -> A reversions
        # instead of deduplicating the return to A against its earlier sample.
        if (previous and previous['captured_at'][:10] == at[:10]
                and previous.get('state_hash', position_hash(previous)) == fingerprint
                and previous['program_key'] == position['program_key']):
            continue
        identity = digest([VERSION, position['client_id'], position['framework_key'],
                           (previous or {}).get('snapshot_id'), at[:10], fingerprint])
        document = {**position, '_id': identity, 'snapshot_id': identity, 'captured_at': at,
                    'state_hash': fingerprint, 'observation_sequence': (previous or {}).get('observation_sequence', 0) + 1,
                    'capture_version': VERSION, 'observation_started_at': first[0]['current']['captured_at'] if first else at}
        result = await db.portfolio_snapshots.update_one({'_id': identity}, {'$setOnInsert': document}, upsert=True)
        count += bool(result.upserted_id)
    return count


async def collect(db):
    """One bounded leased sweep; the next sweep retries unfinished projections."""
    at = now()
    token = uuid.uuid4().hex
    await db.portfolio_reporting_state.update_one({'_id': 'collector'}, {'$setOnInsert': {'started_at': at}}, upsert=True)
    result = await db.portfolio_reporting_state.update_one({'_id': 'collector', '$or': [
        {'lease': None}, {'lease.until': {'$lt': at}}]}, {'$set': {
            'lease': {'token': token, 'until': (date_time(at) + timedelta(seconds=240)).isoformat()}, 'last_attempt_at': at}})
    if not result.modified_count:
        return {'skipped': True}
    try:
        await portfolio_deletions.reconcile(db, limit=500)
        await portfolio_activity.reconcile(db, limit=500)
        clients = await db.clients.find({}, {'_id': 0}).sort('client_id', 1).to_list(501)
        if len(clients) > 500:
            raise RuntimeError('Portfolio collector exceeds 500-client supported scope')
        snapshots = 0
        incomplete_clients = 0
        for client in clients:
            try:
                snapshots += await capture_client(db, client)
            except Exception as exc:
                incomplete_clients += 1
                LOG.warning('Portfolio position capture delayed (%s); other clients continue', type(exc).__name__)
        await db.portfolio_reporting_state.update_one({'_id': 'collector', 'lease.token': token}, {
            '$set': {'last_successful_at': now(), 'incomplete': bool(incomplete_clients),
                     'incomplete_clients': incomplete_clients}, '$unset': {'error': ''}})
        return {'snapshots': snapshots, 'incomplete_clients': incomplete_clients}
    except Exception as exc:
        await db.portfolio_reporting_state.update_one({'_id': 'collector', 'lease.token': token}, {
            '$set': {'incomplete': True, 'error': type(exc).__name__, 'failed_at': now()}})
        raise
    finally:
        await db.portfolio_reporting_state.update_one({'_id': 'collector', 'lease.token': token}, {'$unset': {'lease': ''}})


async def run(db):
    while True:
        try:
            await asyncio.wait_for(collect(db), timeout=230)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            LOG.error('Portfolio collection incomplete (%s); retry in %ss', type(exc).__name__, INTERVAL_SECONDS)
        await asyncio.sleep(INTERVAL_SECONDS)


async def stop(task):
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


async def coverage(db, client_ids, as_of, framework_key=None):
    state = await db.portfolio_reporting_state.find_one({'_id': 'collector'}) or {}
    schema = await db.portfolio_reporting_state.find_one({'_id': 'schema'}) or {}
    query = {'client_id': {'$in': client_ids}, 'captured_at': {'$lte': as_of}}
    if framework_key:
        query['framework_key'] = framework_key
    first = await db.portfolio_snapshots.find_one(query, {'_id': 0, 'captured_at': 1}, sort=[('captured_at', 1)])
    last = await db.portfolio_snapshots.find_one(query, {'_id': 0, 'captured_at': 1}, sort=[('captured_at', -1)])
    success = state.get('last_successful_at')
    delayed = not success or (date_time(as_of) - date_time(success)).total_seconds() > INTERVAL_SECONDS * 2
    return {'started_at': (first or {}).get('captured_at'), 'collection_started_at': schema.get('started_at'),
        'last_captured_at': (last or {}).get('captured_at'), 'last_successful_at': success,
        'partial': True, 'delayed': delayed, 'incomplete': bool(state.get('incomplete')),
        'interval_seconds': INTERVAL_SECONDS,
        'notice': 'History contains actual captured positions. Earlier program scope is not reconstructable from retained assessment records. Changes between samples may be unobserved.'}


async def history_positions(db, position, range_key, as_of):
    start = portfolio_progress.range_start(as_of, range_key)
    query = {'client_id': position['client_id'], 'framework_key': position['framework_key'], 'captured_at': {'$lte': as_of}}
    baseline = await db.portfolio_snapshots.find_one({**query, 'captured_at': {'$lte': start}}, {'_id': 0}, sort=[('captured_at', -1), ('observation_sequence', -1)])
    samples = await db.portfolio_snapshots.find({**query, 'captured_at': {'$gt': start, '$lte': as_of}}, {'_id': 0}).sort([('captured_at', 1), ('observation_sequence', 1)]).to_list(10001)
    if len(samples) > 10000:
        raise HTTPException(413, 'Too many captured positions for this range; choose a shorter period')
    all_samples = ([baseline] if baseline else []) + samples
    comparison = portfolio_progress.compare_positions(all_samples, position['current'], start)
    scope_changes = []
    if comparison.get('baseline'):
        # Committed scope activity can prove an intervening change/reversion that
        # fell between samples. Its time is genuine; no implementation counts are
        # inferred for that time. Untagged legacy scope receipts are conservative.
        keys = ['cis-ig1', 'cis-ig2', 'cis-ig3'] if position['framework_key'] == 'cis-ig1' else [position['framework_key']]
        events = await db.portfolio_events.find({'client_id': position['client_id'],
            'at': {'$gt': comparison['baseline']['captured_at'], '$lte': as_of},
            '$and': [{'$or': [{'type': 'Scope'}, {'scope_changed': True}]},
                     {'$or': [{'program_keys': {'$in': keys}}, {'program_keys': {'$exists': False}}, {'program_keys': []}]}]},
            {'_id': 0, 'at': 1}).sort('at', 1).to_list(10001)
        if len(events) > 10000:
            raise HTTPException(413, 'Too many scope changes for this range; choose a shorter period')
        if events:
            comparison.update({'scope_changed': True, 'comparable': False, 'change_pp': None,
                'reason': 'Committed scope activity occurred between captured positions; the endpoints are not a like-for-like period comparison.'})
            scope_changes.extend({'at': event['at'], 'provenance': 'committed_scope_activity'} for event in events)
    observed = [s['current'] for s in all_samples] + [position['current']]
    for before, after in zip(observed, observed[1:]):
        if before['scope_signature'] != after['scope_signature']:
            scope_changes.append({'at': after['captured_at'],
                'before': {k: before.get(k) for k in ('total', 'denominator', 'implemented', 'scope_signature')},
                'after': {k: after.get(k) for k in ('total', 'denominator', 'implemented', 'scope_signature')}})
    scope_changes.sort(key=lambda change: change['at'])
    # Keep discrete daily observations plus every observed scope transition.
    # Never interpolate or relabel the actual capture date as the period start.
    chart = []
    for sample in all_samples:
        if chart and chart[-1]['captured_at'][:10] == sample['captured_at'][:10] and chart[-1]['current']['scope_signature'] == sample['current']['scope_signature']:
            chart[-1] = sample
        else:
            chart.append(sample)
    return {'snapshots': [{**s['current'], 'snapshot_id': s['snapshot_id']} for s in chart],
            'comparison': comparison, 'scope_changes': scope_changes, 'period_start': start, 'range': range_key}
