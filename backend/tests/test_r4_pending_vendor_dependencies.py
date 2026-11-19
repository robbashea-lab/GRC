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
