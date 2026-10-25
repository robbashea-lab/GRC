"""Authorized native onboarding, replay, and tenant boundaries in isolated test storage."""
import copy
import uuid
import unittest
from datetime import datetime,timezone
from unittest.mock import patch,AsyncMock
import test_client_dashboard_sources as fixture
server=fixture.server
from ai_onboarding import CATALOG,annual_date
import ai_onboarding
import create_requests


class AIOnboardingTests(unittest.IsolatedAsyncioTestCase):
    sign_in=fixture.ClientDashboardSourcesTests.sign_in
    async def asyncSetUp(self):
        await fixture.ClientDashboardSourcesTests.asyncSetUp(self)
        self.sign_in('admin')
        await server.db.requirements.insert_one({'requirement_id':'cis-a','client_id':'a','baseline_key':'cis-ig1','baseline_response':'applies'})

    def payload(self):
        tool=CATALOG['tools'][0]
        return {'client_id':'a','ai':{'catalog_key':'chatgpt','name':tool['name'],'provider':tool['provider'],
            'environment':tool['plan'],'description':tool['purpose'],'owner_id':None,'restrictions':'',
            'purposes':tool['uses'],'data_types':tool['data'],'permitted_data_types':tool['permitted'],'access':tool['access']},
            'screening':{'schema_version':1,'catalog_version':CATALOG['reviewedOn'],'answers':dict(zip([q['id'] for q in CATALOG['questions']],[None if a=='Not sure' else a=='Yes' for a in tool['answers']]))},
            'vendor':{'mode':'none','id':None,'expected_updated_at':None,'name':'','service':'','owner_id':None},
            'risk':{'title':'AI exposure','description':'Documented use exposure','likelihood':3,'impact':2,'rationale':'Settings review remains outstanding','override':False},
            'confirmations':{'details':True,'screening':True,'risk':True}}

    async def add(self,body=None,key=None):
        return await self.client.post('/api/ai_systems/onboard',json=body or self.payload(),headers={'Idempotency-Key':key or uuid.uuid4().hex})

    async def test_native_records_and_replay(self):
        body=self.payload();key=uuid.uuid4().hex
        first=await self.add(body,key)
        self.assertEqual(first.status_code,200,first.text)
        result=first.json();second=await self.add(body,key)
        self.assertEqual(second.status_code,200,second.text)
        self.assertEqual(result,second.json())
        self.assertEqual(await server.db.ai_systems.count_documents({}),1)
        self.assertEqual(await server.db.risks.count_documents({}),1)
        self.assertEqual(await server.db.reviews.count_documents({'ai_system_id':result['ai_system_id']}),1)
        risk=await server.db.risks.find_one({'risk_id':result['risk_id']})
        self.assertEqual(await server.db.reviews.count_documents({'risk_id':risk['risk_id']}),1)
        self.assertEqual(risk['next_review'],annual_date(risk['created_at']))
        self.assertEqual(result['ai_system']['approval_status'],'pending_assessment')
        self.assertEqual(result['ai_system']['onboarding_screening']['answers'],body['screening']['answers'])
        changed=copy.deepcopy(body);changed['ai']['name']='Another intent'
        self.assertEqual((await self.add(changed,key)).status_code,409)

    async def test_denials_and_validation_write_nothing(self):
        self.sign_in('member')
        self.assertEqual((await self.add()).status_code,403)
        self.sign_in('admin')
        for change in [lambda b:b['screening'].update(schema_version=True),lambda b:b['screening']['answers'].update(managed='yes'),
                       lambda b:b['risk'].update(likelihood=5),lambda b:b['confirmations'].update(details=False),
                       lambda b:b['ai'].update(data_types=['No Sensitive Data','PII']),lambda b:b.update(client_id='b')]:
            body=self.payload();change(body);response=await self.add(body)
            self.assertIn(response.status_code,(403,422),response.text)
        self.assertEqual(await server.db.ai_systems.count_documents({}),0)
        self.assertEqual(await server.db.risks.count_documents({}),0)

    async def test_cached_replay_rechecks_authority_and_reads_current_record(self):
        key=uuid.uuid4().hex;body=self.payload();first=await self.add(body,key)
        self.assertEqual(first.status_code,200,first.text)
        aid=first.json()['ai_system_id']
        await server.db.ai_systems.update_one({'ai_system_id':aid},{'$set':{'name':'Native edit'}})
        self.assertEqual((await self.add(body,key)).json()['ai_system']['name'],'Native edit')
        await server.db.requirements.delete_many({'client_id':'a'})
        self.assertEqual((await self.add(body,key)).status_code,422)

    async def test_calendar_anchor_leap_boundary(self):
        self.assertEqual(annual_date('2024-02-29T23:59:59Z'),'2025-02-28')
        self.assertEqual(annual_date('2026-12-31T23:59:59Z'),'2027-12-31')

    async def test_interrupted_creation_keeps_calendar_anchor_across_midnight(self):
        class BeforeMidnight(datetime):
            @classmethod
            def now(cls,tz=None):return datetime(2024,2,29,23,59,59,tzinfo=timezone.utc)
        body=self.payload();key=uuid.uuid4().hex
        with patch.object(create_requests,'datetime',BeforeMidnight),patch.object(server,'audit',AsyncMock(side_effect=RuntimeError('Synthetic audit outage'))):
            failed=await self.add(body,key)
        self.assertEqual(failed.status_code,503,failed.text)
        initial=await server.db.ai_systems.find_one({})
        restored=await self.add(body,key)
        self.assertEqual(restored.status_code,200,restored.text)
        self.assertEqual(restored.json()['ai_system_id'],initial['ai_system_id'])
        risk=await server.db.risks.find_one({'risk_id':restored.json()['risk_id']})
        self.assertEqual(risk['created_at'],initial['created_at'])
        self.assertEqual(risk['date_identified'],initial['created_at'])
        self.assertEqual(risk['next_review'],'2025-02-28')
        self.assertEqual(restored.json()['ai_system']['next_review'],'2025-02-28')
        self.assertEqual(await server.db.ai_systems.count_documents({}),1)
        self.assertEqual(await server.db.risks.count_documents({}),1)

    async def test_pending_child_does_not_overwrite_changed_native_review(self):
        body=self.payload();key=uuid.uuid4().hex;original=ai_onboarding.ensure_native_reviews
        async def interrupt(*args,**kwargs):
            await original(*args,**kwargs)
            raise RuntimeError('Synthetic interruption after native Review')
        with patch.object(ai_onboarding,'ensure_native_reviews',interrupt):
            failed=await self.add(body,key)
        self.assertEqual(failed.status_code,503,failed.text)
        review=await server.db.reviews.find_one({'risk_id':{'$exists':True}})
        await server.db.reviews.update_one({'review_id':review['review_id']},{'$set':{'due_date':'2030-05-01','updated_at':'2030-01-01T00:00:00Z'}})
        retry=await self.add(body,key)
        self.assertEqual(retry.status_code,409,retry.text)
        kept=await server.db.reviews.find_one({'review_id':review['review_id']})
        self.assertEqual(kept['due_date'],'2030-05-01')
        self.assertEqual(await server.db.risks.count_documents({}),1)

    async def test_selected_vendor_change_during_child_prevents_completion(self):
        await server.db.vendors.insert_one({'vendor_id':'selected','client_id':'a','name':'Selected','status':'active','updated_at':'v1'})
        body=self.payload();body['vendor'].update(mode='link',id='selected',expected_updated_at='v1')
        original=server._create_entity
        async def concurrent_change(*args,**kwargs):
            result=await original(*args,**kwargs)
            await server.db.vendors.update_one({'vendor_id':'selected'},{'$set':{'status':'inactive','updated_at':'v2'}})
            return result
        with patch.object(server,'_create_entity',concurrent_change):
            response=await self.add(body)
        self.assertEqual(response.status_code,409,response.text)
        self.assertNotEqual(response.headers.get('x-create-rejected'),'true')
        vendor=await server.db.vendors.find_one({'vendor_id':'selected'})
        self.assertEqual(vendor['status'],'inactive')
        self.assertIsNone(await server.db.create_requests.find_one({'route':'ai_systems/onboard','state':'complete'}))

    async def test_all_presets_and_material_change_projection(self):
        for index,tool in enumerate(CATALOG['tools']):
            body=self.payload();body['ai'].update(catalog_key=ai_onboarding.CATALOG_KEYS[index],name=tool['name'],provider=tool['provider'],environment=tool['plan'],description=tool['purpose'],purposes=tool['uses'],data_types=tool['data'],permitted_data_types=tool['permitted'],access=tool['access'])
            body['screening']['answers']=dict(zip([q['id'] for q in CATALOG['questions']],[None if value=='Not sure' else value=='Yes' for value in tool['answers']]))
            from ai_governance import AIInput
            likelihood,impact=ai_onboarding.proposed_rating(AIInput(client_id='a',**body['ai']),body['screening']['answers'])
            body['risk'].update(likelihood=likelihood,impact=impact)
            response=await self.add(body)
            self.assertEqual(response.status_code,200,response.text)
            self.assertTrue(response.json()['ai_system']['screening_complete'])
        row=response.json()['ai_system']
        changed=await self.client.patch('/api/ai_systems/'+row['ai_system_id'],json={'description':'Materially different use','expected_updated_at':row['updated_at']})
        self.assertEqual(changed.status_code,200,changed.text)
        self.assertTrue(changed.json()['screening_requires_reassessment'])
        self.assertFalse(changed.json()['screening_complete'])
        self.assertEqual(changed.json()['onboarding_screening']['answers'],body['screening']['answers'])

    async def test_screening_review_preserves_provenance_and_requires_current_version(self):
        created=await self.add()
        self.assertEqual(created.status_code,200,created.text)
        row=created.json()['ai_system']; aid=row['ai_system_id']
        original=copy.deepcopy(row['onboarding_screening'])
        review={**self.payload()['screening'],'reviewed':True}
        review['answers']['managed']=not review['answers']['managed']
        body={'expected_updated_at':row['updated_at'],'onboarding_screening':review}
        contradictory={**body,'data_types':['No Sensitive Data','PII']}
        self.assertEqual((await self.client.patch('/api/ai_systems/'+aid,json=contradictory)).status_code,422)
        saved=await self.client.patch('/api/ai_systems/'+aid,json=body)
        self.assertEqual(saved.status_code,200,saved.text)
        current=await server.db.ai_systems.find_one({'ai_system_id':aid})
        screening=current['onboarding_screening']
        self.assertEqual(current['created_at'],row['created_at'])
        self.assertEqual(screening['recorded_at'],original['recorded_at'])
        self.assertEqual(screening['recorded_by'],original['recorded_by'])
        self.assertEqual(screening['history'],[original])
        self.assertEqual(screening['answers'],review['answers'])
        self.assertTrue(screening['reviewed_at'])
        self.assertEqual(current['approval_status'],'pending_assessment')
        self.assertEqual((await self.client.patch('/api/ai_systems/'+aid,json=body)).status_code,409)
        body['expected_updated_at']=current['updated_at']; body['onboarding_screening']['recorded_by']='forged'
        self.assertEqual((await self.client.patch('/api/ai_systems/'+aid,json=body)).status_code,422)
        omitted=await self.client.patch('/api/ai_systems/'+aid,json={'expected_updated_at':current['updated_at'],'name':'Renamed system'})
        self.assertEqual(omitted.status_code,200,omitted.text)
        after=await server.db.ai_systems.find_one({'ai_system_id':aid})
        self.assertEqual(after['onboarding_screening'],screening)

    async def test_rejected_review_cannot_retire_or_cancel_native_review(self):
        created=(await self.add()).json();row=created['ai_system']
        review={**self.payload()['screening'],'reviewed':False}
        rejected=await self.client.patch('/api/ai_systems/'+row['ai_system_id'],json={'expected_updated_at':row['updated_at'],'status':'retired','onboarding_screening':review})
        self.assertEqual(rejected.status_code,422,rejected.text)
        current=await server.db.ai_systems.find_one({'ai_system_id':row['ai_system_id']})
        scheduled=await server.db.reviews.find_one({'review_id':created['review_id']})
        self.assertEqual(current['status'],row['status'])
        self.assertEqual(current['updated_at'],row['updated_at'])
        self.assertEqual(scheduled['status'],'upcoming')
        self.assertEqual(scheduled['recurrence'],'annual')

    async def test_native_alerts_use_versioned_answers_and_preserve_legacy_classifications(self):
        from ai_governance import projection
        row={'ai_system_id':'ai','client_id':'a','status':'active','purposes':['Document Drafting'],'data_types':['Public'],'screening':{'consequential':False,'sensitive':False,'third_party':True}}
        row['onboarding_screening']={'schema_version':1,'catalog_version':CATALOG['reviewedOn'],'scope':ai_onboarding.screening_scope(row),'answers':{'consequential':True,'sensitive':True}}
        def alerts(value):return {alert['key'] for alert in projection(value,[],[])['alerts']}
        self.assertTrue({'oversight','sensitive','vendor'}<=alerts(row))
        row['screening'].update(consequential=True,sensitive=True)
        row['onboarding_screening']['answers'].update(consequential=False,sensitive=False)
        self.assertNotIn('oversight',alerts(row));self.assertNotIn('sensitive',alerts(row));self.assertIn('vendor',alerts(row))
        self.assertIn('oversight',alerts({**row,'screening':{**row['screening'],'employment':True}}))
        self.assertIn('oversight',alerts({**row,'purposes':['HR / Employment']}))
        legacy={**row};legacy.pop('onboarding_screening')
        self.assertTrue({'oversight','sensitive','vendor'}<=alerts(legacy))
        row['onboarding_screening']['schema_version']=2
        self.assertTrue({'oversight','sensitive','screening'}<=alerts(row))
