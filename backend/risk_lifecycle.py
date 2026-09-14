"""Risk governance uses the existing Review obligation and occurrence model."""
import uuid
from fastapi import HTTPException
import review_occurrences

CLOSED = {'closed', 'retired'}
CADENCES = {'none','monthly','quarterly','semiannual','annual','custom'}
CLOSURE_REASONS = {'remediated','no_longer_applicable','system_process_retired','condition_removed','other'}
ASSESSMENT_FIELDS = ('likelihood_score','impact_score','risk_score','risk_level','assessment_rationale',
                     'likelihood_rationale','impact_rationale','treatment','notes','status',
                     'acceptance_rationale','acceptance_expires_at','accepted_by','acceptance_date')


async def prepare_source(db, risk):
    sources = {'review':('reviews','review_id'),'finding':('findings','finding_id'),'vendor':('vendors','vendor_id'),'audit':('assessments','assessment_id')}
    source = risk.get('source_type')
    if source is None:
        return risk  # Legacy free text remains available for traceability.
    if source not in {'manual','annual_assessment','management',*sources}:
        raise HTTPException(422, 'Invalid Risk source')
    if source in sources:
        collection, key = sources[source]
        sid = risk.get('source_id')
        target = await db[collection].find_one({key:sid,'client_id':risk['client_id']}) if sid else None
        if not target:
            raise HTTPException(422, 'Select a source record from this client')
        risk[key] = sid
    elif risk.get('source_id'):
        raise HTTPException(422, 'This source has no related record')
    return risk


def snapshot(risk):
    return {key: risk.get(key) for key in ASSESSMENT_FIELDS}


def validate_schedule(risk):
    cadence = risk.get('review_cadence') or 'annual'
    if cadence not in CADENCES:
        raise HTTPException(422, 'Invalid Risk review cadence')
    if cadence == 'custom':
        days = risk.get('custom_recurrence_days')
        if type(days) is not int or not 1 <= days <= 3650:
            raise HTTPException(422, 'Custom cadence requires 1–3650 days')
    if risk.get('next_review') and not review_occurrences.scheduled_date(risk['next_review']):
        raise HTTPException(422, 'Invalid next review date')


async def ensure_review(db, risk, user, now):
    """Caller holds the Risk lease. Deterministic Mongo _id prevents duplicates."""
    query = {'client_id':risk['client_id'], 'risk_id':risk['risk_id']}
    linked = await db.reviews.find(query, {'_id':0}).to_list(2)
    if len(linked) > 1:
        raise HTTPException(409, 'Multiple linked Risk Reviews require reconciliation')
    review = linked[0] if linked else None
    if risk.get('status') in CLOSED:
        if review and review.get('status') not in ('completed','cancelled'):
            await db.reviews.update_one({'review_id':review['review_id']}, {'$set':{
                'status':'cancelled', 'cancelled_at':now, 'cancelled_by':user['user_id'], 'updated_at':now}})
        return None
    validate_schedule(risk)
    date = risk.get('next_review')
    if not date and not review:
        return None
    rid = review['review_id'] if review else 'rev_' + uuid.uuid5(uuid.NAMESPACE_URL, 'risk-review:'+risk['risk_id']).hex
    fields = {'title':f"Risk Review — {risk.get('display_id',risk['risk_id'])} — {risk['title']}",
              'due_date':date, 'owner_id':risk.get('owner_id'), 'recurrence':risk.get('review_cadence') or 'annual',
              'custom_recurrence_days':risk.get('custom_recurrence_days')}
    if review and all(review.get(key) == value for key,value in fields.items()):
        return review_occurrences.view(review)
    new = {**(review or {}), **fields, **query, 'review_id':rid, 'review_type':'risk_assessment', 'updated_at':now}
    if not review:
        new.update({'created_at':now,'created_by':user['user_id'],'status':'upcoming','current_occurrence_id':'occ_'+uuid.uuid4().hex})
    elif review.get('status') in ('completed','cancelled') and date:
        new.update({'status':'upcoming','current_occurrence_id':'occ_'+uuid.uuid4().hex,'notes':None,
                    'started_at':None,'started_by':None,'completion_date':None})
    new.update(review_occurrences.schedule(new, reset_anchor=not review or review.get('due_date') != date))
    new = review_occurrences.view(new)
    if review:
        await db.reviews.update_one({'review_id':rid}, {'$set':new})
    else:
        await db.reviews.update_one({'_id':'risk-review:'+risk['risk_id']}, {'$setOnInsert':new}, upsert=True)
    await db.risks.update_one({'risk_id':risk['risk_id'],'client_id':risk['client_id']}, {'$set':{'linked_review_id':rid}})
    return new


async def sync_completion(db, review):
    """Idempotent projection; retries repair a failed write after Review commit.

Occurrence history is authoritative and includes the evaluated Risk snapshot.
Risk mutations reconcile this projection before editing, under the same lease.
"""
    if not review.get('risk_id'):
        return
    history = [o for o in review.get('occurrences',[]) if o.get('risk_after')]
    if not history:
        return
    latest = history[-1]
    fields = {**latest['risk_after'], 'last_reviewed':latest['completed_at'],
              'next_review':review.get('due_date') if review.get('status') not in ('completed','cancelled') else None,
              'review_sync_occurrence_id':latest['occurrence_id'], 'updated_at':latest['completed_at']}
    await db.risks.update_one({'risk_id':review['risk_id'],'client_id':review['client_id'],
        'review_sync_occurrence_id':{'$ne':latest['occurrence_id']}}, {'$set':fields})
