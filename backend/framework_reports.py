"""Fixed, tenant-authorized PDF snapshots of saved native framework assessments."""
import calendar
import hashlib
import json
import logging
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pymongo.errors import PyMongoError
from pymongo.read_concern import ReadConcern
from starlette.concurrency import run_in_threadpool

import authorization
from framework_catalog import CATALOGS, active_definitions, client_configuration
from framework_governance import STATUSES
from framework_summary import progress

LOG = logging.getLogger(__name__)
REPORT_KEYS = ('cis-ig1', 'soc-2', 'iso-27001')
ASSESSMENT_FIELDS = ('framework_assessment_id', 'client_id', 'framework_key', 'definition_id',
    'framework_version', 'status', 'implementation', 'verification', 'last_assessed', 'last_saved',
    'assessment_recorded_at', 'assessment_recorded_by', 'verified_at', 'verification_notes',
    'guided_assessment_source',
    'created_at', 'assessment_history.at', 'assessment_history.status', 'assessment_history.soa_applicability',
    'related_links', 'unlinked_evidence_ids', 'na_rationale',
    'soa_applicability', 'soa_justification', 'items_to_address', 'items_revision', 'notes')
CLIENT_FIELDS = ('client_id', 'name', 'status', 'onboarding_baseline', 'framework_settings',
    'cis_configuration_updated_at', 'soc_configuration_updated_at', 'cis_scope_change',
    'timezone', 'time_zone', 'iso_scope', 'isms_scope')
ACTOR_FIELDS = ('user_id', 'role', 'client_ids', 'all_clients', 'status', 'password_change_required',
    'password_changed_at', 'sessions_revoked_at')


def projection(fields):
    return {'_id': 0, **dict.fromkeys(fields, 1)}


def require_access(user, cid):
    if user.get('status') != 'active' or user.get('password_change_required'):
        raise HTTPException(403, 'Account unavailable for report export')
    authorization.scope(user, cid)


def labels(key):
    result = {'not_assessed': 'Not Assessed', 'in_progress': 'Partially Implemented',
              'addressed': 'Implemented', 'needs_attention': 'Not Implemented',
              'not_applicable': 'Not Applicable'}
    if key == 'soc-2':
        result.update(in_progress='Partially Addressed', addressed='Addressed (Readiness)',
                      needs_attention='Needs Remediation / Validation')
    elif key == 'iso-27001':
        result['needs_attention'] = 'Not Implemented / Needs Validation'
    return result


def framework_option(key, client):
    catalog, config = CATALOGS[key], client_configuration(key, client)
    if key == 'cis-ig1':
        group = config['implementation_group']
        scope = f'Cumulative IG{group} safeguards'
        name, units, groups = f'CIS IG{group}', 'safeguards', 'Controls'
    elif key == 'soc-2':
        scope = ', '.join(catalog['categories'][c] for c in config['categories'])
        if config.get('system_description'):
            scope += '. System: ' + config['system_description']
        else:
            scope += '. System description not recorded'
        if config.get('period_start') and config.get('period_end'):
            scope += f". Recorded evidence period: {config['period_start']} to {config['period_end']}"
        else:
            scope += '. Evidence period not recorded'
        name, units, groups = 'SOC 2', 'criteria', 'Criteria groups'
    else:
        scope = client.get('isms_scope') or client.get('iso_scope') or 'ISMS scope not recorded; clauses 4–10 and Annex A / Statement of Applicability'
        name, units, groups = 'ISO/IEC 27001', 'requirements and controls', 'Sections and domains'
    return {'key': key, 'name': name, 'version': catalog['version'], 'scope': scope,
            'unit_name': units, 'group_name': groups}


def enabled_options(client, programs):
    if not client.get('onboarding_baseline', {}).get('completed'):
        return []
    return [framework_option(key, client) for key in REPORT_KEYS if key in programs]


