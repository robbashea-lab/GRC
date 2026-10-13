"""Minimal business activity projection; source records and audit logs stay authoritative.

Writers store a safe event in the same atomic source write as the change. The
collector acknowledges its source marker only after the idempotent projection
write. Retained audit coverage is deliberately partial, not a complete history.
"""
import base64
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from urllib.parse import urlencode, quote

from fastapi import HTTPException
import authorization
from framework_catalog import FRAMEWORKS


# These are the existing tenant-read boundaries (_authorized_parent and Evidence
# item). No portfolio permission grants access to the raw audit metadata.
SOURCES = {
    'framework_assessments': ('framework_assessment_id', 'Assessments', 'Assessment'),
    'organizational_controls': ('control_id', 'Assessments', 'Control'),
    'reviews': ('review_id', 'Assessments', 'Review'),
    'findings': ('finding_id', 'Findings', 'Finding'),
    'risks': ('risk_id', 'Risks', 'Risk'),
    'policies': ('policy_id', 'Policies', 'Policy'),
    'evidence': ('evidence_id', 'Evidence', 'Evidence'),
    'clients': ('client_id', 'Scope', 'Program scope'),
    'requirements': ('requirement_id', 'Scope', 'Program scope'),
}
ALIASES = {kind: kind for kind in SOURCES}
ALIASES.update({kind[:-1]: kind for kind in SOURCES if kind != 'evidence'})
ALIASES.update({'policy': 'policies', 'framework_assessment': 'framework_assessments',
                'organizational_control': 'organizational_controls'})
TYPES = frozenset(value[1] for value in SOURCES.values())
TECHNICAL = {'updated_at', 'last_saved', 'last_assessed', 'assessed_by',
             'assessment_recorded_at', 'assessment_recorded_by', 'created_at', 'created_by',
             'expected_updated_at', 'expected_last_assessed', 'last_activity', 'history',
             'assessment_history', 'rating_history', 'cis_scope_change', 'soc_configuration_updated_at',
             'cis_configuration_updated_at', 'onboarding_completion', 'completion_snapshot'}
BUSINESS_FIELDS = {
    'framework_assessments': {'status', 'implementation', 'technology', 'notes', 'owner_id', 'process_owner_id',
        'verification', 'verification_checklist', 'cis_assessment_criteria', 'soc_assessment_checks',
        'iso_assessment_checks', 'na_rationale', 'soa_applicability', 'soa_justification',
        'addressable_decision', 'addressable_rationale', 'management_controls', 'related_links'},
    'organizational_controls': {'name', 'title', 'description', 'status', 'owner_id', 'assessment_ids',
        'related_links', 'observations', 'design', 'implementation', 'conflicts', 'frequency', 'reconciliation_note'},
    'reviews': {'status', 'notes', 'outcome', 'iso_audit', 'due_date', 'owner_id', 'reviewer_id', 'recurrence',
        'custom_recurrence_days', 'evidence_ids', 'completed_at', 'occurrences', 'amendments'},
    'findings': {'title', 'description', 'status', 'severity', 'owner_id', 'due_date', 'notes', 'accepted_at',
        'validated_at', 'acceptance_reason', 'validation_notes', 'governance_context', 'decision_history'},
    'risks': {'title', 'description', 'status', 'likelihood_score', 'impact_score', 'risk_score', 'risk_level',
        'owner_id', 'treatment', 'treatment_plan', 'next_review', 'review_cadence', 'custom_recurrence_days',
        'accepted_at', 'closed_at', 'acceptance_reason', 'acceptance_rationale', 'acceptance_expires_at',
        'compensating_controls', 'closure_reason', 'closure_note', 'governance_context', 'related_task_ids'},
    'policies': {'title', 'description', 'status', 'owner_id', 'version', 'presence', 'notes', 'content',
        'approval_history', 'decision_history', 'approval_request', 'approval_subject', 'approval_authority',
        'approval_basis', 'approved_at', 'verified_at', 'review_id', 'next_review_date', 'governance_context'},
    'evidence': {'filename', 'display_name', 'evidence_type', 'evidence_date', 'effective_date', 'expiration_date',
        'refresh_date', 'notes', 'relationships', 'archived_at', 'linked_type', 'linked_id', 'content_base64'},
    'clients': {'framework_settings', 'onboarding_baseline', 'iso_audit_program'},
    'requirements': {'baseline_response', 'baseline_key', 'applicability', 'status', 'effective_date'},
}
SAFE_ENUMS = {
    'status': {'not_assessed', 'not_addressed', 'in_progress', 'addressed', 'not_applicable', 'open', 'closed',
        'identified', 'assessed', 'accepted', 'retired', 'active', 'inactive', 'draft', 'approved', 'in_review',
        'rejected', 'completed', 'cancelled', 'upcoming', 'scheduled', 'overdue', 'in_remediation',
        'remediated', 'pending_validation', 'validated', 'done', 'needs_verification',
        'needs_creation', 'needs_review', 'needs_scheduling', 'under_review'},
    'severity': {'low', 'medium', 'high', 'critical', 'info'},
    'risk_level': {'low', 'medium', 'high', 'critical'},
    'verification': {'not_verified', 'verified', 'in_progress', 'failed'},
    'design': {'not_assessed', 'adequate', 'gap'},
    'operating': {'not_assessed', 'effective', 'gap'},
    'soa_applicability': {'included', 'excluded', 'applicable', 'not_applicable', 'undetermined'},
    'baseline_response': {'applies', 'does_not_apply', 'unsure', 'not_assessed', 'retired'},
    'applicability': {'applies', 'does_not_apply', 'unsure', 'not_assessed', 'applicable', 'not_applicable', 'needs_review'},
    'presence': {'reported_missing', 'confirmed_present', 'reported_present', 'unknown',
        'reported_existing', 'verified_existing', 'not_applicable', 'needs_confirmation'},
}
NUMERIC = {'likelihood_score': (1, 5), 'impact_score': (1, 5), 'risk_score': (1, 25),
           'implementation_group': (1, 3)}
