"""Run native AI onboarding checks against a verified, disposable loopback Mongo process."""
import hashlib
import subprocess
import argparse
import asyncio
import importlib.metadata
import json
import logging
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import uuid

from motor.motor_asyncio import AsyncIOMotorClient


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mongo-url',required=True)
    parser.add_argument('--expected-dbpath',required=True)
    parser.add_argument('--expected-pid',required=True,type=int)
    parser.add_argument('--report',required=True)
    args=parser.parse_args()
    origin=urlsplit(args.mongo_url)
    if origin.scheme!='mongodb' or origin.hostname!='127.0.0.1' or not origin.port or origin.username or origin.password or origin.path not in ('','/') or origin.query or origin.fragment:
        parser.error('Use an explicit credential-free loopback Mongo origin')
    backend=Path(__file__).resolve().parents[1]
    sys.path[:0]=[str(backend),str(backend/'tests')]
    import test_ai_onboarding as cases
    from initialization import ensure_indexes
    def source_hashes():
        repo=backend.parent
        names=['backend/ai_onboarding.py','backend/ai_governance.py','backend/server.py','backend/create_requests.py','backend/tests/test_ai_onboarding.py','backend/scripts/verify_ai_onboarding_mongo.py','frontend/src/lib/aiOnboardingCatalog.json']
        return {name:hashlib.sha256((repo/name).read_bytes()).hexdigest() for name in names}
    before_hashes=source_hashes()
    head=subprocess.check_output(['git','-C',str(backend.parent),'rev-parse','HEAD'],text=True).strip()
    ledger=[]

    class MongoStorage:
        async def asyncSetUp(self):
            await super().asyncSetUp()
            self.mongo=AsyncIOMotorClient(args.mongo_url,serverSelectionTimeoutMS=3000)
            self.addCleanup(lambda:self.mongo.close())
            options=await self.mongo.admin.command('getCmdLineOpts')
            status=await self.mongo.admin.command('serverStatus')
            self.assertEqual(status['pid'],args.expected_pid)
            self.assertEqual(Path(options['parsed']['storage']['dbPath']).resolve(),Path(args.expected_dbpath).resolve())
            self.assertEqual(options['parsed']['net']['port'],origin.port)
            self.assertEqual(options['parsed']['net']['bindIp'],'127.0.0.1')
            name='test_grc_ai_'+uuid.uuid4().hex
            self.assertNotIn(name,await self.mongo.list_database_names())
            receipt={'test':self.id(),'database':name,'pid':status['pid'],'origin':args.mongo_url,'cleanup':False}
            ledger.append(receipt)
            async def cleanup():
                await self.mongo.drop_database(name)
                receipt['cleanup']=name not in await self.mongo.list_database_names()
                self.assertTrue(receipt['cleanup'])
            self.addAsyncCleanup(cleanup)
            source=cases.server.db
            real=self.mongo[name]
            for kind in ('users','clients','requirements'):
                rows=await source[kind].find({}).to_list(None)
                if kind=='users':self.assertTrue(all(row['email'].endswith('@example.test') for row in rows))
                if rows:await real[kind].insert_many(rows)
            await ensure_indexes(real)
            override=patch.object(cases.server,'db',real)
            override.start();self.addCleanup(override.stop)

    class MongoAIOnboardingTests(MongoStorage,cases.AIOnboardingTests):
        async def test_concurrent_replay_and_new_connection_preserve_ids_audit_and_vendor(self):
            body=self.payload();body['vendor'].update(mode='create',name='Synthetic AI provider',service='Synthetic AI service')
            key=uuid.uuid4().hex
            responses=await asyncio.gather(*(self.add(body,key) for _ in range(5)))
            self.assertTrue(all(response.status_code in (200,409) for response in responses),[response.text for response in responses])
            first=await self.add(body,key)
            self.assertEqual(first.status_code,200,first.text)
            result=first.json();name=cases.server.db.name
            before={kind:await cases.server.db[kind].count_documents({}) for kind in ('ai_systems','risks','vendors','reviews','audit_logs')}
            self.assertEqual(before['ai_systems'],1);self.assertEqual(before['risks'],1);self.assertEqual(before['vendors'],1)
            expected=[('AI use case created',result['ai_system_id']),('AI record linked',result['ai_system_id']),('AI Governance Review scheduled',result['ai_system_id']),('Risk created',result['risk_id']),('Vendor created',result['vendor_id'])]
            evidence=[]
            for action,entity_id in expected:
                logs=await cases.server.db.audit_logs.find({'action':action,'entity_id':entity_id,'client_id':'a','user_id':'admin'},{'_id':0,'action':1,'entity_id':1,'client_id':1,'user_id':1,'log_id':1,'at':1}).to_list(None)
                self.assertEqual(len(logs),1,(action,logs));evidence.extend(logs)
            ledger[-1]['native_evidence']={'ids':{key:result[key] for key in ('ai_system_id','risk_id','vendor_id','review_id')},'counts':before,'audit':evidence,'ai_created_at':result['ai_system']['created_at'],'ai_next_review':result['ai_system']['next_review'],'approval_status':result['ai_system']['approval_status']}

            self.mongo.close()
            self.mongo=AsyncIOMotorClient(args.mongo_url,serverSelectionTimeoutMS=3000)
            with patch.object(cases.server,'db',self.mongo[name]):
                replay=await self.add(body,key)
                self.assertEqual(replay.status_code,200,replay.text)
                self.assertEqual(replay.json(),result)
                self.assertEqual({kind:await cases.server.db[kind].count_documents({}) for kind in before},before)
                review=await cases.server.db.reviews.find_one({'review_id':result['review_id']})
                self.assertEqual(review['status'],'upcoming')
                self.assertEqual(review['ai_system_id'],result['ai_system_id'])

    logging.getLogger('httpx').setLevel(logging.WARNING)
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(MongoAIOnboardingTests)
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    after_hashes=source_hashes()
    report={'head':head,'source_before':before_hashes,'source_after':after_hashes,'source_unchanged':before_hashes==after_hashes,'tests_run':result.testsRun,'successful':result.wasSuccessful(),'failures':len(result.failures),'errors':len(result.errors),
        'environment':{name:importlib.metadata.version(name) for name in ('fastapi','motor','pymongo','httpx')},
        'scope':'Real loopback Mongo, native ASGI and signed JWT; no browser or HTTP listener; not visual or release qualification',
        'databases':ledger}
    Path(args.report).write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    raise SystemExit(0 if result.wasSuccessful() and before_hashes==after_hashes and all(row['cleanup'] for row in ledger) else 1)


if __name__=='__main__':main()
