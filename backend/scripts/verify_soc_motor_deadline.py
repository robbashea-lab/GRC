"""Opt-in real-Motor SOC timeout/cancellation regression; loopback synthetic data only.

Uses the existing authorized ASGI fixture, not a hosted browser/session. The only
fault injection holds a real PyMongo executor thread before its native CAS send.
Normal 90-second save / 120-second lease bounds and real database are unchanged.
"""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import logging
import multiprocessing
from pathlib import Path
import sys
import time
from unittest.mock import patch
from urllib.parse import urlsplit
import uuid

BACKEND = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(BACKEND), str(BACKEND / 'tests')]
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import test_soc_guided_routes as existing
import routes.onboarding as onboarding


async def prepare(url, name):
    test = existing.SocGuidedRoutes('test_interview_cannot_interleave_immediately_before_native_cas')
    await test.asyncSetUp()
    mongo = AsyncIOMotorClient(url, serverSelectionTimeoutMS=3000)
    try:
        assert name not in await mongo.list_database_names()
        db = mongo[name]
        for kind in await existing.server.db.list_collection_names():
            rows = await existing.server.db[kind].find({}).to_list(None)
            if rows:
                await db[kind].insert_many(rows)
        with patch.object(existing.server, 'db', db), patch.object(onboarding, 'db', db):
            return await test.race_fixture()
    finally:
        await test.client.aclose()
        test.env.stop()
        test.database.stop()
        mongo.close()


def native_worker(url, name, path, payload, release, cancel, results):
    async def execute():
        test = existing.SocGuidedRoutes('test_interview_cannot_interleave_immediately_before_native_cas')
        await test.asyncSetUp()
        mongo = AsyncIOMotorClient(url, serverSelectionTimeoutMS=3000)
        db = mongo[name]
        logging.getLogger('httpx').setLevel(logging.ERROR)
        settled = asyncio.get_running_loop().create_future()
        loop = asyncio.get_running_loop()
        try:
            with patch.object(existing.server, 'db', db), patch.object(onboarding, 'db', db):
                test.sign_in('admin')
                collection = db.framework_assessments
                original = collection.delegate._update_retryable

                def delayed(*args, **kwargs):
                    results.put({'event': 'real_driver_write_pending'})
                    try:
                        if not release.wait(150):
                            raise RuntimeError('Run-owned driver barrier timed out')
                        value = original(*args, **kwargs)
                        results.put({'event': 'driver_settled', 'committed': True})
                        return value
                    except Exception as error:
                        results.put({'event': 'driver_settled', 'committed': False,
                                     'timeout': bool(getattr(error, 'timeout', False))})
                        raise
                    finally:
                        loop.call_soon_threadsafe(settled.set_result, None)

                with patch.object(db, 'framework_assessments', collection), patch.object(collection.delegate, '_update_retryable', side_effect=delayed):
                    request = asyncio.create_task(test.client.patch(path, json=payload))
                    if cancel is not None:
                        assert await asyncio.to_thread(cancel.wait, 20)
                        request.cancel()
                    try:
                        response = await request
                        results.put({'event': 'native_response', 'status': response.status_code})
                    except asyncio.CancelledError:
                        results.put({'event': 'native_response', 'cancelled': True})
                    await asyncio.wait_for(settled, 150)
        except Exception as error:
            results.put({'event': 'worker_error', 'type': type(error).__name__})
        finally:
            await test.client.aclose()
            test.env.stop()
            test.database.stop()
            mongo.close()
    asyncio.run(execute())


def interview_worker(url, name, path, payload, results):
    async def execute():
        test = existing.SocGuidedRoutes('test_interview_cannot_interleave_immediately_before_native_cas')
        await test.asyncSetUp()
        mongo = AsyncIOMotorClient(url, serverSelectionTimeoutMS=3000)
        try:
            with patch.object(existing.server, 'db', mongo[name]), patch.object(onboarding, 'db', mongo[name]):
                test.sign_in('admin')
                response = await test.client.put(path + '/guided-assessment', json=payload)
                results.put({'event': 'interview_response', 'status': response.status_code})
        finally:
            await test.client.aclose()
            test.env.stop()
            test.database.stop()
            mongo.close()
    asyncio.run(execute())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongo-url', required=True)
    parser.add_argument('--mode', choices=('timeout', 'cancel'), required=True)
    args = parser.parse_args()
    parsed = urlsplit(args.mongo_url)
    if (parsed.scheme != 'mongodb' or parsed.hostname != '127.0.0.1' or not parsed.port
            or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment):
        parser.error('Only an explicit credential-free loopback Mongo origin is permitted')
    name = 'test_grc_soc_motor_' + uuid.uuid4().hex
    client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=3000)
    assert name not in client.list_database_names()
    context = multiprocessing.get_context('spawn')
    results, release = context.Queue(), context.Event()
    cancel = context.Event() if args.mode == 'cancel' else None
    owned = []

    def event(expected, wait=20):
        value = results.get(timeout=wait)
        print(json.dumps(value), flush=True)
        assert all(value.get(key) == item for key, item in expected.items()), value
        return value

    def interview(path, payload, status):
        process = context.Process(target=interview_worker, args=(args.mongo_url, name, path, payload, results))
        owned.append(process)
        process.start()
        event({'event': 'interview_response', 'status': status})
        process.join(15)
        assert process.exitcode == 0

    try:
        print(json.dumps({'mode': args.mode, 'mongo_version': client.server_info()['version']}), flush=True)
        row, path, write, negative = asyncio.run(prepare(args.mongo_url, name))
        process = context.Process(target=native_worker, args=(args.mongo_url, name, path, write, release, cancel, results))
        owned.append(process)
        process.start()
        event({'event': 'real_driver_write_pending'})
        if cancel is not None:
            cancel.set()
            event({'event': 'native_response', 'cancelled': True})
        else:
            event({'event': 'native_response', 'status': 503}, 100)
        # Do not admit a successor while the cancelled executor may still send.
        interview(path, negative, 409)
        release.set()
        outcome = event({'event': 'driver_settled'})
        if args.mode == 'timeout':
            assert not outcome['committed'] and outcome['timeout'], outcome
        process.join(15)
        assert process.exitcode == 0
        lock = client[name].soc_guided_locks.find_one({'_id': row['framework_assessment_id']})
        assert lock.get('token') and lock['until']
        native_before = client[name].framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        # Wait for the actual unchanged lease bound, never edit expiration to pass.
        remaining = max(0, (datetime.fromisoformat(lock['until']) - datetime.now(timezone.utc)).total_seconds())
        print(json.dumps({'actual_expiry_wait_seconds': remaining}), flush=True)
        time.sleep(remaining + 0.1)
        interview(path, negative, 200)
        native_after = client[name].framework_assessments.find_one({'framework_assessment_id': row['framework_assessment_id']})
        assert native_after == native_before, 'Older pending native write changed the later interview state'
        draft = client[name].guided_assessment_pilot.find_one({'assessment_id': row['framework_assessment_id']})
        assert draft['revision'] == 2 and draft['result']['status'] == 'needs_attention'
        print(json.dumps({'result': 'passed', 'successor_blocked_while_uncertain': True,
                          'retry_after_actual_expiry': True, 'late_native_change': False}), flush=True)
        return 0
    finally:
        release.set()
        if cancel is not None:
            cancel.set()
        for process in owned:
            if process.is_alive():
                process.terminate()
            process.join(10)
        # Only this UUID database was created by this run. No shared data cleanup.
        client.drop_database(name)
        client.close()


if __name__ == '__main__':
    multiprocessing.freeze_support()
    raise SystemExit(main())
