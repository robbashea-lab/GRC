"""Remediation commands reuse durable receipts and existing record authorization."""
from fastapi import HTTPException
import create_requests
import action_items
import assignment_eligibility
import remediation
import uuid


async def capture_finding(s, finding, after, user, at, action):
    patch,event=s._portfolio_event_patch('finding',finding['finding_id'],finding['client_id'],user,finding,after,at,action)
    if event and finding.get('framework_assessment_id'):
        source=await s.db.framework_assessments.find_one({
            'framework_assessment_id':finding['framework_assessment_id'],'client_id':finding['client_id']},
            {'_id':0,'framework_key':1})
        if source and isinstance(source.get('framework_key'),str):
            event['program_keys']=[source['framework_key']]
    return patch,event


async def require_settled(s, finding, identity):
    commands=[d.get('request_id') for d in finding.get('decision_history',[])]
    tasks=await s.db.tasks.find({'finding_id':finding['finding_id'],'client_id':finding['client_id']},{'_ticket_command':1}).to_list(None)
    commands.extend(t.get('_ticket_command') for t in tasks)
    if await s.db.create_requests.find_one({'_id':{'$in':[c for c in commands if c and c!=identity]},'state':'pending'}):
        raise HTTPException(409,'An earlier remediation command needs recovery; retry that request first')


async def reopen(s, finding, body, user):
    if user.get('role') not in ('super_admin','platform_admin'):
        raise HTTPException(403, 'Only platform-level roles can reopen remediation')
    fid,cid=finding['finding_id'],finding['client_id']
    async def execute(identity):
        current=await s.db.findings.find_one({'finding_id':fid,'client_id':cid},{'_id':0})
        await require_settled(s,current,identity)
        decision=next((d for d in current.get('decision_history',[]) if d.get('request_id')==identity),None)
        portfolio_event_id=current.get('_portfolio_activity_decision_event_ids',{}).get(identity)
        if not decision:
            s._require_snapshot(body,current)
            if current.get('status') not in ('closed','accepted'):
                raise HTTPException(409,'Only completed or accepted remediation can be reopened')
            actions=await s.db.tasks.find({'finding_id':fid,'client_id':cid},{'_id':0}).to_list(None)
            receipt=await s.db.create_requests.find_one({'_id':identity})
            own_task=(receipt.get('reopen_task') or {}).get('task_id')
            active=[t for t in actions if t.get('status') not in ('done','cancelled') and t['task_id']!=own_task]
            primary=next((t for t in actions if t['task_id']==current.get('primary_task_id')),None)
            if not current.get('primary_task_id') and len(actions)==1:primary=actions[0]
            # Historical outstanding work is reopened in place, never duplicated.
            tid=current.get('primary_task_id')
            if not active:
                receipt=await s.db.create_requests.find_one({'_id':identity})
                task=receipt.get('reopen_task')
                if not task:
                    source=primary or current
                    task={'task_id':'tsk_'+uuid.uuid5(uuid.NAMESPACE_URL,identity).hex,
                        'client_id':cid,'finding_id':fid,'title':source.get('title') if primary else current.get('remediation_title') or current['title'],
                        'description':source.get('description') if primary else current.get('remediation_plan'),
                        'assignee_id':source.get('assignee_id') if primary else current.get('owner_id'),
                        'due_date':source.get('due_date'),'priority':source.get('priority') or current.get('severity','medium'),
                        'status':'open','source_type':'finding','source_id':fid,'created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id'],'_ticket_command':identity}
                    if task.get('assignee_id') and not await assignment_eligibility.eligible(s.db,task['assignee_id'],cid,s._can_access_client):
                        task['assignee_id'] = None
                    task=await action_items.prepare(s.db,task,s._can_access_client)
                    await s.db.create_requests.update_one({'_id':identity},{'$set':{'reopen_task':task}})
                task=await create_requests.insert_primary(s.db,'tasks',task,identity)
                tid=task['task_id']
            decision={'action':'reopened','by':user['user_id'],'at':s._next_write_time(current.get('updated_at')),
                      'request_id':identity,'previous_primary_task_id':current.get('primary_task_id')}
            updates={'status':'in_remediation','primary_task_id':tid,'updated_at':decision['at']}
            after={**current,**updates,'decision_history':[*current.get('decision_history',[]),decision]}
            portfolio_patch,portfolio_event=await capture_finding(s,current,after,user,decision['at'],'reopen')
            if portfolio_event:
                portfolio_event_id=portfolio_event['event_id']
                portfolio_patch['_portfolio_activity_decision_event_ids.'+identity]=portfolio_event_id
            await s.db.create_requests.update_one({'_id':identity},{'$set':{'primary_started':True}})
            changed=await s.db.findings.update_one({'finding_id':fid,'client_id':cid,'updated_at':current.get('updated_at')},
                {'$set':{**updates,**portfolio_patch},'$push':{'decision_history':decision}})
            if not changed.modified_count:raise HTTPException(409,'Finding changed; reload before reopening')
        await s.audit(user,'Remediation reopened','finding',fid,cid,meta={
            **decision,'_portfolio_activity_event_id':portfolio_event_id})
        receipt=await s.db.create_requests.find_one({'_id':identity})
        if receipt.get('reopen_task'):
            task=receipt['reopen_task']
            await s.audit(user,'create','task',task['task_id'],cid,meta={'from_finding':fid,'reopened':True})
            if task.get('assignee_id') and task['assignee_id']!=user['user_id']:
                await s.create_notification(user_id=task['assignee_id'],title='Reopened remediation: '+task['title'],
                    kind='task_assigned',entity_type='tasks',entity_id=task['task_id'],client_id=cid)
        if current.get('review_id'):
            review=await s.db.reviews.find_one({'review_id':current['review_id'],'client_id':cid},{'_id':0})
            if review:await s._review_event(user,review,'Remediation reopened',current.get('occurrence_id'),finding_id=fid)
        return await s.db.findings.find_one({'finding_id':fid,'client_id':cid},{'_id':0,'_remediation_lock':0})
    return await create_requests.run(s.db,create_requests.digest(body['request_id']),user['user_id'],cid,
        'findings/'+fid+'/reopen',body,execute)


