"""Vendor projections and scheduling plans. Reviews remain the execution store."""
import uuid
from datetime import date, timedelta
from fastapi import HTTPException
import review_occurrences

WINDOW_DAYS = 90
PURPOSES = {'vendor': 'Vendor Review', 'assurance': 'Security Assurance Review',
            'contract': 'Contract Renewal Review', 'offboarding': 'Offboarding Review'}
FREQUENCIES = {'monthly':'monthly', 'quarterly':'quarterly', 'semiannual':'semiannual',
               'annual':'annual', 'biennial':'custom', 'as_needed':'none', 'custom':'custom'}


def day(value):
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def assurance_status(vendor, artifact, today=None):
    if not vendor.get('assurance_required') or not artifact.get('required', True):
        return 'not_required'
    if not artifact.get('evidence_ids'):
        return 'missing'
    today = today or date.today()
    due = day(artifact.get('refresh_due'))
    if not due or not artifact.get('received_at'):
        return 'missing'
    if due < today:
        return 'expired'
    return 'due_soon' if due <= today + timedelta(days=vendor.get('assurance_window_days') or WINDOW_DAYS) else 'current'


def view(vendor, reviews):
    result = {k:v for k,v in vendor.items() if not k.startswith('_')}
    if vendor.get('status') == 'terminated':
        result['status'] = 'inactive'
        result['legacy_status'] = 'terminated'
    result['service'] = vendor.get('service') or vendor.get('services')
    linked = [r for r in reviews if r.get('vendor_id') == vendor['vendor_id'] and r.get('client_id') == vendor['client_id']]
    primary = [r for r in linked if r.get('vendor_purpose', 'vendor') == 'vendor']
    if primary:
        active = [r for r in primary if r.get('status') not in ('completed','cancelled')]
        result['next_review'] = min((r['due_date'] for r in active if r.get('due_date')), default=None)
        completions = [o.get('completed_at') for r in primary for o in r.get('occurrences', []) if o.get('completed_at')]
        completions += [r.get('completion_date') for r in primary if r.get('status') == 'completed' and r.get('completion_date')]
        result['last_review'] = max(completions, default=vendor.get('last_review'))
    result['linked_review_ids'] = [r['review_id'] for r in linked]
    result['assurance_records'] = [{**a, 'status':assurance_status(vendor,a)} for a in vendor.get('assurance_records') or []]
    return result


def plans(v):
    frequency = v.get('review_frequency') or 'annual'
    custom = 730 if frequency == 'biennial' else v.get('custom_recurrence_days')
    result = {'vendor': (v.get('next_review'), FREQUENCIES.get(frequency), custom)}
    if v.get('assurance_required') and v.get('separate_assurance_review'):
        result['assurance'] = (v.get('assurance_review_date'), v.get('assurance_cadence') or 'annual', None)
    renewal = day(v.get('contract_renewal') or v.get('contract_expiration') or v.get('contract_end'))
    if renewal and v.get('contract_review_enabled'):
        result['contract'] = ((renewal - timedelta(days=v.get('contract_lead_days') or WINDOW_DAYS)).isoformat(), 'none', None)
    if v.get('offboarding_review_date'):
        result['offboarding'] = (v['offboarding_review_date'], 'none', None)
    return result


