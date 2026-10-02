"""Explicit, isolated-database field backfills with durable recovery and rollback.

Default is read-only reporting. Writes require an isolated_/test_ database name,
an exact database confirmation, client, active authorized actor and stable run ID.
"""
import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
import re
import uuid

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

import authorization
from record_integrity import inspect_client


async def run(db, client_id, actor_id, *, mode='report', run_id=None, confirm_database=None):
    actor = await db.users.find_one({'user_id': actor_id})
    if not actor or actor.get('status') != 'active' or not authorization.can_access(actor, client_id):
        raise ValueError('An active administrator with access to this client is required')
    authorization.require_program_admin(actor)
    if not await db.clients.find_one({'client_id': client_id}):
        raise ValueError('Client not found')
    if mode == 'report':
        return {'mode': 'dry-run', **await inspect_client(db, client_id)}
    if mode not in ('apply', 'rollback'):
        raise ValueError('Unknown migration mode')
    if not db.name.startswith(('isolated_', 'test_')) or confirm_database != db.name:
        raise ValueError('Writes require an explicitly confirmed isolated_/test_ database')
    if not run_id or not re.fullmatch(r'[A-Za-z0-9_-]{16,128}', run_id):
        raise ValueError('A stable 16–128 character run ID is required')
    receipt = await db.record_contract_migrations.find_one({'_id': run_id})
    if receipt is None:
        if mode == 'rollback':
            raise ValueError('Unknown migration run')
        report = await inspect_client(db, client_id)
        receipt = {'_id': run_id, 'client_id': client_id, 'actor_id': actor_id,
                   'repairs': report['repairs'], 'issues': report['issues'], 'state': 'pending', 'applied': []}
        try:
            await db.record_contract_migrations.insert_one(receipt)
        except DuplicateKeyError:
            receipt = await db.record_contract_migrations.find_one({'_id': run_id})
    if receipt['client_id'] != client_id or receipt['actor_id'] != actor_id:
        raise ValueError('Migration run belongs to a different actor or client')
    token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    acquired = await db.record_contract_migrations.update_one({'_id': run_id, '$or': [
        {'lease': None}, {'lease.until': {'$lt': now.isoformat()}}]},
        {'$set': {'lease': {'token': token, 'until': (now + timedelta(seconds=120)).isoformat()}}})
    if not acquired.modified_count:
        raise ValueError('Migration is in progress; retry the same run ID')
    try:
        # Another run can finish between the first read and lease acquisition.
        # Its checkpoints and frozen after-images, not our stale copy, own replay.
        receipt = await db.record_contract_migrations.find_one({'_id': run_id, 'lease.token': token})
        if receipt is None:
            raise ValueError('Migration ownership changed; retry the same run ID')
        if mode == 'apply' and (receipt['state'] == 'rolled_back' or receipt.get('rollback_started')):
            raise ValueError('A rolled-back migration cannot be reapplied; inspect a new run')
        if mode == 'rollback':
            await db.record_contract_migrations.update_one({'_id': run_id}, {'$set': {'rollback_started': True}})
        return await asyncio.wait_for(_execute(db, receipt, mode), timeout=90)
    finally:
        await db.record_contract_migrations.update_one({'_id': run_id, 'lease.token': token}, {'$unset': {'lease': ''}})


async def _execute(db, receipt, mode):
    run_id, cid = receipt['_id'], receipt['client_id']
    results = []
    for index, repair in enumerate(receipt['repairs']):
        collection = db[repair['kind']]
        query = {repair['id_field']: repair['id'], 'client_id': cid}
        current = await collection.find_one(query)
        before, absent = repair['before'], repair['absent']
        if mode == 'apply':
            if index in receipt.get('applied', []):
                results.append({'id': repair['id'], 'result': 'already_applied'})
                continue
            after = (receipt.get('after') or {}).get(str(index))
            if after is None:
                stamp = datetime.now(timezone.utc)
                if before.get('updated_at'):
                    prior = datetime.fromisoformat(before['updated_at'].replace('Z', '+00:00'))
                    if prior.tzinfo is None:
                        prior = prior.replace(tzinfo=timezone.utc)
                    stamp = max(stamp, prior + timedelta(microseconds=1))
                after = {**repair['changes'], 'updated_at': stamp.isoformat(), '_contract_migration': run_id}
                await db.record_contract_migrations.update_one({'_id': run_id}, {'$set': {'after.' + str(index): after}})
            if not current or current.get('_contract_migration') != run_id:
                predicate = {**query, **before, **{field: {'$exists': False} for field in absent}}
                changed = await collection.update_one(predicate, {'$set': after})
                if not changed.matched_count:
                    results.append({'id': repair['id'], 'result': 'conflict'})
                    continue
            await db.record_contract_migrations.update_one({'_id': run_id}, {'$addToSet': {'applied': index}})
            results.append({'id': repair['id'], 'result': 'applied'})
        else:
            if index in receipt.get('rolled_back', []):
                results.append({'id': repair['id'], 'result': 'already_rolled_back'})
                continue
            after = (receipt.get('after') or {}).get(str(index))
            if after is None:
                continue
            # A write can have committed before its applied checkpoint. The
            # frozen after-image detects it; newer edits cause a conflict.
            if current and all(current.get(field) == value for field, value in before.items()) and all(field not in current for field in absent):
                changed = True
            else:
                result = await collection.update_one({**query, **after}, {'$set': before, '$unset': {field: '' for field in absent}})
                changed = bool(result.matched_count)
            if changed:
                await db.record_contract_migrations.update_one({'_id': run_id}, {'$addToSet': {'rolled_back': index}})
            results.append({'id': repair['id'], 'result': 'rolled_back' if changed else 'conflict'})
    state = 'conflict' if any(row['result'] == 'conflict' for row in results) else 'complete' if mode == 'apply' else 'rolled_back'
    await db.record_contract_migrations.update_one({'_id': run_id}, {'$set': {'state': state}})
    return {'mode': mode, 'run_id': run_id, 'state': state, 'results': results, 'issues': receipt['issues']}


async def main(args):
    url = os.environ.get(args.mongo_url_env)
    if not url:
        raise ValueError('Set the explicitly selected Mongo URL environment variable')
    client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=5000)
    try:
        result = await run(client[args.database], args.client_id, args.actor_id, mode=args.mode,
                           run_id=args.run_id, confirm_database=args.confirm_database)
        print(json.dumps(result, indent=2, default=str))
    finally:
        client.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongo-url-env', required=True, help='Name of an environment variable; never put credentials in arguments')
    parser.add_argument('--database', required=True)
    parser.add_argument('--client-id', required=True)
    parser.add_argument('--actor-id', required=True)
    parser.add_argument('--mode', choices=('report', 'apply', 'rollback'), default='report')
    parser.add_argument('--run-id')
    parser.add_argument('--confirm-database')
    asyncio.run(main(parser.parse_args()))