CATEGORIES = {'security', 'availability', 'processing_integrity', 'confidentiality', 'privacy'}
AUDIT_ACTIONS = {
    'framework_assessments': {'Framework assessment updated', 'Framework record linked', 'Framework Evidence unlinked'},
    'organizational_controls': {'Control created', 'Control updated', 'Control observation recorded'},
    'reviews': {'Review started', 'Review completed', 'Review configuration changed', 'Audit work updated'},
    'findings': {'create', 'delete', 'validate', 'accept', 'Finding raised', 'Finding accepted',
        'Finding validated', 'Finding reopened', 'Finding moved to Pending Validation',
        'Finding moved to In Remediation', 'Finding returned to Open; its remediation Action Item was deleted'},
    'risks': {'Risk created', 'Risk reassessed', 'Risk owner assigned', 'Treatment updated',
        'Next Risk Review scheduled', 'Risk updated', 'Risk accepted', 'Risk closed', 'accept', 'close'},
    'policies': {'create', 'update', 'delete', 'policy-basis', 'policy-authority', 'submit-review',
        'withdraw-submission', 'approve', 'reject', 'verify', 'retire'},
    'evidence': {'upload', 'delete', 'archive', 'Evidence metadata changed',
        'Evidence relationship added', 'Evidence relationship removed'},
    'clients': {'CIS scope updated', 'SOC 2 readiness scope updated', 'program-applicability-updated',
        'onboarding-complete', 'ISO audit program activated'},
    'requirements': {'program-applicability-updated'},
}


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), default=str).encode()).hexdigest()


def _time(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
        if not isinstance(parsed, datetime) or parsed.tzinfo is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, 'An ISO timestamp with a timezone is required')


def _iso(value):
    return _time(value).isoformat(timespec='microseconds')


def _text(value, limit=200):
    return re.sub(r'[\x00-\x1f\x7f]', '', value)[:limit] if isinstance(value, str) else ''


def _values(record):
    """Copy enumerated conclusions/counts only, never arbitrary source text."""
    result = {}
    for field, allowed in SAFE_ENUMS.items():
        value = record.get(field)
        if value is None or isinstance(value, str) and value in allowed:
            if field in record:
                result[field] = value
    for field, (lower, upper) in NUMERIC.items():
        value = record.get(field)
        if field in record and (value is None or type(value) is int and lower <= value <= upper):
            result[field] = value
    categories = record.get('categories')
    if isinstance(categories, list) and all(isinstance(value, str) and value in CATEGORIES for value in categories):
        result['categories'] = sorted(set(categories))
    return result


