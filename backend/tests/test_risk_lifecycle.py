from unittest.mock import patch
from test_client_dashboard_sources import ClientDashboardSourcesTests, server


class RiskLifecycleTests(ClientDashboardSourcesTests):
    async def test_omitted_reassessment_preserves_saved_decisions_and_native_history(self):
        cases = [('missing', {}, 'admin'), ('null', {'treatment': None, 'assessment_rationale': None}, 'admin'),
                 ('blank', {'treatment': '', 'assessment_rationale': ''}, 'admin'),
                 ('legacy-monitor', {'treatment': 'monitor'}, 'admin'),
                 ('assigned-contributor', {'treatment': '', 'assessment_rationale': None}, 'member')]
        for name, fields, actor in cases:
            with self.subTest(name=name):
                self.sign_in('admin')
                created = await self.client.post('/api/risks', json={
                    'title': 'Synthetic unchanged ' + name, 'client_id': 'a', 'owner_id': 'member',
                    'likelihood_score': 3, 'impact_score': 2, 'next_review': '2099-10-27',
                    'review_cadence': 'annual', **fields})
                self.assertEqual(created.status_code, 200, created.text)
                risk = created.json()
                review = (await self.client.post('/api/risks/' + risk['risk_id'] + '/review')).json()['review']
                before = await server.db.risks.find_one({'risk_id': risk['risk_id']})
                self.sign_in(actor)
                path = '/api/reviews/' + review['review_id'] + '/complete'
                body = {'occurrence_id': review['current_occurrence_id'], 'risk_assessment': {},
                        'risk_outcome': 'Reviewed — No Change'}
                response = await self.client.post(path, json=body)
                self.assertEqual(response.status_code, 200, response.text)
                completed = response.json()['occurrence']
                self.assertEqual(completed['outcome'], 'Reviewed — No Change')
                self.assertEqual(completed['risk_after'], completed['risk_before'])
                self.assertEqual(completed['completed_by'], actor)
                after = await server.db.risks.find_one({'risk_id': risk['risk_id']})
                for key in ('risk_id', 'client_id', 'created_at', 'created_by', 'date_identified',
                            'owner_id', 'status', 'treatment', 'assessment_rationale',
                            'likelihood_score', 'impact_score', 'risk_score', 'risk_level',
                            'acceptance_date', 'accepted_by', 'acceptance_rationale'):
                    self.assertEqual(after.get(key), before.get(key), key)
                self.assertEqual(after['last_reviewed'], completed['completed_at'])
                self.assertEqual(after['next_review'][:10], '2100-10-27')
                replay = await self.client.post(path, json=body)
                self.assertEqual(replay.status_code, 200, replay.text)
                self.assertEqual(replay.json()['occurrence'], completed)
                saved = await server.db.reviews.find_one({'review_id': review['review_id']})
                self.assertEqual(len(saved['occurrences']), 1)

    async def test_omitted_treatment_retains_an_intervening_authorized_decision(self):
        self.sign_in('admin')
        risk = (await self.client.post('/api/risks', json={
            'title': 'Synthetic concurrent treatment', 'client_id': 'a', 'treatment': '',
            'likelihood_score': 3, 'impact_score': 2, 'next_review': '2099-10-27'})).json()
        review = (await self.client.post('/api/risks/' + risk['risk_id'] + '/review')).json()['review']
        await self.client.post('/api/reviews/' + review['review_id'] + '/start',
                               json={'occurrence_id': review['current_occurrence_id']})
        changed = await self.client.patch('/api/risks/' + risk['risk_id'], json={'treatment': 'monitor'})
        self.assertEqual(changed.status_code, 200, changed.text)
        response = await self.client.post('/api/reviews/' + review['review_id'] + '/complete', json={
            'occurrence_id': review['current_occurrence_id'], 'risk_assessment': {},
            'risk_outcome': 'Reviewed — No Change'})
        self.assertEqual(response.status_code, 200, response.text)
        completed = response.json()['occurrence']
        self.assertEqual(completed['risk_before']['treatment'], risk['treatment'])
        self.assertEqual(completed['risk_after']['treatment'], 'monitor')
        self.assertEqual(completed['outcome'], 'Treatment Updated')
        after = await server.db.risks.find_one({'risk_id': risk['risk_id']})
        self.assertEqual(after['treatment'], 'monitor')
        self.assertEqual(after['risk_score'], 6)
        self.assertEqual(after['created_at'], risk['created_at'])
        self.assertEqual(after['date_identified'], risk['date_identified'])

    async def test_admin_schedule_override_is_validated_preserved_and_replay_safe(self):
        self.sign_in('admin')
        risk=(await self.client.post('/api/risks',json={'title':'Synthetic override','client_id':'a','owner_id':'member','next_review':'2026-11-02','review_cadence':'annual'})).json()
        review=(await self.client.post('/api/risks/'+risk['risk_id']+'/review')).json()['review']
        path='/api/reviews/'+review['review_id']+'/complete'
        payload={'occurrence_id':review['current_occurrence_id'],'risk_next_review':'2090-01-01'}
        self.sign_in('member')
        self.assertEqual((await self.client.post(path,json=payload)).status_code,403)
        self.sign_in('admin')
        for value in ('2026-02-30','2000-01-01','2090-01-01T00:00:00Z'):
            self.assertEqual((await self.client.post(path,json={**payload,'risk_next_review':value})).status_code,422)
        done=await self.client.post(path,json=payload)
        self.assertEqual(done.status_code,200,done.text)
        self.assertEqual(done.json()['occurrence']['next_review_override'],'2090-01-01')
        self.assertEqual(done.json()['review']['due_date'],'2090-01-01')
        replay=await self.client.post(path,json=payload)
        self.assertEqual(replay.json()['occurrence'],done.json()['occurrence'])
        self.assertEqual((await server.db.risks.find_one({'risk_id':risk['risk_id']}))['next_review'],'2090-01-01')

    async def test_review_completion_reassessment_acceptance_closure(self):
        self.sign_in('admin')
        created = await self.client.post('/api/risks',json={'title':'Ransomware disruption to core systems','client_id':'a',
            'likelihood_score':3,'impact_score':4,'owner_id':'member','next_review':'2026-11-02','review_cadence':'annual','treatment':'mitigate'})
        self.assertEqual(created.status_code,200,created.text)
        risk = created.json()
        route = '/api/risks/'+risk['risk_id']
        self.assertEqual(risk['status'],'assessed')
        self.assertEqual(risk['risk_level'],'high')
        review = (await self.client.post(route+'/review')).json()['review']
        self.assertEqual((await self.client.post(route+'/review')).json()['review']['review_id'],review['review_id'])
        self.assertEqual(await server.db.reviews.count_documents({'risk_id':risk['risk_id']}),1)
        self.sign_in('member')
        with patch.object(server,'_now',return_value='2026-11-18T12:00:00+00:00'):
            complete = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={
                'occurrence_id':review['current_occurrence_id'],'risk_assessment':{'likelihood_score':4}})
        self.assertEqual(complete.status_code,200,complete.text)
        updated = await server.db.risks.find_one({'risk_id':risk['risk_id']})
        self.assertEqual(updated['last_reviewed'],'2026-11-18T12:00:00+00:00')
        self.assertEqual(updated['next_review'][:10],'2027-11-02')
        self.assertEqual(updated['risk_score'],16)
        self.assertEqual(updated['risk_level'],'critical')
        history = (await self.client.get(route+'/review-history')).json()
        self.assertEqual(history[0]['risk_before']['risk_score'],12)
        self.assertEqual(history[0]['risk_after']['risk_score'],16)
        self.assertEqual((await self.client.get(route+'/activity')).status_code,200)
        self.assertEqual((await self.client.post(route+'/close',json={'reason':'remediated'})).status_code,403)
        self.sign_in('admin')
        self.assertEqual((await self.client.post(route+'/accept',json={'rationale':'Controlled exposure','expiry_date':'2099-01-01'})).status_code,200)
        accepted = await server.db.risks.find_one({'risk_id':risk['risk_id']})
        self.assertEqual(accepted['last_reviewed'],updated['last_reviewed'])
        closed = await self.client.post(route+'/close',json={'reason':'remediated'})
        self.assertEqual(closed.status_code,200,closed.text)
        linked = await server.db.reviews.find_one({'review_id':review['review_id']})
        self.assertEqual(linked['status'],'cancelled')
        self.assertEqual(len(linked['occurrences']),1)
        self.assertEqual((await self.client.delete(route)).status_code,409)
        self.assertEqual((await self.client.patch(route,json={'status':'assessed'})).status_code,409)
        self.assertEqual((await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={
            'occurrence_id':linked['current_occurrence_id'],'risk_assessment':{},
            'risk_outcome':'Reviewed — No Change'})).status_code,409)

    async def test_linking_preserves_source_and_rejects_private_provenance(self):
        self.sign_in('admin')
        risk = (await self.client.post('/api/risks',json={'title':'Exposure','client_id':'a'})).json()
        task = (await self.client.post('/api/tasks',json={'title':'Existing work','client_id':'a','source_type':'manual'})).json()
        route = '/api/risks/'+risk['risk_id']
        for _ in range(2):
            linked = await self.client.post(route+'/link-action-item',json={'task_id':task['task_id']})
            self.assertEqual(linked.status_code,200,linked.text)
        self.assertEqual((await server.db.tasks.find_one({'task_id':task['task_id']}))['source_type'],'manual')
        relations = (await self.client.get('/api/related',params={'entity_type':'risks','entity_id':risk['risk_id']})).json()
        self.assertEqual(len(relations['tasks']),1)
        await server.db.vendors.insert_one({'vendor_id':'private','client_id':'b','name':'Private'})
        result = await self.client.post('/api/risks',json={'title':'Bad provenance','client_id':'a','source_type':'vendor','source_id':'private'})
        self.assertEqual(result.status_code,422,result.text)

    async def test_completion_retry_repairs_projection_without_duplicate_history(self):
        self.sign_in('admin')
        risk = (await self.client.post('/api/risks',json={'title':'Exposure','client_id':'a','next_review':'2026-11-02','likelihood_score':3,'impact_score':4})).json()
        review = (await self.client.post('/api/risks/'+risk['risk_id']+'/review')).json()['review']
        original = server.risk_lifecycle.sync_completion
        async def fail_after_commit(database, current):
            if current.get('occurrences'):
                raise RuntimeError('simulated projection interruption')
            return await original(database,current)
        with patch.object(server.risk_lifecycle,'sync_completion',side_effect=fail_after_commit):
            with self.assertRaises(RuntimeError):
                await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
        result = await self.client.post('/api/reviews/'+review['review_id']+'/complete',json={'occurrence_id':review['current_occurrence_id']})
        self.assertEqual(result.status_code,200,result.text)
        updated = await server.db.risks.find_one({'risk_id':risk['risk_id']})
        self.assertEqual(updated['next_review'][:10],'2027-11-02')
        self.assertIsNotNone(updated.get('last_reviewed'))
        self.assertEqual(len((await server.db.reviews.find_one({'review_id':review['review_id']}))['occurrences']),1)

    async def test_owner_and_linked_review_tenant_controls(self):
        self.sign_in('admin')
        await server.db.users.insert_one({'user_id':'private','role':'client_contributor','client_ids':['b'],'status':'active'})
        result = await self.client.post('/api/risks',json={'title':'Bad owner','client_id':'a','owner_id':'private'})
        self.assertEqual(result.status_code,422,result.text)
        risk = (await self.client.post('/api/risks',json={'title':'Private','client_id':'b','next_review':'2026-11-02'})).json()
        foreign_review = (await self.client.post('/api/risks/'+risk['risk_id']+'/review')).json()['review']
        self.sign_in('member')
        for suffix in ['activity','review-history']:
            self.assertEqual((await self.client.get('/api/risks/'+risk['risk_id']+'/'+suffix)).status_code,403)
        self.assertEqual((await self.client.post('/api/risks/'+risk['risk_id']+'/review')).status_code,403)
        self.assertEqual((await self.client.post('/api/reviews/'+foreign_review['review_id']+'/complete',json={
            'occurrence_id':foreign_review['current_occurrence_id'],'risk_assessment':{},
            'risk_outcome':'Reviewed — No Change'})).status_code,403)

    async def test_risk_raised_from_finding_uses_the_category_vocabulary(self):
        self.sign_in('admin')
        finding = (await self.client.post('/api/findings',json={'title':'Backup lock disabled','client_id':'a','severity':'high'})).json()
        raised = await self.client.post('/api/findings/'+finding['finding_id']+'/raise-risk')
        self.assertEqual(raised.status_code,200,raised.text)
        risk = await server.db.risks.find_one({'finding_id':finding['finding_id']})
        self.assertEqual(risk['category'],'compliance')
