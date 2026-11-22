"""Hosting boundary checks; the stub API is not application auth verification."""
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from starlette.testclient import TestClient


class HostingTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / 'index.html').write_text('<h1>Normal application fixture</h1>')
        (root / 'static').mkdir()
        (root / 'static' / 'app.js').write_text('fixture')
        api = FastAPI()

        @api.get('/api/private')
        def private():
            raise HTTPException(401, 'Sign in required')

        spec = importlib.util.spec_from_file_location('render_staging_fixture',
            Path(__file__).with_name('render_staging.py'))
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {'server': SimpleNamespace(app=api)}), \
             patch.dict(os.environ, {
                 'APP_ENV': 'staging',
                 'RUN_LEGACY_MIGRATIONS': 'false',
                 'DEMO_MODE': 'false',
                 'REACT_APP_PREVIEW': 'false',
                 'FRONTEND_BUILD_DIR': self.directory.name,
             }, clear=True):
            spec.loader.exec_module(module)
        self.client = TestClient(module.app)
        self.addCleanup(self.client.close)

    def test_ui_navigation_and_head(self):
        for path in ('/', '/clients/fictional/assessment'):
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
        for method in ('post', 'put', 'patch', 'delete'):
            self.assertEqual(getattr(self.client, method)('/clients/fictional',
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
                    with patch.dict(sys.modules, {'server': SimpleNamespace(app=api)}), \
                         patch.dict(os.environ, environment, clear=True):
                        spec.loader.exec_module(module)
                    self.assertIs(module.app, api)


if __name__ == '__main__':
    unittest.main()
