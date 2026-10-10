"""Opt-in real-Mongo SOC route/process boundary probes; loopback synthetic data only."""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import json
import multiprocessing
from pathlib import Path
import sys
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'backend/tests')]
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from fastapi import HTTPException
import soc_guided_lease


def worker(url, database, release, results, mode):
    async def execute():
        mongo = AsyncIOMotorClient(url, serverSelectionTimeoutMS=3000)
        db = mongo[database]
        row = {'framework_key': 'soc-2', 'framework_assessment_id': 'synthetic-process-criterion', 'client_id': 'synthetic-only'}
        async def operation(lease):
            results.put({'worker': mode, 'event': 'acquired'})
            if mode in ('holder', 'successor', 'clock-successor'):
                # Actual process/event-loop stall, not a driver/database substitute.
                if not release.wait(180):
                    raise RuntimeError('Run-owned barrier timed out')
            await lease.check()
            await db.probe_results.insert_one({'worker': mode, 'event': 'committed'})
        try:
            if mode == 'clock-successor':
                class AheadClock(datetime):
                    @classmethod
                    def now(cls, tz=None):
                        return super().now(tz) + timedelta(seconds=180)
                with patch.object(soc_guided_lease, 'datetime', AheadClock):
                    await soc_guided_lease.run(SimpleNamespace(db=db), row, operation)
            else:
                await soc_guided_lease.run(SimpleNamespace(db=db), row, operation)
            results.put({'worker': mode, 'event': 'finished'})
        except HTTPException as error:
            results.put({'worker': mode, 'event': 'rejected', 'status': error.status_code})
        except Exception as error:
            results.put({'worker': mode, 'event': 'error', 'type': type(error).__name__})
        finally:
            mongo.close()
    asyncio.run(execute())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongo-url', required=True)
    parser.add_argument('--routes', action='store_true')
    parser.add_argument('--processes', action='store_true')
    parser.add_argument('--expiry', action='store_true')
    parser.add_argument('--clock-skew', action='store_true')
    args = parser.parse_args()
    parsed = urlsplit(args.mongo_url)
    if parsed.scheme != 'mongodb' or parsed.hostname != '127.0.0.1' or not parsed.port or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        parser.error('Only explicit credential-free loopback origin is permitted')
    client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=3000)
    print(json.dumps({'mongo_version': client.server_info()['version'], 'url': args.mongo_url}), flush=True)
    client.close()
    if args.routes:
        import test_soc_guided_routes as existing
        import routes.onboarding as onboarding
        class RealSoc(existing.SocGuidedRoutes):
            async def asyncSetUp(self):
                await super().asyncSetUp()
                mongo = AsyncIOMotorClient(args.mongo_url, serverSelectionTimeoutMS=3000)
                self.addCleanup(mongo.close)
                name = 'test_grc_soc_probe_' + uuid.uuid4().hex
                self.assertNotIn(name, await mongo.list_database_names())
                db = mongo[name]
                self.addAsyncCleanup(mongo.drop_database, name)
                source = existing.server.db
                for kind in await source.list_collection_names():
                    rows = await source[kind].find({}).to_list(None)
                    if rows:
                        await db[kind].insert_many(rows)
                for module in (existing.server, onboarding):
                    override = patch.object(module, 'db', db)
                    override.start()
                    self.addCleanup(override.stop)
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(RealSoc))
        print(json.dumps({'real_mongo_soc_route_tests': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors)}), flush=True)
        if not result.wasSuccessful():
            return 1
    if args.processes:
        name = 'test_grc_soc_process_' + uuid.uuid4().hex
        client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=3000)
        assert name not in client.list_database_names()
        context = multiprocessing.get_context('spawn')
        results, release = context.Queue(), context.Event()
        owned = []
        try:
            first = context.Process(target=worker, args=(args.mongo_url, name, release, results, 'holder'))
            owned.append(first)
            first.start()
            event = results.get(timeout=15)
            assert event == {'worker': 'holder', 'event': 'acquired'}, event
            second = context.Process(target=worker, args=(args.mongo_url, name, release, results, 'contender'))
            owned.append(second)
            second.start()
            event = results.get(timeout=15)
            assert event == {'worker': 'contender', 'event': 'rejected', 'status': 409}, event
            second.join(15)
            release.set()
            event = results.get(timeout=15)
            assert event == {'worker': 'holder', 'event': 'finished'}, event
            first.join(15)
            assert client[name].probe_results.count_documents({}) == 1
            lock = client[name].soc_guided_locks.find_one({})
            assert lock['until'] == '' and 'token' not in lock
            print(json.dumps({'independent_process_contention': 'passed', 'writes': 1, 'lease_released': True}), flush=True)
        finally:
            release.set()
            for process in owned:
                if process.is_alive():
                    process.terminate()
                process.join(10)
            client.drop_database(name)
            client.close()
    for label, enabled, skew in (('actual_120_second_process_stall', args.expiry, False), ('isolated_worker_clock_180_seconds_ahead', args.clock_skew, True)):
        if not enabled:
            continue
        name = 'test_grc_soc_boundary_' + uuid.uuid4().hex
        client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=3000)
        assert name not in client.list_database_names()
        context = multiprocessing.get_context('spawn')
        results, first_release, second_release = context.Queue(), context.Event(), context.Event()
        owned = []
        mode = 'clock-successor' if skew else 'successor'
        try:
            first = context.Process(target=worker, args=(args.mongo_url, name, first_release, results, 'holder'))
            owned.append(first)
            first.start()
            assert results.get(timeout=15) == {'worker': 'holder', 'event': 'acquired'}
            if not skew:
                lock = client[name].soc_guided_locks.find_one({})
                remaining = max(0, (datetime.fromisoformat(lock['until']) - datetime.now(timezone.utc)).total_seconds())
                print(json.dumps({'case': label, 'actual_expiry_wait_seconds': remaining}), flush=True)
                time.sleep(remaining + 0.1)
            second = context.Process(target=worker, args=(args.mongo_url, name, second_release, results, mode))
            owned.append(second)
            second.start()
            assert results.get(timeout=15) == {'worker': mode, 'event': 'acquired'}
            successor = client[name].soc_guided_locks.find_one({})
            first_release.set()
            event = results.get(timeout=15)
            assert event['worker'] == 'holder' and event['event'] == 'rejected' and event['status'] in (409, 503), event
            first.join(15)
            held = client[name].soc_guided_locks.find_one({})
            assert held['token'] == successor['token'] and held['until'] == successor['until']
            assert client[name].probe_results.count_documents({}) == 0
            second_release.set()
            assert results.get(timeout=15) == {'worker': mode, 'event': 'finished'}
            second.join(15)
            assert client[name].probe_results.count_documents({'worker': mode}) == 1
            lock = client[name].soc_guided_locks.find_one({})
            assert lock['until'] == '' and 'token' not in lock
            print(json.dumps({'case': label, 'result': 'passed', 'old_holder_status': event['status'], 'successor_not_released_by_old_holder': True, 'stale_precheck_write': False}), flush=True)
        finally:
            first_release.set()
            second_release.set()
            for process in owned:
                if process.is_alive():
                    process.terminate()
                process.join(10)
            client.drop_database(name)
            client.close()
    return 0


if __name__ == '__main__':
    multiprocessing.freeze_support()
    raise SystemExit(main())
