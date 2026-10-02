"""Review command recovery through real API routes with isolated storage."""
import asyncio
import json
import unittest
import uuid
from copy import deepcopy
from pathlib import Path
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness

server = harness.server
CONTRACT = json.loads((Path(__file__).parents[2] / 'shared/contracts/review-command.json').read_text(encoding='utf-8'))


class ReviewRecoveryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def prepare(self):
        self.sign_in("admin")
        self.client.event_hooks["request"] = []
        await server.db.reviews.insert_one({"review_id": "recovery", "client_id": "a", **CONTRACT['review'],
            "owner_id": "member", "status": "in_progress"})
        return {**CONTRACT['command'], "occurrence_id": "occ_recovery", "owner_id": "member"}

    async def create(self, body):
        return await self.client.post("/api/reviews/recovery/create-finding", json=body)

    async def test_missing_identity_and_changed_payload_are_rejected(self):
        body = await self.prepare()
        missing = {k: v for k, v in body.items() if k != "request_id"}
        self.assertEqual((await self.create(missing)).status_code, CONTRACT['missing_identity_status'])
        first = await self.create(body)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual((await self.create({**body, "title": CONTRACT['changed_title']})).status_code, CONTRACT['changed_payload_status'])
        self.assertEqual(await server.db.findings.count_documents({}), CONTRACT['finding_count'])

    async def test_audit_failure_replays_without_duplicates(self):
        body = await self.prepare()
        with patch.object(server, "audit", AsyncMock(side_effect=RuntimeError("injected audit outage"))):
            response = await self.create(body)
        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(await server.db.findings.count_documents({}), 1)
        recovered = await self.create(body)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()["status"], CONTRACT['result_status'])
        self.assertEqual((await self.create(body)).json(), recovered.json())
        self.assertEqual(await server.db.findings.count_documents({}), 1)
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({"action": "Finding raised"}), 1)

    async def test_failure_after_task_insert_repairs_transition_and_audits(self):
        body = await self.prepare()
        collection_type = type(server.db.tasks)
        update = collection_type.update_one
        tripped = False

        async def uncertain(collection, *args, **kwargs):
            nonlocal tripped
            result = await update(collection, *args, **kwargs)
            if collection.name == "tasks" and kwargs.get("upsert") and not tripped:
                tripped = True
                raise RuntimeError("lost task write acknowledgment")
            return result

        with patch.object(collection_type, "update_one", uncertain):
            failed = await self.create(body)
        self.assertEqual(failed.status_code, 503, failed.text)
        recovered = await self.create(body)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()["status"], "in_remediation")
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({"action": "create", "entity_type": "task"}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({"action": "Action Item created"}), 1)

    async def test_concurrent_retries_and_later_edits(self):
        body = await self.prepare()
        replies = await asyncio.gather(*(self.create(body) for _ in range(8)))
        self.assertTrue(all(r.status_code in (200, 409) for r in replies))
        first = await self.create(body)
        self.assertEqual(first.status_code, 200, first.text)
        await server.db.findings.update_one({"finding_id": first.json()["finding_id"]}, {"$set": {"title": "Later edit"}})
        completed = await self.client.post("/api/reviews/recovery/complete", json={"occurrence_id": body["occurrence_id"]})
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual((await self.create(body)).json(), first.json())
        self.assertEqual((await server.db.findings.find_one({}))["title"], "Later edit")
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
        self.assertEqual(await server.db.notifications.count_documents({"kind": "finding_assigned"}), 1)
        self.assertEqual(await server.db.notifications.count_documents({"kind": "task_assigned"}), 1)

    async def test_definition_edits_leave_completed_history_unchanged(self):
        await self.prepare()
        result = await self.client.post("/api/reviews/recovery/complete", json={"occurrence_id": "occ_recovery"})
        row = result.json()["review"]
        history = deepcopy(row["occurrences"])
        edited = await self.client.patch("/api/reviews/recovery", json={"title": "New definition", "owner_id": "admin",
            "recurrence": "quarterly", "expected_updated_at": row["updated_at"],
            "expected_occurrence_id": row["current_occurrence_id"]})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["occurrences"], history)

    async def test_authorization_is_rechecked_before_receipt_replay(self):
        body = await self.prepare()
        self.assertEqual((await self.create(body)).status_code, 200)
        await server.db.users.update_one({"user_id": "admin"}, {"$set": {"role": "client_viewer", "client_ids": ["a"]}})
        self.assertEqual((await self.create(body)).status_code, 403)
        await server.db.users.update_one({"user_id": "admin"}, {"$set": {"role": "client_contributor", "client_ids": ["b"]}})
        self.assertEqual((await self.create(body)).status_code, 403)

    async def test_two_actors_with_the_same_request_id_create_distinct_intents(self):
        body = await self.prepare()
        first = await self.create(body)
        self.assertEqual(first.status_code, 200, first.text)
        self.sign_in('member')
        second_body = {**body, 'title': 'Independent actor Finding'}
        second = await self.create(second_body)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertNotEqual(first.json()['finding_id'], second.json()['finding_id'])
        self.assertEqual(second.json()['title'], second_body['title'])
        self.assertEqual((await self.create(second_body)).json(), second.json())
        self.assertEqual(await server.db.findings.count_documents({}), 2)
        self.assertEqual(await server.db.tasks.count_documents({}), 2)
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'Finding raised'}), 2)

    async def test_reuses_only_matching_actor_legacy_finding_and_existing_receipt_primary(self):
        body = await self.prepare()
        legacy_id = 'fnd_' + uuid.uuid5(uuid.NAMESPACE_URL, 'recovery:' + body['occurrence_id'] + ':' + body['request_id']).hex
        await server.db.findings.insert_one({'finding_id': legacy_id, 'client_id': 'a', 'review_id': 'recovery',
            'occurrence_id': body['occurrence_id'], 'created_by': 'admin', 'status': 'open',
            'title': 'Legacy Finding', 'severity': 'medium', 'owner_id': 'member'})
        first = await self.create(body)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['finding_id'], legacy_id)
        self.sign_in('member')
        other = await self.create(body)
        self.assertEqual(other.status_code, 200, other.text)
        self.assertNotEqual(other.json()['finding_id'], legacy_id)
        self.assertEqual(await server.db.findings.count_documents({}), 2)

        # A receipt-owned primary from an in-flight upgrade wins over any new ID scheme.
        self.sign_in('admin')
        retry_body = {**body, 'request_id': 'receipt-owned-upgrade'}
        route = 'reviews/recovery/create-finding'
        identity = server.create_requests.digest(['admin', 'a', route, server.create_requests.digest(retry_body['request_id'])])
        await server.db.create_requests.insert_one({'_id': identity, 'state': 'pending', 'primary_started': True,
            'fingerprint': server.create_requests.digest(retry_body)})
        await server.db.findings.insert_one({'_id': 'create:' + identity, 'finding_id': 'previous-primary-id',
            'client_id': 'a', 'review_id': 'recovery', 'occurrence_id': body['occurrence_id'], 'created_by': 'admin',
            'title': 'Already persisted', 'status': 'open', 'severity': 'medium', 'owner_id': 'member'})
        recovered = await self.create(retry_body)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()['finding_id'], 'previous-primary-id')
        self.assertEqual(await server.db.findings.count_documents({}), 3)

    async def test_review_assignment_authority_applies_to_explicit_and_derived_owners(self):
        body = await self.prepare()
        self.sign_in('member')
        denied = await self.create({**body, 'owner_id': 'admin'})
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(denied.headers.get('x-create-rejected'), 'true')
        self.assertEqual(await server.db.findings.count_documents({}), 0)
        await server.db.reviews.update_one({'review_id': 'recovery'}, {'$set': {'owner_id': 'admin', 'reviewer_id': 'member'}})
        derived = {k: v for k, v in body.items() if k != 'owner_id'}
        denied = await self.create({**derived, 'request_id': 'derived-owner-intent'})
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await server.db.tasks.count_documents({}), 0)
        corrected = await self.create({**body, 'request_id': 'corrected-owner-intent', 'owner_id': None})
        self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertIsNone(corrected.json()['owner_id'])
        self.assertIsNone((await server.db.tasks.find_one({}))['assignee_id'])

    async def test_standalone_payload_validation_precedes_freeze_and_corrected_retry(self):
        self.sign_in('admin')
        await server.db.findings.insert_one({'finding_id': 'input-boundary', 'client_id': 'a', 'title': 'Finding',
            'owner_id': 'member', 'severity': 'medium', 'status': 'open'})
        route = '/api/findings/input-boundary/create-task'
        for payload in ({'title': {'unexpected': 'object'}}, {'title': {}}, {'description': []},
                        {'due_date': 'not-a-date'}, {'description': ['not text']},
                        {'status': 'done'}, {'client_id': 'b'}):
            with self.subTest(payload=payload):
                response = await self.client.post(route, json=payload)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(response.headers.get('x-create-rejected'), 'true')
                self.assertEqual(await server.db.tasks.count_documents({}), 0)
        accepted = await self.client.post(route, json={'title': 'Corrected task', 'assignee_id': None})
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()['title'], 'Corrected task')
        self.assertIsNone(accepted.json()['assignee_id'])

    async def test_review_creation_preserves_assignment_role_matrix(self):
        body = await self.prepare()
        await server.db.users.insert_one({'user_id': 'actor', 'name': 'Actor', 'email': 'actor@example.test',
            'status': 'active', 'role': 'client_contributor', 'client_ids': ['a']})
        await server.db.reviews.update_one({'review_id': 'recovery'}, {'$set': {'owner_id': 'actor'}})
        self.sign_in('actor')
        cases = [('super_admin', 'admin', 200), ('platform_admin', 'admin', 200),
                 ('client_grc_manager', 'admin', 403), ('client_grc_manager', 'member', 200),
                 ('client_contributor', 'admin', 403), ('client_contributor', 'actor', 200),
                 ('client_contributor', None, 200), ('client_readonly', 'actor', 403)]
        for index, (role, owner, status) in enumerate(cases):
            with self.subTest(role=role, owner=owner):
                await server.db.users.update_one({'user_id': 'actor'}, {'$set': {'role': role}})
                response = await self.create({**body, 'request_id': 'role-intent-' + str(index), 'owner_id': owner})
                self.assertEqual(response.status_code, status, response.text)

    async def test_review_raw_field_types_are_not_hidden_by_defaults(self):
        body = await self.prepare()
        for index, invalid in enumerate(({'description': []}, {'remediation_plan': {}}, {'due_date': False}, {'owner_id': 0})):
            with self.subTest(invalid=invalid):
                response = await self.create({**body, **invalid, 'request_id': 'raw-input-' + str(index)})
                self.assertEqual(response.status_code, 422, response.text)
                self.assertEqual(await server.db.findings.count_documents({}), 0)

    async def test_standalone_action_audit_failure_resumes_original_command(self):
        await self.prepare()
        await server.db.findings.insert_one({'finding_id': 'standalone', 'client_id': 'a', 'title': 'Finding',
            'owner_id': 'member', 'severity': 'medium', 'status': 'open', 'review_id': 'recovery', 'occurrence_id': 'occ_recovery'})
        route = '/api/findings/standalone/create-task'
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('injected audit outage'))):
            failed = await self.client.post(route, json={'title': 'Original corrective work'})
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
        self.assertEqual(await server.db.audit_logs.count_documents({}), 0)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'client_viewer'}})
        self.assertEqual((await self.client.post(route, json={})).status_code, 403)
        await server.db.users.update_one({'user_id': 'admin'}, {'$set': {'role': 'super_admin'}})
        recovered = await self.client.post(route, json={'title': 'Must not overwrite', 'assignee_id': None})
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual((recovered.json()['title'], recovered.json()['assignee_id']), ('Original corrective work', 'member'))
        self.assertEqual((await self.client.post(route, json={})).json(), recovered.json())
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
        for action in ('create', 'Related Finding moved to In Remediation', 'Finding moved to In Remediation', 'Action Item created'):
            self.assertEqual(await server.db.audit_logs.count_documents({'action': action}), 1, action)
        self.assertEqual(await server.db.notifications.count_documents({'kind': 'task_assigned'}), 1)
        await server.db.tasks.update_one({'task_id': recovered.json()['task_id']}, {'$set': {'title': 'Later operator edit'}})
        self.assertEqual((await self.client.post(route, json={})).json()['title'], 'Later operator edit')

    async def test_standalone_action_freezes_validated_document_before_uncertain_insert(self):
        self.sign_in('admin')
        await server.db.findings.insert_one({'finding_id': 'before-insert', 'client_id': 'a', 'title': 'Finding',
            'owner_id': 'member', 'severity': 'medium', 'status': 'open'})
        original = type(server.db.tasks).update_one

        async def unavailable(collection, *args, **kwargs):
            if collection.name == 'tasks':
                raise RuntimeError('storage unavailable before insert')
            return await original(collection, *args, **kwargs)

        route = '/api/findings/before-insert/create-task'
        with patch.object(type(server.db.tasks), 'update_one', unavailable):
            failed = await self.client.post(route, json={'title': 'Accepted intent'})
        self.assertEqual(failed.status_code, 503, failed.text)
        self.assertEqual(await server.db.tasks.count_documents({}), 0)
        recovered = await self.client.post(route, json={'title': 'Different retry body', 'assignee_id': None})
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual((recovered.json()['title'], recovered.json()['assignee_id']), ('Accepted intent', 'member'))
        self.assertEqual(await server.db.tasks.count_documents({}), 1)
