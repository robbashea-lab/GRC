"""Canonical policy mapping saves through the actual native assessment routes."""
from copy import deepcopy
import unittest
import test_framework_governance as framework_fixture
server = framework_fixture.server
from framework_catalog import CATALOGS


class NordicPolicyLinkTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp = framework_fixture.FrameworkTests.asyncSetUp
    sign_in = framework_fixture.FrameworkTests.sign_in
    body = framework_fixture.FrameworkTests.body
    configure = framework_fixture.FrameworkTests.configure

    async def test_clear_replace_reload_and_live_policy_metadata_all_frameworks(self):
        await self.configure(self.body(programs=tuple(CATALOGS)))
        await server.db.policies.insert_one({'policy_id':'canonical-replacement','client_id':'a','title':'Current title','version':'2','status':'draft'})
        for key,catalog in CATALOGS.items():
            workspace=(await self.client.get('/api/frameworks/'+key,params={'client_id':'a'})).json()
            row=next((row for row in workspace['assessments'] if any(row['definition_id'] in mapping['safeguards'] for mapping in catalog['policy_mappings'])),workspace['assessments'][0])
            aid=row['framework_assessment_id'];path='/api/framework_assessments/'+aid
            mapping=next((mapping for mapping in catalog['policy_mappings'] if row['definition_id'] in mapping['safeguards']),None)
            legacy='legacy-'+key
            provenance={'baseline_key':mapping['policy_key']} if mapping else {'framework_assessment_id':aid}
            # CMMC deliberately has no catalog policy mappings; retain an explicit native association.
            await server.db.policies.insert_one({'policy_id':legacy,'client_id':'a',**provenance,'title':'Recorded onboarding policy','status':'needs_verification'})
            self.assertIn(legacy,[policy['policy_id'] for policy in (await self.client.get(path+'/related')).json()['policies']])
            before=deepcopy(await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))
            token=before.get('last_saved') or before.get('last_assessed')
            cleared=await self.client.patch(path,json={'policy_link_ids':[],'expected_last_assessed':token})
            self.assertEqual(cleared.status_code,200,cleared.text)
            self.assertEqual((await self.client.get(path+'/related')).json()['policies'],[])
            after=(await self.client.get(path)).json()
            for field in ('last_assessed','assessed_by','status','implementation','assessment_history','related_links'):
                self.assertEqual(after.get(field),before.get(field),field)
            replacement=await self.client.patch(path,json={'policy_link_ids':['canonical-replacement'],'expected_last_assessed':after['last_saved']})
            self.assertEqual(replacement.status_code,200,replacement.text)
            current=(await self.client.get(path+'/related')).json()['policies']
            self.assertEqual([(policy['policy_id'],policy['title'],policy['version'],policy['status']) for policy in current],[('canonical-replacement','Current title','2','draft')])
            response=await self.client.get('/api/related',params={'entity_type':'policies','entity_id':legacy})
            self.assertEqual(response.status_code,200,response.text)
            reverse=response.json()['framework_assessments']
            self.assertNotIn(aid,[item['framework_assessment_id'] for item in reverse])
            response=await self.client.get('/api/related',params={'entity_type':'policies','entity_id':'canonical-replacement'})
            self.assertEqual(response.status_code,200,response.text)
            reverse=response.json()['framework_assessments']
            self.assertIn(aid,[item['framework_assessment_id'] for item in reverse])
        await server.db.policies.update_one({'policy_id':'canonical-replacement'},{'$set':{'title':'Renamed policy','version':'3','status':'retired'}})
        current=(await self.client.get(path+'/related')).json()['policies'][0]
        self.assertEqual((current['title'],current['version'],current['status']),('Renamed policy','3','retired'))

    async def test_foreign_stale_duplicate_role_and_retired_scope_leave_records_intact(self):
        row=(await self.configure())['assessments'][0];aid=row['framework_assessment_id'];path='/api/framework_assessments/'+aid
        await server.db.policies.insert_many([{'policy_id':'local','client_id':'a','title':'Local','status':'draft'},{'policy_id':'foreign','client_id':'b','title':'Private','status':'draft'}])
        before=deepcopy(await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))
        token=before.get('last_saved') or before.get('last_assessed')
        for ids in (['foreign'],['missing'],None):
            response=await self.client.patch(path,json={'policy_link_ids':ids,'expected_last_assessed':token})
            self.assertEqual(response.status_code,422,response.text)
        self.assertEqual(before,await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))
        body={'policy_link_ids':['local'],'expected_last_assessed':token}
        saved=await self.client.patch(path,json=body);self.assertEqual(saved.status_code,200,saved.text)
        accepted=deepcopy(await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))
        retry=await self.client.patch(path,json=body);self.assertEqual(retry.status_code,409,retry.text)
        stale=await self.client.patch(path,json={'policy_link_ids':[],'expected_last_assessed':token});self.assertEqual(stale.status_code,409,stale.text)
        self.assertEqual(accepted,await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))
        self.sign_in('member')
        denied=await self.client.patch(path,json={'policy_link_ids':[],'expected_last_assessed':accepted['last_saved']});self.assertEqual(denied.status_code,403,denied.text)
        self.sign_in('admin')
        await server.db.requirements.update_one({'client_id':'a','baseline_key':'cis-ig1'},{'$set':{'baseline_response':'does_not_apply'}})
        denied=await self.client.patch(path,json={'policy_link_ids':[],'expected_last_assessed':accepted['last_saved']});self.assertEqual(denied.status_code,409,denied.text)
        self.assertEqual(accepted,await server.db.framework_assessments.find_one({'framework_assessment_id':aid}))

    async def test_review_subject_context_uses_stable_same_client_identities(self):
        row=(await self.configure())['assessments'][0];aid=row['framework_assessment_id']
        for kind,field in (('risks','risk_id'),('vendors','vendor_id'),('ai_systems','ai_system_id')):
            await server.db[kind].insert_many([{field:'local-'+kind,'client_id':'a','title':'Same display title','name':'Same display title','status':'draft'},
                {field:'foreign-'+kind,'client_id':'b','title':'Same display title','name':'Same display title','status':'approved'}])
        for prefix in ('local','foreign'):
            await server.db.reviews.insert_one({'review_id':prefix+'-subject-review','client_id':'a','title':'Unrelated title','framework_key':row['framework_key'],
                'framework_safeguards':[row['definition_id']],'status':'needs_scheduling','risk_id':prefix+'-risks','vendor_id':prefix+'-vendors','ai_system_id':prefix+'-ai_systems'})
        related=(await self.client.get('/api/framework_assessments/'+aid+'/related')).json()
        for kind,field in (('risks','risk_id'),('vendors','vendor_id'),('ai_systems','ai_system_id')):
            self.assertEqual([subject[field] for subject in related[kind]],['local-'+kind])
            self.assertEqual(related[kind][0]['status'],'draft')