def _scope(record):
    """Only program configuration/applicability changes are Scope activity."""
    result = {key: record.get(key) for key in ('baseline_key', 'baseline_response', 'applicability', 'status')
              if key in record}
    result['framework_settings'] = record.get('framework_settings', {})
    baseline = record.get('onboarding_baseline') or {}
    result['programs'] = baseline.get('requirements', {})
    result['completed'] = baseline.get('completed')
    result['iso_audit_program'] = record.get('iso_audit_program')
    return result


def _base(kind, entity_id, client_id, user, at, action, identity):
    return {'event_id': identity, 'client_id': client_id, 'source_kind': kind, 'source_id': entity_id,
            'at': _iso(at), 'type': SOURCES[kind][1], 'title': _text(action, 160),
            'description': f'{SOURCES[kind][2]} changed.',
            'actor': {'id': user.get('user_id'), 'name': _text(user.get('name') or user.get('user_name')) or
                      ('System' if user.get('system') is True else 'Unknown actor')},
            'provenance': 'committed_source'}


def _generic_program_label(key):
    # The native CIS record namespace does not establish its historical IG.
    if key in {'cis-ig1', 'cis-ig2', 'cis-ig3'}:
        return 'CIS Controls'
    return next((_text(program['label']) for program in FRAMEWORKS if program['key'] == key), None)


def project_committed_change(entity_type, entity_id, client_id, user, before, after, at, action='update'):
    """Return an envelope for the writer's *atomic* pending map, or None for a no-op.

    Calling this helper does not establish commitment. Persist it with the source
    change, never before a failed or still-uncommitted operation.
    """
    kind = ALIASES.get(entity_type)
    if not kind or not entity_id or not client_id:
        return None
    before, after = before or {}, after or {}
    if any(row.get('client_id') not in (None, client_id) for row in (before, after)):
        raise ValueError('Activity source must belong to the committed client')
    changed = sorted(field for field in BUSINESS_FIELDS[kind] if before.get(field) != after.get(field))
    if kind == 'clients' and _scope(before) == _scope(after):
        changed = []
    if before and after and not changed and action != 'record_assessment':
        return None
    if not before and not after:
        return None
    operation = 'created' if not before else 'removed' if not after else 'recorded' if action == 'record_assessment' else 'updated'
    title = f'{SOURCES[kind][2]} {operation}'
    if kind == 'reviews':
        title = {'start_review': 'Review started', 'complete_review': 'Review completed',
                 'amend_review': 'Review amended'}.get(action, title)
    # A timestamp is not a revision: distinct changes can share its resolution.
    # Hash the authoritative business values without persisting free-text data.
    fingerprint = _digest({field: [before.get(field), after.get(field)] for field in BUSINESS_FIELDS[kind]})
    identity = _digest(['source', kind, entity_id, client_id, _iso(at), action, changed, fingerprint])
    event = _base(kind, entity_id, client_id, user, at, title, identity)
    event['changed_fields'] = changed
    event['description'] = f'{SOURCES[kind][2]} {operation}.'
    previous, current = _values(before), _values(after)
    if kind == 'clients':
        old_settings, new_settings = before.get('framework_settings') or {}, after.get('framework_settings') or {}
        previous = {key: _values(value) for key, value in old_settings.items() if isinstance(value, dict)}
        current = {key: _values(value) for key, value in new_settings.items() if isinstance(value, dict)}
        previous = {key: value for key, value in previous.items() if value and re.fullmatch(r'[a-z0-9-]{1,80}', key)}
        current = {key: value for key, value in current.items() if value and re.fullmatch(r'[a-z0-9-]{1,80}', key)}
        for original, target in ((before, previous), (after, current)):
            baseline = original.get('onboarding_baseline') or {}
            programs = baseline.get('requirements') or {}
            target['programs'] = {key: value for key, value in programs.items()
                if isinstance(key, str) and re.fullmatch(r'[a-z0-9-]{1,80}', key)
                and isinstance(value, str) and value in SAFE_ENUMS['baseline_response']}
            if isinstance(baseline.get('completed'), bool):
                target['baseline_completed'] = baseline['completed']
    if previous:
        event['before'] = previous
    if current:
        event['after'] = current
    if kind == 'requirements':
        program = after.get('baseline_key') or before.get('baseline_key')
        if isinstance(program, str) and re.fullmatch(r'[a-z0-9-]{1,80}', program):
            event['program_keys'] = [program]
    elif kind == 'clients':
        keys = set()
        for field in ('framework_settings',):
            old, new = before.get(field) or {}, after.get(field) or {}
            keys.update(key for key in old.keys() | new.keys() if old.get(key) != new.get(key))
        old = (before.get('onboarding_baseline') or {}).get('requirements') or {}
        new = (after.get('onboarding_baseline') or {}).get('requirements') or {}
        keys.update(key for key in old.keys() | new.keys() if old.get(key) != new.get(key))
        if before.get('iso_audit_program') != after.get('iso_audit_program'):
            keys.add('iso-27001')
        event['program_keys'] = sorted(key for key in keys if isinstance(key, str) and re.fullmatch(r'[a-z0-9-]{1,80}', key))
    if kind == 'framework_assessments':
        program = after.get('_portfolio_program_key') or after.get('framework_key') or before.get('framework_key')
        if isinstance(program, str) and re.fullmatch(r'[a-z0-9-]{1,80}', program):
            event['program_key'] = program
            event['program_label'] = (_text(after.get('_portfolio_program_label')) if after.get('_portfolio_program_key')
                                      else '') or _generic_program_label(program)
            event['program_keys'] = [after.get('framework_key') or before.get('framework_key') or program]
        if (any(field in changed for field in ('soa_applicability', 'addressable_decision'))
                or before.get('status') != after.get('status') and 'not_applicable' in (before.get('status'), after.get('status'))
                or 'na_rationale' in changed and 'not_applicable' in (before.get('status'), after.get('status'))):
            event['scope_changed'] = True
    return event


