"""Whole-day R4 recurrence boundaries on the actual native request path."""
import unittest
import test_client_dashboard_sources as fixture

server = fixture.server


class R4CadenceInputTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = fixture.ClientDashboardSourcesTests.asyncSetUp
    sign_in = fixture.ClientDashboardSourcesTests.sign_in

    async def test_actual_raw_inputs_reject_coercion_and_keep_both_native_boundaries(self):
        self.sign_in('admin')
        examples = {
            'reviews': {'title': 'Synthetic recurrence boundary', 'review_type': 'custom',
                        'recurrence': 'custom', 'due_date': '2099-01-01'},
            'risks': {'title': 'Synthetic recurrence boundary', 'review_cadence': 'custom', 'next_review': '2099-01-01'},
            'vendors': {'name': 'Synthetic recurrence boundary', 'service': 'QA-only service',
                        'review_frequency': 'custom', 'next_review': '2099-01-01'},
        }
        for kind, fields in examples.items():
            before = await server.db[kind].count_documents({})
            for value in (True, False, '30', 1.5, 0, 3661):
                with self.subTest(kind=kind, rejected=value):
                    denied = await self.client.post('/api/' + kind, json={
                        **fields, 'client_id': 'a', 'custom_recurrence_days': value})
                    self.assertEqual(denied.status_code, 422, denied.text)
                    self.assertEqual(await server.db[kind].count_documents({}), before)
            for value in (1, 3660):
                with self.subTest(kind=kind, accepted=value):
                    saved = await self.client.post('/api/' + kind, json={
                        **fields, 'client_id': 'a', 'custom_recurrence_days': value})
                    self.assertEqual(saved.status_code, 200, saved.text)
                    self.assertEqual(saved.json()['custom_recurrence_days'], value)
