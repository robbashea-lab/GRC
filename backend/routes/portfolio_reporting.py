"""Internal, tenant-scoped reporting over a narrowed authorized client cohort."""
from typing import Dict, Literal, Optional
import re
from fastapi import APIRouter, Depends, HTTPException, Query
import server
from server import get_current_user
import authorization
import portfolio_progress
import portfolio_activity
import portfolio_reporting as reports

router = APIRouter(prefix='/api/portfolio/reporting', tags=['portfolio reporting'])


async def cohort(user, client_ids=None, include_archived=False):
    if user.get('role') not in ('super_admin', 'platform_admin'):
        raise HTTPException(403, 'Portfolio reporting is restricted to internal admins')
    query = authorization.scope(user)
    if client_ids is not None:
        ids = list(dict.fromkeys(client_ids.split(','))) if client_ids else []
        if len(ids) > 500 or any(not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', cid) for cid in ids):
            raise HTTPException(422, 'Invalid portfolio client scope')
        if any(not authorization.can_access(user, cid) for cid in ids):
            raise HTTPException(403, 'Forbidden for this client')
        query = {'$and': [query, {'client_id': {'$in': ids}}]}
    if not include_archived:
        query = {'$and': [query, {'status': {'$ne': 'archived'}}]}
    clients = await server.db.clients.find(query, {'_id': 0}).sort('client_id', 1).to_list(501)
    if len(clients) > 500:
        raise HTTPException(413, 'Portfolio reporting supports at most 500 clients per view; narrow the current filters')
    return clients


def cutoff(value):
    current = reports.now()
    if value:
        parsed = reports.date_time(value)
        if parsed > reports.date_time(current):
            raise HTTPException(422, 'The reporting cutoff cannot be in the future')
        return parsed.isoformat()
    return current


@router.get('/overview')
async def overview(client_ids: Optional[str] = Query(None, max_length=65000), include_archived: bool = False,
                   range: Literal['30d', '6m', '12m'] = '30d', user: Dict = Depends(get_current_user)):
    clients = await cohort(user, client_ids, include_archived)
    at = cutoff(None)
    programs = []
    frameworks = {}
    for client in clients:
        positions = await portfolio_progress.build_current_positions(server.db, client, as_of=at)
        for position in positions:
            history = await reports.history_positions(server.db, position, range, at)
            position['comparison'] = history['comparison']
            programs.append(position)
            if position['current']['availability'] == 'unavailable':
                continue
            entry = frameworks.setdefault(position['program_key'], {'key': position['program_key'],
                'label': position['program_label'], 'framework_key': position['framework_key'], 'clients': []})
            entry['clients'].append({'client_id': client['client_id'], 'name': client['name']})
    for framework in frameworks.values():
        framework['client_count'] = len(framework['clients'])
    recent = await portfolio_activity.count_activity(server.db, user, clients, at, days=7)
    return {'total_clients': len(clients), 'as_of': at, 'programs': programs, 'frameworks': list(frameworks.values()),
            'recent_changes_count': recent, 'coverage': await reports.coverage(server.db, [c['client_id'] for c in clients], at)}


@router.get('/history')
async def history(client_id: str = Query(..., min_length=1, max_length=128, pattern=r'^[A-Za-z0-9_-]+$'),
                  program_key: str = Query(..., min_length=1, max_length=80, pattern=r'^[A-Za-z0-9_-]+$'),
                  range: Literal['30d', '6m', '12m'] = '30d', include_archived: bool = False,
                  user: Dict = Depends(get_current_user)):
    clients = await cohort(user, client_id, include_archived)
    if not clients:
        raise HTTPException(404, 'Client is unavailable in the current portfolio scope')
    at = cutoff(None)
    positions = await portfolio_progress.build_current_positions(server.db, clients[0], as_of=at)
    position = next((p for p in positions if p['program_key'] == program_key), None)
    if not position:
        raise HTTPException(404, 'Enabled program not found')
    payload = await reports.history_positions(server.db, position, range, at)
    return {**position, **payload, 'as_of': at, 'current': position['current'],
            'coverage': await reports.coverage(server.db, [client_id], at, position['framework_key'])}


@router.get('/activity')
async def activity(client_ids: Optional[str] = Query(None, max_length=65000), include_archived: bool = False,
                   days: int = Query(7),
                   client_id: Optional[str] = Query(None, max_length=128, pattern=r'^[A-Za-z0-9_-]+$'),
                   type: Optional[Literal['Assessments', 'Findings', 'Risks', 'Policies', 'Evidence', 'Scope']] = None,
                   cursor: Optional[str] = Query(None, max_length=2048), as_of: Optional[str] = Query(None, max_length=64),
                   limit: int = Query(50, ge=1, le=100), user: Dict = Depends(get_current_user)):
    if days not in (7, 30, 90):
        raise HTTPException(422, 'Choose 7, 30, or 90 days')
    clients = await cohort(user, client_ids, include_archived)
    if client_id:
        if not authorization.can_access(user, client_id):
            raise HTTPException(403, 'Forbidden for this client')
        if client_id not in {c['client_id'] for c in clients}:
            raise HTTPException(404, 'Client is unavailable in the current portfolio scope')
        clients = [c for c in clients if c['client_id'] == client_id]
    at = cutoff(as_of)
    return await portfolio_activity.read_activity(server.db, user, clients, at, days=days,
            change_type=type, cursor=cursor, limit=limit)