class NordicPolicyReportTests(unittest.IsolatedAsyncioTestCase):
    # Reuse the existing report route fixtures without importing their unittest class.
    import test_r4_reports as report_fixture
    asyncSetUp = report_fixture.R4ReportRouteTests.asyncSetUp
    sign_in = report_fixture.R4ReportRouteTests.sign_in
    prepare = report_fixture.R4ReportRouteTests.prepare
    params = report_fixture.R4ReportRouteTests.params
    export = report_fixture.R4ReportRouteTests.export

    async def test_policy_report_exports_preserve_direct_provenance_and_canonical_clear(self):
        import csv
        import io
        _,rows=await self.prepare()
        row=rows[0];aid=row['framework_assessment_id'];did=row['definition_id']
        # Report fixtures omit editor-only fields; retain the native PATCH contract.
        await server.db.framework_assessments.update_one({'framework_assessment_id':aid},
            {'$set':{'technology':'','notes':'','na_rationale':''}})
        await server.db.policies.insert_one({'policy_id':'direct-report-policy','client_id':'a','framework_assessment_id':aid,
            'title':'Direct policy provenance','status':'draft','version':'7'})
        preview=await self.client.get('/api/reports/preview',params=self.params('policies'))
        self.assertEqual(preview.status_code,200,preview.text)
        self.assertEqual(preview.json()['sections'][0]['rows'],[['Direct policy provenance','draft','7',None,did]])
        exported=await self.export('policies','csv','nordic-direct-policy-report')
        self.assertEqual(exported.status_code,200,exported.text)
        download=await self.client.get(exported.json()['download_url'])
        self.assertEqual(download.status_code,200,download.text)
        cells=list(csv.reader(io.StringIO(download.content.decode('utf-8-sig'))))
        self.assertIn(['Direct policy provenance','draft','7','',did],cells)
        current=(await self.client.get('/api/framework_assessments/'+aid)).json()
        cleared=await self.client.patch('/api/framework_assessments/'+aid,json={'policy_link_ids':[],
            'expected_last_assessed':current.get('last_saved') or current.get('last_assessed')})
        self.assertEqual(cleared.status_code,200,cleared.text)
        after=await self.client.get('/api/reports/preview',params=self.params('policies'))
        self.assertEqual(after.status_code,200,after.text)
        self.assertEqual(after.json()['sections'][0]['rows'],[['Direct policy provenance','draft','7',None,None]])
        retained=await self.client.get(exported.json()['download_url'])
        self.assertEqual(retained.content,download.content)
