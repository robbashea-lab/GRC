"""Read-only portfolio projections over authoritative management populations."""
import json
from datetime import datetime
from framework_governance import ROOT, FRAMEWORKS

RULES = json.loads((ROOT / 'portfolioRules.json').read_text())


def populations(model):
    return {'critical_high_issues': [r for r in model['metrics']['critical_high_open'] if r['kind'] != 'risks'],
            'significant_risks': model['significantRisks']}


def frameworks(client, requirements):
    selected = {r.get('baseline_key') for r in requirements
                if r.get('client_id') == client['client_id'] and r.get('baseline_response') == 'applies'}
    if not client.get('onboarding_baseline', {}).get('completed'):
        return []
    return [{'key': f['key'], 'label': f['label'], 'to': '/compliance/' + f['key']}
            for f in FRAMEWORKS if f['key'] in selected]


def attention_order(row):
    return (*(-row[key] for key in RULES['priorityOrder']), row['name'].casefold(), row['client_id'])


async def latest_activity(db, client_ids, now):
    # One aggregate for authorized clients. Return one narrow lifecycle event per
    # client rather than downloading the entire audit history or generic updates.
    clauses = [{'entity_type': {'$in': [r['kind'], 'policies' if r['kind'] == 'policy' else r['kind'] + 's']},
                'action': {'$in': r['actions']}} for r in RULES['activity']]
    logs = await db.audit_logs.aggregate([
        {'$match': {'client_id': {'$in': client_ids}, '$or': clauses,
                    'at': {'$type': 'string', '$lte': now}}},
        {'$sort': {'at': -1}},
        {'$group': {'_id': '$client_id', 'at': {'$first': '$at'},
                    'action': {'$first': '$action'}, 'entity_type': {'$first': '$entity_type'}}},
    ]).to_list(None)
    latest = {}
    for log in logs:
        try:
            at = datetime.fromisoformat(log['at'].replace('Z', '+00:00'))
            if at.tzinfo is None or at > datetime.fromisoformat(now.replace('Z', '+00:00')):
                continue
        except (ValueError, TypeError):
            continue
        definition = next(r for r in RULES['activity'] if log['action'] in r['actions']
                          and log['entity_type'] in (r['kind'], 'policies' if r['kind'] == 'policy' else r['kind']+'s'))
        latest[log['_id']] = {'at': log['at'], 'label': definition.get('labels', {}).get(log['action'], log['action'])}
    return latest
