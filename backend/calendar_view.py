"""Bounded due-date Calendar projection. Reading never advances Review recurrence."""
from datetime import date, timedelta
from typing import Literal
from fastapi import HTTPException
import review_occurrences
from vendor_governance import day

COMMON = ['client_id', 'title', 'status', 'due_date', 'owner_id', 'assignee_id', 'updated_at']
REVIEW_FIELDS = ['review_id', 'review_type', 'recurrence', 'custom_recurrence_days', 'schedule_anchor',
                 'current_occurrence_id', 'vendor_purpose', 'period', 'recurrence_due_date']


def window(start, end):
    try:
        first = date.fromisoformat(start[:10]) if start else date.today() - timedelta(days=42)
        last = date.fromisoformat(end[:10]) if end else first + timedelta(days=92)
        if not 0 <= (last-first).days <= 366:
            raise ValueError()
        return first.isoformat(), last.isoformat()
    except (ValueError, TypeError):
        raise HTTPException(422, 'Choose a valid Calendar period of no more than 367 days.')


def item(row, kind, user, closed, historical=False):
    row = review_occurrences.view(row) if kind == 'review' else row
    terminal = historical or row.get('status') in closed[kind+'s']
    admin = user.get('role') in ('super_admin', 'platform_admin')
    task_operator = kind=='task' and (user.get('role')=='client_grc_manager' or user.get('role')=='client_contributor' and user.get('user_id') in (row.get('owner_id'),row.get('assignee_id')))
    movable = not terminal and (admin and (kind!='review' or row.get('vendor_purpose')!='contract') or task_operator)
    oid = row.get('occurrence_id') or review_occurrences.occurrence_id(row) if kind == 'review' else None
    return {'id': row[kind+'_id'], 'key': f'{kind}:{row[kind+"_id"]}:{oid or "current"}',
            'client_id': row['client_id'], 'kind': kind, 'title': row.get('title'), 'status': row.get('status'),
            'owner_id': row.get('owner_id') or row.get('assignee_id'), 'due_date_iso': row.get('due_date'),
            'review_type': row.get('review_type'), 'period': row.get('period') if kind == 'review' else None,
            'updated_at':row.get('updated_at'), 'occurrence_id': oid, 'historical': terminal, 'can_reschedule': bool(movable)}