def parse_time(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def report_zone(client):
    name = client.get('timezone') or client.get('time_zone')
    if not name:
        return timezone.utc, 'UTC'
    try:
        return ZoneInfo(name), name
    except (ValueError, ZoneInfoNotFoundError):
        raise HTTPException(409, 'The saved client timezone is invalid; correct it before generating a report')


def local_time(value, zone):
    parsed = parse_time(value)
    if parsed and isinstance(value, str) and len(value) == 10:
        return value
    return parsed.astimezone(zone).isoformat() if parsed else None


def period_start(now, period):
    if period == '30d':
        return now - timedelta(days=30)
    month = now.year * 12 + now.month - 1 - (6 if period == '6m' else 12)
    return now.replace(year=month // 12, month=month % 12 + 1,
                       day=min(now.day, calendar.monthrange(month // 12, month % 12 + 1)[1]))


def distribution(rows):
    counts = Counter(row.get('status') for row in rows)
    return {status: counts[status] for status in STATUSES}


def applicable(row):
    return row.get('soa_applicability') != 'excluded' if row.get('specification') == 'annex_control' else row.get('status') != 'not_applicable'


def metrics(rows):
    included = [row for row in rows if applicable(row)]
    count = distribution(included)
    assessed = len(included) - count['not_assessed']
    return {'total': len(rows), 'applicable_total': len(included), 'assessed': assessed,
            'not_assessed': count['not_assessed'], 'not_applicable': len(rows) - len(included),
            'status_counts': distribution(rows), 'applicable_status_counts': count, 'implementation_percent':
                int(count['addressed'] / len(included) * 100 + .5) if included else 0,
            'coverage_percent': int(assessed / len(included) * 100 + .5) if included else 0,
            'verification_counts': dict(Counter(row.get('verification') or 'not_verified' for row in rows))}


def native_metrics(rows, key):
    result = {'assessment_progress': progress(rows, key)}
    if key == 'iso-27001':
        clauses = [r for r in rows if r['specification'] == 'isms_clause']
        annex = [r for r in rows if r['specification'] == 'annex_control']
        included = [r for r in annex if r.get('soa_applicability') == 'included']
        excluded = sum(r.get('soa_applicability') == 'excluded' for r in annex)
        result.update(clauses={'total': len(clauses), 'status_counts': distribution(clauses)},
            soa={'total': len(annex), 'included': len(included), 'excluded': excluded,
                 'undetermined': len(annex) - len(included) - excluded},
            included_annex={'total': len(included), 'status_counts': distribution(included)})
    return result


def history_trend(rows, client, key, now, period, zone):
    """Only aggregate dates for which every active record has an explicit saved state."""
    start = period_start(now.astimezone(zone), period).astimezone(timezone.utc)
    histories = []
    observations = {}
    usable = 0
    recorded_dates = []
    baseline_at = None
    incomplete_applicability = False
    for row in rows:
        events = []
        for raw in row.get('assessment_history') or []:
            at = parse_time(raw.get('at'))
            if at and at <= now and raw.get('status') in STATUSES:
                events.append((at, raw))
                recorded_dates.append(at)
                if start <= at <= now:
                    if key == 'iso-27001' and row['specification'] == 'annex_control' and 'soa_applicability' not in raw:
                        incomplete_applicability = True
                    bucket = at.astimezone(zone).strftime('%Y-%m-%d' if period == '30d' else '%Y-%m')
                    observations[bucket] = max(at, observations.get(bucket, at))
                elif at < start:
                    baseline_at = max(at, baseline_at or at)
        events.sort(key=lambda value: value[0])
        # A missing/latest mismatched status is incomplete history, never today's state backdated.
        if events and events[-1][1]['status'] == row['status']:
            histories.append((row, events))
            usable += 1
        else:
            histories.append((row, []))
    scope_changes = []
    change = client.get('cis_scope_change') if key == 'cis-ig1' else None
    change_at = parse_time((change or {}).get('updated_at'))
    if change and change_at and start <= change_at <= now:
        scope_changes.append(f"CIS scope changed from IG{change['before']} to IG{change['after']} at {change_at.astimezone(zone).isoformat()}; earlier totals are not compared.")
    config_at = parse_time(client.get('soc_configuration_updated_at') if key == 'soc-2' else client.get('cis_configuration_updated_at'))
    if key == 'soc-2' and config_at and start <= config_at <= now:
        scope_changes.append(f'SOC 2 configuration changed at {config_at.astimezone(zone).isoformat()}; prior category/system scope is not fully recorded for comparison.')
    candidates = sorted(set(observations.values()) | ({baseline_at} if baseline_at else set()))
    points = []
    for at in candidates:
        if config_at and at < config_at:
            continue
        selected = []
        for row, events in histories:
            event = next((raw for when, raw in reversed(events) if when <= at), None)
            if event is None:
                break
            if key == 'iso-27001' and row['specification'] == 'annex_control' and 'soa_applicability' not in event:
                break
            selected.append({**event, 'definition_id': row['definition_id'], 'specification': row.get('specification')})
        if len(selected) == len(rows) and selected:
            values = metrics(selected)
            points.append({'date': at.astimezone(zone).isoformat(), 'total': len(rows),
                'known_count': len(rows), 'coverage': 100, 'status_counts': values['status_counts'],
                'applicable_total': values['applicable_total'], 'implementation_percent': values['implementation_percent'],
                'scope': framework_option(key, client)['scope'], 'comparison_baseline': at < start,
                'scope_fingerprint': hashlib.sha256(json.dumps(sorted(r['definition_id'] for r in selected if applicable(r))).encode()).hexdigest()})
    if points:
        values = metrics(rows)
        points.append({'date': now.astimezone(zone).isoformat(), 'total': len(rows), 'known_count': len(rows),
            'coverage': 100, 'status_counts': values['status_counts'], 'applicable_total': values['applicable_total'],
            'implementation_percent': values['implementation_percent'], 'scope': framework_option(key, client)['scope'],
            'comparison_baseline': False, 'current_snapshot': True,
            'scope_fingerprint': hashlib.sha256(json.dumps(sorted(r['definition_id'] for r in rows if applicable(r))).encode()).hexdigest()})
    denominators = {point['applicable_total'] for point in points}
    scope_fingerprints = {point['scope_fingerprint'] for point in points}
    if len(denominators) > 1:
        scope_changes.append('Recorded applicability changed the implementation denominator between observations; percentages are not a like-for-like comparison.')
    elif len(scope_fingerprints) > 1:
        scope_changes.append('Recorded applicability changed which assessment units were included, despite an unchanged denominator; observations are not a like-for-like comparison.')
    if incomplete_applicability:
        scope_changes.append('Some historical Annex A applicability decisions were not recorded; complete like-for-like history is unavailable.')
    state = 'available' if points and parse_time(points[0]['date']) <= start and not incomplete_applicability else 'partial' if points or recorded_dates else 'unavailable'
    message = ('No saved assessment history is available; current assessments are reported below.' if not recorded_dates else
        f'{usable} of {len(rows)} current assessment records have matching saved history. Only complete known program observations are shown; missing periods are not interpolated.')
    if recorded_dates:
        message += f" Recorded events span {min(recorded_dates).astimezone(zone).isoformat()} to {max(recorded_dates).astimezone(zone).isoformat()}."
        message += ' The latest recorded date per calendar ' + ('day' if period == '30d' else 'month') + ' is evaluated; only complete known program observations are shown.'
        if points and points[0].get('comparison_baseline'):
            message += ' The comparison baseline retains its actual recorded date before the selected period.'
    if scope_changes:
        message += ' Scope/configuration changes limit comparisons.'
    return {'period': period, 'start': start.astimezone(zone).isoformat(), 'end': now.astimezone(zone).isoformat(),
            'state': state, 'message': message, 'observations': points, 'scope_changes': scope_changes,
            'comparable': bool(points) and len(scope_fingerprints) == 1 and not incomplete_applicability}


def build_snapshot(client, key, saved, evidence, findings, now, period, read_window, logical_position, reviews=()):
    config = client_configuration(key, client)
    definitions = active_definitions(key, config)
    allowed = {d['id'] for d in definitions}
    by_id = {}
    for row in saved:
        if row['definition_id'] not in allowed:
            continue
        if row['definition_id'] in by_id:
            raise HTTPException(409, 'Duplicate native assessments exist; resolve program initialization before reporting')
        if row.get('framework_version') != CATALOGS[key]['version']:
            raise HTTPException(409, 'Saved framework versions do not match the active catalog; review program initialization')
        if row.get('status') not in STATUSES:
            raise HTTPException(409, 'An assessment has an unsupported saved status; review it before reporting')
        by_id[row['definition_id']] = row
    if set(by_id) != allowed:
        raise HTTPException(409, 'Framework initialization is incomplete; finish enabling the program before generating its report')
    rows = [{**definition, **by_id[definition['id']]} for definition in definitions]
    zone, zone_label = report_zone(client)
    status_labels = labels(key)
    evidence = [e for e in evidence if e.get('client_id') == client['client_id'] and not e.get('archived_at')]
    ev_by_id = {e['evidence_id']: e for e in evidence}
    finding_ids = {f['finding_id'] for f in findings if f.get('client_id') == client['client_id']}
    groups, details = {}, []
    for row in rows:
        group_id = str(row['control'])
        if key == 'soc-2':
            group_id = row['category'] + '/' + group_id
        title = (f"Control {row['control']} — {row['control_name']}" if key == 'cis-ig1' else
                 f"{row['control']} — {row['control_name']}")
        group = groups.setdefault(group_id, {'id': group_id, 'title': title, 'rows': []})
        group['rows'].append(row)
        aid = row['framework_assessment_id']
        unlinked = set(row.get('unlinked_evidence_ids') or [])
        direct = {r['id'] for r in row.get('related_links') or [] if r.get('kind') == 'evidence'}
        linked_reviews = {r['id'] for r in row.get('related_links') or [] if r.get('kind') == 'reviews'}
        rids = {r['review_id'] for r in reviews if r.get('client_id') == client['client_id'] and (
            r['review_id'] in linked_reviews or r.get('framework_assessment_id') == aid or
            r.get('framework_key') == key and row['definition_id'] in (r.get('framework_safeguards') or []))}
        refs = [e for e in evidence if e.get('client_id') == client['client_id'] and (
            e['evidence_id'] in direct or e.get('linked_type') in ('framework_assessment', 'framework_assessments') and e.get('linked_id') == aid or
            any(r.get('kind') == 'framework_assessments' and r.get('id') == aid for r in e.get('relationships') or []) or
            e.get('linked_type') in ('review', 'reviews') and e.get('linked_id') in rids or
            key == 'cis-ig1' and any(r.get('kind') == 'reviews' and r.get('id') in rids for r in e.get('relationships') or [])) and e['evidence_id'] not in unlinked]
        refs = [{'id': e['evidence_id'], 'title': e.get('display_name') or e.get('filename') or 'Evidence reference'} for e in refs if e['evidence_id'] in ev_by_id]
        items = [{**{k: item.get(k) for k in ('item_id', 'question_id', 'kind', 'text', 'state', 'resolution', 'notes', 'created_at', 'updated_at')},
                  'finding_id': item.get('finding_id') if item.get('finding_id') in finding_ids else None}
                 for item in row.get('items_to_address') or [] if item.get('state') in ('open', 'resolved')]
        judgment = row.get('assessment_recorded_at')
        source = row.get('guided_assessment_source') or {}
        basis = 'Saved guided interview summary' if source.get('origin') == 'guided-assessment-pilot' else 'Not recorded'
        legacy_note = 'Legacy assessment date unconfirmed; the native timestamp records a save rather than a confirmed assessment judgment' if row.get('last_assessed') and not judgment else ''
        details.append({'id': row['definition_id'], 'assessment_id': aid, 'title': row['title'],
            'group_id': group_id, 'group_title': title, 'status': row['status'], 'status_label': status_labels[row['status']],
            'current_implementation': row.get('implementation') or '', 'notes': row.get('notes') or '',
            'verification_state': row.get('verification') or 'not_verified', 'last_assessed': local_time(judgment, zone),
            'record_saved_at': local_time(row.get('last_saved') or row.get('last_assessed'), zone),
            'legacy_date_note': legacy_note, 'assessment_basis': basis, 'specification': row.get('specification'),
            'soa_applicability': row.get('soa_applicability'), 'soa_justification': row.get('soa_justification'),
            'na_rationale': row.get('na_rationale'), 'evidence': refs, 'items_to_address': items,
            'items_revision': row.get('items_revision', 0)})
    summary = metrics(rows)
    summary['status_labels'] = status_labels
    summary['native_metrics'] = native_metrics(rows, key)
    summary['denominator_note'] = 'Implementation and assessed coverage use applicable saved assessment units; Not Applicable / excluded units are shown separately. Mixed statuses are not a control-level score.'
    validity = summary['native_metrics']['assessment_progress']
    summary['denominator_note'] += (f" Native assessment resolution records {validity['valid_na']} valid and {validity['invalid_na']} invalid Not Applicable states; invalid exclusions receive no resolution credit. "
        'Saved-state distributions retain all native statuses, including statuses on excluded ISO controls.')
    summary['management_summary'] = (f"{summary['applicable_status_counts']['addressed']} of {summary['applicable_total']} applicable {framework_option(key, client)['unit_name']} are saved as {status_labels['addressed']}. "
        f"{summary['assessed']} applicable units have a recorded status other than Not Assessed; {summary['not_assessed']} remain Not Assessed. "
        f"{summary['not_applicable']} units are Not Applicable or excluded. Saved implementation and separate verification states do not establish independent effectiveness, certification, or an assurance opinion.")
    if key == 'iso-27001':
        native = summary['native_metrics']
        summary['management_summary'] += (f"\n\nISMS clauses: {native['clauses']['total']} requirements, {native['clauses']['status_counts']['addressed']} Implemented. "
            f"Statement of Applicability: {native['soa']['included']} included, {native['soa']['excluded']} excluded, {native['soa']['undetermined']} undetermined. "
            f"Included Annex A controls: {native['included_annex']['status_counts']['addressed']} Implemented of {native['included_annex']['total']}. Undetermined applicability is retained and is not an implementation decision.")
    source = {'client': client, 'key': key, 'catalog_version': CATALOGS[key]['version'], 'assessments': rows,
              'evidence': evidence, 'review_relationships': reviews, 'finding_ids': sorted(finding_ids)}
    source_hash = hashlib.sha256(json.dumps(source, sort_keys=True, ensure_ascii=False, default=str, separators=(',', ':')).encode()).hexdigest()
    dates = [d['last_assessed'] for d in details if d['last_assessed']]
    save_dates = [d['record_saved_at'] for d in details if d['record_saved_at']]
    read_window = tuple(local_time(value, zone) or value for value in read_window)
    return {'client_name': client.get('name') or client['client_id'], 'client_id': client['client_id'],
        'framework': framework_option(key, client), 'generated_at': now.astimezone(zone).isoformat(),
        'snapshot_at': now.astimezone(zone).isoformat(), 'latest_assessment_at': max(dates, key=parse_time, default=None), 'timezone': zone_label,
        'latest_record_saved_at': max(save_dates, key=parse_time, default=None),
        'timezone_note': '' if client.get('timezone') or client.get('time_zone') else 'Client timezone not recorded; UTC is used.',
        'source_hash': source_hash,
        'source_cutoff': f"Consistent MongoDB read snapshot; read window {read_window[0]} to {read_window[1]}; logical read position {logical_position}",
        'summary': summary, 'groups': [{'id': g['id'], 'title': g['title'], 'total': len(g['rows']),
            'status_counts': distribution(g['rows'])} for g in groups.values()], 'assessments': details,
        'trend': history_trend(rows, client, key, now, period, zone)}


async def read_snapshot(s, cid, key, actor, period):
    """Mongo snapshot read concern keeps all source collections at one read timestamp."""
    began = datetime.now(timezone.utc)
    try:
        async with await s.db.client.start_session() as session:
            async with session.start_transaction(read_concern=ReadConcern('snapshot')):
                current = await s.db.users.find_one({'user_id': actor['user_id']}, projection(ACTOR_FIELDS), session=session)
                if not current:
                    raise HTTPException(403, 'Account unavailable for report export')
                require_access(current, cid)
                if any(current.get(k) != actor.get(k) for k in ('password_changed_at', 'sessions_revoked_at')):
                    raise HTTPException(401, 'Your session changed; sign in again before reporting')
                client = await s.db.clients.find_one({'client_id': cid}, projection(CLIENT_FIELDS), session=session)
                if not client:
                    raise HTTPException(404, 'Client not found')
                programs = await s.db.requirements.distinct('baseline_key', {'client_id': cid, 'baseline_response': 'applies'}, session=session)
                if key not in {f['key'] for f in enabled_options(client, programs)}:
                    raise HTTPException(404, 'The selected framework is not enabled for this client')
                saved = await s.db.framework_assessments.find({'client_id': cid, 'framework_key': key}, projection(ASSESSMENT_FIELDS), session=session).to_list(10001)
                if len(saved) > 10000:
                    raise HTTPException(413, 'Framework assessments exceed the supported report size')
                aids = [row['framework_assessment_id'] for row in saved]
                definitions = [row['definition_id'] for row in saved]
                rids = list({r['id'] for row in saved for r in row.get('related_links') or [] if r.get('kind') == 'reviews'})
                reviews = await s.db.reviews.find({'client_id': cid, '$or': [
                    {'review_id': {'$in': rids}}, {'framework_assessment_id': {'$in': aids}},
                    {'framework_key': key, 'framework_safeguards': {'$in': definitions}}]},
                    projection(('review_id', 'client_id', 'framework_assessment_id', 'framework_key', 'framework_safeguards')), session=session).to_list(20001)
                if len(reviews) > 20000:
                    raise HTTPException(413, 'Framework evidence relationships exceed the supported report size')
                rids = [r['review_id'] for r in reviews]
                evidence_ids = list({r['id'] for row in saved for r in row.get('related_links') or [] if r.get('kind') == 'evidence'})
                clauses = [
                    {'evidence_id': {'$in': evidence_ids}},
                    {'linked_type': {'$in': ['framework_assessment', 'framework_assessments']}, 'linked_id': {'$in': aids}},
                    {'relationships': {'$elemMatch': {'kind': 'framework_assessments', 'id': {'$in': aids}}}},
                    {'linked_type': {'$in': ['review', 'reviews']}, 'linked_id': {'$in': rids}}]
                if key == 'cis-ig1':
                    clauses.append({'relationships': {'$elemMatch': {'kind': 'reviews', 'id': {'$in': rids}}}})
                evidence = await s.db.evidence.find({'client_id': cid, 'archived_at': None, '$or': clauses},
                    projection(('evidence_id', 'client_id', 'display_name', 'filename', 'linked_type', 'linked_id', 'relationships', 'archived_at')), session=session).to_list(20001)
                if len(evidence) > 20000:
                    raise HTTPException(413, 'Evidence references exceed the supported report size')
                fids = list({i['finding_id'] for row in saved for i in row.get('items_to_address') or [] if i.get('finding_id')})
                findings = await s.db.findings.find({'client_id': cid, 'finding_id': {'$in': fids}}, projection(('client_id', 'finding_id')), session=session).to_list(len(fids)) if fids else []
                logical = str(session.operation_time) if session.operation_time else 'not exposed by driver'
                ended = datetime.now(timezone.utc)
                snapshot = build_snapshot(client, key, saved, evidence, findings, ended, period,
                    (began.isoformat(), ended.isoformat()), logical, reviews)
        return snapshot, client
    except HTTPException:
        raise
    except (PyMongoError, NotImplementedError) as error:
        LOG.warning('Framework report snapshot unavailable: %s', type(error).__name__)
        raise HTTPException(503, 'A consistent database snapshot is unavailable. Retry; if this continues, ask your administrator to check MongoDB replica-set snapshot support.')


async def recheck_delivery(s, request, cid, key, prior_client, snapshot):
    current = await s.get_current_user(request)
    require_access(current, cid)
    client = await s.db.clients.find_one({'client_id': cid}, projection(CLIENT_FIELDS))
    if not client:
        raise HTTPException(403, 'Client access changed while generating the report')
    programs = await s.db.requirements.distinct('baseline_key', {'client_id': cid, 'baseline_response': 'applies'})
    if key not in {f['key'] for f in enabled_options(client, programs)}:
        raise HTTPException(403, 'Framework access changed while generating the report')
    if client_configuration(key, client) != client_configuration(key, prior_client) or framework_option(key, client) != framework_option(key, prior_client):
        raise HTTPException(409, 'Framework scope changed while generating the report; generate it again')
    refs = [e for row in snapshot['assessments'] for e in row['evidence']]
    ids = {ref['id'] for ref in refs}
    if ids:
        visible = await s.db.evidence.find({'client_id': cid, 'archived_at': None, 'evidence_id': {'$in': list(ids)}}, projection(('evidence_id', 'display_name', 'filename'))).to_list(len(ids))
        visible = {e['evidence_id']: e.get('display_name') or e.get('filename') or 'Evidence reference' for e in visible}
        if any(visible.get(ref['id']) != ref['title'] for ref in refs):
            raise HTTPException(409, 'Evidence access or reference titles changed while generating the report; generate it again')
    fids = {item['finding_id'] for row in snapshot['assessments'] for item in row['items_to_address'] if item.get('finding_id')}
    if fids and set(await s.db.findings.distinct('finding_id', {'client_id': cid, 'finding_id': {'$in': list(fids)}})) != fids:
        raise HTTPException(409, 'Finding reference access changed while generating the report; generate it again')
    return current


def router_for(s):
    router = APIRouter(prefix='/api/reports', tags=['framework-reports'])

    @router.get('/frameworks')
    async def options(client_id: str = Query(..., min_length=1, max_length=160), user=Depends(s.get_current_user)):
        require_access(user, client_id)
        client = await s.db.clients.find_one({'client_id': client_id}, projection(CLIENT_FIELDS))
        if not client:
            raise HTTPException(404, 'Client not found')
        programs = await s.db.requirements.distinct('baseline_key', {'client_id': client_id, 'baseline_response': 'applies'})
        return {'frameworks': enabled_options(client, programs)}

    @router.get('/framework')
    async def export(request: Request, client_id: str = Query(..., min_length=1, max_length=160),
                     framework_key: Literal['cis-ig1', 'soc-2', 'iso-27001'] = Query(...),
                     detail: Literal['full', 'executive'] = 'full',
                     trend_period: Literal['30d', '6m', '12m'] = '6m', user=Depends(s.get_current_user)):
        require_access(user, client_id)
        snapshot, client = await read_snapshot(s, client_id, framework_key, user, trend_period)
        from framework_report_pdf import render_framework_report
        try:
            content = await run_in_threadpool(render_framework_report, snapshot, detail)
        except ValueError:
            raise HTTPException(422, 'The saved text includes characters unsupported by the PDF font; report generation could not preserve it faithfully')
        actor = await recheck_delivery(s, request, client_id, framework_key, client, snapshot)
        await s.audit(actor, 'generate', 'framework-report', client_id, client_id,
                      meta={'framework_key': framework_key, 'detail': detail, 'trend_period': trend_period,
                            'framework_name': snapshot['framework']['name'], 'framework_version': snapshot['framework']['version'],
                            'source_hash': snapshot['source_hash']})
        slug = re.sub(r'[^a-zA-Z0-9]+', '-', snapshot['client_name']).strip('-').lower()[:80] or 'client'
        framework_slug = re.sub(r'[^a-zA-Z0-9]+', '-', snapshot['framework']['name']).strip('-').lower()
        filename = f"{slug}-{framework_slug}-{detail}-{snapshot['generated_at'][:10]}.pdf"
        return Response(content, media_type='application/pdf', headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})

    return router
