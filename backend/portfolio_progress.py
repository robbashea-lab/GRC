"""Read-only native implementation positions and honest sampled comparisons.

Callers authorize clients before using this module. Guided drafts, verification,
assessment resolution, and linked work never supply implementation credit.
"""
import calendar
import hashlib
import json
from collections import Counter
from datetime import datetime, timedelta, timezone

from framework_catalog import CATALOGS, FRAMEWORKS, active_definitions, client_configuration


MEASURE_VERSION = 'native-implementation-v1'
SOURCE_LIMIT = 20000
STATUS_KEYS = ('addressed', 'in_progress', 'needs_attention', 'not_assessed')
INACTIVE = {'archived', 'inactive', 'retired', 'offboarding', 'terminated', 'revoked'}
SOC_LABELS = {'security': 'Security / Common Criteria', 'availability': 'Availability',
              'confidentiality': 'Confidentiality', 'processing_integrity': 'Processing Integrity', 'privacy': 'Privacy'}


def _datetime(value):
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    else:
        raise ValueError('Use a timezone-aware report timestamp')
    if parsed.tzinfo is None:
        raise ValueError('Use a timezone-aware report timestamp')
    return parsed.astimezone(timezone.utc)


def range_start(as_of, period):
    """UTC calendar-month subtraction, preserving time and clamping month ends."""
    at = _datetime(as_of)
    if period in ('30d', '90d'):
        return (at - timedelta(days=int(period[:-1]))).isoformat()
    if period not in ('1m', '3m', '6m', '12m', '36m'):
        raise ValueError('Choose 1m, 3m, 6m, 12m, or 36m')
    months = int(period[:-1])
    month_index = at.year * 12 + at.month - 1 - months
    year, month_index = divmod(month_index, 12)
    month = month_index + 1
    return at.replace(year=year, month=month, day=min(at.day, calendar.monthrange(year, month)[1])).isoformat()


def _active(row):
    return not row.get('archived') and not row.get('archived_at') and row.get('status') not in INACTIVE


def _labels(key):
    if key == 'soc-2':
        return ('Addressed (Readiness)', 'Partially Addressed', 'Needs Remediation / Validation', 'Not Assessed')
    if key == 'nist-csf-2':
        return ('Achieved', 'Partially Achieved', 'Not Achieved / Needs Validation', 'Not Assessed')
    return ('Implemented', 'Partially Implemented', 'Not Implemented' if key == 'cis-ig1' else
            'Not Implemented / Needs Validation', 'Not Assessed')


def _counts(rows, key):
    counts = Counter(r.get('status') for r in rows)
    result = [{'key': status, 'label': label, 'count': counts[status]}
              for status, label in zip(STATUS_KEYS, _labels(key))]
    unknown = sum(value for status, value in counts.items() if status not in STATUS_KEYS)
    if unknown:
        result.append({'key': 'unknown', 'label': 'Unresolved status', 'count': unknown})
    return result, unknown


