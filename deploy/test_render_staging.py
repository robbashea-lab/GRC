"""Staging hosting and portfolio entry checks against isolated account records."""
from datetime import datetime, timedelta, timezone
import importlib.util
import os
from pathlib import Path
import secrets
import hashlib
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from mongomock import MongoClient
from mongomock_motor import AsyncMongoMockClient
from starlette.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
BRIDGE_TAG = b'<script src="/staging-workspace.js"></script>'


class HostingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Exercise the real session lookup and role checks using in-memory records.
        with patch.object(sys, 'path', [str(ROOT / 'backend'), *sys.path]), \
             patch('dotenv.load_dotenv', return_value=False), \
             patch('motor.motor_asyncio.AsyncIOMotorClient', AsyncMongoMockClient), \
             patch.dict(os.environ, {'APP_ENV': 'test', 'MONGO_URL': 'mongodb://unused',
                                     'DB_NAME': 'staging_hosting'}, clear=True):
            import server
        cls.auth_server = server

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / 'index.html').write_text('<h1>Normal application fixture</h1>')
        (root / 'static').mkdir()
        (root / 'static' / 'app.js').write_text('fixture')
        api = FastAPI()
        api.add_middleware(self.auth_server.security_runtime.SecurityBoundary)
        api.add_api_route('/api/auth/logout', self.auth_server.logout, methods=['POST'])
        mongo = MongoClient()
        self.records = mongo.staging_hosting
        self.enterContext(patch.object(self.auth_server, 'db',
            AsyncMongoMockClient(mock_mongo_client=mongo).staging_hosting))
        self.enterContext(patch.dict(os.environ, {'APP_ENV': 'staging',
                                                  'APP_BASE_URL': 'https://testserver'}))

        @api.get('/api/private')
        def private():
            raise HTTPException(401, 'Sign in required')

        spec = importlib.util.spec_from_file_location('render_staging_fixture',
            Path(__file__).with_name('render_staging.py'))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'server': SimpleNamespace(
                app=api, get_current_user=self.auth_server.get_current_user)}), \
             patch.dict(os.environ, {
                 'APP_ENV': 'staging',
                 'RUN_LEGACY_MIGRATIONS': 'false',
                 'DEMO_MODE': 'false',
                 'REACT_APP_PREVIEW': 'false',
                 'FRONTEND_BUILD_DIR': self.directory.name,
             }, clear=True):
            spec.loader.exec_module(module)
        self.client = TestClient(module.app, base_url='https://testserver')
        self.addCleanup(self.client.close)

    def sign_in(self, role, **account_fields):
        account_id = 'hosting-test-account'
        self.records.users.insert_one({'user_id': account_id, 'role': role,
            'status': 'active', **account_fields})
        session = secrets.token_urlsafe(32)
        self.records.sessions.insert_one({'session_token': session, 'user_id': account_id,
            'environment': 'staging', 'expires_at': datetime.now(timezone.utc) + timedelta(hours=1)})
        self.client.cookies.set('session_token', session)

    def test_approved_workspace_requires_a_current_session(self):
        for token in (None, secrets.token_urlsafe(32)):
            if token:
                self.client.cookies.set('session_token', token)
            for method in (self.client.get, self.client.head):
                with self.subTest(cookie=bool(token), method=method.__name__):
                    response = method('/clients', follow_redirects=False)
                    self.assertEqual(response.status_code, 303)
                    self.assertEqual(response.headers['location'], '/login')
                    self.assertEqual(response.content, b'')

    def test_signed_in_workspace_serves_exact_approved_file_and_head(self):
        self.sign_in('super_admin')
        approved = ROOT / 'frontend' / 'public' / 'visual-preview.html'
        shutil.copyfile(approved, Path(self.directory.name) / approved.name)
        source = approved.read_bytes()
        from approved_v3_page import native_document, PAGE_HOOK
        source = source.replace(b'\r\n',b'\n')
        expected = native_document(source)
        for method in (self.client.get, self.client.head):
            with self.subTest(method=method.__name__):
                response = method('/clients', follow_redirects=False)
                self.assertEqual(response.status_code, 200)
                if method == self.client.get:
                    self.assertEqual(response.content.count(BRIDGE_TAG), 1)
                    native_tag = b'<script src="/approved-v3-native.js"></script>'
                    self.assertIn(BRIDGE_TAG + native_tag + b'</body>', response.content)
                    without_hook = response.content.replace(PAGE_HOOK.encode()+b'\n',b'',1)
                    without_hook = without_hook.replace(BRIDGE_TAG+native_tag,b'',1)
                    without_hook = without_hook.replace(b'connectedRestore=function(){};connectedPersist=function(){return true;};window.GoverNaraPrototypePersist=connectedPersist;\n',b'',1)
                    without_hook = without_hook.replace(b'<style id="native-workspace-loading">body{visibility:hidden}</style>',b'',1)
                    self.assertEqual(without_hook, source)
                    self.assertEqual(response.content,expected)
                else:
                    self.assertEqual(response.content, b'')
                self.assertEqual(response.headers['content-type'].split(';')[0], 'text/html')
                self.assertEqual(int(response.headers['content-length']), len(expected))
                self.assertIn('private', response.headers['cache-control'])
                self.assertIn('no-store', response.headers['cache-control'])
                self.assertEqual(response.headers['x-frame-options'], 'DENY')

    def test_native_hooks_reject_an_unapproved_or_modified_document(self):
        from approved_v3_page import native_document
        source = (ROOT/'frontend/public/visual-preview.html').read_bytes()
        with self.assertRaises(ValueError):
            native_document(source+b'<!-- unapproved replacement -->')

    def test_restricted_account_keeps_its_tenant_landing(self):
        self.sign_in('client_readonly')
        for method in (self.client.get, self.client.head):
            response = method('/clients', follow_redirects=False)
            self.assertEqual(response.status_code, 303)
            self.assertEqual(response.headers['location'], '/dashboard')

    def test_required_password_change_prevents_portfolio_access(self):
        self.sign_in('super_admin', password_change_required=True)
        self.assertEqual(self.client.get('/clients', follow_redirects=False).status_code, 403)

    def test_existing_choice_preserves_native_navigation_and_resets_at_login(self):
        for path in ('/existing', '/existing/clients'):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertIn('data-staging-entry="existing"', response.text)
                self.assertIn(BRIDGE_TAG, response.content)
                self.assertIn('secure', response.headers['set-cookie'].lower())
                self.assertIn('samesite=lax', response.headers['set-cookie'].lower())
                self.assertEqual(self.client.cookies.get('governara_staging_workspace'), 'existing')
        self.assertEqual(self.client.get('/clients', follow_redirects=False).status_code, 303)
        self.sign_in('platform_admin')
        response = self.client.get('/clients')
        self.assertEqual(response.content, b'<h1>Normal application fixture</h1>')
        self.assertIn('no-store', response.headers['cache-control'])
        response = self.client.get('/login', headers={'Accept': 'text/html'})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.client.cookies.get('governara_staging_workspace'))

    def test_same_origin_logout_revokes_the_existing_session(self):
        self.sign_in('super_admin')
        token = self.client.cookies['session_token']
        denied = self.client.post('/api/auth/logout', json={})
        self.assertEqual(denied.status_code, 403)
        self.assertIsNotNone(self.records.sessions.find_one({'session_token': token}))
        response = self.client.post('/api/auth/logout', json={}, headers={'Origin': 'https://testserver'})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(self.records.sessions.find_one({'session_token': token}))
        self.assertEqual(self.client.get('/clients', follow_redirects=False).status_code, 303)

    def test_ui_navigation_and_head(self):
        for path in ('/', '/reviews', '/clients/fictional/assessment'):
            response = self.client.get(path, headers={'Accept': 'text/html'})
            self.assertEqual(response.status_code, 200)
            self.assertIn('Normal application fixture', response.text)
        response = self.client.head('/clients/fictional', headers={'Accept': 'text/html'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b'')

    def test_api_failures_stay_api_failures(self):
        self.assertEqual(self.client.get('/api/private').status_code, 401)
        self.assertEqual(self.client.post('/api/private').status_code, 405)
        for path in ('/api', '/api/missing', '/api/missing/nested', '/api/..%2findex.html'):
            with self.subTest(path=path):
                response = self.client.get(path, headers={'Accept': 'text/html'})
                self.assertEqual(response.status_code, 404)
                self.assertNotIn('Normal application fixture', response.text)

    def test_assets_and_missing_files(self):
        self.assertEqual(self.client.get('/static/app.js').text, 'fixture')
        for path in ('/static/missing.js', '/missing.json', '/static/missing'):
            self.assertEqual(self.client.get(path,
                headers={'Accept': 'text/html'}).status_code, 404)
        self.assertEqual(self.client.get('/clients/fictional',
            headers={'Accept': 'application/json'}).status_code, 404)

    def test_frontend_does_not_accept_mutations(self):
        for path in ('/clients', '/clients/fictional'):
            for method in ('post', 'put', 'patch', 'delete'):
                self.assertEqual(getattr(self.client, method)(path,
                    headers={'Accept': 'text/html'}).status_code, 405)

    def test_files_outside_build_are_not_exposed(self):
        for path in ('/..%2fsecret.txt', '/%2e%2e%2findex.html'):
            self.assertEqual(self.client.get(path).status_code, 404)


class PoisonServer:
    @property
    def app(self):
        raise AssertionError('Application import must not occur')


class EnvironmentGuardTests(unittest.TestCase):
    def test_rejects_unsafe_environment_before_application_import(self):
        environment_error = 'APP_ENV must be staging for the staging entrypoint'
        switch_error = 'Unsafe switches must be disabled for the staging entrypoint'
        cases = [({}, environment_error)]
        cases.extend(({'APP_ENV': value}, environment_error) for value in (
            'development', 'test', 'production', 'invalid', '',
            'STAGING', ' staging', 'staging ',
        ))
        cases.extend(({'APP_ENV': 'staging', name: 'true'}, switch_error)
            for name in ('RUN_LEGACY_MIGRATIONS', 'DEMO_MODE', 'REACT_APP_PREVIEW'))
        for environment, message in cases:
            with self.subTest(environment=environment):
                spec = importlib.util.spec_from_file_location('render_staging_fixture',
                    Path(__file__).with_name('render_staging.py'))
                module = importlib.util.module_from_spec(spec)
                with patch.dict(sys.modules, {'server': PoisonServer()}), \
                     patch.dict(os.environ, environment, clear=True):
                    with self.assertRaises(ValueError) as error:
                        spec.loader.exec_module(module)
                self.assertEqual(str(error.exception), message)

    def test_switches_only_reject_exact_true(self):
        with tempfile.TemporaryDirectory() as directory:
            for value in (None, '', 'false', 'False', 'True', 'TRUE', ' true', 'true ', '1'):
                with self.subTest(value=value):
                    environment = {'APP_ENV': 'staging', 'FRONTEND_BUILD_DIR': directory}
                    if value is not None:
                        environment.update({name: value for name in (
                            'RUN_LEGACY_MIGRATIONS', 'DEMO_MODE', 'REACT_APP_PREVIEW')})
                    api = FastAPI()
                    spec = importlib.util.spec_from_file_location('render_staging_fixture',
                        Path(__file__).with_name('render_staging.py'))
                    module = importlib.util.module_from_spec(spec)
                    with patch.dict(sys.modules, {'server': SimpleNamespace(app=api, get_current_user=None)}), \
                         patch.dict(os.environ, environment, clear=True):
                        spec.loader.exec_module(module)
                    self.assertIs(module.app, api)


if __name__ == '__main__':
    unittest.main()
