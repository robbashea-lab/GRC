"""Remediation commands reuse durable receipts and existing record authorization."""
from fastapi import HTTPException
import create_requests
import action_items
import uuid


async def reopen(s, finding, body, user):
    if user.get('role') not in ('super_admin','platform_admin'):
        raise HTTPException(403, 'Only platform-level roles can reopen remediation')
    fid,cid=finding['finding_id'],finding['client_id']
    async def execute(identity):
        current=await s.db.findings.find_one({'finding_id':fid,'client_id':cid},{'_id':0})
        decision=next((d for d in current.get('decision_history',[]) if d.get('request_id')==identity),None)
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
                        'status':'open','source_type':'finding','source_id':fid,'created_at':s._now(),'updated_at':s._now(),'created_by':user['user_id']}
                    task=await action_items.prepare(s.db,task,s._can_access_client)
                    await s.db.create_requests.update_one({'_id':identity},{'$set':{'reopen_task':task}})
                task=await create_requests.insert_primary(s.db,'tasks',task,identity)
                tid=task['task_id']
            decision={'action':'reopened','by':user['user_id'],'at':s._next_write_time(current.get('updated_at')),
                      'request_id':identity,'previous_primary_task_id':current.get('primary_task_id')}
            await s.db.create_requests.update_one({'_id':identity},{'$set':{'primary_started':True}})
            changed=await s.db.findings.update_one({'finding_id':fid,'client_id':cid,'updated_at':current.get('updated_at')},
                {'$set':{'status':'in_remediation','primary_task_id':tid,'updated_at':decision['at']},'$push':{'decision_history':decision}})
            if not changed.modified_count:raise HTTPException(409,'Finding changed; reload before reopening')
        await s.audit(user,'Remediation reopened','finding',fid,cid,meta=decision)
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


async def validate(s, finding, body, user):
    fid, cid = finding['finding_id'], finding['client_id']
    if user.get('role') not in ('super_admin', 'platform_admin'):
        raise HTTPException(403, 'Only platform-level roles can validate remediation')
    if not body.rationale.strip():
        raise HTTPException(422, 'Validation rationale is required')
    payload = body.model_dump(exclude_unset=True)
    # New ticket callers retain an explicit intent. Keep legacy callers compatible
    # without replaying an old closure after a subsequent reopening.
    key = create_requests.digest(body.request_id or [fid, finding.get('updated_at'), payload])

    async def execute(identity):
        current = await s.db.findings.find_one({'finding_id':fid, 'client_id':cid}, {'_id':0})
        decision = next((d for d in current.get('decision_history', []) if d.get('request_id') == identity), None)
        if not decision:
            if 'expected_updated_at' in payload:
                s._require_snapshot(payload, current)
            if current.get('status') != 'remediated':
                raise HTTPException(409, 'Finding must be pending validation')
            if await s.db.tasks.find_one({'finding_id':fid, 'client_id':cid, 'status':{'$nin':['done','cancelled']}}):
                raise HTTPException(409, 'Complete outstanding remediation first')
            decision = {'action':'validated', 'by':user['user_id'], 'at':s._next_write_time(current.get('updated_at')),
                        'rationale':body.rationale.strip(), 'request_id':identity}
            await s.db.create_requests.update_one({'_id':identity}, {'$set':{'primary_started':True}})
            result = await s.db.findings.update_one({'finding_id':fid, 'client_id':cid,
                'status':'remediated', 'updated_at':current.get('updated_at')}, {'$set':{
                    'status':'closed', 'validated_by':user['user_id'], 'validated_at':decision['at'],
                    'closed_by':user['user_id'], 'closed_at':decision['at'], 'updated_at':decision['at']},
                '$push':{'decision_history':decision}})
            if not result.modified_count:
                raise HTTPException(409, 'Finding changed; reload before validating')
        # Identity travels in the business write, surviving lost acknowledgements.
        await s.audit(user, 'validate', 'finding', fid, cid, meta=decision)
        for task in await s.db.tasks.find({'finding_id':fid,'client_id':cid}, {'_id':0}).to_list(None):
            await s.audit(user, 'Related Finding validated and closed', 'task', task['task_id'], cid, meta={'finding_id':fid})
        if current.get('review_id'):
            review = await s.db.reviews.find_one({'review_id':current['review_id'],'client_id':cid}, {'_id':0})
            if review:
                await s._review_event(user, review, 'Finding validated and closed',
                    current.get('occurrence_id') or 'occ_'+review['review_id'], finding_id=fid, title=current['title'])
        return await s.db.findings.find_one({'finding_id':fid,'client_id':cid}, {'_id':0,'_remediation_lock':0})

    return await create_requests.run(s.db, key, user['user_id'], cid, 'findings/'+fid+'/validate', payload, execute)


async def retain_finding(s, finding):
    """Used by single and bulk deletion; never cascade away remediation history."""
    fid, cid = finding['finding_id'], finding['client_id']
    if (finding.get('decision_history') or finding.get('closed_at') or finding.get('validated_at')
            or finding.get('status') in ('closed','accepted','remediated')
            or await s.db.tasks.find_one({'finding_id':fid,'client_id':cid})
            or await s.db.evidence.find_one({'client_id':cid,'$or':[
                {'linked_type':{'$in':['finding','findings']},'linked_id':fid},
                {'relationships':{'$elemMatch':{'kind':'findings','id':fid}}}]})):
        raise HTTPException(409, 'Findings with remediation or retained history must be preserved')
