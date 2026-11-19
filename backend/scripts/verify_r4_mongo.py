"""Run every R4 native regression class with disposable, real loopback MongoDB.

No default/environment connection, hosted database, test filter or shortened gate.
Every storage test gets a new guarded database and removes only that database.
The existing complete recovery runner remains a separate required check.
"""
import argparse
import importlib
import inspect
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
    args = parser.parse_args()
    parsed = urlsplit(args.mongo_url)
    if (parsed.scheme != 'mongodb' or parsed.hostname != '127.0.0.1' or not parsed.port
            or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        parser.error('Use an explicit loopback MongoDB origin without credentials, database or query options')
    backend = Path(__file__).resolve().parents[1]
    sys.path[:0] = [str(backend), str(backend / 'tests')]
    from suite_registry import classified_suites
    classified = classified_suites(backend / 'tests')
    audited = sorted({path for paths in classified.values() for path in paths
                      if path.name.startswith('test_r4_') and path.suffix == '.py'})
    if not audited:
        raise ValueError('No classified R4 test modules; refusing an empty qualification')
    import test_client_dashboard_sources as harness
    import routes.onboarding as onboarding
    import routes.portfolio as portfolio
    from initialization import ensure_indexes
    from r4_preservation_checks import require_disposable

    class MongoStorage:
        async def asyncSetUp(self):
            await super().asyncSetUp()
            self.mongo = AsyncIOMotorClient(args.mongo_url, serverSelectionTimeoutMS=3000)
            self.addCleanup(lambda: self.mongo.close())
            await self.mongo.admin.command('ping')
            name = 'test_grc_quality_' + uuid.uuid4().hex
            self.assertNotIn(name, await self.mongo.list_database_names())
            database = self.mongo[name]
            require_disposable(database)
            async def remove_owned_database():
                require_disposable(self.mongo[name])
                await self.mongo.drop_database(name)
                self.assertNotIn(name, await self.mongo.list_database_names())
            self.addAsyncCleanup(remove_owned_database)
            # Copy only the test's own isolated bootstrap, never another QA or
            # genuine database. Preserve actual BSON identities during transfer.
            source = getattr(self, 'db', harness.server.db)
            for kind in await source.list_collection_names():
                documents = await source[kind].find({}).to_list(None)
                if documents:
                    await database[kind].insert_many(documents)
            await ensure_indexes(database)
            if hasattr(self, 'db'):
                self.db = database
            if hasattr(self, 's') and hasattr(self.s, 'db'):
                self.s.db = database
            for module in (harness.server, onboarding, portfolio):
                override = patch.object(module, 'db', database)
                override.start()
                self.addCleanup(override.stop)

    suite = unittest.TestSuite()
    inventory = []
    for path in audited:
        module_name = '.'.join(path.relative_to(backend / 'tests').with_suffix('').parts)
        module = importlib.import_module(module_name)
        if Path(module.__file__).resolve() != path.resolve():
            raise ValueError('R4 test import does not match its classified source: ' + module_name)
        module_cases = 0
        classes = []
        seen = set()
        for name, base in inspect.getmembers(module, inspect.isclass):
            # Shared harnesses are imported by many modules. Only the classes
            # declared in each audited module belong to this R4 inventory.
            if base.__module__ != module.__name__ or not issubclass(base, unittest.TestCase):
                continue
            if base in seen:
                continue
            seen.add(base)
            storage = issubclass(base, unittest.IsolatedAsyncioTestCase)
            concrete = type('Mongo' + name, (MongoStorage, base), {}) if storage else base
            cases = unittest.defaultTestLoader.loadTestsFromTestCase(concrete)
            count = cases.countTestCases()
            suite.addTests(cases)
            module_cases += count
            classes.append(f'{name}: {count} ({"Mongo storage" if storage else "pure rules/format"})')
        if not module_cases:
            raise ValueError('Classified R4 module has no module-local unittest cases: ' + path.name)
        inventory.append((path.name, module_cases, classes))
    print(f'R4 audited inventory: {len(inventory)} modules, {suite.countTestCases()} cases', flush=True)
    for name, count, classes in inventory:
        print(f'  {name}: {count}; ' + '; '.join(classes), flush=True)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == '__main__':
    raise SystemExit(main())