def _fingerprint(scope):
    return hashlib.sha256(json.dumps(scope, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def _component(key, label, rows, framework):
    counts, unknown = _counts(rows, framework)
    implemented = sum(r.get('status') == 'addressed' for r in rows)
    return {'key': key, 'label': label, 'counts': counts, 'implemented': implemented,
            'denominator': len(rows), 'percentage': implemented / len(rows) * 100 if rows and not unknown else None}


def current_position(client, framework, assignments, assessments, as_of):
    """Use the native catalog scope and saved conclusion; never score interviews."""
    key = framework['key']
    configuration = client_configuration(key, client)
    group = configuration.get('implementation_group')
    categories = configuration.get('categories')
    valid_configuration = True
    if key == 'cis-ig1':
        valid_configuration = type(group) is int and group in CATALOGS[key]['available_implementation_groups']
    elif key == 'soc-2':
        valid_configuration = (isinstance(categories, list) and
            all(isinstance(c, str) and c in SOC_LABELS for c in categories) and
            'security' in categories and len(set(categories)) == len(categories))
    scope_configuration = ({'implementation_group': group} if key == 'cis-ig1' else
                           {'categories': sorted(categories)} if key == 'soc-2' and valid_configuration else {})
    label = f'CIS IG{group}' if key == 'cis-ig1' and valid_configuration else framework['label']
    program_key = f'cis-ig{group}' if key == 'cis-ig1' and valid_configuration else key
    catalog = CATALOGS.get(key, {})
    version = catalog.get('version') or framework.get('version')
    title = framework.get('name') or framework['label']
    if key == 'cis-ig1' and valid_configuration:
        title = f'CIS Controls v{version} · Implementation Group {group}'
    elif version and version not in title:
        title += ' · ' + version
    unit = (catalog.get('labels', {}).get('items') or ('Safeguards' if key == 'cis-ig1' else 'Items')).lower()
    if key == 'iso-27001':
        unit = 'requirements and controls'
    position = {'client_id': client['client_id'], 'client_name': client.get('name', client['client_id']),
                'program_id': client['client_id'] + ':' + key,
                'program_title': title, 'unit_label': unit, 'framework_version': version,
                'program_key': program_key, 'program_label': label, 'framework_key': key,
                'scope_label': label, 'to': '/compliance/' + key}
    base = {'captured_at': _datetime(as_of).isoformat(), 'effective_at': _datetime(as_of).isoformat(),
            'retrieved_at': _datetime(as_of).isoformat(), 'observation_kind': 'current_source',
            'program_id': position['program_id'], 'measure_version': MEASURE_VERSION,
            'counts': [], 'implemented': None, 'denominator': None, 'excluded': None,
            'included_counts': [], 'assessed': None, 'not_started': False,
            'total': None, 'percentage': None, 'scope_signature': None, 'components': [],
            'availability': 'unavailable', 'missing_records': 0, 'unrecognized_status_count': 0,
            'provenance': {'kind': 'captured', 'source_as_of': None, 'source_references': [],
                           'reconstruction': 'No historical state inferred from the current position.'}}
    if not framework.get('implemented') or key not in CATALOGS:
        return {**position, 'current': {**base, 'reason': 'Native implementation tracking is unavailable for this program.'}}
    if not valid_configuration:
        return {**position, 'current': {**base, 'reason': 'The saved native framework configuration is invalid or unavailable.'}}

    definitions = active_definitions(key, configuration)
    by_id = {d['id']: d for d in definitions}
    grouped = {}
    for row in assessments:
        if row.get('definition_id') in by_id and _active(row):
            grouped.setdefault(row['definition_id'], []).append(row)
    rows = [values[0] for values in grouped.values() if len(values) == 1]
    missing = set(by_id) - set(grouped)
    duplicates = {ident for ident, values in grouped.items() if len(values) > 1}
    applicability = {}
    included, excluded, undetermined, invalid_applicability = [], [], [], []
    for row in rows:
        definition = by_id[row['definition_id']]
        if key == 'iso-27001' and definition.get('specification') == 'annex_control':
            decision = row.get('soa_applicability') or 'undetermined'
            applicability[row['definition_id']] = decision
            if decision == 'included':
                included.append(row)
            elif decision == 'excluded':
                excluded.append(row)
            else:
                undetermined.append(row)
            if decision in ('included', 'excluded') and not (row.get('soa_justification') or '').strip():
                invalid_applicability.append(row['definition_id'])
        elif row.get('status') == 'not_applicable':
            # Native CIS/SOC dashboard excludes N/A, but clauses/addressable rules
            # disallow it. Invalid legacy decisions stay visible and earn no credit.
            valid = definition.get('specification') not in ('isms_clause', 'addressable') and bool((row.get('na_rationale') or '').strip())
            applicability[row['definition_id']] = 'excluded' if valid else 'invalid_not_applicable'
            if valid:
                excluded.append(row)
            else:
                included.append(row)
                invalid_applicability.append(row['definition_id'])
        else:
            applicability[row['definition_id']] = 'included'
            included.append(row)
    for ident in missing | duplicates:
        applicability[ident] = 'missing' if ident in missing else 'duplicate'
    counts, unknown = _counts(included, key)
    included_counts = [dict(count) for count in counts if count['key'] in STATUS_KEYS]
    if excluded:
        counts.append({'key': 'excluded', 'label': 'Excluded / Not Applicable', 'count': len(excluded)})
    if undetermined:
        counts.append({'key': 'scope_undetermined', 'label': 'SoA applicability undetermined', 'count': len(undetermined)})
    if missing or duplicates:
        counts.append({'key': 'missing', 'label': 'Source records unavailable', 'count': len(missing | duplicates)})
    implemented = sum(row.get('status') == 'addressed' for row in included)
    denominator = len(included)
    versions = sorted({(row['definition_id'], row.get('framework_version')) for row in rows})
    scope = {'framework_key': key, 'catalog_version': CATALOGS[key]['version'], 'configuration': scope_configuration,
             'definition_ids': sorted(by_id), 'source_versions': versions,
             'enrollment_ids': sorted(row['requirement_id'] for row in assignments
                 if row.get('baseline_key') == key and row.get('requirement_id')),
             'applicability': applicability, 'measure_version': MEASURE_VERSION}
    components = []
    if key == 'iso-27001':
        clauses = [r for r in included if by_id[r['definition_id']].get('specification') == 'isms_clause']
        annex = [r for r in included if by_id[r['definition_id']].get('specification') == 'annex_control']
        components = [_component('isms', 'ISMS requirements', clauses, key),
                      _component('annex', 'Included Annex A controls', annex, key),
                      {'key': 'soa', 'label': 'Statement of Applicability', 'total': sum(
                          d.get('specification') == 'annex_control' for d in definitions),
                       'included': len(annex), 'excluded': len(excluded), 'undetermined': len(undetermined),
                       'unavailable': sum(by_id[i].get('specification') == 'annex_control' for i in missing | duplicates)}]
        position['scope_label'] = f"ISMS + included Annex A · {len(undetermined)} SoA undetermined"
    elif key == 'soc-2':
        components = [_component(category, SOC_LABELS.get(category, category),
                                 [r for r in included if by_id[r['definition_id']].get('category') == category], key)
                      for category in scope_configuration['categories']]
        position['scope_label'] = ', '.join(SOC_LABELS.get(category, category) for category in scope_configuration['categories'])
    elif key == 'cis-ig1':
        position['scope_label'] = f"Cumulative IG{configuration['implementation_group']} safeguards"

    references = [{'kind': 'requirements', 'id': row.get('requirement_id'), 'version': row.get('updated_at') or row.get('created_at'),
                   'source_event': row.get('_portfolio_activity_last_event_id')}
                  for row in assignments if row.get('baseline_key') == key]
    references.extend({'kind': 'framework_assessments', 'id': row.get('framework_assessment_id'),
                       'definition_id': row['definition_id'], 'framework_version': row.get('framework_version'),
                       'source_event': row.get('_portfolio_activity_last_event_id'),
                       'status': row.get('status'),
                       'version': row.get('last_saved') or row.get('last_assessed') or row.get('created_at')}
                      for values in grouped.values() for row in values)
    configuration_at = client.get('cis_configuration_updated_at' if key == 'cis-ig1' else 'soc_configuration_updated_at') if key in ('cis-ig1', 'soc-2') else None
    if configuration_at:
        references.append({'kind': 'clients', 'id': client['client_id'], 'field': key + '_configuration', 'version': configuration_at})
    references.sort(key=lambda reference: (reference['kind'], reference.get('id') or '', reference.get('field') or ''))
    source_dates = []
    for reference in references:
        try:
            source_dates.append(_datetime(reference['version']))
        except (TypeError, ValueError):
            continue
    after_cutoff = any(at > _datetime(as_of) for at in source_dates)
    complete = not (missing or duplicates or unknown or invalid_applicability or after_cutoff)
    if not complete:
        for component in components:
            if 'percentage' in component:
                component['percentage'] = None
    reason = ('Source changes occurred after this capture cutoff; collection must retry.' if after_cutoff else
              'Some expected native records or statuses are unavailable or invalid.' if not complete else
              'Annex A applicability remains undetermined; percentages describe ISMS and included Annex A only.' if undetermined else
              'No applicable implementation items.' if not denominator else None)
    current = {**base, 'counts': counts, 'implemented': implemented, 'denominator': denominator,
               'included_counts': included_counts,
               'assessed': sum(value['count'] for value in included_counts if value['key'] != 'not_assessed'),
               'not_started': bool(complete and denominator and all(row.get('status') == 'not_assessed' for row in included)
                   and not any(row.get('last_saved') or row.get('last_assessed') for row in rows)),
               'excluded': len(excluded), 'total': len(by_id),
               'percentage': implemented / denominator * 100 if denominator and complete else None,
               # Enrollment is source/lifecycle proof. The implementation scope
               # identity remains compatible with prior saved catalog populations.
               'scope': scope, 'scope_signature': _fingerprint({field: value for field, value in scope.items()
                   if field != 'enrollment_ids'}), 'components': components,
               'availability': 'available' if complete else 'partial', 'reason': reason,
               'missing_records': len(missing), 'duplicate_records': len(duplicates),
               'unrecognized_status_count': unknown, 'invalid_applicability': invalid_applicability,
               'scope_undetermined': len(undetermined),
               'provenance': {**base['provenance'], 'source_as_of': max(source_dates).isoformat() if source_dates else None,
                              'source_references': references, 'cutoff_consistent': not after_cutoff}}
    current['status_signature'] = _fingerprint({field: current.get(field) for field in
        ('scope_signature', 'included_counts', 'implemented', 'denominator', 'availability')})
    current['source_revision'] = _fingerprint({'scope': scope, 'references': references})
    return {**position, 'current': current}


async def build_current_positions(db, client, as_of=None):
    """Two bounded native reads for one authorized client; no source mutation."""
    if not _active(client) or not client.get('onboarding_baseline', {}).get('completed'):
        return []
    cid = client['client_id']
    assignments = await db.requirements.find({'client_id': cid, 'baseline_response': 'applies'},
        {'_id': 0, 'requirement_id': 1, 'client_id': 1, 'baseline_key': 1, 'baseline_response': 1,
         'status': 1, 'archived': 1, 'archived_at': 1, 'created_at': 1, 'updated_at': 1,
         '_portfolio_activity_last_event_id': 1}).to_list(SOURCE_LIMIT + 1)
    if len(assignments) > SOURCE_LIMIT:
        raise ValueError('Portfolio native program population exceeds the supported size')
    assignments = [row for row in assignments if row.get('client_id') == cid and row.get('baseline_response') == 'applies' and _active(row)]
    enabled = {row['baseline_key'] for row in assignments if row.get('baseline_key')}
    frameworks = [row for row in FRAMEWORKS if row['key'] in enabled]
    if not frameworks:
        return []
    tracked = [row['key'] for row in frameworks if row.get('implemented')]
    assessments = await db.framework_assessments.find({'client_id': cid, 'framework_key': {'$in': tracked}},
        {'_id': 0, 'client_id': 1, 'framework_assessment_id': 1, 'definition_id': 1, 'framework_key': 1,
         'framework_version': 1, 'status': 1, 'soa_applicability': 1, 'soa_justification': 1, 'na_rationale': 1,
         'archived': 1, 'archived_at': 1, 'created_at': 1, 'last_saved': 1, 'last_assessed': 1,
         '_portfolio_activity_last_event_id': 1}).to_list(SOURCE_LIMIT + 1)
    if len(assessments) > SOURCE_LIMIT:
        raise ValueError('Portfolio native assessment population exceeds the supported size')
    captured_at = as_of or datetime.now(timezone.utc).isoformat()
    return [current_position(client, framework, assignments,
            [row for row in assessments if row.get('client_id') == cid and row.get('framework_key') == framework['key']], captured_at)
            for framework in frameworks]


def compare_positions(snapshots, current, requested_start):
    """Compare actual sampled endpoints; samples do not prove continuous history."""
    current = current.get('current', current)
    start, end = _datetime(requested_start), _datetime(current['captured_at'])
    if start > end:
        raise ValueError('History start must precede the report cutoff')
    valid = []
    for snapshot in snapshots:
        item = snapshot.get('current', snapshot)
        try:
            captured = _datetime(item.get('effective_at') or item['captured_at'])
        except (KeyError, TypeError, ValueError):
            continue
        if captured <= end:
            valid.append((captured, item))
    valid.sort(key=lambda entry: entry[0])
    before = [entry for entry in valid if entry[0] <= start]
    result = {'baseline': None, 'change_pp': None, 'comparable': False, 'scope_changed': False,
              'change_implemented': None, 'baseline_effective_at_start': False,
              'reason': 'No trustworthy snapshot on or before the requested period start.',
              'requested_start': start.isoformat(), 'as_of': end.isoformat(),
              'available_from': valid[0][0].isoformat() if valid else current['captured_at'],
              'coverage': 'sampled_positions', 'continuous_history': False}
    if not before:
        return result
    baseline_at, baseline = before[-1]
    result['baseline'] = baseline
    result['baseline_before_requested_start'] = baseline_at < start
    try:
        valid_until = _datetime(baseline.get('effective_until'))
    except (ValueError, TypeError):
        valid_until = None
    boundary_proven = baseline_at == start or (baseline.get('continuity_proven') is True and valid_until
        and valid_until >= start)
    result['baseline_effective_at_start'] = bool(boundary_proven)
    tied_baselines = [item for at, item in before if at == baseline_at]
    tied_states = {json.dumps({field: item.get(field) for field in (
        'scope_signature', 'measure_version', 'implemented', 'denominator', 'percentage')}, sort_keys=True)
        for item in tied_baselines}
    if len(tied_states) > 1:
        result['baseline'] = None
        result['reason'] = 'Conflicting positions share the baseline timestamp; no trustworthy baseline can be chosen.'
        return result
    # A scope that changes and changes back still makes the interval incomparable.
    signatures = {entry.get('scope_signature') for at, entry in valid if at >= baseline_at}
    signatures.add(current.get('scope_signature'))
    signatures.add(baseline.get('scope_signature'))
    changed = len(signatures - {None}) > 1
    result['scope_changed'] = changed
    if changed:
        result['reason'] = 'Scope, applicability, catalog version, or measurement semantics changed between captured positions.'
        if (boundary_proven and baseline.get('percentage') is not None and current.get('percentage') is not None
                and baseline.get('measure_version') == current.get('measure_version')):
            result.update(change_pp=current['percentage'] - baseline['percentage'],
                          change_implemented=current['implemented'] - baseline['implemented'])
    elif None in signatures:
        result['reason'] = 'Scope identity is unavailable; like-for-like comparison cannot be established.'
    elif baseline.get('percentage') is None or current.get('percentage') is None:
        result['reason'] = 'An endpoint has no applicable denominator or complete implementation position.'
    elif not baseline.get('measure_version') or baseline.get('measure_version') != current.get('measure_version'):
        result['reason'] = 'Implementation measurement versions differ or are unavailable.'
    elif not boundary_proven:
        result['reason'] = 'The older observation does not establish which committed state was effective at the period boundary.'
    else:
        result.update(comparable=True, change_pp=current['percentage'] - baseline['percentage'],
                      change_implemented=current['implemented'] - baseline['implemented'],
                      reason='Comparison uses actual captured dates; intervals between snapshots are not reconstructed.')
    return result
