// DEMO — SYNTHETIC DATA. Fresh intake and actual transitions, not seeded history.
// Uses jsdom's quota-limited sessionStorage; the ten-year characterization suite
// intentionally uses unbounded storage and cannot establish browser capacity.
import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import baseline from '../lib/onboardingCatalog.json';
import {CATALOGS, FRAMEWORKS} from '../lib/frameworks';

const api = axios.create({adapter: previewAdapter});
const {setImmediate: yieldEventLoop} = jest.requireActual('timers');
const get = async (path, client_id, params = {}) => (await api.get(path, {params: {client_id, ...params}})).data;
async function write(method, path, body) {
  const response = await api[method](path, body);
  // Web Storage dispatches async events retaining old/new strings. Release them
  // as a real browser event loop would, instead of accumulating fake-timer work.
  jest.runOnlyPendingTimers();
  await new Promise(resolve => yieldEventLoop(resolve));
  return response.data;
}
const post = (path, body) => write('post', path, body);
const patch = (path, body) => write('patch', path, body);
const clock = date => jest.setSystemTime(new Date(date.slice(0,10) + 'T14:00:00Z'));
const assessmentPath = row => '/framework_assessments/' + row.framework_assessment_id;
const copy = value => JSON.parse(JSON.stringify(value));

beforeEach(async () => {
  // Keep Axios/Promise cleanup live; only the application clock needs control.
  jest.useFakeTimers({doNotFake: ['performance', 'nextTick', 'queueMicrotask']});
  clock('2027-01-01');
  sessionStorage.clear(); localStorage.clear();
  await post('/demo/enter');
});
afterEach(() => jest.useRealTimers());

