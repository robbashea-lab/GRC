"""Identity routes with real authorization and isolated, nonpersistent storage."""
import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import unittest
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness

server = harness.server


class IdentityLifecycleTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        self.password = secrets.token_urlsafe(24)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {
            'email': 'member@example.com',
            'password_hash': server.hash_password(self.password),
        }})

    async def reset_token(self, user_id='member', days=1):
        token = secrets.token_urlsafe(32)
        await server.db.password_resets.insert_one({
            'user_id': user_id, 'token_hash': hashlib.sha256(token.encode()).hexdigest(),
            'expires_at': (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(),
            'used': False,
        })
        return token

    async def test_disabled_and_invited_cannot_use_jwt_session_or_password(self):
        token = server.create_access_token('member', 'member@example.test')
        await server.db.sessions.insert_one({
            'user_id': 'member', 'session_token': 'isolated-session',
            'expires_at': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        })
        for status in ('disabled', 'invited'):
            await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': status}})
            self.assertIsNone(await server._get_user_from_token(token))
            self.assertIsNone(await server._get_user_from_session('isolated-session'))
            result = await self.client.post('/api/auth/login', json={
                'email': 'member@example.com', 'password': self.password,
            })
            self.assertEqual(result.status_code, 403, result.text)

    async def test_disabled_reset_cannot_reactivate_or_change_password(self):
        token = await self.reset_token()
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'disabled'}})
        before = await server.db.users.find_one({'user_id': 'member'})
        result = await self.client.post('/api/auth/reset-password', json={
            'token': token, 'new_password': secrets.token_urlsafe(24),
        })
        self.assertEqual(result.status_code, 400)
        after = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual(before, after)
        with patch.object(server, 'send_email', new_callable=AsyncMock) as send:
            result = await self.client.post('/api/auth/forgot-password', json={'email': 'member@example.com'})
            self.assertEqual(result.status_code, 200)
            send.assert_not_awaited()

    async def test_invitation_acceptance_single_use_activates_without_login(self):
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'invited'}})
        token = await self.reset_token()
        password = secrets.token_urlsafe(24)
        results = await asyncio.gather(*[
            self.client.post('/api/auth/reset-password', json={'token': token, 'new_password': password})
            for _ in range(2)
        ])
        self.assertEqual(sorted(r.status_code for r in results), [200, 400])
        self.assertFalse(any(r.headers.get('set-cookie') for r in results))
        account = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual(account['status'], 'active')
        self.assertEqual(account['client_ids'], ['a'])
        self.assertEqual(account['role'], 'client_contributor')
        result = await self.client.post('/api/auth/login', json={'email': account['email'], 'password': password})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual((await self.client.get('/api/auth/me')).status_code, 200)

    async def test_expired_missing_account_and_replayed_links_fail(self):
        for token in (await self.reset_token(days=-1), await self.reset_token(user_id='missing'), 'invalid'):
            result = await self.client.post('/api/auth/reset-password', json={
                'token': token, 'new_password': secrets.token_urlsafe(24),
            })
            self.assertEqual(result.status_code, 400)

    async def test_disable_preserves_work_and_revokes_all_auth_material(self):
        token = await self.reset_token()
        old_jwt = server.create_access_token('member', 'member@example.test')
        await server.db.reviews.insert_one({'review_id': 'owned', 'client_id': 'a',
            'owner_id': 'member', 'completed_by': 'member', 'status': 'in_progress'})
        before = await server.db.reviews.find_one({'review_id': 'owned'})
        self.sign_in('admin')
        result = await self.client.patch('/api/users/member', json={'status': 'disabled'})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(before, await server.db.reviews.find_one({'review_id': 'owned'}))
        self.assertIsNone(await server._get_user_from_token(old_jwt))
        result = await self.client.post('/api/auth/reset-password', json={
            'token': token, 'new_password': secrets.token_urlsafe(24),
        })
        self.assertEqual(result.status_code, 400)
        candidates = (await self.client.get('/api/clients/a/assignees')).json()['items']
        self.assertNotIn('member', [row['user_id'] for row in candidates])

    async def test_legacy_active_session_compatibility(self):
        await server.db.users.update_one({'user_id': 'member'}, {'$unset': {'status': ''}})
        self.assertIsNotNone(await server._get_user_from_token(
            server.create_access_token('member', 'member@example.test')))

    async def identity_fixtures(self):
        await server.db.users.insert_many([
            {'user_id': 'scoped', 'role': 'platform_admin', 'client_ids': ['a'], 'status': 'active'},
            {'user_id': 'foreign', 'role': 'client_contributor', 'client_ids': ['b'], 'status': 'active', 'email': 'foreign@example.com'},
            {'user_id': 'shared', 'role': 'client_contributor', 'client_ids': ['a', 'b'], 'status': 'active'},
        ])
        await server.db.contacts.insert_one({'contact_id': 'maya', 'client_id': 'a',
            'name': 'Maya', 'email': 'maya@example.com', 'status': 'active'})

    async def test_explicit_link_does_not_grant_access_and_unlink_preserves_account(self):
        await self.identity_fixtures()
        self.sign_in('scoped')
        before = await server.db.users.find_one({'user_id': 'member'})
        for uid, status in [('foreign', 422), ('missing', 422), ('member', 200)]:
            result = await self.client.post('/api/contacts/maya/account-link', json={'user_id': uid, 'confirmed': True})
            self.assertEqual(result.status_code, status, result.text)
        self.assertEqual(before, await server.db.users.find_one({'user_id': 'member'}))
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'client_ids': []}})
        context = (await self.client.get('/api/clients/a/contact-accounts')).json()
        self.assertFalse(context[0]['has_client_access'])
        self.assertNotIn('client_ids', context[0])
        self.assertNotIn('password_hash', context[0])
        self.assertEqual((await server.db.contacts.find_one({'contact_id': 'maya'}))['linked_user_id'], 'member')
        result = await self.client.post('/api/contacts/maya/account-link', json={'user_id': None, 'confirmed': True})
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(result.json()['linked_user_id'])
        self.assertIsNotNone(await server.db.users.find_one({'user_id': 'member'}))
        self.assertEqual(await server.db.audit_logs.count_documents({'action': 'link-account'}), 1)

    async def test_unauthorized_and_generic_link_writes_rejected(self):
        await self.identity_fixtures()
        self.sign_in('member')
        for path, body in [('/api/contacts/maya/account-link', {'user_id': 'member', 'confirmed': True}),
                           ('/api/contacts/maya/invite', {'role': 'client_readonly', 'client_id': 'a', 'confirmed': True})]:
            self.assertEqual((await self.client.post(path, json=body)).status_code, 403)
        result = await self.client.patch('/api/contacts/maya', json={'linked_user_id': 'member'})
        self.assertEqual(result.status_code, 422, result.text)
        self.assertEqual((await self.client.patch('/api/users/foreign', json={'client_ids': ['a', 'b']})).status_code, 403)
        self.sign_in('foreign')
        self.assertEqual((await self.client.get('/api/contacts/maya/account-candidates')).status_code, 403)
        self.assertEqual((await self.client.get('/api/clients/a/contact-accounts')).status_code, 403)

    async def test_scoped_admin_cannot_escalate_or_change_other_clients(self):
        await self.identity_fixtures()
        self.sign_in('scoped')
        for uid, patch_body in [('member', {'client_ids': ['a', 'b']}),
                                ('shared', {'client_ids': ['a']}),
                                ('shared', {'status': 'disabled'}),
                                ('admin', {'role': 'client_readonly'}),
                                ('member', {'role': 'platform_admin', 'client_ids': []})]:
            result = await self.client.patch('/api/users/'+uid, json=patch_body)
            self.assertEqual(result.status_code, 403, result.text)
        result = await self.client.post('/api/users', json={'name': 'Invalid global', 'email': 'new@example.com', 'role': 'platform_admin'})
        self.assertEqual(result.status_code, 403)
        rows = (await self.client.get('/api/users')).json()
        self.assertNotIn('foreign', [r['user_id'] for r in rows])
        self.assertTrue(all('b' not in r.get('client_ids', []) for r in rows))

    async def test_explicit_membership_preserves_other_client_and_link_history(self):
        await self.identity_fixtures()
        await server.db.contacts.update_one({'contact_id': 'maya'}, {'$set': {'linked_user_id': 'shared'}})
        await server.db.tasks.insert_one({'task_id': 'owned', 'client_id': 'a', 'assignee_id': 'shared', 'status': 'open', 'completed_by': 'shared'})
        self.sign_in('scoped')
        result = await self.client.patch('/api/users/shared', json={'client_ids': ['b']})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual((await server.db.users.find_one({'user_id': 'shared'}))['client_ids'], ['b'])
        self.assertEqual((await server.db.contacts.find_one({'contact_id': 'maya'}))['linked_user_id'], 'shared')
        self.assertEqual((await server.db.tasks.find_one({'task_id': 'owned'}))['assignee_id'], 'shared')
        self.sign_in('shared')
        self.assertEqual((await self.client.get('/api/tasks?client_id=a')).status_code, 403)
        self.assertEqual((await self.client.get('/api/tasks?client_id=b')).status_code, 200)

    async def test_invitation_explicit_pending_no_token_exposure_or_automatic_matching(self):
        await self.identity_fixtures()
        self.sign_in('scoped')
        with patch.object(server, 'send_email', new_callable=AsyncMock, return_value=None) as send, \
             patch.dict(server.os.environ, {'APP_BASE_URL': 'https://staging.example.com'}):
            result = await self.client.post('/api/contacts/maya/invite', json={
                'role': 'client_readonly', 'client_id': 'a', 'confirmed': True})
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['delivery'], 'unavailable')
            self.assertEqual(result.json()['user']['status'], 'invited')
            self.assertNotIn('invite_link', result.json())
            send.assert_awaited_once()
            uid = result.json()['user']['user_id']
            self.assertEqual((await self.client.patch('/api/users/'+uid, json={'status': 'active'})).status_code, 409)
            result = await self.client.post('/api/users/'+uid+'/resend-invite')
            self.assertEqual(result.status_code, 200)
            self.assertEqual(send.await_count, 2)
        await server.db.contacts.insert_one({'contact_id': 'duplicate', 'client_id': 'a', 'email': 'MAYA@example.com'})
        result = await self.client.post('/api/contacts/duplicate/invite', json={
            'role': 'client_readonly', 'client_id': 'a', 'confirmed': True})
        self.assertEqual(result.status_code, 409)
        self.assertFalse((await server.db.contacts.find_one({'contact_id': 'duplicate'})).get('linked_user_id'))

    async def test_active_assignment_report_scoped_current_and_deduplicated(self):
        await self.identity_fixtures()
        await server.db.reviews.insert_many([
            {'review_id': 'active-a', 'client_id': 'a', 'owner_id': 'shared', 'reviewer_id': 'shared', 'status': 'in_progress'},
            {'review_id': 'past-a', 'client_id': 'a', 'owner_id': 'shared', 'status': 'completed'},
            {'review_id': 'active-b', 'client_id': 'b', 'owner_id': 'shared', 'status': 'in_progress'},
        ])
        self.sign_in('scoped')
        result = await self.client.get('/api/users/shared/open_assignments')
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['total'], 1)
        self.assertEqual([i['id'] for i in result.json()['items']], ['active-a'])
        self.assertEqual((await self.client.get('/api/users/shared/open_assignments?client_id=b')).status_code, 403)

    async def test_visible_membership_endpoint_preserves_hidden_memberships(self):
        await self.identity_fixtures()
        self.sign_in('scoped')
        result = await self.client.patch('/api/users/shared/client-memberships', json={'client_ids': []})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()['client_ids'], [])
        self.assertEqual((await server.db.users.find_one({'user_id': 'shared'}))['client_ids'], ['b'])
        self.assertEqual((await self.client.patch('/api/users/member/client-memberships', json={'client_ids': ['b']})).status_code, 403)
        self.sign_in('admin')
        result = await self.client.patch('/api/users/foreign/client-memberships', json={'client_ids': ['a', 'b']})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['client_ids'], ['a', 'b'])

    async def test_disabled_google_identity_cannot_create_session(self):
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'disabled'}})
        provider = AsyncMock()
        provider.get.return_value = harness.httpx.Response(200, json={'email': 'member@example.com', 'session_token': secrets.token_urlsafe(24)})
        with patch.object(server.httpx, 'AsyncClient') as client:
            client.return_value.__aenter__.return_value = provider
            result = await self.client.post('/api/auth/google/session', json={'session_id': 'isolated-provider-fixture'})
        self.assertEqual(result.status_code, 403, result.text)
        self.assertEqual(await server.db.sessions.count_documents({}), 0)


if __name__ == '__main__':
    unittest.main()
