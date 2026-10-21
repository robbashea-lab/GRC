"""Canonical annual Policy coverage, with a resumable pre-completion write plan.

The annual occurrence remains open if any covered write fails. The existing
Review execution lease serializes its journal; child writes use their own CAS.
"""
from copy import deepcopy
from datetime import datetime, timezone
from fastapi import HTTPException
import evidence_context
import review_occurrences
import policy_reviews
import portfolio_activity


def is_policy_set(review):
    return (review.get('client_id') == 'demo_brawndo' and review.get('baseline_key') == 'policy-review'
            and not review.get('policy_id'))


async def assert_deletable(db, kind, row):
    if kind not in ('reviews', 'policies'):
        return
    clauses = [{'review_id': row['review_id']}] if kind == 'reviews' else []
    member = 'child.review_id' if kind == 'reviews' else 'policy_id'
    clauses.append({'_policy_coverage_pending.members.' + member: row['review_id' if kind == 'reviews' else 'policy_id']})
    if await db.reviews.find_one({'client_id': row['client_id'], '_policy_coverage_pending': {'$ne': None}, '$or': clauses}):
        raise HTTPException(409, 'Retry the pending annual Policy completion before deleting its records')


def _time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed.replace(tzinfo=timezone.utc).timestamp() if parsed.tzinfo is None else parsed.timestamp()
    except (ValueError, TypeError, OverflowError):
        return None


def effective_subject(policy, at):
    if (policy.get('archived') or policy.get('archived_at') or policy.get('status') not in ('approved', 'draft', 'in_review')
            or policy.get('presence') in ('not_applicable', 'reported_missing')):
        return None
    approvals = [(entry.get('at'), entry) for entry in policy.get('approval_history', []) if entry.get('action') == 'approved']
    approvals += [(entry.get('recorded_at'), entry) for entry in policy.get('decision_history', []) if entry.get('action') == 'external_approval_recorded']
    cutoff = _time(at)
    approvals = [(date, entry) for date, entry in approvals
                 if entry.get('subject') and _time(date) is not None and cutoff is not None and _time(date) <= cutoff
                 and (not entry.get('reported_approved_at') or _time(entry['reported_approved_at']) is not None and _time(entry['reported_approved_at']) <= cutoff)]
    approvals.sort(key=lambda pair: _time(pair[0]), reverse=True)
    if approvals:
        recorded, approval = approvals[0]
        subject = approval['subject']
    elif (policy.get('status') == 'approved' and policy.get('approval_subject') and _time(policy.get('approved_at')) is not None
          and cutoff is not None and _time(policy['approved_at']) <= cutoff):
        subject, recorded, approval = policy['approval_subject'], policy['approved_at'], None
    else:
        return None
    if subject.get('client_id') != policy.get('client_id') or subject.get('policy_id') != policy.get('policy_id'):
        raise HTTPException(409, 'The approved Policy subject identity is unavailable or belongs to another client')
    if not subject.get('subject_id') or not isinstance(subject.get('version'), str) or not subject['version'].strip():
        return None
    if policy.get('status') == 'approved' and policy.get('version') == subject['version'] and policy.get('effective_date') and (_time(policy['effective_date']) is None or _time(policy['effective_date']) > cutoff):
        return None
    return deepcopy({'policy_id': policy['policy_id'], 'client_id': policy['client_id'], 'subject_id': subject['subject_id'],
                     'version': subject['version'], 'approval_recorded_at': recorded, 'approval': approval, 'subject': subject})


def advance_covered_schedule(review, at):
    """Skip missed anchors, never synthesize additional completed occurrences."""
    current = review_occurrences.view(review)
    due, skipped = current.get('next_review_date'), []
    for _ in range(9999):
        if not due or _time(due) is None:
            raise HTTPException(409, 'The annual Policy cadence has no valid next scheduled date')
        if _time(due) > _time(at):
            return due, skipped
        skipped.append(due)
        due = review_occurrences.schedule({**review, 'due_date': due, 'recurrence_due_date': None,
                                          'schedule_anchor': current['schedule_anchor']})['next_review_date']
    raise HTTPException(409, 'The annual Policy cadence exceeds the supported calendar range')


