import json
from test_client_dashboard_sources import ClientDashboardSourcesTests, server


class EvidenceLibraryTests(ClientDashboardSourcesTests):
    async def upload(self, **fields):
        r=await self.client.post('/api/evidence',json={'client_id':'a','filename':'proof.txt','content_base64':'VEVTVA==',**fields})
        self.assertEqual(r.status_code,200,r.text)
        return r.json()

    async def link(self,e,kind,ident,**fields):
        r=await self.client.post('/api/evidence-library/items/'+e['evidence_id']+'/relationships',json={
            'linked_type':kind,'linked_id':ident,'expected_updated_at':e.get('updated_at'),**fields})
        return r

    async def test_three_links_unlink_preserves_file_and_authorization(self):
        self.sign_in('admin')
        for kind,key in [('findings','finding_id'),('vendors','vendor_id'),('risks','risk_id')]:
            await server.db[kind].insert_one({key:kind,'client_id':'a','title':kind,'name':kind,'status':'open'})
        e=await self.upload(linked_type='vendors',linked_id='vendors')
        first=await self.link(e,'findings','findings');self.assertEqual(first.status_code,200,first.text);e=first.json()
        second=await self.link(e,'risks','risks');self.assertEqual(second.status_code,200,second.text);e=second.json()
        self.assertEqual(len(e['references']),3)
        self.assertEqual(await server.db.evidence.count_documents({}),1)
        removed=await self.link(e,'findings','findings',remove=True);self.assertEqual(removed.status_code,200,removed.text)
        self.assertEqual(len(removed.json()['references']),2)
        await server.db.risks.update_one({'risk_id':'risks'},{'$set':{'status':'closed'}})
        self.assertEqual((await self.link(removed.json(),'risks','risks',remove=True)).status_code,409)
        self.assertEqual((await self.client.get('/api/evidence/'+e['evidence_id']+'/download')).json()['content_base64'],'VEVTVA==')
        audit=(await self.client.get('/api/evidence-library/items/'+e['evidence_id']+'/activity')).json()
        self.assertIn('Evidence relationship removed',[x['action'] for x in audit['items']])
        await server.db.risks.insert_one({'risk_id':'foreign','client_id':'b','title':'SECRET'})
        self.assertEqual((await self.link(removed.json(),'risks','foreign')).status_code,422)
        self.sign_in('member')
        self.assertEqual((await self.client.get('/api/evidence-library/sources',params={'client_id':'b','kind':'risks'})).status_code,403)
        self.assertEqual((await self.client.delete('/api/evidence/'+e['evidence_id'])).status_code,403)
        await server.db.users.update_one({'user_id':'member'},{'$set':{'role':'client_readonly'}})
        self.assertEqual((await self.link(removed.json(),'findings','findings')).status_code,403)

    async def test_four_quarters_shared_vendor_file_and_next_year_preserve_snapshots(self):
        self.sign_in('admin')
        review=(await self.client.post('/api/reviews',json={'client_id':'a','title':'Access Review','review_type':'access','recurrence':'quarterly','due_date':'2027-03-31'})).json()
        await server.db.vendors.insert_one({'vendor_id':'v','client_id':'a','name':'CloudCore','status':'active'})
        e=await self.upload(linked_type='vendor',linked_id='v')
        ids=[]
        for quarter in range(1,5):
            oid=review['current_occurrence_id'];ids.append(oid)
            if quarter==1:
                r=await self.link(e,'reviews',review['review_id'],occurrence_id=oid);self.assertEqual(r.status_code,200,r.text);e=r.json()
            else: await self.upload(filename=f'Q{quarter}.txt',linked_type='review',linked_id=review['review_id'],occurrence_id=oid)
            completed=await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':oid})
            self.assertEqual(completed.status_code,200,completed.text)
            self.assertEqual(len(completed.json()['occurrence']['evidence']),1)
            review=completed.json()['review']
        sets=(await self.client.get('/api/evidence-library/reviews/'+review['review_id']+'/sets',params={'year':'2027'})).json()
        self.assertEqual({o['period'] for o in sets['items']},{'Q1 2027','Q2 2027','Q3 2027','Q4 2027'})
        self.assertEqual(sets['total'],4)
        for oid in ids:
            catalog=(await self.client.get('/api/evidence/catalog',params={'client_id':'a','entity_type':'reviews','entity_id':review['review_id'],'occurrence_id':oid})).json()
            self.assertEqual(catalog['total'],1)
        current=(await self.client.get('/api/evidence/catalog',params={'client_id':'a','entity_type':'reviews','entity_id':review['review_id']})).json()
        self.assertEqual(current['total'],0)
        self.assertEqual((await self.client.delete('/api/evidence/'+e['evidence_id'])).status_code,409)
        self.assertEqual((await self.link(e,'reviews',review['review_id'],occurrence_id=ids[0],remove=True)).status_code,409)
        self.assertEqual(await server.db.evidence.count_documents({}),4)

    async def test_legacy_unassigned_metadata_conflict_filters_and_policy_retention(self):
        self.sign_in('admin')
        e=await self.upload()
        path='/api/evidence-library/items/'+e['evidence_id']
        self.assertEqual((await self.client.patch(path,json={'display_name':'No token'})).status_code,428)
        patch={'expected_updated_at':None,'display_name':'Assurance 2027','evidence_type':'Report','expiration_date':'2027-01-01'}
        r=await self.client.patch(path,json=patch);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual((await self.client.patch(path,json=patch)).status_code,409)
        self.assertEqual((await self.client.patch(path,json={'expected_updated_at':r.json()['updated_at'],'evidence_date':'2027-02-30'})).status_code,422)
        catalog=(await self.client.get('/api/evidence/catalog',params={'client_id':'a','q':'Assurance','today':'2027-02-01','state':json.dumps({'filters':{'program_areas':['Unassigned'],'evidence_type':['Report'],'refresh_status':['Expired / refresh overdue']}})})).json()
        self.assertEqual(catalog['total'],1)
        await server.db.policies.insert_one({'policy_id':'p','client_id':'a','title':'Risk Management Policy','approval_source':{'evidence_id':e['evidence_id']}})
        detail=(await self.client.get(path)).json()
        self.assertEqual(detail['references'][0]['title'],'Risk Management Policy')
        # Existing Policy contract archives inventory but retains downloadable bytes.
        self.assertEqual((await self.client.delete('/api/evidence/'+e['evidence_id'])).status_code,200)
        self.assertEqual((await self.client.get('/api/evidence/'+e['evidence_id']+'/download')).status_code,200)

    async def test_supporting_policy_approval_cannot_be_unlinked_and_sources_are_bounded(self):
        self.sign_in('admin');e=await self.upload()
        await server.db.policies.insert_one({'policy_id':'p','client_id':'a','title':'Policy'})
        e=(await self.link(e,'policies','p')).json()
        await server.db.policies.update_one({'policy_id':'p'},{'$set':{'approval_source':{'evidence_id':e['evidence_id']}}})
        self.assertEqual((await self.link(e,'policies','p',remove=True)).status_code,409)
        await server.db.risks.insert_many([{'risk_id':f'r{i:02}','client_id':'a','title':f'Risk {i}'} for i in range(31)])
        pages=[(await self.client.get('/api/evidence-library/sources',params={'client_id':'a','kind':'risks','page':p})).json() for p in (1,2)]
        self.assertEqual([len(p['items']) for p in pages],[25,6])
        self.assertEqual(len({r['id'] for p in pages for r in p['items']}),31)
        self.assertEqual((await server.db.evidence.find_one({'evidence_id':e['evidence_id']}))['content_base64'],'VEVTVA==')

    async def test_framework_and_vendor_existing_references_are_projected_not_migrated(self):
        self.sign_in('admin');e=await self.upload()
        await server.db.vendors.insert_one({'vendor_id':'v','client_id':'a','name':'CloudCore','assurance_records':[{'evidence_ids':[e['evidence_id']]}]})
        await server.db.framework_assessments.insert_one({'framework_assessment_id':'a1','client_id':'a','framework_key':'cis-ig1','definition_id':'6.3','related_links':[{'kind':'evidence','id':e['evidence_id']}]})
        catalog=(await self.client.get('/api/evidence/catalog',params={'client_id':'a'})).json()
        self.assertEqual(set(catalog['items'][0]['program_areas']),{'Frameworks','Vendors'})
        self.assertEqual(await server.db.evidence.count_documents({}),1)
        self.assertNotIn('relationships',await server.db.evidence.find_one({'evidence_id':e['evidence_id']}))

    async def test_direct_policy_archive_retains_catalog_history_and_scoped_read_routes(self):
        self.sign_in('admin')
        await server.db.policies.insert_one({'policy_id':'p','client_id':'a','title':'Policy'})
        e=await self.upload(linked_type='policy',linked_id='p')
        await server.db.policies.update_one({'policy_id':'p'},{'$set':{'approval_source':{'evidence_id':e['evidence_id']}}})
        self.assertEqual((await self.client.delete('/api/evidence/'+e['evidence_id'])).status_code,200)
        params={'client_id':'a','entity_type':'policies','entity_id':'p'}
        catalog=(await self.client.get('/api/evidence/catalog',params=params)).json()
        self.assertEqual(catalog['total'],1)
        self.assertEqual(catalog['items'][0]['references'][0]['document_context'],'Current approval document')
        foreign=await self.upload(client_id='b',filename='foreign.txt')
        self.sign_in('member')
        for suffix in ('','/activity'):
            self.assertEqual((await self.client.get('/api/evidence-library/items/'+foreign['evidence_id']+suffix)).status_code,403)
        self.assertEqual((await self.client.get('/api/evidence/'+foreign['evidence_id']+'/download')).status_code,403)
        self.assertEqual((await self.client.patch('/api/evidence-library/items/'+foreign['evidence_id'],json={'expected_updated_at':None,'notes':'blocked'})).status_code,403)

    async def test_framework_relationship_remains_owned_by_assessment(self):
        self.sign_in('admin');e=await self.upload()
        await server.db.framework_assessments.insert_one({'framework_assessment_id':'a1','client_id':'a','framework_key':'cis-ig1','definition_id':'6.3','related_links':[]})
        path='/api/framework_assessments/a1/links';body={'kind':'evidence','id':e['evidence_id']}
        self.assertEqual((await self.link(e,'framework_assessments','a1')).status_code,422)
        self.assertEqual((await self.client.post(path,json=body)).status_code,200)
        detail=(await self.client.get('/api/evidence-library/items/'+e['evidence_id'])).json()
        self.assertEqual(detail['references'][0]['origin'],'module')
        self.assertEqual((await self.client.request('DELETE',path,json=body)).status_code,200)
        self.assertEqual((await self.client.get('/api/evidence-library/items/'+e['evidence_id'])).json()['references'],[])
        self.assertEqual((await self.client.get('/api/evidence/'+e['evidence_id']+'/download')).status_code,200)
