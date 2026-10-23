"""Exercise catalog decoration through the tenant-authorized native record routes."""
import unittest

import test_client_dashboard_sources as harness

server = harness.server


class RegisterCatalogIdentityTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = harness.ClientDashboardSourcesTests.asyncSetUp
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def create_catalog_record(self, kind, catalog_key, **extra):
        body = {'client_id': 'a', 'name': 'Synthetic catalog record', 'catalog_key': catalog_key,
                **({'service': 'Synthetic service'} if kind == 'vendors' else {}), **extra}
        response = await self.client.post('/api/' + kind, json=body)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_create_read_and_rename_keep_the_exact_catalog_identity(self):
        self.sign_in('admin')
        for kind, key, id_field in (
            ('vendors', 'iventure-solutions', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'ai_system_id'),
        ):
            with self.subTest(kind=kind):
                row = await self.create_catalog_record(kind, key)
                route = '/api/' + kind + '/' + row[id_field]
                self.assertEqual(row['catalog_key'], key)
                renamed = await self.client.patch(route, json={'name': 'Renamed synthetic record'})
                self.assertEqual(renamed.status_code, 200, renamed.text)
                # A fresh API read and the stored document retain identity without title matching.
                rows = await self.client.get('/api/' + kind, params={'client_id': 'a'})
                loaded = next(item for item in rows.json() if item[id_field] == row[id_field])
                self.assertEqual(loaded['catalog_key'], key)
                self.assertEqual(loaded['name'], 'Renamed synthetic record')
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                self.assertEqual(stored['catalog_key'], key)
                self.assertEqual(stored['status'], 'onboarding' if kind == 'vendors' else 'draft')
        self.assertEqual(await server.db.risks.count_documents({}), 0)
        self.assertEqual(await server.db.reviews.count_documents({}), 0)

    async def test_distinct_products_and_new_clients_use_exact_keys(self):
        self.sign_in('admin')
        for key in ('m365', 'cstudio', 'ghcopilot'):
            row = await self.create_catalog_record('ai_systems', key, client_id='b', provider='Microsoft')
            self.assertEqual(row['catalog_key'], key)
        rows = (await self.client.get('/api/ai_systems', params={'client_id': 'b'})).json()
        self.assertEqual({row['catalog_key'] for row in rows}, {'m365', 'cstudio', 'ghcopilot'})
        self.assertEqual(len({row['ai_system_id'] for row in rows}), 3)

    async def test_custom_and_legacy_names_never_infer_a_brand(self):
        self.sign_in('admin')
        for kind, name, id_field in (
            ('vendors', 'iVenture Solutions', 'vendor_id'),
            ('ai_systems', 'ChatGPT', 'ai_system_id'),
        ):
            row = await self.create_catalog_record(kind, None, name=name)
            self.assertIsNone(row['catalog_key'])
            # Model the historical absence of this optional field, then save another field.
            await server.db[kind].update_one({id_field: row[id_field]}, {'$unset': {'catalog_key': ''}})
            legacy = await server.db[kind].find_one({id_field: row[id_field]})
            blank = await self.client.patch('/api/' + kind + '/' + row[id_field], json={'catalog_key': ''})
            self.assertEqual(blank.status_code, 422, blank.text)
            self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), legacy)
            response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={'name': name + ' custom'})
            self.assertEqual(response.status_code, 200, response.text)
            stored = await server.db[kind].find_one({id_field: row[id_field]})
            self.assertIsNone(stored.get('catalog_key'))

    async def test_invalid_and_cross_module_keys_do_not_create_or_modify_records(self):
        self.sign_in('admin')
        invalid = ('', 'CHATGPT', 'chatgpt ', 'https://example.test/logo.svg', '<svg/>', {}, [], True, 12)
        for kind, key, foreign, id_field in (
            ('vendors', 'iventure-solutions', 'chatgpt', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'iventure-solutions', 'ai_system_id'),
        ):
            row = await self.create_catalog_record(kind, key)
            stored = await server.db[kind].find_one({id_field: row[id_field]})
            for bad in (*invalid, foreign):
                with self.subTest(kind=kind, catalog_key=bad):
                    create = await self.client.post('/api/' + kind, json={'client_id': 'a', 'name': 'Invalid key', 'catalog_key': bad,
                        **({'service': 'Synthetic service'} if kind == 'vendors' else {})})
                    self.assertEqual(create.status_code, 422, create.text)
                    update = await self.client.patch('/api/' + kind + '/' + row[id_field], json={'catalog_key': bad})
                    self.assertEqual(update.status_code, 422, update.text)
                    self.assertEqual(await server.db[kind].count_documents({}), 1)
                    self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)

    async def test_vendor_bulk_updates_validate_the_same_catalog_allowlist(self):
        self.sign_in('admin')
        row = await self.create_catalog_record('vendors', 'salesforce')
        stored = await server.db.vendors.find_one({'vendor_id': row['vendor_id']})
        response = await self.client.post('/api/bulk', json={
            'kind': 'vendors', 'ids': [row['vendor_id']], 'action': 'update', 'payload': {'catalog_key': 'chatgpt'},
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(await server.db.vendors.find_one({'vendor_id': row['vendor_id']}), stored)

    async def test_catalog_decoration_does_not_grant_tenant_or_write_access(self):
        self.sign_in('admin')
        vendor = await self.create_catalog_record('vendors', 'salesforce', client_id='b')
        ai = await self.create_catalog_record('ai_systems', 'chatgpt', client_id='b')
        self.sign_in('member')
        for kind, identity in (('vendors', vendor['vendor_id']), ('ai_systems', ai['ai_system_id'])):
            response = await self.client.patch('/api/' + kind + '/' + identity, json={'name': 'Denied rename'})
            self.assertEqual(response.status_code, 403, response.text)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        for kind, key in (('vendors', 'salesforce'), ('ai_systems', 'chatgpt')):
            response = await self.client.post('/api/' + kind, json={'client_id': 'a', 'name': 'Denied create', 'catalog_key': key,
                **({'service': 'Synthetic service'} if kind == 'vendors' else {})})
            self.assertEqual(response.status_code, 403, response.text)

    async def test_valid_catalog_key_patch_retains_tenant_and_readonly_boundaries(self):
        self.sign_in('admin')
        records = []
        for kind, initial_key, replacement_key, id_field in (
            ('vendors', 'salesforce', 'microsoft-365', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'claude', 'ai_system_id'),
        ):
            for client_id in ('a', 'b'):
                row = await self.create_catalog_record(kind, initial_key, client_id=client_id)
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                records.append((kind, replacement_key, id_field, row, stored))
        self.sign_in('member')
        for kind, key, id_field, row, stored in records:
            if row['client_id'] != 'b':
                continue
            with self.subTest(kind=kind, boundary='foreign tenant'):
                response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={
                    'catalog_key': key, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'role': 'client_readonly'}})
        for kind, key, id_field, row, stored in records:
            if row['client_id'] != 'a':
                continue
            with self.subTest(kind=kind, boundary='same tenant read only'):
                response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={
                    'catalog_key': key, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)

    async def test_invalid_catalog_key_cannot_partially_save_an_ordinary_field(self):
        self.sign_in('admin')
        for kind, key, invalid_key, id_field in (
            ('vendors', 'salesforce', 'chatgpt', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'salesforce', 'ai_system_id'),
        ):
            with self.subTest(kind=kind):
                row = await self.create_catalog_record(kind, key)
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                response = await self.client.patch('/api/' + kind + '/' + row[id_field], json={
                    'name': 'This ordinary edit must not be saved', 'catalog_key': invalid_key,
                    'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(response.status_code, 422, response.text)
                # Equality includes native timestamps, identity and governance fields, not only the key.
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)
                self.assertEqual(await server.db[kind].count_documents({}), 1)

    async def test_invalid_vendor_bulk_catalog_key_leaves_every_selected_record_unchanged(self):
        self.sign_in('admin')
        first = await self.create_catalog_record('vendors', 'salesforce', name='First synthetic vendor')
        second = await self.create_catalog_record('vendors', 'zoom', name='Second synthetic vendor')
        ids = [first['vendor_id'], second['vendor_id']]
        stored = {identity: await server.db.vendors.find_one({'vendor_id': identity}) for identity in ids}
        response = await self.client.post('/api/bulk', json={
            'kind': 'vendors', 'ids': ids, 'action': 'update',
            'expected_versions': {row['vendor_id']: row['updated_at'] for row in (first, second)},
            'payload': {'name': 'Rejected bulk rename', 'catalog_key': 'chatgpt'},
        })
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(await server.db.vendors.count_documents({}), 2)
        for identity in ids:
            self.assertEqual(await server.db.vendors.find_one({'vendor_id': identity}), stored[identity])

    async def test_nullable_catalog_clear_preserves_record_and_rejects_stale_restore(self):
        self.sign_in('admin')
        for kind, key, id_field in (
            ('vendors', 'salesforce', 'vendor_id'),
            ('ai_systems', 'chatgpt', 'ai_system_id'),
        ):
            with self.subTest(kind=kind):
                row = await self.create_catalog_record(kind, key)
                route = '/api/' + kind + '/' + row[id_field]
                cleared = await self.client.patch(route, json={
                    'catalog_key': None, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(cleared.status_code, 200, cleared.text)
                self.assertIsNone(cleared.json()['catalog_key'])
                stored = await server.db[kind].find_one({id_field: row[id_field]})
                for field in (id_field, 'client_id', 'name', 'status', 'created_at', 'created_by'):
                    self.assertEqual(stored[field], row[field])
                self.assertNotEqual(stored['updated_at'], row['updated_at'])
                # Retain the original editor token: the fixture must not refresh it before this retry.
                stale = await self.client.patch(route, json={
                    'catalog_key': key, 'expected_updated_at': row['updated_at'],
                })
                self.assertEqual(stale.status_code, 409, stale.text)
                self.assertEqual(await server.db[kind].find_one({id_field: row[id_field]}), stored)
