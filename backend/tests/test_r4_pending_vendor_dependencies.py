"""Pending shared Vendors cannot become settled native dependencies."""
from copy import deepcopy
import unittest
from unittest.mock import AsyncMock, patch

import create_requests
import test_ai_onboarding as onboarding_fixture
import test_client_dashboard_sources as fixture

server = fixture.server


class R4PendingVendorDependencyTests(unittest.IsolatedAsyncioTestCase):
    sign_in = fixture.ClientDashboardSourcesTests.sign_in
    onboarding_body = onboarding_fixture.AIOnboardingTests.payload

    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        self.client.event_hooks['request'] = []
        self.sign_in('admin')

    def services_body(self):
        return {'expected_updated_at': None,
                'areas': {'governance': {'responsibility': 'iv', 'tool_ids': []}},
                'custom_tools': [], 'preset': 'advisory'}

    async def save_services(self, key):
        return await self.client.post('/api/clients/a/services', json=self.services_body(),
                                      headers={'Idempotency-Key': key})

    async def business_state(self):
        return {name: await server.db[name].find({}).to_list(None)
                for name in ('clients', 'vendors', 'ai_systems', 'risks', 'reviews')}

    async def linked_vendor(self):
        row = {'vendor_id': 'owned-provider', 'client_id': 'a',
               'name': 'Synthetic drafting provider', 'service': 'Synthetic public drafting',
               'status': 'onboarding', 'criticality': 'high', 'next_review': None,
               'review_frequency': 'annual', 'saved_history': ['Retained native relationship'],
               'updated_at': '2026-11-19T00:00:00+00:00'}
        await server.db.vendors.insert_one(deepcopy(row))
        return row

    async def onboard(self, body, key):
        return await self.client.post('/api/ai_systems/onboard', json=body,
                                      headers={'Idempotency-Key': key})

    async def completed_linked_onboarding(self):
        vendor = await self.linked_vendor()
        body = self.onboarding_body()
        body['vendor'].update(mode='link', id=vendor['vendor_id'],
                              expected_updated_at=vendor['updated_at'])
        key = 'r4-vendor-dependency-onboard'
        first = await self.onboard(body, key)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()['vendor_id'], 'owned-provider')
        return body, key, first.json()

    async def test_provider_claim_interval_denies_competing_save_and_original_retry_keeps_one_vendor(self):
        key = 'r4-provider-claim-original'
        identity = create_requests.digest(['admin', 'a', 'clients/a/services', key])
        collection_type = type(server.db.clients)
        original_update = collection_type.update_one
        interrupted = False
        pending_vendor_id = None

        async def interrupt_before_client_claim(collection, query, update, *args, **kwargs):
            nonlocal interrupted, pending_vendor_id
            if (not interrupted and collection.name == 'clients'
                    and update.get('$set', {}).get('_r4_context_pending') == identity):
                interrupted = True
                pending = await server.db.vendors.find_one({'client_id': 'a'})
                self.assertIsNotNone(pending, 'The fault must follow the provider Vendor insert')
                self.assertEqual(pending['_r4_context_pending'], identity)
                self.assertNotIn('_r4_context_applied', pending)
                pending_vendor_id = pending['vendor_id']
                client = await server.db.clients.find_one({'client_id': 'a'})
                self.assertNotIn('_r4_context_pending', client)
                before = await self.business_state()
                competing = await self.save_services('r4-provider-claim-competing')
                self.assertEqual(competing.status_code, 409, competing.text)
                self.assertEqual(await self.business_state(), before)
                raise RuntimeError('Synthetic interruption after Vendor claim, before Client claim')
            return await original_update(collection, query, update, *args, **kwargs)

        with patch.object(collection_type, 'update_one', interrupt_before_client_claim):
            first = await self.save_services(key)
        self.assertTrue(interrupted)
        self.assertEqual(first.status_code, 503, first.text)
        receipt = await server.db.create_requests.find_one({'_id': identity})
        frozen = deepcopy(receipt['r4_write_plan'])
        self.assertEqual(receipt['state'], 'pending')
        self.assertFalse(receipt.get('primary_started', False))
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a'}), 1)
        self.assertNotIn('profile', await server.db.clients.find_one({'client_id': 'a'}))

        recovered = await self.save_services(key)
        self.assertEqual(recovered.status_code, 200, recovered.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        self.assertEqual(client['profile']['services']['provider_vendor_id'], pending_vendor_id)
        vendor = await server.db.vendors.find_one({'vendor_id': pending_vendor_id})
        self.assertEqual(vendor['client_id'], 'a')
        self.assertEqual(vendor['criticality'], 'high')
        self.assertTrue(vendor['criticality_provisional'])
        self.assertNotIn('_r4_context_pending', client)
        self.assertNotIn('_r4_context_pending', vendor)
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a'}), 1)
        receipt = await server.db.create_requests.find_one({'_id': identity})
        self.assertEqual(receipt['state'], 'complete')
        self.assertEqual(receipt['r4_write_plan'], frozen)

    async def test_pending_legacy_name_candidate_denies_then_preserves_settled_reconciliation(self):
        legacy = {'vendor_id': 'legacy-provider', 'client_id': 'a',
                  'name': 'iVenture legacy relationship', 'status': 'active',
                  'saved_history': ['Do not merge this genuine legacy record'],
                  '_r4_context_pending': 'other-owned-command'}
        await server.db.vendors.insert_one(deepcopy(legacy))
        before = await self.business_state()
        denied = await self.save_services('r4-provider-legacy-candidate')
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await self.business_state(), before)
        await server.db.vendors.update_one({'vendor_id': 'legacy-provider'},
                                           {'$unset': {'_r4_context_pending': ''}})
        accepted = await self.save_services('r4-provider-legacy-candidate')
        self.assertEqual(accepted.status_code, 200, accepted.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        services = client['profile']['services']
        self.assertNotIn('provider_vendor_id', services)
        self.assertEqual(services['provider_linkage'],
                         {'status': 'needs_reconciliation', 'candidate_ids': ['legacy-provider']})
        saved = await server.db.vendors.find_one({'vendor_id': 'legacy-provider'}, {'_id': 0})
        self.assertEqual(saved, {k: v for k, v in legacy.items() if k != '_r4_context_pending'})
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a'}), 1)

    async def test_settled_catalog_vendor_reuses_identity_without_changing_history(self):
        vendor = await self.linked_vendor()
        await server.db.vendors.update_one({'vendor_id': vendor['vendor_id']},
                                           {'$set': {'catalog_key': 'iventure-solutions'}})
        before = await server.db.vendors.find_one({'vendor_id': vendor['vendor_id']})
        accepted = await self.save_services('r4-provider-settled-catalog')
        self.assertEqual(accepted.status_code, 200, accepted.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        self.assertEqual(client['profile']['services']['provider_vendor_id'], 'owned-provider')
        self.assertEqual(await server.db.vendors.find_one({'vendor_id': 'owned-provider'}), before)
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a'}), 1)

    async def test_foreign_pending_vendor_does_not_block_current_client_provider(self):
        await server.db.vendors.insert_one({'vendor_id': 'foreign-provider', 'client_id': 'b',
            'catalog_key': 'iventure-solutions', 'name': 'iVenture foreign relationship',
            '_r4_context_pending': 'other-client-command'})
        before = await server.db.vendors.find_one({'vendor_id': 'foreign-provider'})
        accepted = await self.save_services('r4-provider-current-client')
        self.assertEqual(accepted.status_code, 200, accepted.text)
        client = await server.db.clients.find_one({'client_id': 'a'})
        self.assertNotEqual(client['profile']['services']['provider_vendor_id'], 'foreign-provider')
        self.assertEqual(await server.db.vendors.count_documents({'client_id': 'a'}), 1)
        self.assertEqual(await server.db.vendors.find_one({'vendor_id': 'foreign-provider'}), before)

    async def test_fresh_ai_link_refuses_pending_vendor_without_creating_native_records(self):
        vendor = await self.linked_vendor()
        await server.db.vendors.update_one({'vendor_id': vendor['vendor_id']},
                                           {'$set': {'_r4_context_pending': 'pending-provider-command'}})
        body = self.onboarding_body()
        body['vendor'].update(mode='link', id=vendor['vendor_id'],
                              expected_updated_at=vendor['updated_at'])
        before = await self.business_state()
        denied = await self.onboard(body, 'r4-ai-fresh-pending-provider')
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await self.business_state(), before)
        self.assertEqual(await server.db.ai_systems.count_documents({}), 0)
        self.assertEqual(await server.db.risks.count_documents({}), 0)
        self.assertEqual(await server.db.reviews.count_documents({}), 0)

    async def test_cached_ai_onboarding_rechecks_pending_vendor_before_disclosing_result(self):
        body, key, result = await self.completed_linked_onboarding()
        await server.db.vendors.update_one({'vendor_id': 'owned-provider'},
                                           {'$set': {'_r4_context_pending': 'later-provider-command'}})
        before = await self.business_state()
        denied = await self.onboard(body, key)
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertNotIn('ai_system', denied.json())
        self.assertEqual(await self.business_state(), before)
        await server.db.vendors.update_one({'vendor_id': 'owned-provider'},
                                           {'$unset': {'_r4_context_pending': ''}})
        replay = await self.onboard(body, key)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), result)
        self.assertEqual(await server.db.ai_systems.count_documents({}), 1)
        self.assertEqual(await server.db.risks.count_documents({}), 1)

    async def test_current_client_claim_denies_fresh_and_cached_ai_before_receipt_repair(self):
        body, key, _ = await self.completed_linked_onboarding()
        await server.db.clients.update_one({'client_id': 'a'},
                                           {'$set': {'_r4_context_pending': 'client-context-command'}})
        before = await self.business_state()
        receipts = await server.db.create_requests.find({}).to_list(None)
        blocked = AsyncMock(side_effect=AssertionError('Current client claim must precede receipt replay'))
        with patch.object(create_requests, 'run', blocked):
            for request_key in (key, 'r4-ai-fresh-client-pending'):
                with self.subTest(cached=request_key == key):
                    denied = await self.onboard(body, request_key)
                    self.assertEqual(denied.status_code, 409, denied.text)
                    self.assertEqual(await self.business_state(), before)
                    self.assertEqual(await server.db.create_requests.find({}).to_list(None), receipts)
        blocked.assert_not_awaited()
        await server.db.clients.update_one({'client_id': 'a'}, {'$unset': {'_r4_context_pending': ''}})
        self.assertEqual((await self.onboard(body, key)).status_code, 200)

    async def test_cached_ai_keeps_settled_vendor_edits_and_current_role_requirements(self):
        body, key, result = await self.completed_linked_onboarding()
        await server.db.vendors.update_one({'vendor_id': 'owned-provider'}, {'$set': {
            'updated_at': '2026-11-19T01:00:00+00:00', 'service': 'A later native service description'}})
        before = await self.business_state()
        replay = await self.onboard(body, key)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()['ai_system_id'], result['ai_system_id'])
        self.assertEqual(await self.business_state(), before)
        # Keep the same authenticated actor and completed receipt; its former
        # administrator role must not authorize a cached success after revocation.
        await server.db.users.update_one({'user_id': 'admin'},
                                         {'$set': {'role': 'client_contributor'}})
        denied = await self.onboard(body, key)
        self.assertEqual(denied.status_code, 403, denied.text)
        self.assertEqual(await self.business_state(), before)


