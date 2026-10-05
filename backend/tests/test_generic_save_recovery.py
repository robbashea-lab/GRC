"""Generic save recovery through actual authorized API routes."""
import unittest
import httpx
from unittest.mock import AsyncMock, patch
import test_client_dashboard_sources as harness

server = harness.server


class GenericSaveRecoveryTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def prepare(self, kind='assets'):
        self.sign_in('admin')
        self.client.event_hooks['request'] = []
        self.client._transport = httpx.ASGITransport(app=server.app, raise_app_exceptions=False)
        key = server.ENTITY_MAP[kind][2]
        row = {key:'recovery', 'client_id':'a', 'name':'Before', 'updated_at':'2026-10-01T00:00:00+00:00'}
        if kind == 'vendors':
            row.update(service='Synthetic service', criticality='low', status='onboarding', review_frequency='annual')
        await server.db[kind].insert_one(row)
        self.path = '/api/' + kind + '/recovery'
        self.body = {'expected_updated_at':row['updated_at'], **({'next_review':'2027-01-15'} if kind == 'vendors' else {'name':'After'})}
        self.headers = {'Idempotency-Key':'generic-save-recovery-001'}

    async def save(self, body=None, headers=None):
        return await self.client.patch(self.path, json=body or self.body, headers=headers or self.headers)

    async def test_asset_audit_failure_recovers_once_and_replays(self):
        await self.prepare()
        with patch.object(server, 'audit', AsyncMock(side_effect=RuntimeError('injected outage'))):
            failed = await self.save()
        self.assertEqual(failed.status_code, 503, failed.text)
        recovered = await self.save()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()['name'], 'After')
        self.assertEqual((await self.save()).json(), recovered.json())
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id':'recovery','action':'update'}), 1)

    async def test_vendor_review_failure_recovers_once(self):
        await self.prepare('vendors')
        with patch.object(server.vendor_governance, 'ensure_reviews', AsyncMock(side_effect=RuntimeError('injected outage'))):
            failed = await self.save()
        self.assertEqual(failed.status_code, 503, failed.text)
        recovered = await self.save()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual((await self.save()).status_code, 200)
        reviews = await server.db.reviews.find({'vendor_id':'recovery'}).to_list(None)
        self.assertEqual(len(reviews), 1)
        self.assertEqual(reviews[0]['due_date'][:10], '2027-01-15')

    async def test_completed_retry_cannot_overwrite_new_edit_and_rechecks_access(self):
        await self.prepare()
        first = await self.save()
        self.assertEqual(first.status_code, 200, first.text)
        new = await self.save({'name':'Newer', 'expected_updated_at':first.json()['updated_at']}, {'Idempotency-Key':'generic-save-newer-002'})
        self.assertEqual(new.status_code, 200, new.text)
        self.assertEqual((await self.save()).status_code, 200)
        self.assertEqual((await server.db.assets.find_one({'asset_id':'recovery'}))['name'], 'Newer')
        self.assertEqual((await self.save(headers={'Idempotency-Key':'generic-stale-new-003'})).status_code, 409)
        await server.db.users.update_one({'user_id':'admin'}, {'$set':{'role':'client_contributor','client_ids':['b']}})
        self.assertEqual((await self.save()).status_code, 403)

    async def test_lost_primary_acknowledgment_and_pending_new_edit(self):
        await self.prepare()
        collection_type = type(server.db.assets)
        update = collection_type.update_one
        tripped = False
        async def uncertain(collection, query, change, *args, **kwargs):
            nonlocal tripped
            result = await update(collection, query, change, *args, **kwargs)
            if collection.name == 'assets' and change.get('$set', {}).get('name') == 'After' and not tripped:
                tripped = True
                raise RuntimeError('lost primary acknowledgment')
            return result
        with patch.object(collection_type, 'update_one', uncertain):
            failed = await self.save()
        self.assertEqual(failed.status_code, 503, failed.text)
        row = await server.db.assets.find_one({'asset_id':'recovery'})
        blocked = await self.save({'name':'Newer','expected_updated_at':row['updated_at']}, {'Idempotency-Key':'pending-new-save-004'})
        self.assertEqual(blocked.status_code, 409)
        recovered = await self.save()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        self.assertEqual(recovered.json()['updated_at'], row['updated_at'])
        self.assertEqual(await server.db.audit_logs.count_documents({'entity_id':'recovery','action':'update'}), 1)

    async def test_pending_retry_uses_current_vendor_plan_not_obsolete_relationships(self):
        await self.prepare('vendors')
        with patch.object(server.vendor_governance, 'ensure_reviews', AsyncMock(side_effect=RuntimeError('outage'))):
            self.assertEqual((await self.save()).status_code, 503)
        # A later authorized specialized operation can advance the same Vendor.
        await server.db.vendors.update_one({'vendor_id':'recovery'}, {'$set':{'next_review':'2027-03-01','updated_at':'2026-10-06T00:00:00+00:00'}})
        recovered = await self.save()
        self.assertEqual(recovered.status_code, 200, recovered.text)
        reviews = await server.db.reviews.find({'vendor_id':'recovery'}).to_list(None)
        self.assertEqual(len(reviews), 1)
        self.assertEqual(reviews[0]['due_date'][:10], '2027-03-01')
        self.assertEqual(recovered.json()['updated_at'],'2026-10-06T00:00:00+00:00')

    async def test_pending_save_blocks_individual_and_bulk_delete_without_partial_deletion(self):
        await self.prepare()
        with patch.object(server,'audit',AsyncMock(side_effect=RuntimeError('outage'))):
            self.assertEqual((await self.save()).status_code,503)
        row=await server.db.assets.find_one({'asset_id':'recovery'})
        individual=await self.client.request('DELETE',self.path,json={'expected_updated_at':row['updated_at']})
        self.assertEqual(individual.status_code,409,individual.text)
        await server.db.assets.insert_one({'asset_id':'other','client_id':'a','name':'Other','updated_at':None})
        bulk=await self.client.post('/api/bulk',json={'kind':'assets','ids':['other','recovery'],'action':'delete','expected_versions':{'other':None,'recovery':row['updated_at']}})
        self.assertEqual(bulk.status_code,409,bulk.text)
        self.assertEqual(await server.db.assets.count_documents({}),2)
        self.assertEqual((await self.save()).status_code,200)

    async def test_risk_recovery_audits_original_change_not_later_ratings(self):
        await self.prepare('risks')
        await server.db.risks.update_one({'risk_id':'recovery'},{'$set':{'title':'Synthetic risk','status':'assessed','likelihood_score':2,'impact_score':2,'risk_score':4}})
        self.body.update(likelihood_score=3,impact_score=4)
        self.body.pop('name',None)
        with patch.object(server,'audit',AsyncMock(side_effect=RuntimeError('outage'))):
            self.assertEqual((await self.save()).status_code,503)
        await server.db.risks.update_one({'risk_id':'recovery'},{'$set':{'likelihood_score':2,'impact_score':3,'risk_score':6,'updated_at':'2026-10-06T00:00:00+00:00'}})
        self.assertEqual((await self.save()).status_code,200)
        event=await server.db.audit_logs.find_one({'entity_id':'recovery','action':'Risk reassessed'})
        self.assertEqual(event['meta']['score'],12)
        self.assertEqual(event['meta']['previous_score'],4)
        self.assertEqual((await server.db.risks.find_one({'risk_id':'recovery'}))['risk_score'],6)