async def read(s, query, user, start=None, end=None, scope: Literal['active', 'history', 'all']='active', overdue_before=None):
    first, last = window(start, end)
    date_query = {'$gte': first, '$lt': (date.fromisoformat(last)+timedelta(days=1)).isoformat()}
    entries = {}
    if overdue_before:
        try:
            if date.fromisoformat(overdue_before).isoformat() != overdue_before:
                raise ValueError()
        except (ValueError, TypeError):
            raise HTTPException(422, 'Choose a valid overdue cutoff date.')

    def add(row, kind, historical=False):
        value = item(row, kind, user, s.CLOSED, historical)
        if scope == 'active' and value['historical'] or scope == 'history' and not value['historical']:
            return
        entries[value['key']] = value

    for kind in ('review', 'finding', 'task'):
        fields = COMMON + (REVIEW_FIELDS if kind == 'review' else [kind+'_id'])
        status_query = {} if scope == 'all' else {'status': {'$in' if scope == 'history' else '$nin': s.CLOSED[kind+'s']}}
        period_query = {'due_date': date_query}
        if overdue_before and scope != 'history':
            period_query = {'$or':[period_query, {'due_date':{'$gte':'0001-01-01', '$lt':overdue_before}, 'status':{'$nin':s.CLOSED[kind+'s']}}]}
        rows = await s.db[kind+'s'].find({**query, **status_query, **period_query}, {'_id': 0, **dict.fromkeys(fields, 1)}).to_list(5001)
        if len(rows) > 5000:
            raise HTTPException(413, 'Too many Calendar entries. Choose a shorter period; no partial results are shown.')
        for row in rows:
            add(row, kind)
    # A Finding with an active Action is represented by that Action in work counts (both stay on the grid).
    finding_ids = [v['id'] for v in entries.values() if v['kind'] == 'finding']
    if finding_ids:
        covered = {t['finding_id'] for t in await s.db.tasks.find({**query, 'finding_id': {'$in': finding_ids}, 'status': {'$nin': s.CLOSED['tasks']}}, {'_id': 0, 'finding_id': 1}).to_list(None)}
        for value in entries.values():
            if value['kind'] == 'finding':
                value['represented'] = value['id'] in covered
    if scope != 'active':
        # Filter and project occurrence snapshots in Mongo; never return whole client history to the browser.
        fields = COMMON + REVIEW_FIELDS + ['occurrence_id']
        history = await s.db.reviews.aggregate([
            {'$match': {**query, 'occurrences': {'$elemMatch': {'due_date': date_query}}}},
            {'$unwind': '$occurrences'}, {'$match': {'occurrences.due_date': date_query}},
            {'$project': {'_id': 0, 'client_id': 1, 'review_id': 1, **dict.fromkeys(['occurrences.'+f for f in fields], 1)}},
            {'$limit': 5001},
        ]).to_list(5001)
        if len(history) > 5000:
            raise HTTPException(413, 'Too many historical Calendar entries. Choose a shorter period.')
        for parent in history:
            occurrence = parent['occurrences']
            if occurrence.get('client_id') not in (None,parent['client_id']) or occurrence.get('review_id') not in (None,parent['review_id']):
                continue
            if occurrence.get('occurrence_id') and occurrence.get('status') in s.CLOSED['reviews']:
                add({**occurrence, 'client_id': parent['client_id'], 'review_id': parent['review_id']}, 'review', True)
    result = {'reviews': {}, 'findings': {}, 'tasks': {}, 'vendor_dates': {}}
    for value in sorted(entries.values(), key=lambda r: (r['due_date_iso'],r['historical'],r['title'] or '',r['key'])):
        result[value['kind']+'s'].setdefault(value['due_date_iso'][:10], []).append(value)
    # Existing derived Vendor dates are read-only, alongside their linked Reviews.
    fields = ['vendor_id','client_id','name','status','business_owner_id','assurance_records','contract_renewal','contract_notice_deadline']
    vendor_dates = [{field:date_query} for field in ('assurance_records.next_follow_up','assurance_records.refresh_due','contract_renewal','contract_notice_deadline')]
    if overdue_before and scope!='history':
        vendor_dates.extend({field:{'$gte':'0001-01-01','$lt':overdue_before}} for field in ('assurance_records.next_follow_up','assurance_records.refresh_due'))
    vendors = await s.db.vendors.find({**query, 'status':{'$nin':['inactive','terminated']}, '$or':vendor_dates}, {'_id':0, **dict.fromkeys(fields,1)}).to_list(5001)
    if len(vendors)>5000:
        raise HTTPException(413, 'Too many Vendor Calendar records; no partial results are shown.')
    vendor_ids = [v['vendor_id'] for v in vendors]
    reviews = await s.db.reviews.find({**query, 'vendor_id':{'$in':vendor_ids}, 'status':{'$nin':s.CLOSED['reviews']}}, {'_id':0,'vendor_id':1,'client_id':1,'vendor_purpose':1,'due_date':1}).to_list(5001) if vendor_ids else []
    if len(reviews)>5000:
        raise HTTPException(413, 'Too many linked Vendor Reviews; no partial results are shown.')
    linked_by_vendor = {}
    for review in reviews:
        linked_by_vendor.setdefault((review['client_id'],review['vendor_id']),[]).append(review)
    today = day(overdue_before) or date.today()
    def vendor_date(v, kind, due, suffix, label, **extra):
        if not due:
            return
        historical = kind!='vendor_assurance' and due<today
        if not first<=due.isoformat()<=last and not (overdue_before and kind=='vendor_assurance' and due<today):
            return
        if scope=='active' and historical or scope=='history' and not historical:
            return
        value = {'id':v['vendor_id'],'vendor_id':v['vendor_id'],'client_id':v['client_id'], 'key':f"{kind}:{v['vendor_id']}:{suffix}",
                 'kind':kind,'title':label+' — '+v.get('name',''), 'status':'scheduled','due_date_iso':due.isoformat(),
                 'owner_id':v.get('business_owner_id'),'historical':historical,'can_reschedule':False, **extra}
        result['vendor_dates'].setdefault(due.isoformat(),[]).append(value)
    for v in vendors:
        linked = linked_by_vendor.get((v['client_id'],v['vendor_id']),[])
        for index, assurance in enumerate(v.get('assurance_records') or []):
            due=day(assurance.get('next_follow_up') or assurance.get('refresh_due'))
            if assurance.get('superseded_by') or any((r.get('vendor_purpose') or 'vendor') in ('vendor','assurance') and day(r.get('due_date'))==due for r in linked):
                continue
            vendor_date(v,'vendor_assurance',due,assurance.get('assurance_id') or f'legacy:{index}', 'Security Assurance Due · '+str(assurance.get('type') or 'Assurance'), assurance_id=assurance.get('assurance_id'))
        notice,renewal=day(v.get('contract_notice_deadline')),day(v.get('contract_renewal'))
        if renewal!=notice and not any(r.get('vendor_purpose')=='contract' for r in linked):
            vendor_date(v,'vendor_contract_renewal',renewal,'renewal','Contract Renewal')
        vendor_date(v,'vendor_contract_notice',notice,'notice','Contract Notice Deadline')
    if sum(map(len,result['vendor_dates'].values()))>5000:
        raise HTTPException(413, 'Too many Vendor Calendar entries; no partial results are shown.')
    for values in result['vendor_dates'].values():
        values.sort(key=lambda v:(v['title'],v['key']))
    return result