async def validate(db, v, can_access, previous=None):
    for key in ('assurance_required','separate_assurance_review','contract_review_enabled'):
        if key in v and type(v[key]) is not bool:
            raise HTTPException(422, 'Assurance and review options must be boolean')
    if not isinstance(v.get('assurance_records',[]),list) or any(not isinstance(a,dict) for a in v.get('assurance_records',[])):
        raise HTTPException(422, 'Assurance records must be a list of records')
    if not str(v.get('name') or '').strip() or not str(v.get('service') or v.get('services') or '').strip():
        raise HTTPException(422, 'Vendor name and Service / Product are required')
    if v.get('criticality') not in ('critical','high','medium','moderate','low'):
        raise HTTPException(422, 'Invalid Vendor criticality')
    states = ('onboarding','under_review','active','offboarding','inactive')
    if v.get('status') not in states and not (previous and previous.get('status') == v.get('status') == 'terminated'):
        raise HTTPException(422, 'Invalid Vendor status')
    if not previous and v.get('status') != 'onboarding':
        raise HTTPException(422, 'New Vendors start Onboarding')
    if previous and previous.get('status') != v.get('status'):
        allowed = {'onboarding':{'under_review','offboarding'}, 'under_review':{'active','offboarding'},
                   'active':{'under_review','offboarding'}, 'offboarding':{'inactive'}, 'inactive':set()}
        if v.get('status') not in allowed.get(previous.get('status'), set()):
            raise HTTPException(422, 'Use the next Vendor lifecycle stage')
    for key in ('contract_lead_days','assurance_window_days'):
        if v.get(key) is not None and (type(v[key]) is not int or not 1 <= v[key] <= 3650):
            raise HTTPException(422, 'Lead time must be 1–3650 days')
    owner = v.get('business_owner_id')
    if owner:
        user = await db.users.find_one({'user_id':owner})
        if not user or not can_access(user,v['client_id']):
            raise HTTPException(422, 'Business owner must have access to this client')
    if v.get('vendor_id'):
        linked = await db.reviews.find({'vendor_id':v['vendor_id'],'client_id':v['client_id'],'status':{'$nin':['completed','cancelled']}}).to_list(None)
        for purpose in PURPOSES:
            if sum((r.get('vendor_purpose') or 'vendor') == purpose for r in linked) > 1:
                raise HTTPException(409, 'Multiple active Vendor Reviews require reconciliation; history has been retained')
    for purpose,(due,recurrence,custom) in plans(v).items():
        if due and not day(due):
            raise HTTPException(422, 'Invalid Review date')
        if recurrence not in ('none','monthly','quarterly','semiannual','annual','custom'):
            raise HTTPException(422, 'Invalid Review frequency')
        if recurrence == 'custom' and (type(custom) is not int or not 1 <= custom <= 3650):
            raise HTTPException(422, 'Custom recurrence requires 1–3650 days')
    for key in ('contract_start','contract_renewal','contract_expiration'):
        if v.get(key) and not day(v[key]):
            raise HTTPException(422, 'Invalid contract date')
    artifacts = v.get('assurance_records') or []
    if v.get('assurance_required') and not any(a.get('required',True) for a in artifacts):
        raise HTTPException(422, 'Select at least one expected assurance artifact')
    if len({a.get('type') for a in artifacts}) != len(artifacts):
        raise HTTPException(422, 'Use one assurance record per type')
    evidence_ids = list(v.get('contract_evidence_ids') or [])
    for a in artifacts:
        if not isinstance(a.get('evidence_ids',[]),list) or any(not isinstance(eid,str) for eid in a.get('evidence_ids',[])):
            raise HTTPException(422, 'Evidence IDs must be a list')
        if not a.get('type'):
            raise HTTPException(422, 'Assurance type is required')
        for key in ('received_at','refresh_due'):
            if a.get(key) and not day(a[key]):
                raise HTTPException(422, 'Invalid assurance date')
        evidence_ids += a.get('evidence_ids') or []
    for eid in evidence_ids:
        if not await db.evidence.find_one({'evidence_id':eid,'client_id':v['client_id'],'archived_at':None}):
            raise HTTPException(422, 'Evidence must be an available record from this client')


