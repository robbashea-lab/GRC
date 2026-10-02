import json
from pathlib import Path
import unittest

from fastapi import HTTPException
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from record_contracts import normalize_write


class RecordContractTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = Harness.asyncSetUp
    sign_in = Harness.sign_in

    def test_shared_alias_matrix(self):
        scenarios = json.loads((Path(__file__).parents[2] / 'shared/contracts/record-aliases.json').read_text())
        for row in scenarios:
            with self.subTest(row['name']):
                if row.get('error'):
                    with self.assertRaises(HTTPException) as raised:
                        normalize_write(row['kind'], row['body'])
                    self.assertEqual(raised.exception.status_code, row['error'])
                else:
                    self.assertEqual(normalize_write(row['kind'], row['body'], row.get('existing')), row['expected'])

    async def test_vendor_legacy_only_writes_become_canonical_and_conflicts_reject(self):
        self.sign_in('admin')
        response = await self.client.post('/api/vendors', json={
            'client_id': 'a', 'name': 'Legacy integration', 'services': 'CRM', 'contract_end': '2028-02-29'})
        self.assertEqual(response.status_code, 200, response.text)
        vendor = response.json()
        self.assertEqual((vendor['service'], vendor['contract_expiration']), ('CRM', '2028-02-29'))
        for change in ({'service': 'CRM', 'services': 'Other'},
                       {'contract_expiration': '2028-02-29', 'contract_end': '2029-02-28'}):
            result = await self.client.patch('/api/vendors/' + vendor['vendor_id'], json=change)
            self.assertEqual(result.status_code, 422, result.text)
        stored = await server.db.vendors.find_one({'vendor_id': vendor['vendor_id']})
        self.assertEqual((stored['service'], stored['contract_expiration']), ('CRM', '2028-02-29'))

    async def test_existing_alias_values_are_read_without_silent_migration(self):
        self.sign_in('admin')
        await server.db.vendors.insert_one({'vendor_id': 'legacy', 'client_id': 'a', 'name': 'Retained',
            'services': 'Historic service', 'contract_end': '2028-02-29', 'status': 'terminated'})
        response = await self.client.get('/api/vendors/legacy')
        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.json()['service'], response.json()['contract_expiration'], response.json()['status']),
                         ('Historic service', '2028-02-29', 'inactive'))
        stored = await server.db.vendors.find_one({'vendor_id': 'legacy'})
        self.assertNotIn('service', stored)
        self.assertNotIn('contract_expiration', stored)
        self.assertEqual(stored['status'], 'terminated')

    async def test_explicit_contract_clear_does_not_revive_legacy_date(self):
        self.sign_in('admin')
        await server.db.vendors.insert_one({'vendor_id': 'clear-legacy', 'client_id': 'a', 'name': 'Retained',
            'services': 'Historic service', 'contract_end': '2028-02-29', 'status': 'onboarding', 'criticality': 'medium'})
        response = await self.client.patch('/api/vendors/clear-legacy', json={'contract_expiration': None})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone((await self.client.get('/api/vendors/clear-legacy')).json()['contract_expiration'])
        stored = await server.db.vendors.find_one({'vendor_id': 'clear-legacy'})
        self.assertIsNone(stored['contract_end'])
        self.assertEqual(stored['services'], 'Historic service')