async def prepare(db, review, completed, updates, request, user):
    """Persist the membership cut-off before any child write; retries reuse it."""
    if not is_policy_set(review):
        return None
    if review.get('recurrence') != 'annual':
        raise HTTPException(409, 'Configure the annual Policy Review anchor before completion')
    pending = review.get('_policy_coverage_pending')
    if pending:
        if pending['occurrence_id'] != completed['occurrence_id'] or pending['request'] != request:
            raise HTTPException(409, 'Annual Policy completion is pending; retry its original occurrence and request')
        return pending
    next_due, skipped = advance_covered_schedule(review, completed['completed_at'])
    updates = deepcopy(updates)
    updates['due_date'] = next_due
    updates.update(review_occurrences.schedule({**review, **updates}))
    completed = deepcopy(completed)
    completed['next_review_date'] = next_due
    completed['covered_schedule_skipped_dates'] = skipped
    members = []
    policies = await db.policies.find({'client_id': review['client_id']}, {'_id': 0}).to_list(None)
    for policy in sorted(policies, key=lambda item: item['policy_id']):
        member = effective_subject(policy, completed['completed_at'])
        if member is None:
            continue
        children = await db.reviews.find({'client_id': review['client_id'], 'policy_id': policy['policy_id'],
                                         'status': {'$nin': ['completed', 'cancelled']}}, {'_id': 0}).to_list(None)
        annual = [child for child in children if child.get('recurrence') == 'annual']
        if len(annual) > 1:
            raise HTTPException(409, 'A covered Policy has conflicting annual Review obligations')
        member['child'] = None
        if annual:
            child = annual[0]
            current = review_occurrences.view(child)
            if current['status'] == 'needs_scheduling' or not current.get('next_review_date'):
                raise HTTPException(409, 'Schedule the covered Policy Review before annual completion')
            oid = review_occurrences.occurrence_id(child)
            evidence = await db.evidence.find({'client_id': review['client_id'], 'archived_at': None,
                **evidence_context.review_evidence_query(child, oid)}, {'_id': 0, 'content_base64': 0}).to_list(None)
            findings = await db.findings.count_documents({'client_id': review['client_id'], 'review_id': child['review_id'],
                                                          **review_occurrences.occurrence_query(child, oid)})
            snapshot = review_occurrences.snapshot(child, evidence, findings, user, completed['completed_at'])
            snapshot['covered_by'] = {'review_id': review['review_id'], 'occurrence_id': completed['occurrence_id']}
            snapshot['policy_coverage'] = [deepcopy({key: value for key, value in member.items() if key != 'child'})]
            child_due, child_skipped = advance_covered_schedule(child, completed['completed_at'])
            snapshot['next_review_date'] = child_due
            snapshot['covered_schedule_skipped_dates'] = child_skipped
            next_fields = {'status': 'upcoming', 'due_date': child_due, 'current_occurrence_id': updates['current_occurrence_id'] + '_' + child['review_id'],
                           'notes': None, 'started_at': None, 'started_by': None, 'completion_date': None,
                           'completion_snapshot': None, 'updated_at': completed['completed_at'],
                           'schedule_anchor': current['schedule_anchor'], 'recurrence_due_date': None}
            next_fields.update(review_occurrences.schedule({**child, **next_fields}))
            member['child'] = {'review_id': child['review_id'], 'occurrence_id': oid, 'stored_occurrence_id': child.get('current_occurrence_id'), 'updated_at': child.get('updated_at'),
                               'status': child.get('status'), 'snapshot': snapshot, 'updates': next_fields}
        members.append(member)
    completed = deepcopy(completed)
    completed['policy_coverage'] = [{key: value for key, value in member.items() if key != 'child'} for member in members]
    completed['covered_policy_reviews'] = [{'review_id': member['child']['review_id'], 'occurrence_id': member['child']['occurrence_id']}
                                          for member in members if member['child']]
    plan = {'occurrence_id': completed['occurrence_id'], 'request': deepcopy(request), 'completed': completed,
            'updates': deepcopy(updates), 'members': members}
    result = await db.reviews.update_one({'review_id': review['review_id'], 'client_id': review['client_id'],
        'updated_at': review.get('updated_at'), 'current_occurrence_id': review.get('current_occurrence_id'),
        '_policy_coverage_pending': None}, {'$set': {'_policy_coverage_pending': plan}})
    if not result.matched_count:
        raise HTTPException(409, 'Annual Policy Review changed; retry completion')
    return plan


