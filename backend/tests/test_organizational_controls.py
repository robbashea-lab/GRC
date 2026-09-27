"""Real authorized routes over isolated Mongo; no staging durability claim."""
from copy import deepcopy
import unittest
from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests as Harness, server
from organizational_controls import migration_plan

BASE='/api/organizational-controls'


class OrganizationalControlTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=Harness.asyncSetUp
    sign_in=Harness.sign_in

    async def seed(self):
        self.sign_in('admin')
        value={'control_id':'AC-01','name':'Access review','description':'Quarterly entitlement review',
               'frequency':'Quarterly','design':'adequate','operating':'effective','period_start':'2025-01-01','period_end':'2025-12-31',
               'expected_instances':4,'collected_instances':4}
        self.rows=[]
        for aid,did,cid,description in [('a1','CC6.1','a',value['description']),('a2','CC6.2','a','Different supplier coverage'),('b1','CC6.1','b','Other tenant')]:
            row={'framework_assessment_id':aid,'client_id':cid,'framework_key':'soc-2','definition_id':did,
                 'status':'not_assessed','implementation':'','technology':'','notes':'','na_rationale':'','last_assessed':'2026-01-01T00:00:00Z',
                 'management_controls':[{**value,'description':description}], 'related_links':[],
                 'assessment_history':[{'at':'2025-01-01','by':'admin','management_controls':[{**value,'description':'Year one design'}]}]}
            self.rows.append(deepcopy(row));await server.db.framework_assessments.insert_one(deepcopy(row))
        await server.db.reviews.insert_one({'review_id':'r1','client_id':'a','title':'Access review','status':'upcoming'})
        await server.db.evidence.insert_one({'evidence_id':'e1','client_id':'a','filename':'Q1.txt','created_at':'2025-03-31','content_base64':'c3ludGhldGlj'})
        await server.db.evidence.insert_one({'evidence_id':'foreign','client_id':'b','filename':'private.txt'})

    async def migrate(self):
        result=await self.client.post(BASE+'/migrate',json={'client_id':'a'})
        self.assertEqual(result.status_code,200,result.text)
        return (await self.client.get(BASE,params={'client_id':'a'})).json()['items'][0]

    async def test_migration_conflicts_history_isolation_and_idempotency(self):
        await self.seed();row=await self.migrate()
        self.assertEqual(row['conflicts'],['description']);self.assertEqual(row['description'],'')
        self.assertEqual(row['assessment_ids'],['a1','a2']);self.assertIsNone(row['owner_id'])
        detail=(await self.client.get(BASE+'/'+row['control_id'])).json()
        self.assertEqual(len(detail['legacy_sources']),4)
        self.assertEqual((await self.client.post(BASE+'/migrate',json={'client_id':'a'})).json()['created'],0)
        for original in self.rows:
            saved=await server.db.framework_assessments.find_one({'framework_assessment_id':original['framework_assessment_id']},{'_id':0})
            self.assertEqual(saved,{**original,**({'controls_migrated':True} if original['client_id']=='a' else {})})
        self.assertEqual(await server.db.organizational_controls.count_documents({}),1)
        changed=await self.client.patch('/api/framework_assessments/a1',json={'management_controls':[]})
        self.assertEqual(changed.status_code,409,changed.text)

    async def test_reconciled_design_observations_links_and_independent_conclusions(self):
        await self.seed();row=await self.migrate();endpoint=BASE+'/'+row['control_id']
        fields={k:row[k] for k in ('name','description','frequency','design','owner_id','assessment_ids','related_links')}
        body={**fields,'description':'Reconciled access and supplier review','owner_id':'member',
              'related_links':[{'kind':'reviews','id':'r1'},{'kind':'evidence','id':'e1'}],
              'expected_updated_at':row['updated_at'],'resolve_conflicts':True,'reconciliation_note':'Both criterion owners agreed to include supplier access'}
        saved=await self.client.patch(endpoint,json=body);self.assertEqual(saved.status_code,200,saved.text);row=saved.json()
        self.assertEqual(row['conflicts'],[]);self.assertEqual(len(row['legacy_sources']),4)
        observation={'request_id':'period-2026','expected_updated_at':row['updated_at'],'period_start':'2026-01-01','period_end':'2026-12-31','operating':'gap','expected_instances':4,'collected_instances':3,'notes':'One review missed; linked Finding required'}
        recorded=await self.client.post(endpoint+'/observations',json=observation);self.assertEqual(recorded.status_code,200,recorded.text);row=recorded.json()
        self.assertEqual((await self.client.post(endpoint+'/observations',json=observation)).status_code,200)
        original=deepcopy(row['observations'][0])
        changed=await self.client.patch(endpoint,json={**body,'expected_updated_at':row['updated_at'],'description':'New design in the next cycle','frequency':'Monthly','owner_id':'admin'})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertEqual(changed.json()['observations'][0],original)
        self.assertEqual(original['design_snapshot']['owner_id'],'member')
        self.assertEqual(original['design_snapshot']['frequency'],'Quarterly')
        self.assertEqual((await self.client.patch(endpoint,json=body)).status_code,409)
        for aid in ('a1','a2'):
            self.assertEqual((await self.client.get('/api/framework_assessments/'+aid)).json()['status'],'not_assessed')
        detail=(await self.client.get(endpoint)).json()
        self.assertEqual(detail['linked_records']['evidence'][0]['created_at'],'2025-03-31')
        self.assertNotIn('content_base64',detail['linked_records']['evidence'][0])
        self.assertEqual(await server.db.evidence.count_documents({'evidence_id':'e1'}),1)
        reference=(await self.client.get('/api/evidence-library/items/e1')).json()['references'][0]
        self.assertEqual(reference['kind'],'organizational_controls')
        self.assertEqual(reference['document_context'],'Current Control relationship')
        changed=await self.client.patch(endpoint,json={**body,'expected_updated_at':changed.json()['updated_at'],'related_links':[]})
        self.assertEqual(changed.status_code,200,changed.text)
        reference=(await self.client.get('/api/evidence-library/items/e1')).json()['references'][0]
        self.assertEqual(reference['document_context'],'Historical Control relationship')
        self.assertEqual((await self.client.delete('/api/evidence/e1')).status_code,409)
        self.assertEqual(len((await self.client.get(endpoint)).json()['linked_records']['evidence']),1)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'client_ids':[],'status':'disabled'}})
        people=(await self.client.get('/api/clients/a/members')).json()
        self.assertTrue(next(p for p in people if p['user_id']=='member')['orphaned'])

    async def test_access_mass_assignment_cross_client_and_disabled_owner(self):
        await self.seed();row=await self.migrate();endpoint=BASE+'/'+row['control_id']
        body={**{k:row[k] for k in ('name','description','frequency','design','owner_id','assessment_ids','related_links')},'expected_updated_at':row['updated_at']}
        for patch in ({'client_id':'b'},{'assessment_ids':['b1']},{'related_links':[{'kind':'evidence','id':'foreign'}]},{'owner_id':'absent'},{'history':[]}):
            result=await self.client.patch(endpoint,json={**body,**patch});self.assertEqual(result.status_code,422,result.text)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'status':'disabled'}})
        self.assertEqual((await self.client.patch(endpoint,json={**body,'owner_id':'member'})).status_code,422)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'status':'active'}})
        for role in ('client_contributor','client_grc_manager','client_readonly'):
            await server.db.users.update_one({'user_id':'member'},{'$set':{'role':role}});self.sign_in('member')
            self.assertEqual((await self.client.get(endpoint)).status_code,200)
            self.assertEqual((await self.client.get(BASE,params={'client_id':'b'})).status_code,403)
            self.assertEqual((await self.client.patch(endpoint,json=body)).status_code,403)
            self.assertEqual((await self.client.post(BASE+'/migrate',json={'client_id':'a'})).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'platform_admin','client_ids':['b']}})
        self.assertEqual((await self.client.get(endpoint)).status_code,404)

    async def test_creation_replay_and_paged_candidate_reads(self):
        await self.seed()
        body={'client_id':'a','request_id':'intent','name':'Independent Control','assessment_ids':['a1','a2']}
        first=await self.client.post(BASE,json=body);self.assertEqual(first.status_code,200,first.text)
        replay=await self.client.post(BASE,json=body);self.assertEqual(first.json()['control_id'],replay.json()['control_id'])
        self.assertEqual((await self.client.post(BASE,json={**body,'name':'Other intent'})).status_code,409)
        await server.db.reviews.insert_many([{'review_id':f'page{i:02}','client_id':'a','title':f'Historical {i}'} for i in range(30)])
        pages=[]
        for offset in (0,25):
            data=(await self.client.get(BASE+'/candidates',params={'client_id':'a','kind':'reviews','offset':offset,'q':'Historical'})).json()
            pages.extend(data['items'])
        self.assertEqual(len(pages),30);self.assertEqual(len({r['review_id'] for r in pages}),30)

    def test_missing_identifiers_never_merge_across_criteria(self):
        rows=[{'client_id':'a','framework_key':'soc-2','framework_assessment_id':aid,'definition_id':aid,'management_controls':[{'name':'Same name'}]} for aid in ('one','two')]
        self.assertEqual(len(migration_plan(rows,'a','now','actor')),2)

    async def test_migration_fence_rejects_an_already_in_flight_legacy_write(self):
        await self.seed()
        collection=server.db.framework_assessments
        import assignment_eligibility
        validate=assignment_eligibility.validate
        async def interleave(*args, **kwargs):
            migrated=await self.client.post(BASE+'/migrate',json={'client_id':'a'})
            self.assertEqual(migrated.status_code,200,migrated.text)
            return await validate(*args,**kwargs)
        with patch.object(assignment_eligibility,'validate',side_effect=interleave):
            result=await self.client.patch('/api/framework_assessments/a1',json={'management_controls':[]})
        self.assertEqual(result.status_code,409,result.text)
        saved=await collection.find_one({'framework_assessment_id':'a1'},{'_id':0})
        self.assertEqual(saved['management_controls'],self.rows[0]['management_controls'])
        self.assertEqual(saved['assessment_history'],self.rows[0]['assessment_history'])
