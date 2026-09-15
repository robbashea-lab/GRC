"""Read-only management contract. Equivalent JS rules have shared scenario tests.

No writes, recurrence generation or permission decisions occur in this module.
Callers must supply tenant-authorized records. See docs/management-obligation-contract.md.
"""
import json
import re
from datetime import date, datetime, timezone
from pathlib import Path
from grc_rules import assessed_risk, represented_finding

RULES = json.loads((Path(__file__).resolve().parents[1] / 'frontend/src/lib/managementRules.json').read_text())
KINDS = RULES['kinds']
METRICS = RULES['metrics']


def calendar_day(value):
    if not isinstance(value, str) or not re.match(r'^\d{4}-\d{2}-\d{2}(?:T|$)', value):
        return None
    try:
        return date.fromisoformat(value[:10]).toordinal()
    except ValueError:
        return None


def owner_ids(record, kind):
    return [record[k] for k in RULES['owners'][kind] if record.get(k)]


def active_record(record, kind):
    return not record.get('archived') and not record.get('archived_at') and record.get('status') not in RULES['terminal'] and not (kind == 'findings' and record.get('status') == 'accepted')


def management_model(records, client_id, *, today=None, members=(), scope='org', user_id=None):
    today = today or datetime.now(timezone.utc).date().isoformat()
    day = calendar_day(today)
    if day is None:
        raise ValueError('Invalid management calculation date')
    names = {u['user_id']: u.get('name') or u.get('email') for u in members}
    active = {}
    for kind in KINDS:
        rows = records.get(kind, [])
        if not isinstance(rows, list) or any(r.get('client_id') != client_id for r in rows):
            raise ValueError('Management records belong to another client')
        active[kind] = [r for r in rows if active_record(r, kind)]

    def scoped(r, kind):
        owners = owner_ids(r, kind)
        return not owners if scope == 'unassigned' else user_id in owners if scope in ('mine', 'user') else True

    def row(r, kind, event, label, due, level=None):
        owners = owner_ids(r, kind)
        due_day = calendar_day(due)
        return {'key': f'{kind}:{r[KINDS[kind]]}:{event}', 'id': r[KINDS[kind]], 'kind': kind, 'record': r,
                'event': event, 'type': label, 'title': r.get('title') or r.get('name') or label,
                'due_date': due if due_day is not None else None, 'day': due_day,
                'owner_id': owners[0] if owners else None, 'owner': names.get(owners[0], 'Assigned user') if owners else 'Unassigned',
                'unassigned': not owners, 'status': r.get('status'), 'severity': 'critical' if level == 'immediate' else level}

    work = []

    def add(r, kind, event, label, due, level=None, undated=False):
        if not r.get(KINDS[kind]) or calendar_day(due) is None and not undated:
            return
        work.append(row(r, kind, event, label, due, level))

    def review_rep(field, identity, due):
        return any(v.get(field) == identity and calendar_day(v.get('due_date')) == calendar_day(due) for v in active['reviews'])

    def exception_rep(risk_id, due):
        return calendar_day(due) is not None and any(e.get('risk_id') == risk_id and e.get('status') in ('approved', 'expired') and calendar_day(e.get('expires_at')) == calendar_day(due) for e in active['exceptions'])

    for r in active['reviews']:
        add(r, 'reviews', 'due', 'Review', r.get('due_date'), undated=True)
    for r in active['tasks']:
        add(r, 'tasks', 'due', 'Action Item', r.get('due_date'), r.get('priority'), True)
    for r in active['findings']:
        if not represented_finding(r, active['tasks']):
            add(r, 'findings', 'due', 'Validation' if r.get('status') == 'remediated' else 'Finding', r.get('due_date'), r.get('severity'), True)
    for r in active['risks']:
        accepted = r.get('status') == 'accepted'
        expiry, due = r.get('acceptance_expires_at'), r.get('next_review')
        if accepted and calendar_day(expiry) != calendar_day(due) and not exception_rep(r['risk_id'], expiry):
            add(r, 'risks', 'acceptance', 'Risk Acceptance Expiry', expiry)
        if not review_rep('risk_id', r['risk_id'], due) and not (accepted and exception_rep(r['risk_id'], due)):
            add(r, 'risks', 'review', 'Risk Acceptance Review' if accepted else 'Risk Review' if due else 'Risk', due, None if accepted else assessed_risk(r)['risk_level'], not accepted)
    for r in active['policies']:
        if not review_rep('policy_id', r['policy_id'], r.get('next_review_date')):
            add(r, 'policies', 'review', 'Policy Review', r.get('next_review_date'))
    for r in active['vendors']:
        if not review_rep('vendor_id', r['vendor_id'], r.get('next_review')):
            add(r, 'vendors', 'review', 'Vendor Review', r.get('next_review'))
        contract = any(v.get('vendor_id') == r['vendor_id'] and v.get('vendor_purpose') == 'contract' for v in active['reviews'])
        if not contract:
            add(r, 'vendors', 'renewal', 'Contract Renewal', r.get('contract_renewal'))
            expiration = r.get('contract_expiration') or r.get('contract_end')
            if calendar_day(expiration) != calendar_day(r.get('contract_renewal')):
                add(r, 'vendors', 'expiration', 'Contract Expiration', expiration)
        for a in r.get('assurance_records') or []:
            represented = any(v.get('vendor_id') == r['vendor_id'] and (v.get('vendor_purpose') or 'vendor') in ('assurance', 'vendor') and calendar_day(v.get('due_date')) == calendar_day(a.get('refresh_due')) for v in active['reviews'])
            if r.get('assurance_required') and a.get('required') is not False and not represented:
                add(r, 'vendors', 'assurance-'+a['type'], 'Assurance Refresh · '+a['type'], a.get('refresh_due'))
    for r in active['exceptions']:
        if r.get('status') in ('approved', 'expired'):
            add(r, 'exceptions', 'expiry', 'Risk Acceptance Expiry' if r.get('risk_id') else 'Exception Expiry', r.get('expires_at'))
    for r in active['requirements']:
        if r.get('applicability') != 'not_applicable':
            add(r, 'requirements', 'review', 'Requirement Review', r.get('next_review_date'))

    work = list({r['key']: r for r in work if scoped(r['record'], r['kind'])}.values())
    active = {k: [r for r in rows if scoped(r, k)] for k, rows in active.items()}
    def record_row(r, k, label, severity):
        return row(r, k, 'record', label, r.get('due_date') or r.get('next_review'), severity)
    def high(r):
        return r['severity'] in ('critical', 'high')
    findings = [record_row(r, 'findings', 'Finding', r.get('severity')) for r in active['findings']]
    material = list(filter(high, findings))
    risks = [record_row(r, 'risks', 'Risk', assessed_risk(r)['risk_level']) for r in active['risks']]
    significant = list(filter(high, risks))
    critical = material + significant + list(filter(high, [record_row(r, 'tasks', 'Action Item', r.get('priority')) for r in active['tasks'] if not r.get('finding_id')]))
    metrics = {
        'past_due': [r for r in work if r['day'] is not None and r['day'] < day],
        'due_30d': [r for r in work if r['day'] is not None and day <= r['day'] <= day+30],
        'due_31_90d': [r for r in work if r['day'] is not None and day+31 <= r['day'] <= day+90],
        'critical_high_open': critical,
        'unassigned': list({(r['kind'], r['id']): r for r in work+risks if r['unassigned']}.values()),
    }
    return {'metrics': metrics, 'counts': {k: len(v) for k, v in metrics.items()}, 'work': work, 'activeRecords': active,
            'materialFindings': material, 'significantRisks': significant, 'risks': risks, 'as_of': today[:10]}


