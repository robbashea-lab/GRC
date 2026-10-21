"""Additive portfolio reporting storage and committed or sampled source capture.

Reports never initialize or modify assessments. Polling observes its actual read
time; only a validated committed-source predecessor proves an earlier interval.
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
VERSION = 2


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
    await db.portfolio_snapshots.create_index([('client_id', 1), ('framework_key', 1), ('effective_at', 1)])
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


def _event_bound(position, client, event):
    """Only an unchanged latest source token can establish the event-time state."""
    references = position['current'].get('provenance', {}).get('source_references', [])
    matched = (event['source_kind'] == 'clients' and client.get('_portfolio_activity_last_event_id') == event['event_id']) or any(
        reference['kind'] == event['source_kind'] and reference.get('id') == event['source_id']
        and reference.get('source_event') == event['event_id'] for reference in references)
    if not matched or not references:
        return False
    try:
        return all(date_time(reference['version']) <= date_time(event['at']) for reference in references)
    except (KeyError, HTTPException):
        return False


def _proves_previous(previous, current, event):
    if event.get('source_kind') != 'framework_assessments' or previous.get('scope_signature') != current.get('scope_signature'):
        return False
    def references(position):
        return {(reference['kind'], reference.get('id'), reference.get('field')): reference
                for reference in position.get('provenance', {}).get('source_references', [])}
    old, new = references(previous), references(current)
    target = ('framework_assessments', event['source_id'], None)
    if not old or old.keys() != new.keys() or target not in old:
        return False
    return (all(old[key] == new[key] for key in old if key != target)
        and old[target].get('version') == event.get('position_before_version')
        and old[target].get('source_event') == event.get('position_predecessor_event')
        and old[target].get('status') == event.get('before', {}).get('status')
        and new[target].get('status') == event.get('after', {}).get('status'))


async def capture_committed(db, event):
    """Derive positions only after a native posture/scope write has committed."""
    fields = {'status', 'soa_applicability', 'soa_justification', 'na_rationale', 'addressable_decision', 'addressable_rationale'}
    allowed = {'framework_assessments': fields,
               'clients': {'framework_settings', 'onboarding_baseline', 'status', 'archived', 'archived_at'},
               'requirements': {'baseline_response', 'baseline_key', 'applicability', 'status'}}
    if event.get('provenance') != 'committed_source' or not allowed.get(event.get('source_kind'), set()).intersection(event.get('changed_fields', [])):
        return 0
    if event.get('source_kind') in ('clients', 'requirements') and event.get('implementation_scope_changed') is not True:
        return 0
    client = await db.clients.find_one({'client_id': event['client_id']}, {'_id': 0})
    return await capture_client(db, client, event) if client else 0


async def capture_client(db, client, source_event=None):
    # Retry the next collection cycle if a write crosses the observation. Two
    # agreeing reads avoid publishing counts joined to a different configuration.
    first = await portfolio_progress.build_current_positions(db, client, as_of=now())
    refreshed = await db.clients.find_one({'client_id': client['client_id']}, {'_id': 0})
    if not refreshed:
        return 0
    second = await portfolio_progress.build_current_positions(db, refreshed, as_of=now())
    if any(p['current'].get('provenance', {}).get('cutoff_consistent') is False for p in [*first, *second]):
        raise RuntimeError('Portfolio source crosses capture cutoff; retry next cycle')
    if [(p['program_key'], position_hash(p), p['current'].get('source_revision')) for p in first] != [
            (p['program_key'], position_hash(p), p['current'].get('source_revision')) for p in second]:
        raise RuntimeError('Portfolio source changed during capture; retry next cycle')
    count = 0
    for position in second:
        event_keys = ['cis-ig1' if key in ('cis-ig2', 'cis-ig3') else key for key in (source_event or {}).get('program_keys', [])]
        if source_event and event_keys and position['framework_key'] not in event_keys:
            continue
        current = position['current']
        at = current['captured_at']
        fingerprint = position_hash(position)
        previous = await db.portfolio_snapshots.find_one({
            'client_id': position['client_id'], 'framework_key': position['framework_key']},
            sort=[('captured_at', -1), ('observation_sequence', -1)])
        # Persist one unchanged observation per UTC day and every observed state
        # transition. Including the predecessor preserves A -> B -> A reversions
        # instead of deduplicating the return to A against its earlier sample.
        if (not source_event and previous and previous['captured_at'][:10] == at[:10]
                and previous.get('state_hash', position_hash(previous)) == fingerprint
                and previous['program_key'] == position['program_key']):
            continue
        bound = bool(source_event and _event_bound(position, refreshed, source_event))
        kind = 'committed_event' if bound else 'sampled' if previous or source_event else 'current_baseline'
        effective_at = source_event['at'] if bound else at
        identity = digest([VERSION, position['program_id'], source_event['event_id']]) if source_event else digest([
            VERSION, position['client_id'], position['framework_key'], (previous or {}).get('snapshot_id'), at[:10], fingerprint])
        current.update(effective_at=effective_at, observation_kind=kind,
            source_event=source_event['event_id'] if source_event else None,
            provenance={**current['provenance'], 'kind': kind,
                'event_time_bound': bound, 'source_event': source_event['event_id'] if source_event else None})
        document = {**position, '_id': identity, 'snapshot_id': identity, 'captured_at': at,
                    'effective_at': effective_at, 'observation_kind': kind, 'source_revision': current.get('source_revision'),
                    'source_event': source_event['event_id'] if source_event else None,
                    'state_hash': fingerprint, 'observation_sequence': (previous or {}).get('observation_sequence', 0) + 1,
                    'capture_version': VERSION, 'observation_started_at': first[0]['current']['captured_at'] if first else at}
        result = await db.portfolio_snapshots.update_one({'_id': identity}, {'$setOnInsert': document}, upsert=True)
        if (bound and previous and date_time(previous.get('effective_at') or previous['captured_at']) < date_time(effective_at)
                and _proves_previous(previous['current'], current, source_event)):
            # The writer's exact predecessor proves this old state through the
            # next committed event; polling alone never establishes carry-forward.
            await db.portfolio_snapshots.update_one({'_id': previous['_id']}, {'$set': {
                'current.effective_until': effective_at, 'current.continuity_proven': True,
                'current.continuity_source_event': source_event['event_id']}})
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


# Keep the catalog, applicability vector and native source references in storage.
# A chart point needs its own counts and identity, not a repeated catalog export.
OBSERVATION_FIELDS = (
    'program_id', 'measure_version', 'availability', 'reason', 'percentage',
    'implemented', 'denominator', 'total', 'excluded', 'counts', 'included_counts',
    'assessed', 'not_started', 'scope_signature', 'status_signature',
    'scope_undetermined', 'missing_records', 'duplicate_records',
    'unrecognized_status_count', 'effective_until', 'continuity_proven',
    'continuity_source_event',
)


def observation(document):
    current = document['current']
    provenance = current.get('provenance', {})
    return {**{field: current[field] for field in OBSERVATION_FIELDS if field in current},
        'invalid_applicability_count': len(current.get('invalid_applicability', [])),
        'provenance': {field: provenance[field] for field in
            ('kind', 'label', 'source_as_of', 'cutoff_consistent', 'event_time_bound', 'source_event') if field in provenance},
        'snapshot_id': document['snapshot_id'],
        'captured_at': document['captured_at'],
        'effective_at': document.get('effective_at') or current.get('effective_at') or document['captured_at'],
        'observation_kind': document.get('observation_kind') or 'sampled',
        'source_event': document.get('source_event'),
        'observation_sequence': document.get('observation_sequence', 0),
        'source_revision': document.get('source_revision') or current.get('source_revision')}


async def history_positions(db, position, range_key, as_of):
    start = portfolio_progress.range_start(as_of, range_key)
    forecast_start = portfolio_progress.range_start(as_of, '90d')
    query = {'client_id': position['client_id'], 'framework_key': position['framework_key'], 'captured_at': {'$lte': as_of}}
    first_start = min(date_time(start), date_time(forecast_start)).isoformat()
    documents = await db.portfolio_snapshots.find({**query, '$or': [
        {'effective_at': {'$gte': first_start, '$lte': as_of}},
        {'effective_at': {'$exists': False}, 'captured_at': {'$gte': first_start, '$lte': as_of}}]}, {'_id': 0}).to_list(10001)
    if len(documents) > 10000:
        raise HTTPException(413, 'Too many positions for this period; choose a shorter range')
    baselines = [await db.portfolio_snapshots.find_one({**query, 'effective_at': {'$lt': first_start}}, {'_id': 0},
                  sort=[('effective_at', -1), ('observation_sequence', -1)]),
                 await db.portfolio_snapshots.find_one({**query, 'effective_at': {'$exists': False},
                  'captured_at': {'$lt': first_start}}, {'_id': 0}, sort=[('captured_at', -1), ('observation_sequence', -1)])]
    baselines = [baseline for baseline in baselines if baseline]
    if baselines:
        documents.append(max(baselines, key=lambda value: date_time(value.get('effective_at') or value['captured_at'])))
    samples = sorted((observation(document) for document in documents),
                     key=lambda value: (date_time(value['effective_at']), value.get('observation_sequence', 0), value['captured_at']))
    samples = [sample for sample in samples if date_time(sample['effective_at']) <= date_time(as_of)]
    comparison = portfolio_progress.compare_positions(samples, position['current'], start)
    baseline = comparison.get('baseline')
    event_start = min(date_time(start), date_time(forecast_start), date_time(
        baseline.get('effective_at') or baseline['captured_at']) if baseline else date_time(start))
    keys = ['cis-ig1', 'cis-ig2', 'cis-ig3'] if position['framework_key'] == 'cis-ig1' else [position['framework_key']]
    events = await db.portfolio_events.find({'client_id': position['client_id'],
        'at': {'$gt': event_start.isoformat(timespec='microseconds'), '$lte': date_time(as_of).isoformat(timespec='microseconds')},
        '$and': [{'$or': [{'type': 'Scope'}, {'scope_changed': True}]},
                 {'implementation_scope_changed': {'$ne': False}},
                 {'$or': [{'program_keys': {'$in': keys}}, {'program_keys': {'$exists': False}}, {'program_keys': []}]}]},
        {'_id': 0, 'at': 1, 'event_id': 1}).sort('at', 1).to_list(10001)
    if len(events) > 10000:
        raise HTTPException(413, 'Too many scope changes for this range; choose a shorter period')
    scope_changes = [{'at': event['at'], 'event_id': event.get('event_id'), 'provenance': 'committed_scope_activity'} for event in events]
    # Stored membership is authoritative; a denominator delta alone cannot identify additions.
    full = {document['snapshot_id']: document['current'] for document in documents}
    observed = [{**sample, 'scope': full.get(sample['snapshot_id'], {}).get('scope')} for sample in samples] + [position['current']]
    for before, after in zip(observed, observed[1:]):
        if before.get('scope_signature') != after.get('scope_signature'):
            change = {'at': after.get('effective_at') or after['captured_at'],
                'after_snapshot_id': after.get('snapshot_id'),
                'provenance': 'observed_scope_transition',
                'before': {key: before.get(key) for key in ('total', 'denominator', 'implemented', 'scope_signature')},
                'after': {key: after.get(key) for key in ('total', 'denominator', 'implemented', 'scope_signature')}}
            before_scope, after_scope = before.get('scope') or {}, after.get('scope') or {}
            if isinstance(before_scope.get('applicability'), dict) and isinstance(after_scope.get('applicability'), dict):
                old = {key for key, value in before_scope['applicability'].items() if value == 'included'}
                new = {key for key, value in after_scope['applicability'].items() if value == 'included'}
                change.update(added_ids=sorted(new - old), removed_ids=sorted(old - new), membership_known=True)
            scope_changes.append(change)
    scope_changes.sort(key=lambda change: date_time(change['at']))
    if baseline and any(date_time(change['at']) > date_time(baseline.get('effective_at') or baseline['captured_at']) for change in scope_changes):
        comparison.update(scope_changed=True, comparable=False,
            reason='Scope changed; raw endpoint change uses each position\'s own denominator and is not like-for-like progress.')
    return {'snapshots': [sample for sample in samples if date_time(sample['effective_at']) >= date_time(start)],
        'forecast_snapshots': [sample for sample in samples if date_time(sample['effective_at']) >= date_time(forecast_start)],
        'comparison': comparison,
        'scope_changes': [change for change in scope_changes if date_time(change['at']) >= date_time(start)],
        'forecast_scope_changes': [change for change in scope_changes if date_time(change['at']) >= date_time(forecast_start)],
        'period_start': start, 'period_end': as_of, 'range': range_key,
        'capture_method': 'Committed posture/scope events and explicitly sampled recovery observations; no historical interpolation.'}
