"""Current assessment counts and separately linked work; never a compliance score."""
from collections import Counter
from fastapi import HTTPException
from framework_governance import FRAMEWORKS, STATUSES
from framework_catalog import active_definitions, definition_for
from soc_readiness import configuration as soc_configuration
from management_obligations import calendar_day, active_record
import review_occurrences


def progress(rows, key):
    """Assessment resolution, not compliance; legacy invalid N/A earns no credit."""
    def valid_na(row):
        spec = definition_for(key, row['definition_id']).get('specification')
        if spec in ('isms_clause', 'addressable'):
            return False
        if spec == 'annex_control':
            return row.get('soa_applicability') == 'excluded' and bool((row.get('soa_justification') or '').strip())
        return bool((row.get('na_rationale') or '').strip())
    na = [r for r in rows if r.get('status') == 'not_applicable']
    valid = sum(valid_na(r) for r in na)
    resolved = sum(r.get('status') == 'addressed' for r in rows) + valid
    return {'total': len(rows), 'resolved': resolved, 'valid_na': valid, 'invalid_na': len(na)-valid,
            'percent': int(resolved / len(rows) * 100 + .5) if rows else None}


def ongoing(reviews, today):
    day = calendar_day(today)
    groups = {k: [] for k in ('past_due', 'due_soon', 'current', 'unscheduled')}
    for raw in reviews:
        if not active_record(raw, 'reviews') or raw.get('recurrence') in (None, '', 'none', 'one_time'):
            continue
        r = review_occurrences.view(raw)
        due = calendar_day(r.get('due_date'))
        state = 'unscheduled' if due is None else 'past_due' if due < day else 'due_soon' if due <= day+30 else 'current'
        groups[state].append({'id': r['review_id'], 'title': r.get('title') or 'Review',
                              'due_date': r.get('due_date'), 'status': r.get('status'), 'kind': 'reviews'})
    for rows in groups.values():
        rows.sort(key=lambda r: (r.get('due_date') or '9999', r['id']))
    candidates = groups['past_due'] + groups['due_soon'] + groups['current']
    return {'total': sum(map(len, groups.values())), 'counts': {k: len(v) for k,v in groups.items()},
            'next': candidates[0] if candidates else None}, groups


async def bounded(collection, query, fields):
    rows = await collection.find(query, {'_id': 0, **dict.fromkeys(fields, 1)}).to_list(20001)
    if len(rows) > 20000:
        raise HTTPException(413, 'Framework summary exceeds its supported size; no partial totals are shown.')
    return rows


async def read(s, client, detail=None, offset=0, limit=25):
    cid = client['client_id']
    programs = await s.db.requirements.distinct('baseline_key', {'client_id': cid, 'baseline_response': 'applies'})
    items = []
    for framework in FRAMEWORKS:
        key = framework['key']
        if not client.get('onboarding_baseline', {}).get('completed') or key not in programs:
            continue
        item = {'key': key, 'tracking_available': framework['implemented'], 'total': None,
                'status_counts': None, 'unrecognized_status_count': None, 'last_assessed': None,
                'open_findings': None, 'open_actions': None}
        if framework['implemented']:
            assessments = await bounded(s.db.framework_assessments, {'client_id': cid, 'framework_key': key},
                                        ['framework_assessment_id', 'definition_id', 'status', 'related_links', 'last_assessed',
                                         'na_rationale', 'soa_applicability', 'soa_justification'])
            configuration = None
            if key == 'soc-2':
                scoped_client = await s.db.clients.find_one({'client_id': cid}, {'_id': 0, 'framework_settings': 1})
                configuration = soc_configuration(scoped_client or {})
            active = {d['id'] for d in active_definitions(key, configuration)}
            assessments = [a for a in assessments if a['definition_id'] in active]
            counts = Counter(a.get('status') for a in assessments)
            aids = [a['framework_assessment_id'] for a in assessments]
            definitions = [a['definition_id'] for a in assessments]
            direct = lambda kind: [link['id'] for a in assessments for link in a.get('related_links', []) if link.get('kind') == kind]
            # Match the existing framework relationship model in one batch, not one call per safeguard.
            reviews = await bounded(s.db.reviews, {'client_id': cid, '$or': [
                {'review_id': {'$in': direct('reviews')}}, {'framework_assessment_id': {'$in': aids}},
                {'framework_key': key, 'framework_safeguards': {'$in': definitions}}]},
                ['review_id', 'client_id', 'title', 'status', 'due_date', 'recurrence',
                 'custom_recurrence_days', 'schedule_anchor', 'archived', 'archived_at'])
            health, obligations = ongoing(reviews, s._now())
            item.update(assessment_progress=progress(assessments, key), ongoing=health)
            if detail and detail[0] == key:
                category = detail[1]
                if category in STATUSES or category == 'all':
                    selected = [a for a in assessments if category == 'all' or a.get('status') == category]
                    selected.sort(key=lambda a: a['definition_id'])
                    rows = [{'id': a['framework_assessment_id'], 'definition_id': a['definition_id'],
                             'title': definition_for(key,a['definition_id']).get('title',a['definition_id']),
                             'status': a.get('status'), 'kind': 'framework_assessments'} for a in selected]
                elif category in obligations:
                    rows = obligations[category]
                else:
                    raise HTTPException(422, 'Unknown program detail')
                return {'client_id': cid, 'items': rows[offset:offset+limit], 'total': len(rows), 'offset': offset}
            rids = [r['review_id'] for r in reviews]
            findings = await bounded(s.db.findings, {'client_id': cid, '$or': [
                {'finding_id': {'$in': direct('findings')}}, {'framework_assessment_id': {'$in': aids}},
                {'review_id': {'$in': rids}}]}, ['finding_id', 'status'])
            actions = await bounded(s.db.tasks, {'client_id': cid, '$or': [
                {'task_id': {'$in': direct('tasks')}}, {'framework_assessment_id': {'$in': aids}},
                {'review_id': {'$in': rids}}, {'finding_id': {'$in': [f['finding_id'] for f in findings]}}]}, ['task_id', 'status'])
            item.update(total=len(assessments), status_counts={status: counts[status] for status in STATUSES},
                        unrecognized_status_count=sum(n for status, n in counts.items() if status not in STATUSES),
                        last_assessed=max((a['last_assessed'] for a in assessments if a.get('last_assessed')), default=None),
                        open_findings=sum(f.get('status') not in s.CLOSED['findings'] for f in findings),
                        open_actions=sum(a.get('status') not in s.CLOSED['tasks'] for a in actions))
        items.append(item)
    if detail:
        raise HTTPException(404, 'Applicable program not found')
    return {'client_id': cid, 'items': items}
