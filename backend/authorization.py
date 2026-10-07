"""Role families and the server-side operational authorization contract.

Persisted role IDs are retained. Membership is always explicit except for the
Platform Owner. Route and lifecycle checks further restrict these permissions.
"""
from fastapi import HTTPException
from create_requests import digest

OWNER = 'super_admin'
PROVIDER = 'platform_admin'
MANAGER = 'client_grc_manager'
CONTRIBUTOR = 'client_contributor'
READER = 'client_readonly'
CLIENT_ROLES = {MANAGER, CONTRIBUTOR, READER}
ROLES = {OWNER, PROVIDER, *CLIENT_ROLES}

def role_of(user):
    # Historical read-only spelling, never an elevation or arbitrary-role fallback.
    return READER if user.get('role') == 'client_viewer' else user.get('role')


def can_access(user, client_id):
    return role_of(user) in ROLES and bool(client_id) and (
        global_scope(user) or client_id in (user.get('client_ids') or []))


def global_scope(user):
    return role_of(user) == OWNER or role_of(user) == PROVIDER and user.get('all_clients') is True


def writable(user):
    return user.get('role') in {OWNER, PROVIDER, MANAGER, CONTRIBUTOR}


def scope(user, client_id=None):
    if role_of(user) not in ROLES:
        raise HTTPException(403, 'Unsupported role')
    if client_id:
        if not can_access(user, client_id):
            raise HTTPException(403, 'Forbidden for this client')
        return {'client_id': client_id}
    return {} if global_scope(user) else {'client_id': {'$in': user.get('client_ids') or []}}


def require_program_admin(user):
    if user.get('role') not in {OWNER, PROVIDER}:
        raise HTTPException(403, 'Program configuration requires a service-provider administrator')


OWNERS = {
    'reviews': ('owner_id', 'reviewer_id'), 'tasks': ('assignee_id', 'owner_id'),
    'findings': ('owner_id',), 'risks': ('owner_id',), 'policies': ('owner_id',),
    'vendors': ('business_owner_id',), 'assets': ('owner_id',),
    'framework_assessments': ('owner_id',), 'ai_systems': ('owner_id','technical_owner_id'),
}


def require_assigned(user, kind, record):
    if kind == 'tasks' and not (record.get('assignee_id') or record.get('owner_id')) and record.get('created_by') == user.get('user_id'):
        return
    if user.get('role') == CONTRIBUTOR and not any(
            record.get(field) == user.get('user_id') for field in OWNERS.get(kind, ())):
        raise HTTPException(403, 'This activity must be assigned to you')


# Explicit client mutation allowlist. Unknown/new operations are denied until
# their contract is reviewed. Self-service never grants business-record writes.
CLIENT_OPERATIONS = {
    ('POST', '/api/{kind}'),
    ('PATCH', '/api/{kind}/{item_id}'),
    ('POST', '/api/evidence'), ('POST', '/api/comments'),
    ('POST', '/api/reviews/{review_id}/start'),
    ('POST', '/api/reviews/{review_id}/complete'),
    ('POST', '/api/reviews/{review_id}/create-finding'),
    ('PATCH', '/api/reviews/{review_id}/iso-audit'),
    ('PATCH', '/api/reviews/{review_id}/iso-audit/{item_key}'),
    ('PATCH', '/api/framework_assessments/{aid}'),
    ('POST', '/api/framework_assessments/{aid}/findings'),
    ('PUT', '/api/framework_assessments/{aid}/guided-assessment'),
}


async def object_body(request):
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(422, 'A JSON object is required')
    if not isinstance(body, dict):
        raise HTTPException(422, 'A JSON object is required')
    return body


async def require_creation_assignee(db, user, client_id, assignee_id):
    """The existing Task-create rule, including work derived by another command."""
    role = role_of(user)
    if role == CONTRIBUTOR and assignee_id not in (None, '', user['user_id']):
        raise HTTPException(403, 'Contributors may create work only for themselves')
    if role == MANAGER and assignee_id:
        target = await db.users.find_one({'user_id': assignee_id, 'status': 'active',
            'role': {'$in': list(CLIENT_ROLES)}, 'client_ids': client_id})
        if not target:
            raise HTTPException(403, 'Assign an existing authorized client user')


