"""Optional client context; source records and permissions remain in their modules."""
import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt, ValidationError, create_model

CATALOG = json.loads((Path(__file__).parent.parent/'frontend/src/lib/clientProfileFields.json').read_text())


def section_model(section):
    fields = {}
    for field in CATALOG['sections'][section]:
        options = field.get('options')
        if isinstance(options, str):
            options = CATALOG['options'][options]
        kind = field['type']
        annotation = Literal[tuple(options)] if options else StrictInt if kind == 'number' else str
        if kind == 'multi':
            annotation = list[annotation]
        bounds = {'ge': 0, 'le': 100000000} if kind == 'number' else {'max_length': 40 if kind == 'multi' else 2000}
        fields[field['id']] = (annotation | None, Field(default=None, **bounds))
    return create_model(section+'Profile', __config__=ConfigDict(extra='forbid', strict=True), **fields)


MODELS = {key: section_model(key) for key in CATALOG['sections']}


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    section: Literal['organization','technical','security','scope']
    values: dict
    expected_updated_at: str | None = Field(default=None, max_length=100)


def validate_values(section, values):
    try:
        result = MODELS[section].model_validate(values).model_dump(exclude_unset=True)
    except ValidationError:
        raise HTTPException(422, 'Invalid profile field, type or selection')
    for field in CATALOG['sections'][section]:
        value = result.get(field['id'])
        if isinstance(value, str):
            result[field['id']] = value.strip() or None
        if field['type'] == 'date' and value:
            try:
                if date.fromisoformat(value).isoformat() != value: raise ValueError()
            except ValueError:
                raise HTTPException(422, 'Invalid profile date')
        if isinstance(value, list):
            if len(set(value)) != len(value) or (len(value)>1 and any(v in value for v in ('Unknown','None'))):
                raise HTTPException(422, 'Unknown and None cannot be combined with other selections')
    return result


def baseline_view(client):
    if client.get('initial_program_baseline'):
        return client['initial_program_baseline']
    saved = client.get('onboarding_baseline') or {}
    return {'state': saved, 'legacy': True, 'completed_at': None} if saved.get('completed') else None


async def recorded_baseline(s,client):
    saved=baseline_view(client)
    if saved: return saved
    # The original six-step workflow recorded completion only in the audit log.
    event=await s.db.audit_logs.find_one({'client_id':client['client_id'],'action':'onboarding-complete'},sort=[('at',1)])
    if event:
        return {'state':{},'legacy':True,'completed_at':event.get('at'),'completed_by':event.get('user_id')}
    return None


def recorded_onboarding_state(client, *, legacy_completed=False):
    """Read-only status from the same saved/legacy proof used by recorded_baseline."""
    if not isinstance(client.get('client_id'), str) or not client['client_id'].strip():
        return 'unknown'
    initial, saved = client.get('initial_program_baseline'), client.get('onboarding_baseline')
    has_snapshot = isinstance(initial, dict) and bool(initial)
    has_saved_completion = isinstance(saved, dict) and saved.get('completed') is True
    if has_snapshot or has_saved_completion or legacy_completed:
        return 'complete'
    updated_at = saved.get('updated_at') if isinstance(saved, dict) else None
    if (isinstance(saved, dict) and saved.get('completed') is False
            and isinstance(updated_at, str) and re.match(r'^\d{4}-\d{2}-\d{2}(?:$|T| )', updated_at)):
        try:
            datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
            return 'in_progress'
        except ValueError:
            pass
    return 'unknown'


def router_for(s):
    router = APIRouter(prefix='/api')

    async def client_for(cid, user, write=False):
        if not s._can_access_client(user,cid) or (write and user.get('role') not in ('super_admin','platform_admin')):
            raise HTTPException(403,'Forbidden for this client')
        client = await s.db.clients.find_one({'client_id':cid},{'_id':0})
        if not client: raise HTTPException(404,'Client not found')
        import r4_services
        r4_services.assert_settled(client)
        return client

    @router.get('/clients/{cid}/profile')
    async def read(cid:str, user=Depends(s.get_current_user)):
        client = await client_for(cid,user)
        baseline=await recorded_baseline(s,client)
        # Reuse the audit log; do not create a parallel profile-history collection.
        history = await s.db.audit_logs.find({'client_id':cid,'$or':[{'action':{'$in':['client-profile-updated','program-applicability-updated']}},{'action':'update','entity_type':'client'}]},
            {'_id':0,'action':1,'at':1,'user_name':1,'meta':1}).sort('at',-1).limit(50).to_list(50)
        return {'client_id':cid,'profile':client.get('profile') or {},'scope_confirmation':client.get('profile_scope_confirmation'),'updated_at':client.get('updated_at'),
                'baseline':baseline,'completed':baseline is not None,
                'history':history}

    @router.patch('/clients/{cid}/profile')
    async def update(cid:str, body:ProfileUpdate, user=Depends(s.get_current_user)):
        client = await client_for(cid,user,True)
        s._require_snapshot(body.model_dump(exclude_unset=True),client)
        values = validate_values(body.section,body.values)
        old = (client.get('profile') or {}).get(body.section) or {}
        merged = {**old,**values}
        changes = {key:{'before':old.get(key),'after':value} for key,value in values.items() if old.get(key)!=value}
        confirm_scope = body.section == 'scope' and any(merged.values())
        if not changes and not confirm_scope: return {'ok':True}
        at = s._next_write_time(client.get('updated_at'))
        fields = {f'profile.{body.section}':merged,'updated_at':at}
        if body.section == 'scope':
            fields['profile_scope_confirmation'] = {'at':at,'by':user.get('name') or user.get('user_id')} if confirm_scope else None
        changed = await s.db.clients.update_one({'client_id':cid,'updated_at':client.get('updated_at'),'_r4_context_pending':None},
            {'$set':fields})
        if not changed.matched_count: raise HTTPException(409,'Profile changed; reload before saving')
        await s.audit(user,'client-profile-updated','client',cid,cid,meta={'section':body.section,'changes':changes})
        return {'ok':True}
    return router