test.each(['cis-ig1', 'iso-27001', 'soc-2'])('%s fresh client retains five years of operation, decisions and period evidence', async framework => {
  const client = await post('/clients', {name: framework + ' Lifecycle Validation'});
  const cid = client.client_id;
  const state = {
    version: 3, step: 3,
    policies: Object.fromEntries(baseline.policies.map(p => [p.key, 'unsure'])),
    requirements: Object.fromEntries(FRAMEWORKS.map(f => [f.key, f.key === framework ? 'applies' : 'does_not_apply'])),
    reviews: [],
    framework_reviews: Object.fromEntries(CATALOGS[framework].review_plans.map(p => [p.key, {
      enabled: true, recurrence: p.default_cadence, due_date: '2027-03-31'
    }]))
  };
  await post('/onboarding/baseline', {client_id: cid, state, finalize: true});
  const workspace = await get('/frameworks/' + framework, cid);
  expect(workspace.assessments).toHaveLength(framework === 'cis-ig1' ? 56 : framework === 'iso-27001' ? 123 : 33);
  const initialReviews = await get('/reviews', cid);
  expect(initialReviews.length).toBeGreaterThan(0);
  expect(initialReviews.every(r => r.due_date === '2027-03-31')).toBe(true);
  const originalBaseline = copy((await get('/clients/' + cid + '/profile')).baseline);
  const owner = (await get('/clients/' + cid + '/assignees')).items[0].user_id;
  const nextOwner=(await get('/users')).find(u=>u.status==='active'&&u.user_id!==owner);
  await patch('/users/'+nextOwner.user_id+'/client-memberships',{client_ids:[...new Set([...(nextOwner.client_ids||[]),cid])]});
  for (const r of initialReviews) await patch('/reviews/' + r.review_id, {owner_id: owner, expected_occurrence_id: r.current_occurrence_id});

  const definition = framework === 'iso-27001' ? 'A.8.30' : framework === 'soc-2' ? 'CC6.1' : '1.1';
  const row = workspace.assessments.find(a => a.definition_id === definition);
  const path = assessmentPath(row);
  const second = workspace.assessments.find(a => a.framework_assessment_id !== row.framework_assessment_id);
  const risk = await post('/risks', {client_id: cid, title: 'Unverified supplier access to the scoped service', owner_id: owner, likelihood_score: 3, impact_score: 4, treatment:'mitigate', notes:'Validate access and retain review evidence'});
  await post(path + '/links', {kind:'risks', id:risk.risk_id});
  const asset = await post('/assets', {client_id:cid, name:'Synthetic scoped service', status:'active', owner_id:owner});
  const policy=(await get('/policies',cid))[0];
  await post('/policies/'+policy.policy_id+'/approval-subject',{version:'1',external_reference:'https://documents.example.test/synthetic-policy',external_version:'demo-v1'});
  const approval=await post('/policies/'+policy.policy_id+'/submit-review');
  await post('/policies/'+policy.policy_id+'/approve',{approval_request_id:approval.approval_request_id});
  const approvedPolicy=copy(await get('/policies/'+policy.policy_id));
  const vendor=await post('/vendors',{client_id:cid,name:'Synthetic service provider',service:'Scoped service support',business_owner_id:owner,criticality:'high',review_frequency:'as_needed'});
  const histories = new Map(), occurrenceSnapshots = new Map();
  let firstEvidence, firstFinding, firstAssessmentHistory, sharedControl, firstControlObservation, laterFinding, auditFinding, improvement;
  const controlDesign=c=>Object.fromEntries(['name','description','frequency','design','owner_id','assessment_ids','related_links'].map(k=>[k,c[k]]));
  async function remediate(finding){
    const task=(await get('/tasks',cid)).find(t=>t.finding_id===finding.finding_id);
    await patch('/tasks/'+task.task_id,{status:'in_progress'});
    await patch('/tasks/'+task.task_id,{status:'done'});
    expect((await get('/findings/'+finding.finding_id)).status).toBe('remediated');
    await post('/findings/'+finding.finding_id+'/validate',{rationale:'DEMO: independently sampled corrective operation and verified effectiveness'});
  }

  for (let year = 2027; year <= 2031; year++) {
    clock(year + '-01-15');
    const profile = await get('/clients/' + cid + '/profile');
    await patch('/clients/' + cid + '/profile', {section:'organization', values:{employees:20 + (year-2027)*5}, expected_updated_at:profile.updated_at});
    if (framework === 'soc-2') await patch('/frameworks/soc-2/configuration', {
      client_id:cid, categories:['security'], system_description:'Synthetic scoped service; organization-defined controls',
      period_start:year+'-01-01', period_end:year+'-12-31'
    });
    const changes = {status:year === 2027 ? 'in_progress' : 'addressed', implementation:'DEMO — SYNTHETIC DATA. Year '+year+' implementation review.', owner_id:year>=2030?nextOwner.user_id:owner};
    if (framework === 'iso-27001') Object.assign(changes, year < 2030 ? {
      status:'not_applicable', soa_applicability:'excluded', soa_justification:'No outsourced development in the original service boundary'
    } : {status:'in_progress', soa_applicability:'included', soa_justification:'Scope now includes an outsourced development supplier; treatment underway'});
    const managementControl = {
      control_id:'access-review', name:'Access entitlement review', description:year < 2030 ? 'Review access decisions' : 'Review access and new supplier decisions',
      design:'adequate', operating:year === 2029 ? 'gap' : 'not_assessed', frequency:'Quarterly',
      period_start:year+'-01-01', period_end:year+'-12-31', expected_instances:4, collected_instances:0,
      population_notes:'Four organization-defined access reviews', testing_notes:'Operation evaluated separately from design'
    };
    if (framework === 'soc-2' && year===2027) changes.management_controls = [managementControl];
    if(sharedControl)sharedControl=await patch('/organizational-controls/'+encodeURIComponent(sharedControl.control_id),{
      ...controlDesign(sharedControl),description:managementControl.description,owner_id:changes.owner_id,expected_updated_at:sharedControl.updated_at});
    const assessed = await patch(path, changes);
    if (!firstAssessmentHistory) firstAssessmentHistory = copy(assessed.assessment_history[0]);
    expect(assessed.assessment_history[0]).toEqual(firstAssessmentHistory);
    if (year === 2030) {
      await patch('/assets/' + asset.asset_id, {name:'Synthetic scoped service with supplier dependency', expected_updated_at:asset.updated_at});
      await patch('/vendors/'+vendor.vendor_id,{business_owner_id:nextOwner.user_id,service:'Expanded supplier access and managed operations',expected_updated_at:vendor.updated_at});
    }

    // Complete due work in chronological order. Year three deliberately runs late.
    let due, executions = 0;
    while ((due = (await get('/reviews', cid)).filter(r => r.due_date && r.due_date.slice(0,10) <= year+'-12-31' && r.status !== 'completed').sort((a,b)=>a.due_date.localeCompare(b.due_date))[0])) {
      if (++executions > 120) throw new Error('Review schedule failed to advance within one year: '+due.title+' '+due.due_date);
      clock(due.due_date);
      if (year === 2029) jest.setSystemTime(new Date(Date.now() + 8 * 86400000));
      await post('/reviews/' + due.review_id + '/start', {occurrence_id:due.current_occurrence_id});
      const evidence = await post('/evidence', {client_id:cid, linked_type:'review', linked_id:due.review_id, occurrence_id:due.current_occurrence_id,
        filename:framework+'-'+due.period+'.txt', mime_type:'text/plain', content_base64:btoa('DEMO — SYNTHETIC DATA'.replace('—','-'))});
      if (!firstEvidence && due.framework_safeguards.includes(definition)) {
        firstEvidence = copy(evidence);
        await patch('/evidence-library/items/'+evidence.evidence_id,{expiration_date:'2028-12-31',expected_updated_at:evidence.updated_at||null});
        await post(path+'/links', {kind:'evidence', id:evidence.evidence_id});
        await post(assessmentPath(second)+'/links', {kind:'evidence', id:evidence.evidence_id});
        firstFinding = await post('/reviews/'+due.review_id+'/create-finding', {occurrence_id:due.current_occurrence_id,
          title:'Validation did not cover supplier access', description:'Record cause analysis and independent effectiveness validation',
          remediation_title:'Validate supplier access and document corrective measures', severity:'medium'});
      }
      if(year===2028&&framework==='iso-27001'&&!auditFinding&&/internal audit/i.test(due.title)){
        auditFinding=await post('/reviews/'+due.review_id+'/create-finding',{occurrence_id:due.current_occurrence_id,title:'Internal audit: supplier review record incomplete',description:'Cause: handoff omitted independent verification; add the missing verification step',remediation_title:'Correct supplier verification handoff',severity:'medium'});
      }
      if(year===2029&&!laterFinding&&due.framework_safeguards.includes(definition)){
        const old=await get('/evidence-library/items/'+firstEvidence.evidence_id);
        expect(old.expiration_date).toBe('2028-12-31');
        expect(old.expiration_date<due.due_date.slice(0,10)).toBe(true);
        laterFinding=await post('/reviews/'+due.review_id+'/create-finding',{occurrence_id:due.current_occurrence_id,title:'Operating review missed supplier change',description:'Late review found a changed supplier dependency not covered by the previous sample',remediation_title:'Extend supplier-change validation',severity:'medium'});
      }
      if(year===2029&&framework==='iso-27001'&&!improvement&&/management review/i.test(due.title)){
        improvement=await post('/tasks',{client_id:cid,title:'Management review: improve supplier monitoring',review_id:due.review_id,risk_id:risk.risk_id,assignee_id:owner,due_date:'2030-03-31'});
        const currentRisk=await get('/risks/'+risk.risk_id);
        await patch('/risks/'+risk.risk_id,{treatment:'monitor',notes:'Management review retained mitigation and added ongoing supplier monitoring',expected_updated_at:currentRisk.updated_at});
      }
      const completed = await post('/reviews/'+due.review_id+'/complete', {occurrence_id:due.current_occurrence_id});
      expect(completed.occurrence.evidence.map(e=>e.evidence_id)).toContain(evidence.evidence_id);
      occurrenceSnapshots.set(completed.occurrence.occurrence_id, copy(completed.occurrence));
      histories.set(due.review_id, (histories.get(due.review_id)||0)+1);
      expect(completed.review.current_occurrence_id).not.toBe(due.current_occurrence_id);
      if (completed.review.status !== 'completed') expect(completed.review.due_date > due.due_date).toBe(true);
      expect((await get('/evidence/catalog',cid,{entity_type:'reviews',entity_id:due.review_id})).total).toBe(0);
    }
    if (framework === 'soc-2') {
      const access = (await get('/reviews',cid)).find(r=>r.framework_safeguards.includes(definition));
      const periods = access.occurrences.filter(o=>o.period.endsWith(String(year)));
      expect(periods).toHaveLength(4);
      expect(periods.every(o=>o.evidence.length===1)).toBe(true);
      if(!sharedControl){
        await patch(path,{management_controls:[{...managementControl,collected_instances:periods.length,operating:'effective',testing_notes:'First operating cycle before shared-Control migration'}]});
        await post('/organizational-controls/migrate',{client_id:cid});
        sharedControl=(await get('/organizational-controls',cid)).items[0];
        sharedControl=await patch('/organizational-controls/'+encodeURIComponent(sharedControl.control_id),{
          ...controlDesign(sharedControl),owner_id:owner,assessment_ids:[row.framework_assessment_id,second.framework_assessment_id],
          related_links:[{kind:'reviews',id:access.review_id},{kind:'evidence',id:firstEvidence.evidence_id},{kind:'risks',id:risk.risk_id},{kind:'findings',id:firstFinding.finding_id},{kind:'policies',id:policy.policy_id},{kind:'vendors',id:vendor.vendor_id}],expected_updated_at:sharedControl.updated_at});
      }
      sharedControl=await post('/organizational-controls/'+encodeURIComponent(sharedControl.control_id)+'/observations',{
        request_id:'cycle-'+year,expected_updated_at:sharedControl.updated_at,period_start:year+'-01-01',period_end:year+'-12-31',
        expected_instances:4,collected_instances:periods.length,operating:[2028,2029].includes(year)?'gap':'effective',
        notes:year===2028?'Sampling found incomplete supplier verification despite four collected records':year===2029?'Four records collected; late operation remains an exception':'Inspected each completed quarterly occurrence and its evidence'});
      firstControlObservation||=copy(sharedControl.observations[0]);
      expect(sharedControl.observations[0]).toEqual(firstControlObservation);
      expect(sharedControl.observations).toHaveLength(year-2026);
    }
    if (year === 2028) {
      await remediate(firstFinding);
      if(auditFinding)await remediate(auditFinding);
      expect((await get(path)).status).toBe(changes.status);
    }
    if(year===2031){
      expect(laterFinding).toBeTruthy();
      if(framework==='cis-ig1'){
        const remaining=(await get('/tasks',cid)).find(t=>t.finding_id===laterFinding.finding_id);
        await patch('/tasks/'+remaining.task_id,{status:'in_progress'});
      }else await remediate(laterFinding);
      if(improvement)await patch('/tasks/'+improvement.task_id,{status:'done'});
    }
    expect((await get(path)).assessment_history[0]).toEqual(firstAssessmentHistory);
    expect((await get('/clients/'+cid+'/profile')).baseline).toEqual(originalBaseline);
  }
  clock('2031-12-31');
  const finalReviews = await get('/reviews',cid);
  for (const r of finalReviews) {
    expect(r.occurrences).toHaveLength(histories.get(r.review_id));
    for (const occurrence of r.occurrences) expect(occurrence).toEqual(occurrenceSnapshots.get(occurrence.occurrence_id));
  }
  expect((await get('/findings/'+firstFinding.finding_id)).status).toBe('closed');
  expect((await get('/policies/'+policy.policy_id)).approval_history).toEqual(approvedPolicy.approval_history);
  expect((await get('/vendors/'+vendor.vendor_id)).business_owner_id).toBe(nextOwner.user_id);
  if(framework==='iso-27001'){
    expect(auditFinding).toBeTruthy();expect(improvement).toBeTruthy();
    expect((await get('/findings/'+auditFinding.finding_id)).status).toBe('closed');
    expect((await get('/risks/'+risk.risk_id)).treatment).toBe('monitor');
  }
  expect((await get(assessmentPath(second))).status).toBe('not_assessed');
  if(sharedControl){
    const final=await get('/organizational-controls/'+encodeURIComponent(sharedControl.control_id));
    expect(final.observations[0].design_snapshot.owner_id).toBe(owner);
    expect(final.observations.at(-1).design_snapshot.owner_id).toBe(nextOwner.user_id);
    expect(final.observations[0].design_snapshot.description).toBe('Review access decisions');
    expect(final.observations.at(-1).design_snapshot.description).toBe('Review access and new supplier decisions');
    expect(final.legacy_sources.length).toBeGreaterThan(0);
  }
  const oldFile = await get('/evidence-library/items/'+firstEvidence.evidence_id);
  expect(oldFile.created_at).toBe(firstEvidence.created_at);
  expect(oldFile.references.filter(r=>r.kind==='framework_assessments')).toHaveLength(2);
  const snapshot = JSON.parse(sessionStorage.getItem(STORE_KEY));
  expect(snapshot.evidence.filter(e=>e.evidence_id===firstEvidence.evidence_id)).toHaveLength(1);
  expect(snapshot.evidence.reduce((bytes,e)=>bytes+(e.content_base64?.length||0)*2,0)).toBeLessThanOrEqual(256*1024);
  // Read through a new client instance to ensure results are persisted, not API-local state.
  const reloaded = axios.create({adapter:previewAdapter});
  expect((await reloaded.get(path)).data.assessment_history[0]).toEqual(firstAssessmentHistory);
  await post('/onboarding/baseline', {client_id:cid,state,finalize:true});
  expect((await get('/reviews',cid)).map(r=>r.review_id)).toEqual(finalReviews.map(r=>r.review_id));
  expect((await get(path)).assessment_history[0]).toEqual(firstAssessmentHistory);
  expect(sessionStorage.getItem(STORE_KEY).length).toBeLessThan(5000000);
  // Optional synthetic fixture for the loopback-only browser harness. This is
  // generated by the same verified transitions, never a production seed.
  if(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR){
    const fs=jest.requireActual('fs'),nodePath=jest.requireActual('path');
    fs.mkdirSync(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,{recursive:true});
    fs.writeFileSync(nodePath.join(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,framework+'.json'),JSON.stringify({synthetic_lifecycle_fixture:true,client_id:cid,store:JSON.parse(sessionStorage.getItem(STORE_KEY))}));
  }
  console.info('Five-year lifecycle', {framework, reviews:histories.size, occurrences:occurrenceSnapshots.size,
    evidence:snapshot.evidence.filter(e=>e.client_id===cid).length, storeCharacters:sessionStorage.getItem(STORE_KEY).length});
}, 180000);