def project_audit(document):
    """Use only success receipts with explicit known business meaning."""
    kind, action = ALIASES.get(document.get('entity_type')), document.get('action')
    meta = document.get('meta') or {}
    if not kind or action not in AUDIT_ACTIONS[kind] or document.get('outcome', 'success') != 'success':
        return None
    if meta.get('_portfolio_activity_event_id') or meta.get('_portfolio_activity_noop'):
        return None
    if action == 'program-applicability-updated' and meta.get('previous_status') == meta.get('applicability'):
        return None
    if kind == 'framework_assessments' and action in {'Framework record linked', 'Framework Evidence unlinked'} and meta.get('kind') == 'evidence':
        return None
    # This mirror historically logged incoming fields even on same-value saves.
    # Its fields alone cannot prove a committed change; atomic events can.
    if action == 'Review configuration changed' and not meta.get('changed_fields'):
        return None
    fields = meta.get('changed_fields', meta.get('fields'))
    if fields is not None and (not isinstance(fields, list) or not any(
            isinstance(field, str) and field in BUSINESS_FIELDS[kind] for field in fields)):
        return None
    if action in {'update', 'Risk updated', 'Risk owner assigned', 'Treatment updated', 'Next Risk Review scheduled'} and fields is None:
        return None
    if not document.get('client_id') or not document.get('entity_id'):
        return None
    identity = document.get('log_id') or str(document.get('_id') or '')
    if not identity:
        return None
    try:
        event = _base(kind, document['entity_id'], document['client_id'],
            {'user_id': document.get('user_id'), 'user_name': document.get('user_name')},
            document.get('at'), action, _digest(['audit', identity]))
    except HTTPException:
        return None
    event['provenance'] = 'retained_audit_partial'
    program = ('cis-ig1' if action == 'CIS scope updated' else 'soc-2' if action == 'SOC 2 readiness scope updated'
               else 'iso-27001' if action == 'ISO audit program activated' else meta.get('program'))
    if kind in {'clients', 'requirements'} and isinstance(program, str) and re.fullmatch(r'[a-z0-9-]{1,80}', program):
        event['program_keys'] = [program]
    if kind == 'framework_assessments' and fields and (
            'soa_applicability' in fields or 'addressable_decision' in fields or meta.get('status') == 'not_applicable'):
        event['scope_changed'] = True
    if fields:
        event['changed_fields'] = sorted({field for field in fields if field in BUSINESS_FIELDS[kind]})
    # These historical before/after facts were recorded with the committed audit.
    if kind == 'risks':
        previous = _values({'risk_score': meta.get('previous_score')}) if 'previous_score' in meta else {}
        current = _values({'risk_score': meta.get('score')}) if 'score' in meta else {}
    elif action == 'CIS scope updated':
        previous, current = _values({'implementation_group': meta.get('before')}), _values({'implementation_group': meta.get('after')})
    elif action == 'program-applicability-updated':
        previous, current = _values({'baseline_response': meta.get('previous_status')}), _values({'baseline_response': meta.get('applicability')})
    else:
        previous, current = {}, {}
    if previous:
        event['before'] = previous
    if current:
        event['after'] = current
    return event


