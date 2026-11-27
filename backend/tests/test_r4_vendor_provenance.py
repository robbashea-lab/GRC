"""A saved rating choice, never an unrelated edit, confirms a provisional Vendor."""
import unittest

import test_client_dashboard_sources as fixture

server = fixture.server


class R4VendorProvenanceTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def test_explicit_same_rating_confirmation_retains_services_access_and_assurance_facts(self):
        self.sign_in('admin')
        vendor = {'vendor_id': 'synthetic-provisional-vendor', 'client_id': 'a',
                  'name': 'Synthetic provider', 'service': 'Synthetic selected service', 'status': 'onboarding',
                  'criticality': 'high', 'criticality_provisional': True, 'data_types': [],
                  'data_relationship': [], 'assurance_required': False, 'assurance_records': [],
                  'source_services': {'area_ids': ['governance'], 'by': 'admin', 'at': '2026-01-01'},
                  'review_frequency': 'annual', 'updated_at': '2026-01-01'}
        await server.db.vendors.insert_one(vendor.copy())
        path = '/api/vendors/' + vendor['vendor_id']
        ordinary = await self.client.patch(path, json={'notes': 'An unrelated saved note'})
        self.assertEqual(ordinary.status_code, 200, ordinary.text)
        self.assertTrue(ordinary.json()['criticality_provisional'])
        denied = await self.client.patch(path, json={'criticality_provisional': False})
        self.assertEqual(denied.status_code, 422, denied.text)
        confirmed = await self.client.patch(path, json={'criticality': 'high', 'confirm_criticality': True})
        self.assertEqual(confirmed.status_code, 200, confirmed.text)
        saved = confirmed.json()
        self.assertFalse(saved['criticality_provisional'])
        self.assertEqual(saved['criticality_confirmed_by'], 'admin')
        self.assertTrue(saved['criticality_confirmed_at'])
        self.assertNotIn('confirm_criticality', saved)
        for field in ('vendor_id', 'client_id', 'criticality', 'source_services', 'data_relationship',
                      'data_types', 'assurance_required', 'assurance_records'):
            self.assertEqual(saved[field], vendor[field])
        self.assertEqual(await server.db.reviews.count_documents({'vendor_id': vendor['vendor_id']}), 0)