from bson import BSON
from fastapi import HTTPException
import r4_services as services
import r4_preservation_checks as preservation

PENDING = 'd' * 64

class R4TaskDependencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        self.client.event_hooks['request'] = []
        fixture.ClientDashboardSourcesTests.sign_in(self, 'admin')

    async def snapshot(self, exclude=()):
        saved = {}
        for name in sorted(await server.db.list_collection_names()):
            if name in exclude:
                continue
            rows = await server.db[name].find({}).to_list(None)
            saved[name] = {'documents': [BSON.encode(row) for row in rows],
                           'indexes': deepcopy(await server.db[name].index_information())}
        return preservation.comparable(saved)

    async def create(self, body, key):
        return await self.client.post('/api/tasks', json=body,
                                      headers={'Idempotency-Key': key})

    def task(self, **extra):
        return {'client_id': 'a', 'title': 'Synthetic dependent Action', **extra}

    async def review(self, ident='source-review', **extra):
        row = {'review_id': ident, 'client_id': 'a', 'title': 'Synthetic source Review',
               'review_type': 'custom', 'status': 'upcoming', 'recurrence': 'annual',
               'due_date': '2099-12-01', 'current_occurrence_id': 'occ-' + ident, **extra}
        await server.db.reviews.insert_one(deepcopy(row))
        return row

    async def assert_refused_without_writes(self, body, key):
        before = await self.snapshot()
        denied = await self.create(body, key)
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await self.snapshot(), before,
                         'Denial must preserve every document/index, including receipts, audit and events')
        return denied

    async def test_new_claimed_review_cannot_publish_orphan_task_before_claim_rollback(self):
        review = {'review_id': 'claimed-new-review', 'client_id': 'a',
                  'title': 'Claimed native Review', 'review_type': 'custom',
                  'status': 'upcoming', 'recurrence': 'annual', 'due_date': '2099-12-01',
                  'current_occurrence_id': 'claimed-native-occurrence'}
        client = await server.db.clients.find_one({'client_id': 'a'}, {'_id': 0})
        key = 'task-source-native-claim-rollback'
        identity = create_requests.digest(['admin', 'a', 'synthetic-context', key])
        writes = [services.write_row('reviews', 'review_id', review, {}, new=True),
                  services.write_row('clients', 'client_id', client, {'name': 'Settled recovery'})]
        collection_type = type(server.db.reviews)
        original = collection_type.insert_one
        response = None
        pending_snapshot = None
        dependent_preserved = False

        async def pause_after_review_claim(collection, document, *positional, **keyword):
            nonlocal response, pending_snapshot, dependent_preserved
            result = await original(collection, document, *positional, **keyword)
            if collection.name == 'reviews' and document.get('_r4_context_pending') == identity:
                self.assertFalse((await server.db.create_requests.find_one({'_id': identity})).get('primary_started'))
                pending_snapshot = await self.snapshot()
                # A separate incoming HTTP request has no outer command identity.
                # ASGITransport otherwise directly inherits this callback's ContextVar.
                request_context = create_requests.current.set(None)
                try:
                    response = await self.create(self.task(source_type='review', source_id=review['review_id']),
                                                 'task-during-uncommitted-review')
                finally:
                    create_requests.current.reset(request_context)
                dependent_preserved = await self.snapshot() == pending_snapshot
                # Force a genuine later claim conflict. apply_plan must remove its new Review.
                await server.db.clients.update_one({'client_id': 'a'},
                                                    {'$set': {'updated_at': 'competing-client-revision'}})
            return result

        user = await server.db.users.find_one({'user_id': 'admin'}, {'_id': 0})
        async def execute(command):
            return await services.apply_plan(server, writes, command, user, 'Synthetic context claim')

        with patch.object(collection_type, 'insert_one', pause_after_review_claim):
            with self.assertRaises(HTTPException) as conflict:
                await create_requests.run(server.db, key, 'admin', 'a', 'synthetic-context', {}, execute)
        self.assertEqual(conflict.exception.status_code, 409)
        self.assertIsNotNone(response, 'The attempt must occur inside the actual new-Review claim interval')
        self.assertEqual(response.status_code, 409,
                         f'Claimed source Task must be refused; persisted orphan count={await server.db.tasks.count_documents({})}')
        self.assertEqual(await server.db.tasks.count_documents({}), 0)
        self.assertIsNone(await server.db.reviews.find_one({'review_id': review['review_id']}))
        self.assertEqual(await server.db.audit_logs.count_documents({}), 0)
        self.assertEqual(await server.db.create_requests.count_documents({}), 1,
                         'The refused dependent Task must not create a receipt')
        self.assertIsNotNone(pending_snapshot)
        self.assertTrue(dependent_preserved, 'The refused Task cannot add documents, receipts, audits, events or indexes')
        # Retry the retained original plan after removing only the synthetic conflicting revision.
        await server.db.clients.update_one({'client_id': 'a'}, {'$unset': {'updated_at': ''}})
        await create_requests.run(server.db, key, 'admin', 'a', 'synthetic-context', {}, execute)
        recovered = await server.db.reviews.find_one({'review_id': review['review_id']})
        self.assertNotIn('_r4_context_pending', recovered)
        accepted = await self.create(self.task(source_type='review', source_id=review['review_id']),
                                      'task-during-uncommitted-review')
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()['review_id'], review['review_id'])
        self.assertEqual(accepted.json()['occurrence_id'], review['current_occurrence_id'])
        self.assertEqual(await server.db.tasks.count_documents({}), 1)

    async def test_each_selected_source_refuses_pending_before_any_create_receipt(self):
        for source_type, (collection, field) in server.action_items.SOURCES.items():
            ident = 'pending-' + source_type
            await server.db[collection].insert_one({field: ident, 'client_id': 'a',
                'title': 'Synthetic pending source', '_r4_context_pending': PENDING})
            with self.subTest(source_type=source_type):
                await self.assert_refused_without_writes(
                    self.task(source_type=source_type, source_id=ident), 'task-pending-source-' + source_type)

    async def test_finding_review_and_derived_vendor_are_all_checked(self):
        await server.db.vendors.insert_one({'vendor_id': 'derived-vendor', 'client_id': 'a'})
        await self.review(vendor_id='derived-vendor')
        await server.db.findings.insert_one({'finding_id': 'linked-finding', 'client_id': 'a',
            'review_id': 'source-review', 'occurrence_id': 'historical-finding-occurrence', 'status': 'open'})
        body = self.task(source_type='finding', source_id='linked-finding')
        for collection, field, ident in [('reviews', 'review_id', 'source-review'),
                                         ('vendors', 'vendor_id', 'derived-vendor')]:
            await server.db[collection].update_one({field: ident}, {'$set': {'_r4_context_pending': PENDING}})
            with self.subTest(collection=collection):
                await self.assert_refused_without_writes(body, 'task-derived-pending-' + collection)
            await server.db[collection].update_one({field: ident}, {'$unset': {'_r4_context_pending': ''}})

    async def test_current_client_and_cached_source_are_rechecked_without_receipt_replay(self):
        await self.review()
        body = self.task(source_type='review', source_id='source-review')
        key = 'task-current-client-and-cached-source'
        accepted = await self.create(body, key)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        for collection, field, ident in [('clients', 'client_id', 'a'),
                                         ('reviews', 'review_id', 'source-review')]:
            await server.db[collection].update_one({field: ident}, {'$set': {'_r4_context_pending': PENDING}})
            with self.subTest(collection=collection):
                await self.assert_refused_without_writes(body, key)
                await self.assert_refused_without_writes(body, key + '-fresh')
            await server.db[collection].update_one({field: ident}, {'$unset': {'_r4_context_pending': ''}})
        before = await self.snapshot()
        replay = await self.create(body, key)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json(), accepted.json())
        self.assertEqual(await self.snapshot(), before)
        self.assertEqual(await server.db.tasks.count_documents({}), 1)

    async def test_parent_claim_after_preflight_is_checked_on_the_consumed_row(self):
        body = self.task(source_type='review', source_id='source-review')
        key = 'task-source-claim-after-admission'
        original = server.action_items.prepare
        claimed_state = None

        async def claim_before_consumption(db, row, can_access, previous=None):
            nonlocal claimed_state
            await self.review(_r4_context_pending=PENDING)
            claimed_state = await self.snapshot(exclude=('create_requests',))
            return await original(db, row, can_access, previous)

        with patch.object(server.action_items, 'prepare', claim_before_consumption):
            denied = await self.create(body, key)
        self.assertIsNotNone(claimed_state)
        self.assertEqual(denied.status_code, 409, denied.text)
        self.assertEqual(await self.snapshot(exclude=('create_requests',)), claimed_state)
        self.assertEqual(await server.db.tasks.count_documents({}), 0)
        # Admission raced a new claim after the create receipt was acquired. Only
        # that original, unstarted four-field intent may remain; no lease/effects.
        receipt = await server.db.create_requests.find_one({})
        self.assertEqual(set(receipt), {'_id', 'fingerprint', 'created_at', 'state'})
        self.assertEqual(receipt['_id'], create_requests.digest(['admin', 'a', 'tasks', key]))
        self.assertEqual(receipt['fingerprint'], create_requests.digest(body))
        self.assertEqual(receipt['state'], 'pending')
        self.assertIsInstance(receipt['created_at'], str)
        self.assertEqual(await server.db.create_requests.count_documents({}), 1)

    async def test_unrelated_pending_records_do_not_freeze_settled_manual_or_source_tasks(self):
        await self.review()
        await self.review('unrelated-review', _r4_context_pending=PENDING)
        await server.db.vendors.insert_one({'vendor_id': 'foreign-vendor', 'client_id': 'b',
                                           '_r4_context_pending': PENDING})
        for suffix, body in [('manual', self.task()),
                             ('review', self.task(source_type='review', source_id='source-review'))]:
            response = await self.create(body, 'task-unrelated-pending-' + suffix)
            self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(await server.db.tasks.count_documents({}), 2)