async def persist_event(db, event):
    if event is None:
        return False
    result = await db.portfolio_events.update_one({'_id': event['event_id']}, {'$setOnInsert': event}, upsert=True)
    return result.upserted_id is not None


async def reconcile_pending(db, limit=500):
    if type(limit) is not int or not 1 <= limit <= 2000:
        raise ValueError('Activity reconciliation limit must be 1 to 2000')
    processed, inserted = 0, 0
    for kind, (key, _type, _label) in SOURCES.items():
        if processed >= limit:
            break
        rows = db[kind].find({'_portfolio_activity_pending': {'$exists': True, '$ne': {}}},
                            {key: 1, 'client_id': 1, '_portfolio_activity_pending': 1}).limit(limit - processed)
        async for row in rows:
            pending = row.get('_portfolio_activity_pending') or {}
            for identity, event in pending.items():
                if processed >= limit:
                    break
                if (not re.fullmatch(r'[a-f0-9]{64}', identity) or event.get('event_id') != identity
                        or event.get('client_id') != row.get('client_id') or event.get('source_kind') != kind
                        or event.get('source_id') != row.get(key)):
                    raise ValueError('Invalid activity source marker')
                inserted += await persist_event(db, event)
                await db[kind].update_one({key: row[key], 'client_id': row['client_id'],
                    '_portfolio_activity_pending.' + identity: event},
                    {'$unset': {'_portfolio_activity_pending.' + identity: ''}})
                await db[kind].update_one({key: row[key], 'client_id': row['client_id'], '_portfolio_activity_pending': {}},
                                         {'$unset': {'_portfolio_activity_pending': ''}})
                processed += 1
    return {'processed': processed, 'inserted': inserted}


async def reconcile(db, limit=500):
    """Restartable projection catch-up, including late repaired old audit receipts."""
    pending = await reconcile_pending(db, limit)
    now = datetime.now(timezone.utc)
    # Reports support at most 90 days; join derived acknowledgements on the server
    # so each batch downloads only unprocessed receipts, including late repairs.
    logs = await db.audit_logs.aggregate([
        {'$match': {'client_id': {'$type': 'string'}, 'at': {'$gte': (now - timedelta(days=91)).isoformat(),
                                                        '$lte': now.isoformat()}}},
        {'$sort': {'at': 1, 'log_id': 1}},
        {'$addFields': {'_activity_receipt_id': {'$ifNull': ['$log_id', {'$toString': '$_id'}]}}},
        {'$lookup': {'from': 'portfolio_activity_receipts', 'localField': '_activity_receipt_id',
                     'foreignField': '_id', 'as': '_activity_seen'}},
        {'$match': {'_activity_seen': {'$size': 0}}}, {'$limit': limit},
    ]).to_list(limit)
    inserted = 0
    for document in logs:
        event = project_audit(document)
        if event:
            inserted += await persist_event(db, event)
        await db.portfolio_activity_receipts.update_one({'_id': document['_activity_receipt_id']},
            {'$setOnInsert': {'processed_at': now.isoformat()}}, upsert=True)
    await db.portfolio_reporting_state.update_one({'_id': 'activity'}, {'$set': {
        'last_captured_at': now.isoformat(), 'historical_coverage': 'partial',
        'audit_batch_complete': len(logs) < limit, 'pending_batch_complete': pending['processed'] < limit}}, upsert=True)
    return {'pending': pending, 'audits_processed': len(logs), 'inserted': inserted}


