import copy
import unittest
from unittest.mock import patch

from mongomock_motor import AsyncMongoMockClient

from migrate_record_contracts import run
from record_integrity import inspect_client, ticket_diagnostics


class RecordIntegrityTests(unittest.IsolatedAsyncioTestCase):
    def test_ticket_diagnostics_preserve_ambiguous_assignments_without_repair(self):
        records={'findings':[{'finding_id':'f'},{'finding_id':'empty'},{'finding_id':'bad','primary_task_id':'foreign'}],
                 'tasks':[{'task_id':'one','finding_id':'f','assignee_id':'a','status':'done'},
                          {'task_id':'two','finding_id':'f','assignee_id':'b','status':'blocked'},
                          {'task_id':'orphan','finding_id':'missing'}]}
        before=copy.deepcopy(records);report=ticket_diagnostics(records)
        row=next(r for r in report if r['ticket_id']=='finding:f')
        self.assertEqual(row['code'],'ambiguous_primary_action')
        self.assertIsNone(row['primary_task_id'])
        self.assertEqual([a['owner_id'] for a in row['actions']],['a','b'])
        self.assertEqual(row['outstanding_actions'],1)
        self.assertEqual(records,before)
        self.assertEqual({r['code'] for r in report},{'ambiguous_primary_action','no_action','primary_action_unavailable','linked_finding_unavailable'})
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()['isolated_record_contracts']
        await self.db.users.insert_many([
            {'user_id': 'admin', 'email': 'migration-admin@example.test', 'status': 'active', 'role': 'platform_admin', 'client_ids': ['a']},
            {'user_id': 'reader', 'email': 'migration-reader@example.test', 'status': 'active', 'role': 'client_readonly', 'client_ids': ['a']}])
        await self.db.clients.insert_many([{'client_id': 'a'}, {'client_id': 'b'}])
        await self.db.vendors.insert_one({'vendor_id': 'v', 'client_id': 'a', 'services': 'Legacy service', 'contract_end': '2028-02-29'})
        await self.db.tasks.insert_one({'task_id': 't', 'client_id': 'a', 'owner_id': 'admin', 'status': 'done'})

    async def migrate(self, mode='apply', run_id='isolated-migration-0001'):
        return await run(self.db, 'a', 'admin', mode=mode, run_id=run_id, confirm_database=self.db.name)

    async def test_dry_run_is_read_only_and_reports_conflicts_and_relationships(self):
        await self.db.vendors.insert_one({'vendor_id': 'conflict', 'client_id': 'a', 'service': 'New', 'services': 'Old'})
        await self.db.reviews.insert_one({'review_id': 'foreign', 'client_id': 'b'})
        await self.db.findings.insert_one({'finding_id': 'f', 'client_id': 'a', 'review_id': 'foreign'})
        await self.db.evidence.insert_one({'evidence_id': 'e', 'client_id': 'a', 'linked_type': 'findings', 'linked_id': 'missing'})
        before = await self.db.vendors.find_one({'vendor_id': 'v'})
        report = await run(self.db, 'a', 'admin')
        self.assertEqual(report['mode'], 'dry-run')
        self.assertEqual(len(report['repairs']), 2)
        self.assertEqual({item['code'] for item in report['issues']}, {
            'conflicting_legacy_alias', 'cross_tenant_relationship', 'missing_relationship_target'})
        self.assertEqual(await self.db.vendors.find_one({'vendor_id': 'v'}), before)
        self.assertEqual(await self.db.record_contract_migrations.count_documents({}), 0)

    async def test_apply_repeat_and_rollback_preserve_aliases_and_historical_records(self):
        before = await self.db.tasks.find_one({'task_id': 't'})
        self.assertEqual((await self.migrate())['state'], 'complete')
        vendor = await self.db.vendors.find_one({'vendor_id': 'v'})
        self.assertEqual((vendor['services'], vendor['service']), ('Legacy service', 'Legacy service'))
        self.assertEqual((await self.db.tasks.find_one({'task_id': 't'}))['status'], 'done')
        self.assertEqual((await self.migrate())['state'], 'complete')
        self.assertEqual((await self.migrate('rollback'))['state'], 'rolled_back')
        self.assertEqual(await self.db.tasks.find_one({'task_id': 't'}), before)
        self.assertNotIn('service', await self.db.vendors.find_one({'vendor_id': 'v'}))
        self.assertEqual((await self.migrate('rollback'))['state'], 'rolled_back')

    async def test_unknown_write_result_resumes_once(self):
        original = type(self.db.vendors).update_one
        raised = False

        async def lost_ack(collection, *args, **kwargs):
            nonlocal raised
            result = await original(collection, *args, **kwargs)
            if collection.name == 'vendors' and not raised:
                raised = True
                raise RuntimeError('lost acknowledgement')
            return result

        with patch.object(type(self.db.vendors), 'update_one', lost_ack):
            with self.assertRaises(RuntimeError):
                await self.migrate()
        self.assertEqual((await self.migrate())['state'], 'complete')
        self.assertEqual(await self.db.vendors.count_documents({}), 1)
        self.assertEqual((await self.migrate('rollback'))['state'], 'rolled_back')

    async def test_apply_and_rollback_never_overwrite_concurrent_operator_edits(self):
        report = await inspect_client(self.db, 'a')
        await self.db.record_contract_migrations.insert_one({'_id': 'isolated-migration-0001', 'client_id': 'a',
            'actor_id': 'admin', 'repairs': report['repairs'], 'issues': report['issues'], 'state': 'pending', 'applied': []})
        await self.db.vendors.update_one({'vendor_id': 'v'}, {'$set': {'service': 'Operator decision'}})
        self.assertEqual((await self.migrate())['state'], 'conflict')
        self.assertEqual((await self.db.vendors.find_one({'vendor_id': 'v'}))['service'], 'Operator decision')
        await self.db.tasks.update_one({'task_id': 't'}, {'$set': {'assignee_id': 'new-owner', 'updated_at': '2030-01-01'}})
        self.assertEqual((await self.migrate('rollback'))['state'], 'conflict')
        self.assertEqual((await self.db.tasks.find_one({'task_id': 't'}))['assignee_id'], 'new-owner')

    async def test_overlapping_apply_refreshes_receipt_before_freezing_after_image(self):
        report = await inspect_client(self.db, 'a')
        await self.db.record_contract_migrations.insert_one({'_id': 'isolated-migration-0001', 'client_id': 'a',
            'actor_id': 'admin', 'repairs': report['repairs'], 'issues': report['issues'], 'state': 'pending', 'applied': []})
        original = type(self.db.record_contract_migrations).find_one
        interrupted = False

        async def finish_other_apply(collection, *args, **kwargs):
            nonlocal interrupted
            # Mongo returns detached documents. Hold B's old snapshot while A finishes.
            result = copy.deepcopy(await original(collection, *args, **kwargs))
            if collection.name == 'record_contract_migrations' and not interrupted:
                interrupted = True
                self.assertEqual((await self.migrate())['state'], 'complete')
            return result

        with patch.object(type(self.db.record_contract_migrations), 'find_one', finish_other_apply):
            self.assertEqual((await self.migrate())['state'], 'complete')
        receipt = await self.db.record_contract_migrations.find_one({'_id': 'isolated-migration-0001'})
        vendor = await self.db.vendors.find_one({'vendor_id': 'v'})
        vendor_index = next(index for index, repair in enumerate(receipt['repairs'])
                            if repair['kind'] == 'vendors' and repair['id'] == 'v')
        self.assertEqual(receipt['after'][str(vendor_index)]['updated_at'], vendor['updated_at'])
        self.assertEqual((await self.migrate('rollback'))['state'], 'rolled_back')

    async def test_apply_rechecks_rollback_state_after_acquiring_lease(self):
        await self.migrate()
        original = type(self.db.record_contract_migrations).find_one
        interrupted = False

        async def finish_rollback(collection, *args, **kwargs):
            nonlocal interrupted
            result = copy.deepcopy(await original(collection, *args, **kwargs))
            if collection.name == 'record_contract_migrations' and not interrupted:
                interrupted = True
                self.assertEqual((await self.migrate('rollback'))['state'], 'rolled_back')
            return result

        with patch.object(type(self.db.record_contract_migrations), 'find_one', finish_rollback):
            with self.assertRaisesRegex(ValueError, 'rolled-back migration'):
                await self.migrate()
        receipt = await self.db.record_contract_migrations.find_one({'_id': 'isolated-migration-0001'})
        self.assertEqual(receipt['state'], 'rolled_back')
        self.assertNotIn('service', await self.db.vendors.find_one({'vendor_id': 'v'}))

    async def test_write_gate_authorization_and_receipt_scope(self):
        with self.assertRaises(ValueError):
            await run(self.db, 'a', 'admin', mode='apply', run_id='isolated-migration-0001')
        with self.assertRaises(Exception) as denied:
            await run(self.db, 'a', 'reader')
        self.assertEqual(denied.exception.status_code, 403)
        with self.assertRaises(ValueError):
            await run(self.db, 'b', 'admin')
        await self.migrate()
        await self.db.users.update_one({'user_id': 'admin'}, {'$set': {'status': 'disabled'}})
        with self.assertRaises(ValueError):
            await self.migrate('rollback')

    async def test_occurrence_and_source_provenance_conflicts_are_reported_without_repair(self):
        await self.db.reviews.insert_one({'review_id': 'r', 'client_id': 'a', 'current_occurrence_id': 'current',
            'occurrences': [{'occurrence_id': 'old', 'status': 'completed'}]})
        await self.db.findings.insert_one({'finding_id': 'f', 'client_id': 'a', 'review_id': 'r', 'occurrence_id': 'unknown'})
        await self.db.tasks.insert_one({'task_id': 'linked', 'client_id': 'a', 'review_id': 'r', 'source_type': 'review', 'source_id': 'different'})
        report = await inspect_client(self.db, 'a')
        self.assertTrue({'unknown_review_occurrence', 'conflicting_source_relationship'} <= {item['code'] for item in report['issues']})
        self.assertEqual((await self.db.findings.find_one({'finding_id': 'f'}))['occurrence_id'], 'unknown')

    async def test_duplicate_identities_are_reported_and_never_repaired(self):
        await self.db.vendors.insert_one({'vendor_id': 'v', 'client_id': 'a', 'services': 'Another legacy value'})
        report = await inspect_client(self.db, 'a')
        self.assertIn({'kind': 'vendors', 'id': 'v', 'code': 'duplicate_identity'}, report['issues'])
        self.assertFalse(any(row['kind'] == 'vendors' for row in report['repairs']))
        await self.migrate()
        self.assertEqual(await self.db.vendors.count_documents({'service': {'$exists': True}}), 0)

    async def test_malformed_relationship_containers_are_reported_without_crashing(self):
        await self.db.vendors.update_one({'vendor_id': 'v'}, {'$set': {'assurance_records': [None], 'related_risk_ids': 'bad'}})
        await self.db.reviews.insert_one({'review_id': 'bad', 'client_id': 'a',
            'related_links': [False], 'occurrences': [{'evidence': ['bad'], 'iso_audit': {'items': {'item': None}}}]})
        await self.db.policies.insert_one({'policy_id': 'p', 'client_id': 'a', 'approval_subject': [], 'approval_history': [False]})
        await self.db.organizational_controls.insert_one({'control_id': 'c', 'client_id': 'a',
            'history': [None], 'observations': [{'design_snapshot': {'related_links': [None]}}]})
        report = await inspect_client(self.db, 'a')
        fields = {row['field'] for row in report['issues'] if row['code'] == 'invalid_relationship'}
        self.assertTrue({'assurance_records.0', 'related_risk_ids', 'related_links.0',
            'occurrences.0.evidence.0', 'occurrences.0.iso_audit.items.item',
            'approval_subject', 'approval_history.0', 'history.0',
            'observations.0.design_snapshot.related_links.0'} <= fields, fields)