async def plan_rework(s, finding, actions, identity, user):
    """Retain the replacement before the Finding write; insert only after it wins."""
    receipt = await s.db.create_requests.find_one({'_id': identity})
    if receipt.get('rework_task'):
        task = receipt['rework_task']
        if task.get('assignee_id') and not await assignment_eligibility.eligible(
                s.db, task['assignee_id'], task['client_id'], s._can_access_client):
            task = {**task, 'assignee_id': None}
            await s.db.create_requests.update_one({'_id': identity}, {'$set': {'rework_task': task}})
        return task
    source = next((task for task in actions if task['task_id'] == finding.get('primary_task_id')), actions[0])
    at = s._now()
    task = {'task_id': 'tsk_' + uuid.uuid5(uuid.NAMESPACE_URL, identity).hex,
            'client_id': finding['client_id'], 'finding_id': finding['finding_id'],
            'title': source.get('title') or finding.get('remediation_title') or finding['title'],
            'description': source.get('description'), 'assignee_id': source.get('assignee_id') or source.get('owner_id'),
            'due_date': source.get('due_date'), 'priority': source.get('priority') or finding.get('severity', 'medium'),
            'status': 'open', 'source_type': 'finding', 'source_id': finding['finding_id'],
            'created_at': at, 'updated_at': at, 'created_by': user['user_id'], '_ticket_command': identity}
    if task.get('assignee_id') and not await assignment_eligibility.eligible(
            s.db, task['assignee_id'], task['client_id'], s._can_access_client):
        task['assignee_id'] = None
    task = await action_items.prepare(s.db, task, s._can_access_client)
    await s.db.create_requests.update_one({'_id': identity}, {'$set': {'rework_task': task}})
    return task


