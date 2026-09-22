"""Current assessment counts and separately linked work; never a compliance score."""
from collections import Counter
from fastapi import HTTPException
from framework_governance import FRAMEWORKS, STATUSES
from framework_catalog import active_definitions
from soc_readiness import configuration as soc_configuration


async def bounded(collection, query, fields):
    rows = await collection.find(query, {'_id': 0, **dict.fromkeys(fields, 1)}).to_list(20001)
    if len(rows) > 20000:
        raise HTTPException(413, 'Framework summary exceeds its supported size; no partial totals are shown.')
    return rows


async def read(s, client):
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
                                        ['framework_assessment_id', 'definition_id', 'status', 'related_links', 'last_assessed'])
            if key == 'soc-2':
                scoped_client = await s.db.clients.find_one({'client_id': cid}, {'_id': 0, 'framework_settings': 1})
                active = {d['id'] for d in active_definitions(key, soc_configuration(scoped_client or {}))}
                assessments = [a for a in assessments if a['definition_id'] in active]
            counts = Counter(a.get('status') for a in assessments)
            aids = [a['framework_assessment_id'] for a in assessments]
            definitions = [a['definition_id'] for a in assessments]
            direct = lambda kind: [link['id'] for a in assessments for link in a.get('related_links', []) if link.get('kind') == kind]
            # Match the existing framework relationship model in one batch, not one call per safeguard.
            reviews = await bounded(s.db.reviews, {'client_id': cid, '$or': [
                {'review_id': {'$in': direct('reviews')}}, {'framework_assessment_id': {'$in': aids}},
                {'framework_key': key, 'framework_safeguards': {'$in': definitions}}]}, ['review_id'])
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
    return {'client_id': cid, 'items': items}
