"""Disposable approved-workspace browser fixture. All records live in this process only."""
import os
import sys
import inspect
from contextlib import ExitStack, nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import uvicorn
from mongomock_motor import AsyncMongoMockClient
from mongomock.collection import BulkOperationBuilder


class SerialReportCollection:
    """Keep the real report queries while dropping mock-only session metadata."""

    def __init__(self, collection):
        self.collection = collection

    def find(self, *args, session, **kwargs):
        return self.collection.find(*args, **kwargs)

    async def find_one(self, *args, session, **kwargs):
        return await self.collection.find_one(*args, **kwargs)

    async def distinct(self, *args, session, **kwargs):
        return await self.collection.distinct(*args, **kwargs)


class SerialReportDatabase:
    def __init__(self, database):
        self.database = database
        self.client = SimpleNamespace(start_session=self.start_session)

    async def start_session(self):
        return nullcontext(SimpleNamespace(operation_time=None, start_transaction=lambda **_: nullcontext()))

    def __getattr__(self, name):
        return SerialReportCollection(self.database[name])


def main():
    root = Path(__file__).resolve().parents[2]
    build = Path(sys.argv[1]).resolve(strict=True)
    if not all((build / name).is_file() for name in ('index.html', 'visual-preview.html', 'approved-v3-native.js')):
        raise ValueError('Supply the built authenticated frontend with its approved native bundle.')
    credentials = os.environ['GOVERNARA_QA_PASSWORD']
    run_id = os.environ['GOVERNARA_QA_RUN_ID']
    allowed = {key: os.environ[key] for key in ('PATH', 'SYSTEMROOT', 'TEMP', 'TMP') if key in os.environ}
    local = 'http://127.0.0.1:18194'
    settings = {**allowed, 'APP_ENV': 'test', 'JWT_SECRET': os.environ['GOVERNARA_QA_JWT'],
                'MONGO_URL': 'mongodb://unused', 'DB_NAME': 'approved_v3_browser_disposable',
                'APP_BASE_URL': local, 'CORS_ORIGINS': local, 'FRONTEND_BUILD_DIR': str(build),
                'RUN_LEGACY_MIGRATIONS': 'false'}
    sys.path[:0] = [str(root / 'backend'), str(root / 'deploy')]
    with patch.dict(os.environ, settings, clear=True), patch('dotenv.load_dotenv', return_value=False), \
            patch('motor.motor_asyncio.AsyncIOMotorClient', AsyncMongoMockClient), ExitStack() as stack:
        original = BulkOperationBuilder.add_update
        if 'sort' not in inspect.signature(original).parameters:
            # PyMongo supplies sort=None by default. The offline Mongo substitute predates that keyword.
            def unsorted_update(builder, *args, sort=None, **kwargs):
                if sort is not None:
                    raise AssertionError('Sorted bulk updates require a real Mongo database')
                return original(builder, *args, **kwargs)
            stack.enter_context(patch.object(BulkOperationBuilder, 'add_update', unsorted_update))
        import server
        import cmmc_workbook
        import framework_reports
        import r4_reports
        # The disposable browser verifies serial reads and real output writers.
        # Snapshot isolation and transaction durability run in the real Mongo suite.
        async def workbook_operation(service, operation):
            return await operation(None)
        stack.enter_context(patch.object(cmmc_workbook, 'transaction', workbook_operation))
        read_snapshot = framework_reports.read_snapshot

        async def serial_snapshot(service, *args):
            return await read_snapshot(SimpleNamespace(db=SerialReportDatabase(service.db)), *args)

        stack.enter_context(patch.object(framework_reports, 'read_snapshot', serial_snapshot))
        stack.enter_context(patch.object(r4_reports, 'operational_snapshot', r4_reports.read_operational))
        @server.app.get('/qa-native-identity', include_in_schema=False)
        async def loopback_identity():
            return {'run_id': run_id}

        # Reuse the actual hosting routes; only this module's import guard needs the staging label.
        with patch.dict(os.environ, {'APP_ENV': 'staging'}):
            import render_staging

        @server.app.on_event('startup')
        async def seed_test_actor():
            await server.db.users.insert_one({'user_id': 'qa-owner', 'name': 'QA Owner',
                'email': 'owner@example.com', 'role': 'super_admin', 'client_ids': [], 'all_clients': True,
                'status': 'active', 'auth_provider': 'password', 'password_hash': server.hash_password(credentials)})
            await server.db.clients.insert_one({'client_id': 'qa-existing', 'name': 'Retained QA client', 'status': 'active'})

        uvicorn.run(render_staging.app, host='127.0.0.1', port=18194, log_level='warning', access_log=False)


if __name__ == '__main__':
    main()