async def reconcile(db, review, plan, user, authorize):
    """Each child and metadata write is replay-safe; no annual success yet."""
    for member in plan['members']:
        await authorize('policies', member['policy_id'], user, write=True)
        scope = {'policy_id': member['policy_id'], 'client_id': review['client_id']}
        policy = await db.policies.find_one(scope, {'_id': 0})
        if not policy:
            raise HTTPException(409, 'A covered Policy identity is unavailable')
        retired = policy.get('archived') or policy.get('archived_at') or policy.get('status') in ('retired', 'not_applicable')
        child = member['child']
        if child:
            child_scope = {'review_id': child['review_id'], 'client_id': review['client_id'], 'policy_id': member['policy_id']}
            current = await db.reviews.find_one(child_scope, {'_id': 0})
            if not current:
                raise HTTPException(409, 'A covered Policy Review is unavailable')
            await authorize('reviews', child['review_id'], user, write=True)
            prior = next((item for item in current.get('occurrences', []) if item.get('occurrence_id') == child['occurrence_id']), None)
            relation = next(item for item in plan['completed']['covered_policy_reviews'] if item['review_id'] == child['review_id'])
            own = prior and prior.get('covered_by') == child['snapshot']['covered_by']
            if prior and not own:
                if prior.get('status') != 'completed' or not prior.get('completed_at'):
                    raise HTTPException(409, 'The covered occurrence has no valid completion identity')
                relation.update(child_relation='completed_independently', completed_at=prior['completed_at'])
            elif not own:
                if review_occurrences.occurrence_id(current) != child['occurrence_id']:
                    raise HTTPException(409, 'The covered occurrence identity is unavailable')
                if current.get('status') == 'cancelled':
                    relation.update(child_relation='cancelled_after_cutoff', cancelled_at=current.get('cancelled_at'),
                                    cancelled_by=current.get('cancelled_by'))
                else:
                    fields = dict(child['updates'])
                    live_schedule = review_occurrences.view(current)
                    fields['schedule_anchor'] = live_schedule['schedule_anchor']
                    changed_schedule = (str(current.get('due_date') or '')[:10] != str(child['snapshot'].get('due_date') or '')[:10]
                                        or any(current.get(key) != child['snapshot'].get(key)
                                               for key in ('recurrence', 'custom_recurrence_days')))
                    if retired or current.get('recurrence') in (None, '', 'none'):
                        fields.update(status='completed', current_occurrence_id=child['occurrence_id'],
                                      completion_date=child['snapshot']['completed_at'], due_date=current.get('due_date'),
                                      period=live_schedule['period'], next_review_date=None)
                    else:
                        future = _time(current.get('due_date'))
                        # A Calendar move retains the original cycle; a definition Save may re-anchor it.
                        following_definition = changed_schedule and not current.get('recurrence_due_date')
                        due = current['due_date'] if following_definition and future is not None and future > _time(plan['completed']['completed_at']) else advance_covered_schedule(current, plan['completed']['completed_at'])[0]
                        fields['due_date'] = due
                        fields.update(review_occurrences.schedule({**current, **fields}))
                    if current.get('notes') != child['snapshot'].get('notes'):
                        fields['notes'] = current.get('notes')
                    # Preserve later saved fields and timestamps; only this execution advances.
                    if _time(current.get('updated_at')) is not None and _time(current['updated_at']) > _time(fields['updated_at']):
                        fields['updated_at'] = current['updated_at']
                    committed = deepcopy(child['snapshot'])
                    committed['covered_following_due_date'] = fields['due_date'] if fields['status'] == 'upcoming' else None
                    event = portfolio_activity.project_committed_change('reviews', child['review_id'], review['client_id'],
                        {'user_id': committed['completed_by'], 'name': committed['completed_by_name']}, current,
                        {**current, **fields, 'occurrences': [*current.get('occurrences', []), committed]},
                        committed['completed_at'], 'complete_review')
                    if event:
                        committed['_portfolio_activity_event_id'] = event['event_id']
                        fields.update({'_portfolio_activity_pending.' + event['event_id']: event,
                                       '_portfolio_activity_last_event_id': event['event_id']})
                    result = await db.reviews.update_one({**child_scope, 'updated_at': current.get('updated_at'),
                        'current_occurrence_id': current.get('current_occurrence_id'), 'status': current.get('status'),
                        '$or': [{'_execution_lock': None}, {'_execution_lock.until': {'$lt': datetime.now(timezone.utc).isoformat()}}]},
                        {'$set': fields, '$push': {'occurrences': committed}})
                    if not result.matched_count:
                        raise HTTPException(409, 'A covered Policy Review changed or is busy; retry annual completion')
                    own = True
            current = await db.reviews.find_one(child_scope, {'_id': 0})
            # Stable native activity identities make a failed receipt safe to retry.
            saved = next((item for item in current.get('occurrences', []) if item.get('occurrence_id') == child['occurrence_id']), None)
            event_id = (saved or {}).get('_portfolio_activity_event_id')
            if event_id and own:
                actions = [('complete', 'Review completed')]
                if saved.get('covered_following_due_date'):
                    actions.append(('next', 'Next occurrence scheduled'))
                for suffix, action in actions:
                    identity = 'policy-coverage-' + event_id + '-' + suffix
                    await db.audit_logs.update_one({'log_id': identity}, {'$setOnInsert': {
                        'log_id': identity, 'at': child['snapshot']['completed_at'],
                        'user_id': child['snapshot']['completed_by'], 'user_name': child['snapshot']['completed_by_name'],
                        'action': action, 'entity_type': 'review', 'entity_id': child['review_id'], 'client_id': review['client_id'],
                        'meta': {'occurrence_id': child['occurrence_id'], 'covered_by': child['snapshot']['covered_by'],
                                 'period': child['snapshot']['period'], 'due_date': saved.get('covered_following_due_date')}}}, upsert=True)
                await portfolio_activity.acknowledge_committed(db, 'reviews', child['review_id'], review['client_id'], event_id)
            await policy_reviews.sync(db, current, user)
        entry = {'review_id': review['review_id'], 'occurrence_id': plan['occurrence_id'],
                 'completed_at': plan['completed']['completed_at'], 'completed_by': plan['completed']['completed_by'],
                 'subject_id': member['subject_id'], 'version': member['version']}
        policy = await db.policies.find_one(scope, {'_id': 0})
        if not policy:
            raise HTTPException(409, 'A covered Policy identity is unavailable before metadata persistence')
        retired = policy.get('archived') or policy.get('archived_at') or policy.get('status') in ('retired', 'not_applicable')
        if entry not in policy.get('review_history', []):
            fields = {'last_reviewed_at': max(filter(None, [policy.get('last_reviewed_at'), entry['completed_at']])),
                      'next_review_date': None if retired else policy.get('next_review_date') if child else plan['updates'].get('due_date'),
                      'schedule_from_reviews': True}
            result = await db.policies.update_one({**scope, 'updated_at': policy.get('updated_at'),
                'review_history': policy.get('review_history'), 'status': policy.get('status')},
                {'$set': fields, '$push': {'review_history': entry}})
            if not result.matched_count:
                raise HTTPException(409, 'Covered Policy metadata changed; retry annual completion')
