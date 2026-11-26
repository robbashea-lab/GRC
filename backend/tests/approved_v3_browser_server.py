"""Disposable approved-workspace browser fixture. All records live in this process only."""
import os
import sys
import inspect
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

import uvicorn
from mongomock_motor import AsyncMongoMockClient
from mongomock.collection import BulkOperationBuilder


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
        # This sequential browser run reads/exports a workbook. Snapshot isolation
        # and transaction durability require a real replica set in their own suite.
        async def workbook_operation(service, operation):
            return await operation(None)
        stack.enter_context(patch.object(cmmc_workbook, 'transaction', workbook_operation))
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