def program_status(client, model):
    if client.get('status') in ('archived', 'inactive', 'onboarding'):
        return client['status']
    c = model['counts']
    if any(r['severity'] == 'critical' for r in model['metrics']['past_due']) or c['past_due'] >= 3 or c['critical_high_open'] >= 3:
        return 'action_required'
    setup = any(r['status'] == 'remediated' or r['kind'] == 'reviews' and r['day'] is None for r in model['work']) or any(r['status'] != 'accepted' and not r['severity'] for r in model['risks'])
    return 'needs_attention' if c['past_due'] or c['due_30d'] or c['critical_high_open'] or c['unassigned'] or setup else 'healthy'


def portfolio_item(item, client, today):
    overdue = item['day'] is not None and item['day'] < calendar_day(today)
    return {**{k: item[k] for k in ('key', 'title', 'type', 'event', 'owner_id', 'due_date', 'status', 'severity')},
            'entity_type': 'policy' if item['kind'] == 'policies' else item['kind'][:-1], 'entity_id': item['id'], 'id': item['id'], 'client_id': client['client_id'], 'client_name': client['name'],
            'owner_name': None if item['unassigned'] else item['owner'], 'overdue': overdue,
            'priority': item['severity'] if item['severity'] in ('critical', 'high') else 'overdue' if overdue else 'due_soon'}


async def load_records(db, query):
    # Complete management input, not register pagination or a top-N queue.
    import review_occurrences
    import vendor_governance
    records = {kind: await db[kind].find(query, {'_id': 0}).to_list(None) for kind in KINDS}
    records['reviews'] = [review_occurrences.view(r) for r in records['reviews']]
    records['risks'] = [assessed_risk(r) for r in records['risks']]
    records['vendors'] = [vendor_governance.view(r, records['reviews']) for r in records['vendors']]
    for rows in records.values():
        for r in rows:
            r.pop('_governance_lock', None)
    return records


def management_for_scope(records, *, today, members=(), scope='org', user_id=None):
    client_ids = {r['client_id'] for rows in records.values() for r in rows}
    models = [management_model({k: [r for r in rows if r['client_id'] == cid] for k, rows in records.items()}, cid,
                              today=today, members=members, scope=scope, user_id=user_id) for cid in sorted(client_ids)]
    metrics = {k: [r for m in models for r in m['metrics'][k]] for k in METRICS}
    return {'metrics': metrics, 'counts': {k: len(rows) for k, rows in metrics.items()}, 'as_of': today[:10],
            **{k: [r for m in models for r in m[k]] for k in ('work', 'materialFindings', 'significantRisks')},
            'activeRecords': {k: [r for m in models for r in m['activeRecords'][k]] for k in KINDS}}
