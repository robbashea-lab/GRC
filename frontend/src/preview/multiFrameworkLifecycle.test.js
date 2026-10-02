// DEMO — SYNTHETIC DATA. All state below is produced through normal workflows.
import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY,readStore,saveStore} from './store';
import catalog from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS,sharedFrameworkPlans,reviewConfig} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter});
const {setImmediate:yieldEventLoop}=jest.requireActual('timers');
const get=async(path,cid,params={})=>(await api.get(path,{params:{client_id:cid,...params}})).data;
async function write(method,path,body){let r;try{r=await api[method](path,body);}catch(error){console.info('Lifecycle failure context',{date:new Date().toISOString(),path,storeCharacters:sessionStorage.getItem(STORE_KEY)?.length});throw error;}jest.runOnlyPendingTimers();await new Promise(resolve=>yieldEventLoop(resolve));return r.data;}
const post=(p,b)=>write('post',p,b),patch=(p,b)=>write('patch',p,b);
const clock=date=>jest.setSystemTime(new Date(date+'T14:00:00Z'));
const copy=v=>JSON.parse(JSON.stringify(v));
const ap=a=>'/framework_assessments/'+a.framework_assessment_id;
const design=c=>Object.fromEntries(['name','description','frequency','design','owner_id','assessment_ids','related_links'].map(k=>[k,c[k]]));
const cp=c=>'/organizational-controls/'+encodeURIComponent(c.control_id);
beforeEach(async()=>{jest.useFakeTimers({doNotFake:['performance','nextTick','queueMicrotask']});clock('2027-01-01');sessionStorage.clear();localStorage.clear();await post('/demo/enter');});
afterEach(()=>jest.useRealTimers());

