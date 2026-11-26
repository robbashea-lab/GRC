"""Native sample initialization, retained people, and tenant-scoped reads."""
from copy import deepcopy
import inspect
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import uuid

from fastapi import FastAPI
import httpx
from mongomock.collection import BulkOperationBuilder
from mongomock_motor import AsyncMongoMockClient

import test_client_dashboard_sources as fixture
import approved_v3
import initialization


server = fixture.server
CID = 'v3sample_brawndo'
OTHER = 'v3sample_dunder'
RISK = CID + '_risks_1'
PERSON = 'v3sample_user_1'
ROUTE = '/api/v3/approved-portfolio'


def small_scenario():
    return {'schema_version': 1, 'source_sha256': approved_v3.SOURCE_SHA256, 'records': {
        'clients': [{'client_id': cid, 'source_client_id':cid.removeprefix('v3sample_'), 'name': cid, 'status': 'active'}
                    for cid in sorted(approved_v3.CLIENT_IDS)],
        'users': [{'user_id': PERSON, 'email': 'sample.owner@example.test', 'name': 'Sample owner',
                   'role': 'super_admin', 'status': 'active', 'client_ids': [CID]}],
        'risks': [{'risk_id': RISK, 'client_id': CID, 'title': 'Recorded risk', 'owner_id': PERSON}],
        'ai_systems': [{'ai_system_id': CID+'_ai_systems_1', 'client_id': CID, 'name': 'Sample AI',
                        'display_id': 'AI-004', 'ai_name_key': 'sample ai'}],
        'evidence': [{'evidence_id': CID+'_evidence_1', 'client_id': CID, 'filename': 'reference.pdf'}],
    }, 'source_state': {'clients': [{'id':k} for k in sorted(approved_v3.SOURCE_CLIENTS)], 'users': []}}


class ApprovedPortfolioTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient().approved_portfolio
        self.enterContext(patch.object(server, 'db', self.db))
        self.enterContext(patch.dict(os.environ, {'JWT_SECRET': uuid.uuid4().hex}))
        self.scenario = small_scenario()
        self.enterContext(patch.object(approved_v3, 'load_scenario', side_effect=lambda: deepcopy(self.scenario)))
        # PyMongo passes sort=None for every UpdateOne. mongomock 4.x predates
        # this optional argument. Pass its real bulk writer all supported options.
        original_update = BulkOperationBuilder.add_update
        if 'sort' not in inspect.signature(original_update).parameters:
            def apply_update(builder, *args, sort=None, **kwargs):
                if sort is not None:
                    raise AssertionError('Sorted bulk updates need integration coverage on MongoDB')
                return original_update(builder, *args, **kwargs)
            self.enterContext(patch.object(BulkOperationBuilder, 'add_update', apply_update))
        await initialization.ensure_indexes(self.db)
        await self.db.users.insert_many([
            {'user_id':uid, 'email':uid+'@example.test', 'name':uid, 'role':role,
             'status':'active', 'client_ids':clients}
            for uid,role,clients in [('owner','super_admin',[]),('provider','platform_admin',[CID]),
                                     ('reader','client_readonly',[CID])]])
        await self.db.clients.insert_one({'client_id':'existing-client','name':'Existing', 'status':'active'})
        app = FastAPI()
        app.include_router(approved_v3.router_for(server))
        app.add_api_route('/api/clients/{client_id}/members', server.client_members)
        app.add_api_route('/api/clients/{client_id}/assignees', server.eligible_assignees)
        app.add_api_route('/api/users/{user_id}', server.admin_update_user, methods=['PATCH'])
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')
        self.addAsyncCleanup(self.client.aclose)
        self.key = uuid.uuid4().hex

    def auth(self, uid):
        return {'Authorization':'Bearer '+server.create_access_token(uid,uid+'@example.test')}

    async def initialize(self, uid='owner', key=None):
        return await self.client.post(ROUTE+'/initialize', headers={**self.auth(uid),'Idempotency-Key':key or self.key})

    async def read(self, uid, cid):
        return await self.client.get(ROUTE+'/records', params={'client_id':cid}, headers=self.auth(uid))

    async def test_import_requires_current_owner_and_idempotent_request(self):
        self.assertEqual((await self.client.post(ROUTE+'/initialize')).status_code,401)
        for uid in ['reader','provider']:
            self.assertEqual((await self.initialize(uid)).status_code,403)
        self.assertEqual((await self.client.post(ROUTE+'/initialize',headers=self.auth('owner'))).status_code,422)
        self.assertEqual(await self.db.clients.count_documents({}),1)
        first = await self.initialize()
        self.assertEqual(first.status_code,200,first.text)
        self.assertEqual(set(first.json()['client_ids']),approved_v3.CLIENT_IDS)
        self.assertEqual((await self.initialize()).json(),first.json())
        self.assertEqual(await self.db.clients.count_documents({}),9)
        self.assertEqual(await self.db.risks.count_documents({'risk_id':RISK}),1)
        await self.db.risks.update_one({'risk_id':RISK},{'$set':{'title':'Edited in native'}})
        self.assertEqual((await self.initialize(key=uuid.uuid4().hex)).status_code,200)
        self.assertEqual((await self.db.risks.find_one({'risk_id':RISK}))['title'],'Edited in native')

    async def test_reference_people_have_no_auth_account_grants_and_ai_counter_reserves_ids(self):
        await self.db.business_counters.insert_one({'_id':'ai-display:'+CID,'sequence':8})
        result = await self.initialize()
        self.assertEqual(result.status_code,200,result.text)
        self.assertIsNone(await self.db.users.find_one({'user_id':PERSON}))
        self.assertIsNone(await self.db.users.find_one({'email':'sample.owner@example.test'}))
        ref = await self.db.approved_v3_people.find_one({'user_id':PERSON})
        self.assertTrue(ref['reference_only'])
        self.assertEqual((await self.db.business_counters.find_one({'_id':'ai-display:'+CID}))['sequence'],8)
        self.assertEqual(await self.db.users.count_documents({}),3)
        self.assertEqual((await self.read(PERSON,CID)).status_code,401)
        activate = await self.client.patch('/api/users/'+PERSON,headers=self.auth('owner'),
                                          json={'status':'active','expected_updated_at':None})
        self.assertEqual(activate.status_code,404,activate.text)
        members = await self.client.get('/api/clients/'+CID+'/members',headers=self.auth('reader'))
        self.assertEqual(members.status_code,200,members.text)
        person = next(p for p in members.json() if p['user_id']==PERSON)
        self.assertEqual(person['name'],'Sample owner')
        self.assertTrue(person['reference_only'])
        self.assertNotIn('email',person)
        options = await self.client.get('/api/clients/'+CID+'/assignees',headers=self.auth('owner'))
        self.assertNotIn(PERSON,[row['user_id'] for row in options.json()['items']])

    async def test_existing_real_user_cannot_become_a_fictional_record_owner_by_id_collision(self):
        await self.db.users.insert_one({'user_id':PERSON,'email':'retained@example.test',
                                        'role':'client_readonly','status':'active','client_ids':['existing-client']})
        result = await self.initialize()
        self.assertEqual(result.status_code,409,result.text)
        self.assertEqual(await self.db.approved_v3_people.count_documents({}),0)
        person = await self.db.users.find_one({'user_id':PERSON})
        self.assertEqual(person['client_ids'],['existing-client'])
        self.assertEqual(await self.db.clients.count_documents({}),1)

    async def test_retry_after_partial_write_preserves_edits_and_publishes_clients_last(self):
        original = type(self.db.risks).bulk_write
        interrupted = False
        async def interrupted_batch(collection,*args,**kwargs):
            nonlocal interrupted
            if not interrupted and collection.name=='clients':
                interrupted = True
                raise RuntimeError('Test interruption before publishing')
            return await original(collection,*args,**kwargs)
        with patch.object(type(self.db.risks),'bulk_write',interrupted_batch):
            response = await self.initialize()
        self.assertEqual(response.status_code,503,response.text)
        self.assertIsNone(await self.db.clients.find_one({'client_id':CID}))
        self.assertIsNotNone(await self.db.risks.find_one({'risk_id':RISK}))
        await self.db.risks.update_one({'risk_id':RISK},{'$set':{'title':'Preserved on retry'}})
        response = await self.initialize()
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual((await self.db.risks.find_one({'risk_id':RISK}))['title'],'Preserved on retry')
        self.assertEqual((await self.db.business_counters.find_one({'_id':'ai-display:'+CID}))['sequence'],4)

    async def test_existing_native_id_or_same_mark_in_foreign_client_never_becomes_an_import(self):
        for marker in (None,approved_v3.SOURCE_MARK):
            with self.subTest(marked=bool(marker)):
                row = {'risk_id':RISK,'client_id':'existing-client','title':'Original'}
                if marker:
                    row['approved_v3_source']=marker
                await self.db.risks.insert_one(row)
                response = await self.initialize(key=uuid.uuid4().hex)
                self.assertEqual(response.status_code,409,response.text)
                self.assertEqual((await self.db.risks.find_one({'risk_id':RISK}))['title'],'Original')
                self.assertEqual(await self.db.clients.count_documents({}),1)
                await self.db.risks.delete_one({'risk_id':RISK})

    async def test_reads_check_actual_client_grants_filter_bytes_and_keep_incomplete_updates_closed(self):
        result = await self.initialize()
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual((await self.read('provider',OTHER)).status_code,403)
        self.assertEqual((await self.read('reader',CID)).status_code,403)
        self.assertEqual((await self.read('owner','existing-client')).status_code,404)
        await self.db.evidence.update_one({'client_id':CID},{'$set':{'content_base64':'dGVzdA=='}})
        result = await self.read('provider',CID)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['client_id'],CID)
        records = result.json()['records']
        self.assertIn(PERSON,[r['user_id'] for r in records['users'] if r.get('reference_only')])
        self.assertIn('provider',[r['user_id'] for r in records['users'] if not r.get('reference_only')])
        self.assertNotIn('content_base64',records['evidence'][0])
        self.assertNotIn('_id',records['evidence'][0])
        await self.db.risks.update_one({'risk_id':RISK},{'$set':{'_r4_context_pending':'another-save'}})
        self.assertEqual((await self.read('provider',CID)).status_code,409)

    async def test_shipped_portfolio_round_trip_and_single_client_bootstrap(self):
        self.scenario = approved_v3.validate_scenario(json.loads(approved_v3.SCENARIO_PATH.read_text(encoding='utf-8')))
        result = await self.initialize()
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(await self.db.framework_assessments.count_documents({}),1026)
        self.assertEqual(await self.db.users.count_documents({}),3)
        self.assertEqual(await self.db.approved_v3_people.count_documents({}),37)
        response = await self.client.get(ROUTE+'/bootstrap',headers=self.auth('provider'))
        self.assertEqual(response.status_code,200,response.text[:300])
        view = response.json()
        self.assertEqual(set(view['records']),{CID})
        self.assertEqual(view['actor']['user_id'],'provider')
        state = view['source_state']
        self.assertEqual({c['id'] for c in state['clients']},{'brawndo'})
        self.assertTrue(all(r.get('client')=='brawndo' for r in state['audit']))
        for user in state['users']:
            self.assertNotIn('dunder',user['clients'])
            self.assertNotIn('ppth',user['clients'])
        for name in ('itemCur','itemHist','ita','guideSaved','itemExtra'):
            self.assertTrue(all(k.startswith('brawndo|') for k in state[name]),name)
        self.assertEqual(len(view['records'][CID]['policies']),10)

    async def new_client(self, source_id, body=None, key=None, user='owner'):
        return await self.client.post(ROUTE+'/clients', headers={**self.auth(user),'Idempotency-Key':key or self.key},
            json={'source_id':source_id,'client':body if body is not None else {'name':'New organization','status':'onboarding'}})

    async def test_new_client_does_not_adopt_regular_create_even_with_same_actor_body_and_request_key(self):
        await self.initialize()
        user=await self.db.users.find_one({'user_id':'owner'})
        body={'name':'New organization','status':'onboarding'}
        original=await server.create_client(server.ClientIn(**body),user,self.key)
        created=await self.new_client('c-new',body)
        self.assertEqual(created.status_code,200,created.text)
        cid=created.json()['client_id']
        self.assertNotEqual(cid,original['client_id'])
        self.assertNotIn('approved_v3_source',await self.db.clients.find_one({'client_id':original['client_id']}))
        await self.db.clients.update_one({'client_id':cid},{'$set':{'name':'Edited native record'}})
        retry=await self.new_client('c-new',body)
        self.assertEqual((retry.status_code,retry.json()['name']),(200,'Edited native record'))
        other=await self.new_client('c-new',body,key='another-register-intent')
        self.assertEqual(other.status_code,409)
        self.assertEqual(await self.db.clients.count_documents({'source_client_id':'c-new'}),1)
        for actor,visible in [('owner',True),('provider',False)]:
            response=await self.client.get(ROUTE+'/bootstrap',headers=self.auth(actor))
            self.assertEqual(response.status_code,200,response.text[:300])
            self.assertEqual(cid in response.json()['records'],visible)
            self.assertEqual(any(c['id']=='c-new' for c in response.json()['source_state']['clients']),visible)

    async def test_invalid_create_can_be_corrected_without_seizing_alias_or_granting_access(self):
        for user in ('provider','reader'):
            self.assertEqual((await self.new_client('c-row',user=user)).status_code,403)
        invalid=await self.new_client('c-row',{'name':'New org','assigned_owner_id':'no-such-user'})
        self.assertEqual(invalid.status_code,422,invalid.text)
        self.assertIsNone(await self.db.approved_v3_client_references.find_one({'_id':'c-row'}))
        self.assertEqual((await self.new_client('c-row',key='corrected-create-intent')).status_code,200)
        self.assertEqual((await self.new_client('c-grant',{'name':'New org','approved_v3_source':approved_v3.SOURCE_MARK})).status_code,422)
        await self.db.clients.insert_one({'client_id':'unrelated','source_client_id':'c-collision','name':'Untouched'})
        self.assertEqual((await self.new_client('c-collision',key='conflicting-alias-intent')).status_code,409)
        self.assertNotIn('approved_v3_source',await self.db.clients.find_one({'client_id':'unrelated'}))

    async def test_retry_after_an_interrupted_binding_preserves_new_native_client_and_contact(self):
        original=type(self.db.clients).update_one
        raised=False
        async def interrupted(coll,criteria,update,*args,**kwargs):
            nonlocal raised
            if not raised and coll.name=='clients' and update.get('$set',{}).get('source_client_id')=='c-interrupted':
                raised=True
                raise RuntimeError('Synthetic transport failure after native creation')
            return await original(coll,criteria,update,*args,**kwargs)
        form={'name':'Original name','primary_contact_details':{'name':'Primary contact'}}
        with patch.object(type(self.db.clients),'update_one',interrupted):
            first=await self.new_client('c-interrupted',form)
        self.assertEqual(first.status_code,503,first.text)
        await self.db.clients.update_one({'name':'Original name'},{'$set':{'name':'Later native edit'}})
        second=await self.new_client('c-interrupted',form)
        self.assertEqual(second.status_code,200,second.text)
        self.assertEqual(second.json()['name'],'Later native edit')
        self.assertEqual(await self.db.contacts.count_documents({'client_id':second.json()['client_id']}),1)

    async def test_drafts_are_private_per_native_actor_and_refuse_stale_or_cross_client_writes(self):
        await self.initialize()
        async def save(actor,revision,view):
            return await self.client.put(ROUTE+'/view-draft',headers=self.auth(actor),json={
                'client_id':CID,'expected_revision':revision,'view':view})
        for actor in ('owner','provider'):
            reply=await save(actor,0,{'onboarding':{'brawndo':{'notes':actor}}})
            self.assertEqual(reply.status_code,200,reply.text)
        self.assertEqual((await save('owner',0,{'onboarding':{'brawndo':{'notes':'stale'}}})).status_code,409)
        for view in ({'itemExtra':{'dunder|other':'outside'}},{'activity':{'rev|some-id':[]}},
                     {'ita':{'brawndo|cis|1.1':[]}},{'checklists':{'brawndo|r1|o1':{}}}):
            self.assertEqual((await save('owner',1,view)).status_code,422)
        for actor in ('owner','provider'):
            bootstrap=await self.client.get(ROUTE+'/bootstrap',headers=self.auth(actor))
            self.assertEqual(bootstrap.status_code,200,bootstrap.text[:260])
            row=bootstrap.json()['drafts'][CID]
            self.assertEqual((row['revision'],row['view']['onboarding']['brawndo']['notes']),(1,actor))

    async def test_activity_and_checklists_are_scoped_even_when_other_clients_reuse_display_ids_or_names(self):
        await self.initialize()
        state=self.scenario['source_state']
        state['programs']={'brawndo':{'risks':[{'id':'RISK-001'}]},'dunder':{'risks':[{'id':'RISK-001'}]}}
        state['work']={'brawndo':{'revs':[{'id':'b-review'}]},'dunder':{'revs':[{'id':'d-review'}]}}
        state['itemHist']={'dunder|b-review':['private'],'brawndo|cis|1.1':[]}
        state['activity']={'risk|RISK-001':['ambiguous'],'rev|b-review':['own'],'dunder|b-review':['private']}
        state['checklists']={'b-review':{'note':'own'},'d-review':{'note':'other'},
                             'dunder|b-review|occ':{'note':'private'}}
        await self.db.audit_logs.insert_many([{'log_id':'in','client_id':CID,'action':'public summary','meta':{'excluded':'payload'}},
                                              {'log_id':'foreign','client_id':OTHER,'action':'private summary'}])
        view=(await self.client.get(ROUTE+'/bootstrap',headers=self.auth('provider'))).json()
        self.assertEqual(set(view['source_state']['activity']),{'rev|b-review'})
        self.assertEqual(set(view['source_state']['checklists']),{'b-review'})
        self.assertEqual(set(view['source_state']['itemHist']),{'brawndo|cis|1.1'})
        events=view['records'][CID]['audit_logs']
        self.assertIn('in',[e['log_id'] for e in events])
        self.assertTrue(all(e['client_id']==CID and 'meta' not in e for e in events))


class ApprovedFixtureTests(unittest.TestCase):
    def test_shipped_fixture_is_valid_for_every_declared_client(self):
        data = approved_v3.load_scenario()
        self.assertEqual({r['client_id'] for r in data['records']['clients']},approved_v3.CLIENT_IDS)
        for kind, count in {'risks':87,'policies':103,'vendors':78,'ai_systems':23}.items():
            self.assertEqual(len(data['records'][kind]),count,kind)

    def test_rejects_duplicate_ids_and_foreign_native_client(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'fixture.json'
            for defect in ['duplicate','foreign']:
                scenario=small_scenario()
                risks=scenario['records']['risks']
                if defect=='duplicate':
                    risks.append(deepcopy(risks[0]))
                else:
                    risks[0]['client_id']='existing-client'
                path.write_text(json.dumps(scenario),encoding='utf-8')
                with self.subTest(defect=defect), self.assertRaises(ValueError):
                    approved_v3.load_scenario(path)