async def ensure_reviews(db, vendor, user, now):
    """Caller holds Vendor lease. Never replace completed occurrence arrays."""
    linked = await db.reviews.find({'vendor_id':vendor['vendor_id'],'client_id':vendor['client_id']},{'_id':0}).to_list(None)
    desired = plans(vendor)
    result = []
    for purpose in PURPOSES:
        candidates = [r for r in linked if r.get('vendor_purpose','vendor') == purpose]
        live = [r for r in candidates if r.get('status') not in ('completed','cancelled')]
        if len(live) > 1:
            raise HTTPException(409, 'Multiple active Vendor Reviews require reconciliation; history has been retained')
        review = live[0] if live else next((r for r in candidates if r.get('vendor_purpose') == purpose), None)
        due, recurrence, custom = desired.get(purpose, (None,'none',None))
        enabled = purpose in desired and (vendor.get('status') not in ('inactive','terminated') or purpose == 'offboarding')
        if not enabled:
            if review and review.get('status') not in ('completed','cancelled'):
                await db.reviews.update_one({'review_id':review['review_id']},{'$set':{'status':'cancelled','cancelled_at':now,'updated_at':now}})
            continue
        if not due and (not review or review.get('status') in ('completed','cancelled')):
            if review:
                result.append(review)
            continue
        if review and review.get('status') == 'completed' and day(review.get('due_date')) == day(due):
            result.append(review)
            continue
        # Independent reviews are explicit opt-in; shared-date assurance stays in the primary Review.
        if purpose == 'assurance' and day(due) == day(vendor.get('next_review')):
            if review and review.get('status') not in ('completed','cancelled'):
                await db.reviews.update_one({'review_id':review['review_id']},{'$set':{'status':'cancelled','cancelled_at':now,'updated_at':now}})
            continue
        rid = review['review_id'] if review else 'rev_'+uuid.uuid5(uuid.NAMESPACE_URL, 'vendor:'+vendor['vendor_id']+':'+purpose).hex
        fields = {'title':PURPOSES[purpose]+' — '+vendor['name'], 'due_date':due,
                  'recurrence':recurrence,'custom_recurrence_days':custom,'owner_id':review.get('owner_id') if review and review.get('vendor_business_owner_id') == vendor.get('business_owner_id') else vendor.get('business_owner_id'),
                  'vendor_business_owner_id':vendor.get('business_owner_id'),
                  'vendor_purpose':purpose,'vendor_id':vendor['vendor_id'],'client_id':vendor['client_id']}
        if review and all(review.get(k) == v for k,v in fields.items()):
            result.append(review)
            continue
        updated = {**(review or {}), **fields, 'review_id':rid,'review_type':'vendor','updated_at':now}
        if not review:
            updated.update({'created_at':now,'created_by':user['user_id'],'status':'upcoming'})
        if not review or review.get('status') in ('completed','cancelled'):
            updated.update({'status':'upcoming','current_occurrence_id':'occ_'+uuid.uuid4().hex,'notes':None,'completion_date':None,'started_at':None})
        updated.update(review_occurrences.schedule(updated, reset_anchor=not review or day(review.get('due_date')) != day(due)))
        updated = review_occurrences.view(updated)
        if review:
            await db.reviews.update_one({'review_id':rid},{'$set':updated})
        else:
            await db.reviews.update_one({'_id':'vendor:'+vendor['vendor_id']+':'+purpose},{'$setOnInsert':updated},upsert=True)
        result.append(updated)
    return result


async def sync_completion(db, review):
    if not review.get('vendor_id'):
        return
    history = review.get('occurrences') or []
    purpose = review.get('vendor_purpose','vendor')
    updates = {}
    if purpose == 'vendor':
        updates['review_frequency'] = 'as_needed' if review.get('recurrence') == 'none' else review.get('recurrence') or 'annual'
        updates['custom_recurrence_days'] = review.get('custom_recurrence_days')
        updates['next_review'] = review.get('due_date') if review.get('status') not in ('completed','cancelled') else None
        if history:
            updates['last_review'] = history[-1]['completed_at']
    elif history:
        updates[purpose+'_last_reviewed'] = history[-1]['completed_at']
        if purpose == 'assurance':
            updates['assurance_review_date'] = review.get('due_date') if review.get('status') not in ('completed','cancelled') else None
    if history and purpose == 'assurance':
        latest = history[-1]
        vendor = await db.vendors.find_one({'vendor_id':review['vendor_id'],'client_id':review['client_id']})
        if vendor and vendor.get('assurance_sync_occurrence_id') != latest['occurrence_id']:
            updates['assurance_sync_occurrence_id'] = latest['occurrence_id']
            updates['assurance_records'] = [{**a, **({'last_reviewed':latest['completed_at'],'review_occurrence_id':latest['occurrence_id']} if a.get('required',True) else {})} for a in vendor.get('assurance_records') or []]
    if updates:
        await db.vendors.update_one({'vendor_id':review['vendor_id'],'client_id':review['client_id']},{'$set':updates})
