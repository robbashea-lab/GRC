"""Recovery boundaries with real handlers, synthetic identities and no mail delivery."""
import asyncio
from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
import unittest
from unittest.mock import AsyncMock, patch

import test_client_dashboard_sources as harness

server = harness.server


class RecoveryRetirementTests(unittest.IsolatedAsyncioTestCase):
    sign_in = harness.ClientDashboardSourcesTests.sign_in

    async def asyncSetUp(self):
        await harness.ClientDashboardSourcesTests.asyncSetUp(self)
        self.password = secrets.token_urlsafe(24)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {
            'email': 'member@example.com', 'password_hash': server.hash_password(self.password)}})
        self.mail = AsyncMock(return_value='synthetic-receipt')
        self.mail_patch = patch.object(server, 'send_email', self.mail)
        self.mail_patch.start()
        self.addCleanup(self.mail_patch.stop)
        self.base_patch = patch.dict(server.os.environ, {'APP_BASE_URL': 'https://isolated.example.test'})
        self.base_patch.start()
        self.addCleanup(self.base_patch.stop)

    async def issue(self):
        result = await self.client.post('/api/auth/forgot-password', json={'email': 'member@example.com'})
        self.assertEqual(result.status_code, 200, result.text)
        match = re.search(r'reset-password\?token=([^"< ]+)', self.mail.await_args.kwargs['html'])
        self.assertIsNotNone(match)
        return match[1]

    async def redeem(self, token):
        return await self.client.post('/api/auth/reset-password', json={
            'token': token, 'new_password': secrets.token_urlsafe(24)})

    async def change_password(self):
        self.sign_in('member')
        replacement = secrets.token_urlsafe(24)
        result = await self.client.patch('/api/me/password', json={
            'current_password': self.password, 'new_password': replacement})
        self.assertEqual(result.status_code, 200, result.text)
        return replacement

    async def change_email(self):
        self.sign_in('admin')
        result = await self.client.patch('/api/users/member', json={'email': 'new@example.com'})
        self.assertEqual(result.status_code, 200, result.text)

    async def test_old_reset_cannot_replace_changed_password(self):
        token = await self.issue()
        replacement = await self.change_password()
        before = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)
        self.assertTrue(server.verify_password(replacement, before['password_hash']))

    async def test_old_address_reset_cannot_replace_current_credentials(self):
        token = await self.issue()
        await self.change_email()
        before = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)
        self.mail.reset_mock()
        result = await self.client.post('/api/auth/forgot-password', json={'email': 'new@example.com'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(self.mail.await_args.kwargs['to'], 'new@example.com')

    async def test_denied_states_issue_no_mail_and_redemption_changes_nothing(self):
        for state in ['missing', None, 'unknown', 'disabled', 'invited']:
            with self.subTest(state=state):
                await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'active'}})
                token = await self.issue()
                if state == 'missing':
                    await server.db.users.update_one({'user_id': 'member'}, {'$unset': {'status': ''}})
                else:
                    await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': state}})
                before = await server.db.users.find_one({'user_id': 'member'})
                rows = await server.db.password_resets.count_documents({})
                self.mail.reset_mock()
                result = await self.client.post('/api/auth/forgot-password', json={'email': 'member@example.com'})
                self.assertEqual(result.status_code, 200)
                self.mail.assert_not_awaited()
                self.assertEqual(await server.db.password_resets.count_documents({}), rows)
                self.assertEqual((await self.redeem(token)).status_code, 400)
                self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_fresh_reset_single_use_and_supersession_preserve_grants(self):
        old = await self.issue()
        current = await self.issue()
        self.assertEqual((await self.redeem(old)).status_code, 400)
        before = await server.db.users.find_one({'user_id': 'member'})
        await server.db.sessions.insert_one({'session_token': 'synthetic-session', 'user_id': 'member'})
        result = await self.redeem(current)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertNotIn('set-cookie', result.headers)
        after = await server.db.users.find_one({'user_id': 'member'})
        for field in ['status', 'role', 'client_ids', 'email']:
            self.assertEqual(after[field], before[field])
        self.assertEqual(await server.db.sessions.count_documents({'user_id': 'member'}), 0)
        self.assertEqual((await self.redeem(current)).status_code, 400)

    async def test_invitation_is_distinct_and_legacy_material_is_not_grandfathered(self):
        account = await server.db.users.find_one({'user_id': 'member'})
        raw = secrets.token_urlsafe(32)
        await server.db.password_resets.insert_one({'user_id': 'member',
            'token_hash': hashlib.sha256(raw.encode()).hexdigest(), 'used': False,
            'expires_at': (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()})
        self.assertEqual((await self.redeem(raw)).status_code, 400)
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'invited'}})
        account = await server.db.users.find_one({'user_id': 'member'})
        await server._issue_invitation(account, {'name': 'Synthetic administrator'})
        token = re.search(r'reset-password\?token=([^"< ]+)', self.mail.await_args.kwargs['html'])[1]
        result = await self.redeem(token)
        self.assertEqual(result.status_code, 200, result.text)
        after = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual(after['status'], 'active')
        self.assertEqual(after['role'], account['role'])
        self.assertEqual(after['client_ids'], account['client_ids'])
        self.assertNotIn('set-cookie', result.headers)
        self.assertEqual((await self.redeem(token)).status_code, 400)

    async def test_invitation_cannot_activate_an_active_account(self):
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'invited'}})
        account = await server.db.users.find_one({'user_id': 'member'})
        await server._issue_invitation(account, {'name': 'Synthetic administrator'})
        token = re.search(r'reset-password\?token=([^"< ]+)', self.mail.await_args.kwargs['html'])[1]
        await server.db.users.update_one({'user_id': 'member'}, {'$set': {'status': 'active'}})
        before = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_late_issuance_insert_cannot_cross_password_change(self):
        reached, resume = asyncio.Event(), asyncio.Event()
        collection = server.db.password_resets
        insert = type(collection).insert_one
        async def delayed_insert(instance, doc, *args, **kwargs):
            if instance.name == 'password_resets':
                reached.set()
                await resume.wait()
            return await insert(instance, doc, *args, **kwargs)
        with patch.object(type(collection), 'insert_one', delayed_insert):
            pending = asyncio.create_task(self.issue())
            await asyncio.wait_for(reached.wait(), 5)
            await self.change_password()
            resume.set()
            token = await pending
        before = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_claimed_redemption_cannot_cross_email_change(self):
        token = await self.issue()
        reached, resume = asyncio.Event(), asyncio.Event()
        collection = server.db.password_resets
        update = type(collection).update_one
        async def delayed_claim(instance, *args, **kwargs):
            result = await update(instance, *args, **kwargs)
            if instance.name == 'password_resets':
                reached.set()
                await resume.wait()
            return result
        with patch.object(type(collection), 'update_one', delayed_claim):
            pending = asyncio.create_task(self.redeem(token))
            await asyncio.wait_for(reached.wait(), 15)
            await self.change_email()
            before = await server.db.users.find_one({'user_id': 'member'})
            resume.set()
            self.assertEqual((await pending).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_stale_issuance_snapshot_is_rejected_without_timestamp_or_grant_changes(self):
        before = await server.db.users.find_one({'user_id': 'member'})
        self.sign_in('member')
        jwt = self.client.headers['Authorization'].removeprefix('Bearer ')
        await self.issue()
        after_issue = await server.db.users.find_one({'user_id': 'member'})
        for field in ['password_changed_at', 'sessions_revoked_at', 'status', 'role', 'client_ids']:
            self.assertEqual(after_issue.get(field), before.get(field))
        self.assertIsNotNone(await server._get_user_from_token(jwt))
        await self.change_email()
        after_change = await server.db.users.find_one({'user_id': 'member'})
        self.mail.reset_mock()
        self.assertIsNone(await server._issue_recovery_credential(before, 'password_reset', timedelta(hours=2)))
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), after_change)
        self.mail.assert_not_awaited()

    async def test_overlapping_issuance_has_one_current_credential_and_single_redemption(self):
        await asyncio.gather(self.issue(), self.issue())
        tokens = [re.search(r'reset-password\?token=([^"< ]+)', call.kwargs['html'])[1]
                  for call in self.mail.await_args_list]
        self.assertGreaterEqual(len(tokens), 1)
        account = await server.db.users.find_one({'user_id': 'member'})
        rows = await server.db.password_resets.find({'user_id': 'member', 'used': False}).to_list(None)
        current = [row for row in rows if row.get('credential_generation') == account.get('recovery_generation')]
        self.assertEqual(len(current), 1)
        valid = next(token for token in tokens if hashlib.sha256(token.encode()).hexdigest() == current[0]['token_hash'])
        for token in tokens:
            if token != valid:
                self.assertEqual((await self.redeem(token)).status_code, 400)
        results = await asyncio.gather(self.redeem(valid), self.redeem(valid))
        self.assertEqual(sorted(result.status_code for result in results), [200, 400])

    async def test_claimed_redemption_cannot_cross_disable(self):
        token = await self.issue()
        reached, resume = asyncio.Event(), asyncio.Event()
        cls = type(server.db.password_resets)
        update = cls.update_one
        async def delay(instance, *args, **kwargs):
            result = await update(instance, *args, **kwargs)
            if instance.name == 'password_resets':
                reached.set()
                await resume.wait()
            return result
        with patch.object(cls, 'update_one', delay):
            pending = asyncio.create_task(self.redeem(token))
            await asyncio.wait_for(reached.wait(), 15)
            self.sign_in('admin')
            disabled = await self.client.patch('/api/users/member', json={'status': 'disabled'})
            self.assertEqual(disabled.status_code, 200, disabled.text)
            before = await server.db.users.find_one({'user_id': 'member'})
            resume.set()
            self.assertEqual((await pending).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_cleanup_failure_cannot_keep_an_old_link_current(self):
        token = await self.issue()
        self.client._transport.raise_app_exceptions = False
        with patch.object(server, '_retire_recovery_generation', AsyncMock(side_effect=RuntimeError('synthetic cleanup failure'))):
            self.sign_in('member')
            result = await self.client.patch('/api/me/password', json={
                'current_password': self.password, 'new_password': secrets.token_urlsafe(24)})
            self.assertEqual(result.status_code, 500)
        before = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_lost_password_write_acknowledgment_still_retires_old_material(self):
        token = await self.issue()
        self.client._transport.raise_app_exceptions = False
        cls = type(server.db.users)
        update = cls.update_one
        async def lose_ack(instance, query, change, *args, **kwargs):
            result = await update(instance, query, change, *args, **kwargs)
            if instance.name == 'users' and 'password_hash' in change.get('$set', {}):
                raise RuntimeError('synthetic lost acknowledgment')
            return result
        with patch.object(cls, 'update_one', lose_ack):
            self.sign_in('member')
            result = await self.client.patch('/api/me/password', json={
                'current_password': self.password, 'new_password': secrets.token_urlsafe(24)})
            self.assertEqual(result.status_code, 500)
        before = await server.db.users.find_one({'user_id': 'member'})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)

    async def test_failed_mail_has_no_secret_response_and_fresh_recovery_works(self):
        self.client._transport.raise_app_exceptions = False
        self.mail.side_effect = RuntimeError('synthetic delivery failure')
        result = await self.client.post('/api/auth/forgot-password', json={'email': 'member@example.com'})
        self.assertEqual(result.status_code, 500)
        self.assertNotIn('token=', result.text)
        self.mail.side_effect = None
        token = await self.issue()
        self.assertEqual((await self.redeem(token)).status_code, 200)

    async def test_expiry_boundary_is_rejected_without_account_changes(self):
        token = await self.issue()
        before = await server.db.users.find_one({'user_id': 'member'})
        await server.db.password_resets.update_one({'token_hash': hashlib.sha256(token.encode()).hexdigest()},
            {'$set': {'expires_at': datetime.now(timezone.utc).isoformat()}})
        self.assertEqual((await self.redeem(token)).status_code, 400)
        self.assertEqual(await server.db.users.find_one({'user_id': 'member'}), before)


if __name__ == '__main__':
    unittest.main()