async def validate(s, finding, body, user, action='validate'):
    fid, cid = finding['finding_id'], finding['client_id']
    if action not in ('validate', 'reject', 'accept'):
        raise HTTPException(422, 'Invalid remediation decision')
    if user.get('role') not in ('super_admin', 'platform_admin'):
        raise HTTPException(403, 'Only platform-level roles can validate remediation')
    if not s._can_access_client(user, cid):
        raise HTTPException(403, 'Forbidden for this client')
    if not body.rationale.strip():
        raise HTTPException(422, 'Validation rationale is required')
    payload = body.model_dump(exclude_unset=True)
    # New ticket callers retain an explicit intent. Keep legacy callers compatible
    # without replaying an old closure after a subsequent reopening.
    key = create_requests.digest(body.request_id or [fid, payload.get('expected_updated_at', finding.get('updated_at')), payload])
    if not body.request_id and 'expected_updated_at' not in payload:
        previous = next((d for d in reversed(finding.get('decision_history', []))
            if d.get('at') == finding.get('updated_at') and d.get('by') == user['user_id']
            and d.get('action') == {'validate': 'validated', 'reject': 'rejected', 'accept': 'accepted'}[action]
            and d.get('legacy_payload') == create_requests.digest(payload)), None)
        if previous:
            key = previous['legacy_key']

    async def execute(identity):
        current = await s.db.findings.find_one({'finding_id':fid, 'client_id':cid}, {'_id':0})
        await require_settled(s,current,identity)
        decision = next((d for d in current.get('decision_history', []) if d.get('request_id') == identity), None)
        portfolio_event_id=current.get('_portfolio_activity_decision_event_ids',{}).get(identity)
        if not decision:
            if action in ('accept', 'reject') or 'expected_updated_at' in payload:
                s._require_snapshot(payload, current)
            if action in ('validate', 'reject') and current.get('status') != 'remediated':
                raise HTTPException(409, 'Finding must be pending validation')
            actions = await remediation.require_independent_validator(s.db, current, user) if action in ('validate', 'reject') else []
            rework = await plan_rework(s, current, actions, identity, user) if action == 'reject' else None
            decision = {'action':{'validate': 'validated', 'reject': 'rejected', 'accept': 'accepted'}[action], 'by':user['user_id'], 'at':s._next_write_time(current.get('updated_at')),
                        'rationale':body.rationale.strip(), 'request_id':identity}
            if rework:
                decision.update(rework_task_id=rework['task_id'], previous_primary_task_id=current.get('primary_task_id'))
            if not body.request_id:
                decision.update(legacy_key=key, legacy_payload=create_requests.digest(payload))
            updates={'status':{'validate': 'closed', 'reject': 'in_remediation', 'accept': 'accepted'}[action],'updated_at':decision['at'],
                **({'validated_by':user['user_id'],'validated_at':decision['at'],'closed_by':user['user_id'],'closed_at':decision['at']} if action=='validate' else {})}
            if rework:
                updates['primary_task_id'] = rework['task_id']
            after={**current,**updates,'decision_history':[*current.get('decision_history',[]),decision]}
            portfolio_patch,portfolio_event=await capture_finding(s,current,after,user,decision['at'],action)
            if portfolio_event:
                portfolio_event_id=portfolio_event['event_id']
                portfolio_patch['_portfolio_activity_decision_event_ids.'+identity]=portfolio_event_id
            await s.db.create_requests.update_one({'_id':identity}, {'$set':{'primary_started':True}})
            result = await s.db.findings.update_one({'finding_id':fid, 'client_id':cid,
                'status':current.get('status'), 'updated_at':current.get('updated_at')}, {'$set':{**updates,**portfolio_patch},
                '$push':{'decision_history':decision}})
            if not result.modified_count:
                raise HTTPException(409, 'Finding changed; reload before validating', headers={'X-Create-Rejected':'true'})
        if action == 'reject':
            receipt = await s.db.create_requests.find_one({'_id': identity})
            rework = receipt.get('rework_task')
            if not rework or rework.get('task_id') != decision.get('rework_task_id'):
                raise HTTPException(409, 'The retained rework command needs recovery')
            await create_requests.insert_primary(s.db, 'tasks', rework, identity)
            await s.audit(user, 'create', 'task', rework['task_id'], cid, meta={'from_finding': fid, 'rework': True})
            if rework.get('assignee_id') and rework['assignee_id'] != user['user_id']:
                await s.create_notification(user_id=rework['assignee_id'], title='Reopened remediation: ' + rework['title'],
                                            kind='task_assigned', entity_type='tasks', entity_id=rework['task_id'], client_id=cid)
        # Identity travels in the business write, surviving lost acknowledgements.
        await s.audit(user, action, 'finding', fid, cid, meta={**decision,'_portfolio_activity_event_id':portfolio_event_id})
        task_event = {'validate': 'Related Finding validated and closed', 'reject': 'Related Finding returned for correction',
                      'accept': 'Related Finding accepted'}[action]
        for task in await s.db.tasks.find({'finding_id':fid,'client_id':cid}, {'_id':0}).to_list(None):
            await s.audit(user, task_event, 'task', task['task_id'], cid, meta={'finding_id':fid})
        if current.get('review_id'):
            review = await s.db.reviews.find_one({'review_id':current['review_id'],'client_id':cid}, {'_id':0})
            if review:
                review_event = {'validate': 'Finding validated and closed', 'reject': 'Finding returned for correction', 'accept': 'Finding accepted'}[action]
                await s._review_event(user, review, review_event,
                    current.get('occurrence_id') or 'occ_'+review['review_id'], finding_id=fid, title=current['title'])
        return await s.db.findings.find_one({'finding_id':fid,'client_id':cid}, {'_id':0,'_remediation_lock':0})

    return await create_requests.run(s.db, key, user['user_id'], cid, 'findings/'+fid+'/'+action, payload, execute)


async def retain_finding(s, finding):
    """Used by single and bulk deletion; never cascade away remediation history."""
    fid, cid = finding['finding_id'], finding['client_id']
    if (finding.get('decision_history') or finding.get('closed_at') or finding.get('validated_at')
            or finding.get('status') in ('closed','accepted','remediated')
            or await s.db.comments.find_one({'entity_type':{'$in':['finding','findings']},'entity_id':fid,'client_id':cid})
            or await s.db.audit_logs.find_one({'entity_id':fid,'client_id':cid,'action':{'$nin':['create','Finding raised']}})
            or await s.db.tasks.find_one({'finding_id':fid,'client_id':cid})
            or await s.db.evidence.find_one({'client_id':cid,'$or':[
                {'linked_type':{'$in':['finding','findings']},'linked_id':fid},
                {'relationships':{'$elemMatch':{'kind':'findings','id':fid}}}]})):
        raise HTTPException(409, 'Findings with remediation or retained history must be preserved')
