"""Explicit synthetic operator input for pre-R4 lifecycle regression fixtures.

Opt-in only: these tests exercise recurrence/coverage/projections after a valid
completion. They must now supply the approved current guide and saved revision.
Production never uses this helper. R4 boundary tests do NOT opt in and continue
to assert missing/stale/incomplete input denials independently.
"""
from copy import deepcopy
import json
import re

import httpx


async def supply_completion_inputs(test, request, server):
    if not getattr(test, 'r4_valid_completion_fixture', False) or request.method != 'POST':
        return
    match = re.fullmatch(r'/api/reviews/([^/]+)/complete', request.url.path)
    if not match:
        return
    data = json.loads(request.content or b'{}')
    if not data.get('occurrence_id'):
        return
    review = await server.db.reviews.find_one({'review_id': match[1]})
    if not review:
        return
    if any(item.get('occurrence_id') == data['occurrence_id'] for item in review.get('occurrences', [])):
        return  # An immutable completed occurrence is replayed, never re-evaluated.
    pending = review.get('_policy_coverage_pending')
    if pending:
        # Repair the accepted input, not a newly read or rewritten evaluation.
        original = pending.get('request') or {}
        for field in ('expected_updated_at', 'checklist', 'supporting_reference'):
            if field in original:
                data.setdefault(field, deepcopy(original[field]))
    else:
        response = await test.client.get('/api/reviews/' + match[1] + '/completion-guide')
        if response.status_code != 200:
            return  # Preserve the actual scope/permission/configuration refusal.
        guide = response.json()
        if guide['occurrence_id'] != data['occurrence_id']:
            return
        data.setdefault('expected_updated_at', guide['expected_updated_at'])
        data.setdefault('checklist', {'contract_token': guide['contract_token'], 'results': [
            {'step_id': step['step_id'], 'result': 'Pass', 'reason': ''} for step in guide['steps']]})
        data.setdefault('supporting_reference', 'Synthetic completed result documented by the lifecycle test operator')
    request._content = json.dumps(data).encode('utf-8')
    request.stream = httpx.ByteStream(request._content)
    request.headers['Content-Length'] = str(len(request._content))
    request.headers['Content-Type'] = 'application/json'

async def validate_with_independent_actor(test, server, finding_id, decision):
    """Explicit positive fixture; retain the submitting actor and original worker facts."""
    import uuid

    test.assertIn('expected_updated_at', decision)
    test.assertTrue(decision.get('request_id'))
    path = '/api/findings/' + finding_id + '/validate'
    finding = await server.db.findings.find_one({'finding_id': finding_id})
    test.assertIsNotNone(finding)
    actions = await server.db.tasks.find({'finding_id': finding_id, 'client_id': finding['client_id']}).to_list(None)
    test.assertTrue(actions)
    denied = await test.client.post(path, json=decision)
    test.assertEqual(denied.status_code, 403, denied.text)
    test.assertIn('Independent validation', denied.text)

    validator_id = 'fixture-independent-' + uuid.uuid4().hex
    await server.db.users.insert_one({
        'user_id': validator_id, 'name': 'Synthetic independent validator',
        'email': validator_id + '@example.test', 'role': 'platform_admin',
        'client_ids': [finding['client_id']], 'all_clients': False, 'status': 'active',
    })
    previous_authorization = test.client.headers.get('Authorization')
    try:
        test.sign_in(validator_id)
        response = await test.client.post(path, json=decision)
        test.assertEqual(response.status_code, 200, response.text)
        test.assertEqual(response.json()['validated_by'], validator_id)
        test.assertEqual(response.json()['closed_by'], validator_id)
        # Validation must not replace who submitted the correction or its history.
        for original in actions:
            current = await server.db.tasks.find_one({'task_id': original['task_id'], 'client_id': finding['client_id']})
            test.assertIsNotNone(current)
            for field in ('status', 'assignee_id', 'owner_id', 'completed_at', 'completed_by', 'submission_history'):
                test.assertEqual(current.get(field), original.get(field), field)
        return response
    finally:
        if previous_authorization is None:
            test.client.headers.pop('Authorization', None)
        else:
            test.client.headers['Authorization'] = previous_authorization