def _request(user, clients, as_of, days, change_type, limit):
    if authorization.role_of(user) not in {authorization.OWNER, authorization.PROVIDER}:
        raise HTTPException(403, 'Portfolio activity is restricted to internal administrators')
    if days not in (7, 30, 90) or type(days) is not int:
        raise HTTPException(422, 'Activity range must be 7, 30, or 90 days')
    if change_type not in (None, '', *TYPES):
        raise HTTPException(422, 'Unsupported activity type')
    if type(limit) is not int or not 1 <= limit <= 100:
        raise HTTPException(422, 'Activity page size must be 1 to 100')
    identifiers = sorted({row['client_id'] for row in clients})
    if any(not authorization.can_access(user, cid) for cid in identifiers):
        raise HTTPException(403, 'Forbidden for this client')
    cutoff = _time(as_of)
    scope = _digest([user.get('user_id'), authorization.role_of(user), user.get('all_clients'),
        sorted(user.get('client_ids') or []), identifiers, days, change_type or None])
    return identifiers, cutoff, scope


def _cursor(value, scope, cutoff, days):
    if not value:
        return cutoff, None
    try:
        if not isinstance(value, str) or len(value) > 2048 or not re.fullmatch(r'[A-Za-z0-9_-]+', value):
            raise ValueError()
        data = json.loads(base64.urlsafe_b64decode(value + '=' * (-len(value) % 4)))
        if set(data) != {'scope', 'as_of', 'at', 'event_id'} or data['scope'] != scope:
            raise ValueError()
        frozen, at = _time(data['as_of']), _time(data['at'])
        if frozen > cutoff or not frozen - timedelta(days=days) <= at <= frozen:
            raise ValueError()
        if not isinstance(data['event_id'], str) or not re.fullmatch(r'[a-f0-9]{64}', data['event_id']):
            raise ValueError()
        return frozen, {'at': _iso(at), 'event_id': data['event_id']}
    except (ValueError, TypeError, KeyError, UnicodeError, HTTPException):
        raise HTTPException(422, 'Invalid activity cursor')


def _pipeline(kind, identifiers, cutoff, days, change_type, cursor=None):
    key = SOURCES[kind][0]
    query = {'client_id': {'$in': identifiers}, 'source_kind': kind,
             'at': {'$gte': _iso(cutoff - timedelta(days=days)), '$lte': _iso(cutoff)}}
    if change_type:
        query['type'] = change_type
    if cursor:
        query['$or'] = [{'at': {'$lt': cursor['at']}}, {'at': cursor['at'], 'event_id': {'$lt': cursor['event_id']}}]
    return [
        {'$match': query},
        {'$lookup': {'from': kind, 'localField': 'source_id', 'foreignField': key, 'as': '_source'}},
        # Existing reads authorize the source's current tenant. Missing/deleted
        # targets remain generic events; a target in another tenant is denied.
        {'$match': {'$expr': {'$eq': [{'$size': '$_source'}, {'$size': {'$filter': {
            'input': '$_source', 'as': 'target',
            'cond': {'$eq': [{'$ifNull': ['$$target.client_id', None]}, '$client_id']},
        }}}]}}},
        {'$project': {'event_id': 1, 'client_id': 1, 'source_kind': 1, 'source_id': 1,
            'at': 1, 'type': 1, 'title': 1, 'description': 1, 'actor': 1,
            'provenance': 1, 'before': 1, 'after': 1, 'program_key': 1, 'program_label': 1,
            '_source.client_id': 1, '_source.archived_at': 1, '_source.archived': 1,
            '_source.status': 1, '_source.framework_key': 1}},
    ]


def _destination(event):
    kind, entity_id, cid = event['source_kind'], event['source_id'], event['client_id']
    if kind == 'framework_assessments':
        key = ((event.get('_source') or [{}])[0]).get('framework_key') or event.get('program_key')
        return '/compliance/' + quote(key, safe='') + '?' + urlencode({'assessment': entity_id, 'client_id': cid}) if key else None
    if kind == 'clients':
        return '/client-profile?' + urlencode({'client_id': cid})
    if kind == 'organizational_controls':
        return '/compliance/soc-2?' + urlencode({'client_id': cid})
    return '/' + kind + '?' + urlencode({'id': entity_id, 'client_id': cid})