async def authorize_request(request, user, db):
    request.scope['security_actor'] = user.get('user_id')
    role = role_of(user)
    user['role'] = role
    if role not in ROLES:
        raise HTTPException(403, 'Unsupported role')
    if user.get('password_change_required') and (request.method, request.scope['route'].path) not in {
            ('GET', '/api/auth/me'), ('PATCH', '/api/me/password'), ('POST', '/api/auth/logout')}:
        raise HTTPException(403, 'Change your password before continuing to client data')
    method = request.method
    if method in {'GET', 'HEAD', 'OPTIONS'}:
        return
    path = request.scope['route'].path
    if (method, path) in {
        ('PATCH','/api/me'), ('PATCH','/api/me/password'), ('PATCH','/api/me/preferences'),
        ('POST','/api/me/favorites/{client_id}'), ('DELETE','/api/me/favorites/{client_id}'),
        ('POST','/api/notifications/{nid}/read'), ('POST','/api/notifications/read-all'),
        ('POST','/api/auth/logout'),
    }:
        return
    # Archived tenants retain history but accept no ordinary program changes.
    # Resolve the resource's trusted tenant, never the caller's claimed tenant.
    client_id = request.path_params.get('client_id')
    params = request.path_params
    kind = params.get('kind')
    identity = params.get('item_id')
    if params.get('review_id'):
        kind, identity = 'reviews', params['review_id']
    if params.get('aid'):
        kind, identity = 'ai_systems' if path.startswith('/api/ai_systems/') else 'framework_assessments', params['aid']
    for parameter, collection in {'risk_id': 'risks', 'vendor_id': 'vendors', 'finding_id': 'findings',
            'policy_id': 'policies', 'contact_id': 'contacts', 'ev_id': 'evidence', 'eid': 'evidence', 'exception_id': 'exceptions'}.items():
        if params.get(parameter):
            kind, identity = collection, params[parameter]
    if identity and kind in {*OWNERS, 'evidence', 'exceptions', 'contacts', 'requirements'}:
        key = {'framework_assessments':'framework_assessment_id', 'ai_systems':'ai_system_id', 'tasks':'task_id', 'policies':'policy_id'}.get(kind, kind[:-1]+'_id')
        if kind == 'evidence': key = 'evidence_id'
        row = await db[kind].find_one({key: identity})
        client_id = (row or {}).get('client_id')
    if role != OWNER and method in {'POST', 'PATCH', 'PUT'} and 'application/json' in request.headers.get('content-type', ''):
        body = await object_body(request)
        if not client_id:
            client_id = body.get('client_id')
        if path == '/api/comments':
            collection = body.get('entity_type', '')
            collection = collection if collection in OWNERS else collection + 's'
            if collection in OWNERS:
                key = {'framework_assessments':'framework_assessment_id', 'ai_systems':'ai_system_id', 'policies':'policy_id'}.get(collection, collection[:-1] + '_id')
                parent = await db[collection].find_one({key: body.get('entity_id')})
                client_id = (parent or {}).get('client_id')
        if path == '/api/bulk' and body.get('kind') in OWNERS:
            collection = body['kind']
            key = {'framework_assessments':'framework_assessment_id', 'ai_systems':'ai_system_id', 'policies':'policy_id'}.get(collection, collection[:-1] + '_id')
            tenants = await db[collection].distinct('client_id', {key: {'$in': body.get('ids', [])}})
            if await db.clients.find_one({'client_id': {'$in': tenants}, 'status': 'archived'}):
                raise HTTPException(403, 'Archived clients are read-only; ask a Super Admin to restore the client')
    if role != OWNER and client_id and await db.clients.find_one({'client_id': client_id, 'status': 'archived'}):
        raise HTTPException(403, 'Archived clients are read-only; ask a Super Admin to restore the client')
    if role in {OWNER, PROVIDER}:
        if role != OWNER and (path == '/api/clients' or path.startswith('/api/reminders/')):
            raise HTTPException(403, 'Platform Owner required')
        return
    if role == READER:
        raise HTTPException(403, 'Read-only role')
    if (method, path) not in CLIENT_OPERATIONS:
        raise HTTPException(403, 'This operation requires a service-provider administrator')
    params = request.path_params
    kind = params.get('kind')
    applied_retry = False
    record_id = params.get('item_id')
    if path == '/api/{kind}' and method == 'POST':
        if kind != 'tasks':
            raise HTTPException(403, 'Creating this record requires a service-provider administrator')
        body = await object_body(request)
        await require_creation_assignee(db, user, body.get('client_id'), body.get('assignee_id'))
    if params.get('review_id'):
        kind, record_id = 'reviews', params['review_id']
    if params.get('aid'):
        kind, record_id = 'framework_assessments', params['aid']
    if record_id and kind in OWNERS:
        key = {'framework_assessments':'framework_assessment_id','tasks':'task_id'}.get(kind, kind[:-1]+'_id')
        if kind == 'policies': key = 'policy_id'
        row = await db[kind].find_one({key:record_id, **scope(user)}, {'_id':0})
        if not row:
            raise HTTPException(403, 'Record unavailable for this client')
        if kind == 'tasks' and method == 'PATCH' and request.headers.get('Idempotency-Key'):
            identity = digest([user['user_id'], row['client_id'], 'tasks/' + record_id + '/update', request.headers['Idempotency-Key']])
            receipt = await db.create_requests.find_one({'_id': identity})
            if receipt:
                if receipt['fingerprint'] != digest(await object_body(request)):
                    raise HTTPException(409, 'This request has different data; restore the original request before retrying')
                before = receipt.get('task_before', {})
                # An exact actor-bound retry may finish after its own assignment change.
                # Current role and tenant access were checked above; new intents still
                # require current assignment, and pending writes retain their marker.
                if (before.get('task_id') == record_id and before.get('client_id') == row['client_id']
                        and (receipt['state'] == 'complete' or row.get('_ticket_command') == identity)):
                    applied_retry = True
                    row = before
        require_assigned(user, kind, row)
        if method == 'PATCH':
            body = await object_body(request)
            for field in set(body) & set(OWNERS[kind]):
                if body[field] == row.get(field):
                    continue
                if role == CONTRIBUTOR and not (kind == 'tasks' and body[field] in (None, '', user['user_id'])):
                    raise HTTPException(403, 'Contributors cannot reassign this activity')
                if body[field] and not applied_retry:
                    target = await db.users.find_one({'user_id':body[field], 'status':'active',
                        'role':{'$in':list(CLIENT_ROLES)}, 'client_ids':row['client_id']})
                    if not target:
                        raise HTTPException(403, 'Assign an existing authorized client user')
    if method == 'PATCH' and path == '/api/{kind}/{item_id}':
        if kind not in OWNERS:
            raise HTTPException(403, 'This resource requires service-provider administration')
        body = await object_body(request)
        fields = {field for field, value in body.items()
                  if field not in {'expected_updated_at', 'expected_occurrence_id'} and value != row.get(field)
                  and not (value in (None, '') and row.get(field) in (None, ''))}
        allowed = {'notes'}
        if kind == 'tasks': allowed |= {'status', 'description', 'resolution', 'title', 'priority', 'due_date', 'reason', 'context'}
        if kind == 'tasks' and role == CONTRIBUTOR and body.get('assignee_id') in (None, '', user['user_id']):
            allowed.add('assignee_id')
        if kind == 'findings': allowed |= {'remediation_plan'}
        if role == MANAGER and kind in {'tasks','findings','reviews','risks','policies','vendors','assets'}:
            allowed |= set(OWNERS.get(kind, ()))
        if fields - allowed:
            raise HTTPException(403, 'These fields require service-provider administration')