test('one organization operates five years across three frameworks without shared conclusions or lost history',async()=>{
  const originals=copy(JSON.parse(sessionStorage.getItem(STORE_KEY)));
  const client=await post('/clients',{name:'Aperture Research — Multi-Framework Reference',industry:'Synthetic research / technology services'}),cid=client.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(catalog.policies.map(p=>[p.key,'yes'])),requirements:Object.fromEntries(FRAMEWORKS.map(f=>[f.key,['cis-ig1','iso-27001','soc-2'].includes(f.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}};
  for(const p of sharedFrameworkPlans(state)){const {conflict,...config}=reviewConfig(state,p);for(const d of p.drivers)state.framework_reviews[d.key]={...config,due_date:'2027-03-31'};}
  await post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  await patch('/clients/'+cid,{status:'active'});
  let reviews=await get('/reviews',cid);
  expect(reviews).toHaveLength(22);expect(reviews.every(r=>r.due_date==='2027-03-31')).toBe(true);
  const baseline=copy((await get('/clients/'+cid+'/profile')).baseline);
  const rows=(await Promise.all(['cis-ig1','iso-27001','soc-2'].map(key=>get('/frameworks/'+key,cid)))).flatMap(w=>w.assessments);
  expect(rows).toHaveLength(212);
  const pick=(key,id)=>rows.find(a=>a.framework_key===key&&a.definition_id===id);
  const mapped=[pick('cis-ig1','5.1'),pick('iso-27001','A.5.18'),pick('soc-2','CC6.2')];
  const access=reviews.find(r=>r.framework_plan_key==='account-authorization');
  expect(access.framework_drivers).toHaveLength(3);
  const owner=(await get('/clients/'+cid+'/assignees')).items[0].user_id;
  // Identity-only test boundary: Demo cannot accept real invitations. No client,
  // GRC record, assessment or history is seeded, and reference users are untouched.
  const replacement={user_id:'qa_aperture_operator',name:'Caroline',email:'caroline@example.test',role:'client_contributor',status:'active',client_ids:[cid]};
  const identityStore=readStore();identityStore.users.push(replacement);saveStore(identityStore);
  for(const r of reviews)await patch('/reviews/'+r.review_id,{owner_id:replacement.user_id,scope:'Synthetic workforce identity service; original scope',expected_occurrence_id:r.current_occurrence_id});
  const policies=await get('/policies',cid);expect(policies).toHaveLength(17);
  expect(new Set(policies.map(p=>p.baseline_key)).size).toBe(17);
  const policy=policies.find(p=>/Access Control/i.test(p.title));
  const policyReview=await post('/reviews',{client_id:cid,title:'Annual Policy Review — Access Control Policy',review_type:'policy',policy_id:policy.policy_id,recurrence:'annual',due_date:'2027-09-30',owner_id:replacement.user_id});
  const policyRelated=await get('/related',cid,{entity_type:'policies',entity_id:policy.policy_id});
  expect(new Set(policyRelated.framework_assessments.map(a=>a.framework_key)).size).toBe(3);
  const risk=await post('/risks',{client_id:cid,title:'Privileged supplier access exceeds approved business need',owner_id:replacement.user_id,likelihood_score:4,impact_score:4,treatment:'mitigate',next_review:'2027-09-30',review_cadence:'annual'});
  const accepted=await post('/risks',{client_id:cid,title:'Time-limited secondary site recovery exposure',owner_id:owner,likelihood_score:2,impact_score:3});
  await post('/risks/'+accepted.risk_id+'/accept',{rationale:'Synthetic management decision; compensating recovery measures reviewed',expiry_date:'2032-01-01'});
  expect((await get('/risks/'+accepted.risk_id)).status).toBe('accepted');
  const mitigated=await post('/risks',{client_id:cid,title:'Retired legacy access path',owner_id:owner,likelihood_score:1,impact_score:2});
  await post('/risks/'+mitigated.risk_id+'/close',{reason:'remediated',note:'Synthetic retirement independently checked'});
  const vendor=await post('/vendors',{client_id:cid,name:'Synthetic Identity Hosting',service:'Workforce identity hosting',criticality:'high',business_owner_id:replacement.user_id,next_review:'2027-09-30',review_frequency:'annual'});
  await post('/vendors',{client_id:cid,name:'Synthetic Office Supplier',service:'Office supplies',criticality:'low',business_owner_id:owner,review_frequency:'annual',next_review:'2027-10-31'});
  const system=await post('/assets',{client_id:cid,name:'Original workforce identity service',status:'active',owner_id:replacement.user_id});
  for(const a of mapped){
    await post(ap(a)+'/links',{kind:'risks',id:risk.risk_id});
    await post(ap(a)+'/links',{kind:'reviews',id:policyReview.review_id});
    await post(ap(a)+'/links',{kind:'vendors',id:vendor.vendor_id});
  }
  const soc2=pick('soc-2','CC6.1');
  for(const [i,a] of [mapped[2],soc2].entries())await patch(ap(a),{management_controls:[{control_id:'AC-01',name:'Access authorization review',description:i?'Review workforce and supplier access':'Review workforce access',frequency:'Quarterly',design:'adequate'}]});
  const sourceAssessments=await Promise.all([mapped[2],soc2].map(a=>get(ap(a))));
  await post('/organizational-controls/migrate',{client_id:cid});
  let control=(await get('/organizational-controls',cid)).items[0];
  expect(control.description).toBe('');expect(control.conflicts).toContain('description');
  control=await patch(cp(control),{...design(control),description:'Review workforce and supplier authorization against approved business needs',owner_id:replacement.user_id,assessment_ids:mapped.map(a=>a.framework_assessment_id),related_links:[{kind:'reviews',id:access.review_id},{kind:'policies',id:policy.policy_id},{kind:'risks',id:risk.risk_id},{kind:'vendors',id:vendor.vendor_id}],resolve_conflicts:true,reconciliation_note:'Both original populations are included; source descriptions retained',expected_updated_at:control.updated_at});
  expect(control.legacy_sources).toHaveLength(4);
  expect(new Set(control.legacy_sources.map(s=>s.value.description)).size).toBe(2);
  for(const a of sourceAssessments)expect((await get(ap(a))).assessment_history).toEqual(a.assessment_history);
  let sharedFinding,sharedAction,firstEvidence,firstObservation,firstSoa,firstOccurrence;
  const occurrences=new Map();
  const soa=pick('iso-27001','A.8.30');
  const planCounts=[];
  for(let year=2027;year<=2031;year++){
    clock(year+'-01-15');
    await patch('/frameworks/soc-2/configuration',{client_id:cid,categories:['security'],system_description:year<2030?'Original workforce identity service':'Replacement identity service and supplier population',period_start:year+'-01-01',period_end:year+'-12-31'});
    const assessed=await patch(ap(soa),year<2030?{status:'not_applicable',soa_applicability:'excluded',soa_justification:'No outsourced development in original boundary'}:{status:'in_progress',soa_applicability:'included',soa_justification:'Replacement service now includes supplier development'});
    firstSoa||=copy(assessed.assessment_history[0]);expect(assessed.assessment_history[0]).toEqual(firstSoa);
    if(year===2030){
      await patch('/assets/'+system.asset_id,{status:'retired'});
      await post('/assets',{client_id:cid,name:'Replacement identity service',status:'active',owner_id:owner});
      const current=await get('/reviews/'+access.review_id);
      await patch('/reviews/'+access.review_id,{recurrence:'monthly',owner_id:owner,scope:'Replacement identity service and supplier population',expected_occurrence_id:current.current_occurrence_id});
      control=await patch(cp(control),{...design(control),description:'Monthly workforce, privileged and supplier authorization review',frequency:'Monthly',owner_id:owner,expected_updated_at:control.updated_at});
      await patch('/vendors/'+vendor.vendor_id,{business_owner_id:owner,service:'Replacement identity service operations'});
    }
    let due,executions=0;
    while((due=(await get('/reviews',cid)).filter(r=>r.due_date&&r.due_date.slice(0,10)<=year+'-12-31'&&!['completed','cancelled'].includes(r.status)).sort((a,b)=>a.due_date.localeCompare(b.due_date))[0])){
      if(++executions>200)throw new Error('Schedule did not advance: '+due.title);
      clock(due.due_date.slice(0,10));if(year===2029)jest.setSystemTime(new Date(Date.now()+12*86400000));
      await post('/reviews/'+due.review_id+'/start',{occurrence_id:due.current_occurrence_id});
      const evidence=await post('/evidence',{client_id:cid,linked_type:'review',linked_id:due.review_id,occurrence_id:due.current_occurrence_id,filename:'DEMO-'+year+'-'+due.review_type+'.txt',mime_type:'text/plain',content_base64:Buffer.from('DEMO - SYNTHETIC DATA. Scope: '+(due.scope||due.title),'utf8').toString('base64')});
      if(due.review_id===access.review_id&&!firstEvidence){
        firstEvidence=copy(evidence);
        await patch('/evidence-library/items/'+evidence.evidence_id,{expiration_date:'2028-12-31',expected_updated_at:evidence.updated_at||null});
        for(const a of mapped)await post(ap(a)+'/links',{kind:'evidence',id:evidence.evidence_id});
        control=await patch(cp(control),{...design(control),related_links:[...control.related_links,{kind:'evidence',id:evidence.evidence_id}],expected_updated_at:control.updated_at});
      }
      if(year===2029&&due.review_id===access.review_id&&!sharedFinding){
        sharedFinding=await post('/reviews/'+due.review_id+'/create-finding',{occurrence_id:due.current_occurrence_id,title:'Privileged access review completed late with unverified supplier rights',description:'DEMO: privileged supplier population not verified by the planned date',remediation_title:'Validate overdue privileged access and correct exceptions',severity:'high'});
        for(const a of mapped)await post(ap(a)+'/links',{kind:'findings',id:sharedFinding.finding_id});
        sharedAction=(await get('/tasks',cid)).find(t=>t.finding_id===sharedFinding.finding_id);
        for(const a of mapped)await post(ap(a)+'/links',{kind:'evidence',id:evidence.evidence_id});
        await post('/evidence-library/items/'+evidence.evidence_id+'/relationships',{linked_type:'findings',linked_id:sharedFinding.finding_id,expected_updated_at:evidence.updated_at||null});
        control=await patch(cp(control),{...design(control),related_links:[...control.related_links,{kind:'findings',id:sharedFinding.finding_id},{kind:'tasks',id:sharedAction.task_id},{kind:'evidence',id:evidence.evidence_id}],expected_updated_at:control.updated_at});
        expect((await get('/evidence-library/items/'+evidence.evidence_id)).references.filter(r=>r.kind==='framework_assessments')).toHaveLength(3);
        await patch('/tasks/'+sharedAction.task_id,{due_date:due.due_date.slice(0,10),assignee_id:replacement.user_id});
        await patch('/findings/'+sharedFinding.finding_id,{owner_id:replacement.user_id});
        const assurance=await post('/evidence',{client_id:cid,linked_type:'vendor',linked_id:vendor.vendor_id,filename:'DEMO-vendor-assurance.txt',mime_type:'text/plain',content_base64:btoa('DEMO - SYNTHETIC DATA')});
        await patch('/vendors/'+vendor.vendor_id,{assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:[assurance.evidence_id],received_at:'2027-01-01',refresh_due:'2028-12-31'}]});
        const isoGap=await post(ap(pick('iso-27001','9.3.1'))+'/findings',{title:'Management review inputs incomplete',description:'ISO management review lacked recorded interested-party input',remediation_title:'Document missing management review input',severity:'medium',request_id:'iso-only-gap'});
        const socGap=await post(ap(pick('soc-2','CC4.1'))+'/findings',{title:'SOC readiness period monitoring narrative incomplete',description:'Readiness narrative does not explain monitoring results across the selected examination period; no other framework conclusion was made.',remediation_title:'Document period-specific monitoring assessment',severity:'medium',request_id:'soc-only-gap'});
        for(const key of ['cis-ig1','iso-27001'])expect(Object.values((await get('/frameworks/'+key,cid)).work).some(w=>w.finding_ids.includes(socGap.finding_id))).toBe(false);
        const vendorReview=(await get('/reviews',cid)).find(r=>r.vendor_id===vendor.vendor_id);
        const vendorGap=await post('/reviews/'+vendorReview.review_id+'/create-finding',{occurrence_id:vendorReview.current_occurrence_id,title:'Supplier assurance expired',description:'Updated assurance and bridge-period coverage not yet received',remediation_title:'Obtain current supplier assurance',severity:'medium',request_id:'vendor-assurance-gap'});
        expect(vendorGap.vendor_id).toBe(vendor.vendor_id);
        expect((await get('/tasks',cid)).filter(t=>t.finding_id===vendorGap.finding_id)).toHaveLength(1);
        const pending=(await get('/tasks',cid)).find(t=>t.finding_id===isoGap.finding_id);
        await patch('/tasks/'+pending.task_id,{status:'done'});
        expect((await get('/findings/'+isoGap.finding_id)).status).toBe('remediated');
        for(const key of ['cis-ig1','soc-2'])expect(Object.values((await get('/frameworks/'+key,cid)).work).some(w=>w.finding_ids.includes(isoGap.finding_id))).toBe(false);
        const dash=await get('/dashboard',cid),portfolio=(await get('/clients/directory')).clients.find(c=>c.client_id===cid);
        expect(dash.kpis.overdue_reviews).toBeGreaterThan(0);expect(dash.kpis.critical_high_findings).toBeGreaterThan(0);expect(dash.kpis.significant_risks).toBeGreaterThan(0);
        for(const metric of ['past_due','due_30d','unassigned'])expect(portfolio[metric]).toBe(dash.management.counts[metric]);
        for(const metric of ['pastDue','due30','materialFindings','significantRisks']){const detail=await get('/dashboard',cid,{detail:metric,limit:100});expect(detail.total).toBe(dash.posture.totals[metric]);expect(new Set(detail.items.map(i=>i.key)).size).toBe(detail.items.length);}
        expect(portfolio.frameworks).toHaveLength(3);expect(portfolio.last_activity).toBeTruthy();
        expect((await get('/evidence-library/items/'+firstEvidence.evidence_id)).expiration_date).toBe('2028-12-31');
      }
      const completed=await post('/reviews/'+due.review_id+'/complete',{occurrence_id:due.current_occurrence_id});
      occurrences.set(completed.occurrence.occurrence_id,copy(completed.occurrence));
      if(due.review_id===access.review_id)firstOccurrence||=copy(completed.occurrence);
      expect(completed.review.current_occurrence_id).not.toBe(due.current_occurrence_id);
    }
    clock(year+'-12-31');
    control=await post(cp(control)+'/observations',{request_id:'period-'+year,expected_updated_at:control.updated_at,period_start:year+'-01-01',period_end:year+'-12-31',operating:year===2029?'gap':'effective',expected_instances:year<2030?4:12,collected_instances:year<2030?4:12,notes:year===2029?'Late execution and supplier exception; records alone did not establish effectiveness':'Synthetic sample review; independently inspected operation in this period'});
    firstObservation||=copy(control.observations[0]);expect(control.observations[0]).toEqual(firstObservation);
    if(year===2030){
      await patch('/tasks/'+sharedAction.task_id,{status:'done'});
      expect((await get('/findings/'+sharedFinding.finding_id)).status).toBe('remediated');
      expect((await get('/tasks/'+sharedAction.task_id)).completed_at).toBeTruthy();
      await post('/findings/'+sharedFinding.finding_id+'/validate',{rationale:'Independently verified sampled supplier rights and corrective operation'});
      expect((await get('/findings/'+sharedFinding.finding_id)).status).toBe('closed');
      for(const a of mapped)expect((await get(ap(a))).status).toBe('not_assessed');
      // Separate synthetic assessor decisions, not a side effect of closing work.
      await patch(ap(mapped[0]),{status:'addressed',implementation:'Synthetic assessor reconciled the account inventory, authorization sample and completed review occurrences for CIS 5.1.'});
      await patch(ap(mapped[1]),{status:'in_progress',soa_applicability:'included',soa_justification:'Access rights require treatment within the expanded supplier scope',implementation:'Access operation inspected; ISO treatment documentation remains incomplete.'});
      await patch(ap(mapped[2]),{status:'needs_attention',implementation:'The revised Control operates, but the assessor has not established sufficient period coverage for this criterion.'});
    }
    if(year===2031)await patch(ap(mapped[2]),{status:'addressed',implementation:'Synthetic readiness assessor inspected the revised design, monthly occurrences and period evidence. This is a criterion-specific readiness judgment, not an audit opinion.'});
    planCounts.push(executions);
    expect((await get('/clients/'+cid+'/profile')).baseline).toEqual(baseline);
    const expected=year<2030?['not_assessed','not_assessed','not_assessed']:['addressed','in_progress',year===2030?'needs_attention':'addressed'];
    for(const [i,a] of mapped.entries())expect((await get(ap(a))).status).toBe(expected[i]);
  }
  reviews=await get('/reviews',cid);
  for(const r of reviews)for(const occurrence of r.occurrences||[])expect(occurrence).toEqual(occurrences.get(occurrence.occurrence_id));
  expect(firstOccurrence.scope).toBe('Synthetic workforce identity service; original scope');
  expect(firstOccurrence.owner_id).toBe(replacement.user_id);expect(firstOccurrence.framework_drivers).toHaveLength(3);
  expect(control.observations).toHaveLength(5);expect(control.observations[0].design_snapshot.frequency).toBe('Quarterly');expect(control.observations[4].design_snapshot.frequency).toBe('Monthly');
  expect((await get('/risks/'+risk.risk_id)).next_review.slice(0,10)).toBe('2032-09-30');
  expect((await get('/vendors/'+vendor.vendor_id)).next_review.slice(0,10)).toBe('2032-09-30');
  const currentPolicy=(await get('/policies',cid)).find(p=>p.policy_id===policy.policy_id);
  expect(currentPolicy.next_review_date.slice(0,10)).toBe('2032-09-30');
  expect(currentPolicy.status).toBe(policy.status); // Review completion is not policy approval.
  expect(reviews.find(r=>r.review_id===policyReview.review_id).occurrences).toHaveLength(5);
  const ids=reviews.map(r=>r.review_id).sort();
  const assessmentHistory=await Promise.all(mapped.map(a=>get(ap(a))));
  await patch('/onboarding/programs/soc-2',{client_id:cid,applicability:'does_not_apply'});
  expect((await get('/frameworks/soc-2',cid)).selected).toBe(false);
  const retained=await get('/reviews/'+access.review_id);expect(retained.framework_driver_active).toBe(true);expect(retained.occurrences[0]).toEqual(firstOccurrence);
  expect(nextDriver(retained,'soc-2').framework_driver_active).toBe(false);
  await patch('/onboarding/programs/soc-2',{client_id:cid,applicability:'applies'});
  expect((await get('/reviews',cid)).map(r=>r.review_id).sort()).toEqual(ids);
  expect((await get('/frameworks/soc-2',cid)).assessments).toHaveLength(33);
  expect((await get('/organizational-controls',cid)).items).toHaveLength(1);
  for(const original of assessmentHistory){const current=await get(ap(original));expect(current.assessment_history).toEqual(original.assessment_history);expect(current.status).toBe(original.status);}
  // One relationship may be removed without deleting the object or historical support.
  await write('delete',ap(mapped[0])+'/links',{data:{kind:'evidence',id:firstEvidence.evidence_id}});
  const evidence=await get('/evidence-library/items/'+firstEvidence.evidence_id);
  expect(evidence.references.filter(r=>r.kind==='framework_assessments')).toHaveLength(2);
  await expect(api.delete('/evidence/'+firstEvidence.evidence_id)).rejects.toBeTruthy();
  await patch('/users/'+replacement.user_id,{status:'disabled'});
  expect((await get('/reviews/'+access.review_id)).occurrences[0]).toEqual(firstOccurrence);
  expect((await get('/clients/'+cid+'/assignees')).items.some(u=>u.user_id===replacement.user_id)).toBe(false);
  const userAssignments=await get('/users/'+replacement.user_id+'/open_assignments');expect(userAssignments.total).toBeGreaterThan(0);
  expect((await get('/dashboard',cid)).kpis.unassigned).toBeGreaterThan(0);
  await expect(api.post('/tasks',{client_id:cid,title:'Invalid assignment',assignee_id:replacement.user_id})).rejects.toBeTruthy();
  for(const r of await get('/reviews',cid))if(r.owner_id===replacement.user_id)await patch('/reviews/'+r.review_id,{owner_id:owner,expected_occurrence_id:r.current_occurrence_id});
  await patch('/risks/'+risk.risk_id,{owner_id:owner});
  for(const t of await get('/tasks',cid))if(t.assignee_id===replacement.user_id&&!['done','cancelled'].includes(t.status))await patch('/tasks/'+t.task_id,{assignee_id:owner});
  for(const f of await get('/findings',cid))if(f.owner_id===replacement.user_id&&!['closed','accepted'].includes(f.status))await patch('/findings/'+f.finding_id,{owner_id:owner});
  expect((await get('/users/'+replacement.user_id+'/open_assignments')).items).toEqual([]);
  // Calendar emits one event per authoritative Review, not one per framework driver.
  const cal=await get('/calendar',cid,{start:'2032-01-01',end:'2032-12-31',scope:'active'});
  const entries=Object.values(cal.reviews).flat().filter(e=>e.id===access.review_id);expect(entries).toHaveLength(1);
  const final=JSON.parse(sessionStorage.getItem(STORE_KEY));
  for(const kind of ['clients','reviews','policies','risks','findings','tasks','vendors','assets','framework_assessments','evidence']){
    // Demo's existing bounded payload cache can move bytes to session memory.
    // Compare all authoritative metadata and verify a displaced download below.
    const metadata=({content_base64,demo_file_storage,...r})=>r;
    const reference=values=>values.filter(r=>originals.clients.some(c=>r.client_id===c.client_id)).map(metadata);
    expect(reference(final[kind])).toEqual(reference(originals[kind]));
  }
  const displaced=originals.evidence.find(e=>e.content_base64&&final.evidence.find(r=>r.evidence_id===e.evidence_id)?.demo_file_storage==='session_only');
  if(displaced)expect((await get('/evidence/'+displaced.evidence_id+'/download')).content_base64).toBe(displaced.content_base64);
  expect(new Set(final.evidence.map(e=>e.evidence_id)).size).toBe(final.evidence.length);
  expect(final.evidence.filter(e=>e.client_id===cid&&e.evidence_id===firstEvidence.evidence_id)).toHaveLength(1);
  expect((await axios.create({adapter:previewAdapter}).get(cp(control))).data.observations[0]).toEqual(firstObservation);
  if(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR){const fs=jest.requireActual('fs'),path=jest.requireActual('path');fs.mkdirSync(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,'multi-framework.json'),JSON.stringify({synthetic_lifecycle_fixture:true,client_id:cid,store:final}));}
  console.info('Multi-framework five-year lifecycle',{reviews:reviews.length,executions:planCounts,occurrences:occurrences.size,assessments:rows.length,policies:policies.length,controls:1,evidence:final.evidence.filter(e=>e.client_id===cid).length,storeCharacters:sessionStorage.getItem(STORE_KEY).length});
},240000);
function nextDriver(review,key){return review.framework_drivers.find(d=>d.framework_key===key);}
