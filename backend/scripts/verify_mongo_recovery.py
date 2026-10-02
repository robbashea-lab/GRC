"""Run the existing command recovery checks against disposable loopback MongoDB.

No environment/default connection is used. Each check gets a fresh database;
only those generated database names are dropped, including on failed checks.
"""
import argparse
import logging
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import uuid

from motor.motor_asyncio import AsyncIOMotorClient


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongo-url', required=True, help='Explicit mongodb://127.0.0.1:PORT origin')
    parser.add_argument('--include-program-lifecycle', action='store_true', help='Also run the three-framework 36-month API matrix')
    args = parser.parse_args()
    parsed = urlsplit(args.mongo_url)
    if (parsed.scheme != 'mongodb' or parsed.hostname != '127.0.0.1' or not parsed.port
            or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        parser.error('Use an explicit loopback MongoDB origin without credentials, database or query options')
    backend = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(backend), str(backend / 'tests')]
    import test_client_dashboard_sources as harness
    from test_create_requests import CreateRequestTests
    from test_review_recovery import ReviewRecoveryTests
    from test_review_audit_recovery import ReviewAuditRecoveryTests
    from test_onboarding_recovery import OnboardingRecoveryTests
    from test_record_integrity import RecordIntegrityTests
    import routes.onboarding as onboarding
    from initialization import ensure_indexes

    class MongoStorage:
        async def asyncSetUp(self):
            await super().asyncSetUp()
            self.mongo = AsyncIOMotorClient(args.mongo_url, serverSelectionTimeoutMS=3000)
            self.addCleanup(lambda: self.mongo.close())
            await self.mongo.admin.command('ping')
            name = 'test_grc_quality_' + uuid.uuid4().hex
            self.assertNotIn(name, await self.mongo.list_database_names())
            real_db = self.mongo[name]
            async def remove_disposable_database():
                await self.mongo.drop_database(name)
            self.addAsyncCleanup(remove_disposable_database)
            # Copy only this test's isolated bootstrap identities, never user data.
            source = getattr(self, 'db', harness.server.db)
            for kind in await source.list_collection_names():
                rows = await source[kind].find({}).to_list(None)
                if rows:
                    await real_db[kind].insert_many(rows)
            await ensure_indexes(real_db)
            if hasattr(self, 'db'):
                self.db = real_db
            for module in (harness.server, onboarding):
                override = patch.object(module, 'db', real_db)
                override.start()
                self.addCleanup(override.stop)

    class ReconnectReceiptTests(MongoStorage, ReviewRecoveryTests):
        async def test_receipt_survives_a_new_database_connection(self):
            body = await self.prepare()
            first = await self.create(body)
            self.assertEqual(first.status_code, 200, first.text)
            database_name = harness.server.db.name
            self.mongo.close()
            fresh = AsyncIOMotorClient(args.mongo_url, serverSelectionTimeoutMS=3000)
            self.mongo = fresh
            with patch.object(harness.server, 'db', fresh[database_name]):
                replay = await self.create(body)
                self.assertEqual(replay.json(), first.json())
                self.assertEqual(await harness.server.db.tasks.count_documents({}), 1)

    suite = unittest.TestSuite()
    for base in (CreateRequestTests, ReviewRecoveryTests, ReviewAuditRecoveryTests, OnboardingRecoveryTests, RecordIntegrityTests):
        concrete = type('Mongo' + base.__name__, (MongoStorage, base), {})
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(concrete))
    suite.addTest(ReconnectReceiptTests('test_receipt_survives_a_new_database_connection'))
    if args.include_program_lifecycle:
        from test_framework_three_year import FrameworkThreeYearTests
        concrete = type('MongoFrameworkThreeYearTests', (MongoStorage, FrameworkThreeYearTests), {})
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(concrete))
    logging.getLogger('httpx').setLevel(logging.WARNING)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