def _public(event, clients):
    source = next((row for row in event.get('_source', []) if row.get('client_id') == event['client_id']), None)
    archived = bool(source and (source.get('archived_at') or source.get('archived') or source.get('status') == 'archived'))
    available = bool(source) and not archived
    result = {field: event[field] for field in ('event_id', 'client_id', 'at', 'type', 'title', 'description', 'actor', 'provenance')}
    result['client_name'] = _text(clients[event['client_id']].get('name'))
    result['source'] = {'entity_type': event['source_kind'], 'entity_id': event['source_id'],
                        'available': available, 'to': _destination(event) if available else None}
    if event.get('program_key'):
        result['program_key'] = event['program_key']
    program_label = event.get('program_label') or _generic_program_label(event.get('program_key'))
    if not program_label and source and event['source_kind'] == 'framework_assessments':
        program_label = _generic_program_label(source.get('framework_key'))
    if program_label:
        result['program_label'] = program_label
    if available:
        if event['source_kind'] == 'framework_assessments':
            result['source']['framework_key'] = source.get('framework_key')
        for field in ('before', 'after'):
            if field in event:
                result[field] = event[field]
    else:
        result['note'] = 'Source record is archived.' if archived else 'Source record is no longer available.'
    return result


async def read_activity(db, user, clients, as_of, days=7, change_type=None, cursor=None, limit=50):
    identifiers, cutoff, scope = _request(user, clients, as_of, days, change_type, limit)
    cutoff, position = _cursor(cursor, scope, cutoff, days)
    rows, total, earliest = [], 0, None
    for kind, (_key, category, _label) in SOURCES.items():
        if change_type and category != change_type:
            continue
        population = _pipeline(kind, identifiers, cutoff, days, change_type)
        position_query = {'$or': [{'at': {'$lt': position['at']}},
            {'at': position['at'], 'event_id': {'$lt': position['event_id']}}]} if position else {}
        result = await db.portfolio_events.aggregate(population + [{'$facet': {
            'total': [{'$count': 'total'}],
            'first': [{'$sort': {'at': 1}}, {'$limit': 1}, {'$project': {'at': 1}}],
            'events': [{'$match': position_query}, {'$sort': {'at': -1, 'event_id': -1}}, {'$limit': limit + 1}],
        }}]).to_list(1)
        batch = result[0]
        total += batch['total'][0]['total'] if batch['total'] else 0
        first = batch['first']
        if first and (earliest is None or first[0]['at'] < earliest):
            earliest = first[0]['at']
        rows.extend(batch['events'])
    rows.sort(key=lambda row: (row['at'], row['event_id']), reverse=True)
    more, rows = len(rows) > limit, rows[:limit]
    next_cursor = None
    if more and rows:
        data = {'scope': scope, 'as_of': _iso(cutoff), 'at': rows[-1]['at'], 'event_id': rows[-1]['event_id']}
        next_cursor = base64.urlsafe_b64encode(json.dumps(data, separators=(',', ':')).encode()).decode().rstrip('=')
    state = await db.portfolio_reporting_state.find_one({'_id': 'activity'}, {'_id': 0}) or {}
    return {'events': [_public(row, {c['client_id']: c for c in clients}) for row in rows], 'total': total,
        'next_cursor': next_cursor, 'as_of': _iso(cutoff), 'period_start': _iso(cutoff - timedelta(days=days)),
        'coverage': {'status': 'partial', 'first_event_at': earliest,
            'last_captured_at': state.get('last_captured_at'),
            'catch_up_complete': bool(state.get('audit_batch_complete') and state.get('pending_batch_complete')),
            'note': 'Retained business activity coverage is partial. Genuine committed changes are captured going forward.'}}


async def count_activity(db, user, clients, as_of, days=7, change_type=None):
    identifiers, cutoff, _scope = _request(user, clients, as_of, days, change_type, 1)
    total = 0
    for kind, (_key, category, _label) in SOURCES.items():
        if change_type and category != change_type:
            continue
        counted = await db.portfolio_events.aggregate(_pipeline(kind, identifiers, cutoff, days, change_type) +
                                                        [{'$count': 'total'}]).to_list(1)
        total += counted[0]['total'] if counted else 0
    return total
