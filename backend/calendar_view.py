"""Bounded due-date Calendar projection. Reading never advances Review recurrence."""
from datetime import date, timedelta
from typing import Literal
from fastapi import HTTPException
import review_occurrences

COMMON = ['client_id', 'title', 'status', 'due_date', 'owner_id', 'assignee_id']
REVIEW_FIELDS = ['review_id', 'review_type', 'recurrence', 'custom_recurrence_days', 'schedule_anchor',
                 'current_occurrence_id', 'vendor_purpose', 'period']


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
    permitted = admin or user.get('role') == 'client_contributor'
    movable = permitted and not terminal and (kind != 'review' or admin and row.get('vendor_purpose') != 'contract')
    oid = row.get('occurrence_id') or review_occurrences.occurrence_id(row) if kind == 'review' else None
    return {'id': row[kind+'_id'], 'key': f'{kind}:{row[kind+"_id"]}:{oid or "current"}',
            'client_id': row['client_id'], 'kind': kind, 'title': row.get('title'), 'status': row.get('status'),
            'owner_id': row.get('owner_id') or row.get('assignee_id'), 'due_date_iso': row.get('due_date'),
            'review_type': row.get('review_type'), 'period': row.get('period') if kind == 'review' else None,
            'occurrence_id': oid, 'historical': terminal, 'can_reschedule': bool(movable)}


async def read(s, query, user, start=None, end=None, scope: Literal['active', 'history', 'all']='active'):
    first, last = window(start, end)
    date_query = {'$gte': first, '$lt': (date.fromisoformat(last)+timedelta(days=1)).isoformat()}
    entries = {}

    def add(row, kind, historical=False):
        value = item(row, kind, user, s.CLOSED, historical)
        if scope == 'active' and value['historical'] or scope == 'history' and not value['historical']:
            return
        entries[value['key']] = value

    for kind in ('review', 'finding', 'task'):
        fields = COMMON + (REVIEW_FIELDS if kind == 'review' else [kind+'_id'])
        status_query = {} if scope == 'all' else {'status': {'$in' if scope == 'history' else '$nin': s.CLOSED[kind+'s']}}
        rows = await s.db[kind+'s'].find({**query, **status_query, 'due_date': date_query}, {'_id': 0, **dict.fromkeys(fields, 1)}).to_list(5001)
        if len(rows) > 5000:
            raise HTTPException(413, 'Too many Calendar entries. Choose a shorter period; no partial results are shown.')
        for row in rows:
            add(row, kind)
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
    result = {'reviews': {}, 'findings': {}, 'tasks': {}}
    for value in sorted(entries.values(), key=lambda r: (r['due_date_iso'],r['historical'],r['title'] or '',r['key'])):
        result[value['kind']+'s'].setdefault(value['due_date_iso'][:10], []).append(value)
    return result
