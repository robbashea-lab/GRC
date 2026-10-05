// DEMO — SYNTHETIC DATA. Fresh intake and actual transitions, not seeded history.
// Uses jsdom's quota-limited sessionStorage; the ten-year characterization suite
// intentionally uses unbounded storage and cannot establish browser capacity.
import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY} from './store';
import baseline from '@catalogs/onboardingCatalog.json';
import {CATALOGS, FRAMEWORKS, activePlans} from '../lib/frameworks';
import {auditPackage,blankAuditItem} from '../lib/isoAudit';
import timeline from '@contracts/program-lifecycle.json';

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
const years=Number(process.env.FRAMEWORK_LIFECYCLE_YEARS||5),startYear=timeline.start_year,endYear=startYear+years-1,changeYear=endYear-1;
if(![3,5].includes(years))throw new Error('Framework lifecycle supports the verified three- or five-year scenarios');
const addDays=(date,days)=>new Date(Date.parse(date.slice(0,10)+'T14:00:00Z')+days*86400000).toISOString().slice(0,10);

beforeEach(async () => {
  // Keep Axios/Promise cleanup live; only the application clock needs control.
  jest.useFakeTimers({doNotFake: ['performance', 'nextTick', 'queueMicrotask']});
  clock('2027-01-01');
  sessionStorage.clear(); localStorage.clear();
  await post('/demo/enter');
});
afterEach(() => jest.useRealTimers());

test.each(timeline.frameworks)('%s fresh client retains the configured program lifecycle and period evidence', async framework => {
  const client = await post('/clients', {name: framework + ' '+years+'-year Lifecycle Validation — disposable'});
  const cid = client.client_id;
  const state = {
    version: 3, step: 3,
    policies: Object.fromEntries(baseline.policies.map(p => [p.key, 'unsure'])),
    requirements: Object.fromEntries(FRAMEWORKS.map(f => [f.key, f.key === framework ? 'applies' : 'does_not_apply'])),
    reviews: [],
    framework_reviews: Object.fromEntries(activePlans(framework).map(p => [p.key, {
      enabled: true, recurrence: p.default_cadence, due_date: '2027-03-31'
    }]))
  };
  await post('/onboarding/baseline', {client_id: cid, state, finalize: true});
  const workspace = await get('/frameworks/' + framework, cid);
  expect(workspace.assessments).toHaveLength(timeline.assessment_counts[framework]);
  const initialReviews = await get('/reviews', cid);
  expect(initialReviews.length).toBeGreaterThan(0);
  expect(initialReviews.every(r => r.due_date === '2027-03-31')).toBe(true);
  const originalBaseline = copy((await get('/clients/' + cid + '/profile')).baseline);
  const owner = (await get('/clients/' + cid + '/assignees')).items[0].user_id;
  const nextOwner=(await get('/users')).find(u=>u.status==='active'&&u.user_id!==owner);
  await patch('/users/'+nextOwner.user_id+'/client-memberships',{client_ids:[...new Set([...(nextOwner.client_ids||[]),cid])]});
  const sessionUser=(await get('/auth/me')).user_id;
  const departing=(await get('/users')).find(u=>u.status==='active'&&![owner,nextOwner.user_id,sessionUser].includes(u.user_id));
  expect(departing).toBeTruthy();
  await patch('/users/'+departing.user_id+'/client-memberships',{client_ids:[...new Set([...(departing.client_ids||[]),cid])]});
  for (const r of initialReviews) await patch('/reviews/' + r.review_id, {owner_id: owner, expected_occurrence_id: r.current_occurrence_id});
  const probe=await post('/reviews',{client_id:cid,title:timeline.month_end_probe.title,review_type:'governance',owner_id:departing.user_id,due_date:timeline.month_end_probe.first_due,recurrence:'monthly',status:'upcoming'});
  const handoff=await post('/tasks',{client_id:cid,title:'Synthetic owner departure handoff',assignee_id:departing.user_id});
  if(framework==='iso-27001')await post('/iso-audit/activate',{client_id:cid,start_date:'2027-01-01',first_package:'governance-risk',auditor_id:owner,scope:'Synthetic scoped service',independence:'Independent reviewer does not audit their own operation'});

  const definition = framework === 'iso-27001' ? 'A.8.30' : framework === 'soc-2' ? 'CC6.1' : '1.1';
  const row = workspace.assessments.find(a => a.definition_id === definition);
  const path = assessmentPath(row);
  const second = workspace.assessments.find(a => a.framework_assessment_id !== row.framework_assessment_id);
  const risk = await post('/risks', {client_id: cid, title: 'Unverified supplier access to the scoped service', owner_id: owner, likelihood_score: 3, impact_score: 4, treatment:'mitigate', next_review:'2027-06-30',review_cadence:'annual',notes:'Validate access and retain review evidence'});
  await post(path + '/links', {kind:'risks', id:risk.risk_id});
  const asset = await post('/assets', {client_id:cid, name:'Synthetic scoped service', status:'active', owner_id:owner});
  const policy=(await get('/policies',cid))[0];
  await post('/policies/'+policy.policy_id+'/approval-subject',{version:'1',external_reference:'https://documents.example.test/synthetic-policy',external_version:'demo-v1'});
  const approval=await post('/policies/'+policy.policy_id+'/submit-review');
  await post('/policies/'+policy.policy_id+'/approve',{approval_request_id:approval.approval_request_id});
  const approvedPolicy=copy(await get('/policies/'+policy.policy_id));
  const vendor=await post('/vendors',{client_id:cid,name:'Synthetic service provider',service:'Scoped service support',business_owner_id:owner,criticality:'high',next_review:'2027-06-30',review_frequency:'annual',contract_renewal:'2028-03-31',contract_review_enabled:true});
  const histories = new Map(), occurrenceSnapshots = new Map();
  let firstEvidence, firstFinding, firstAssessmentHistory, sharedControl, firstControlObservation, laterFinding, auditFinding, improvement, firstClosed, originalAction, reopenedAction;
  const controlDesign=c=>Object.fromEntries(['name','description','frequency','design','owner_id','assessment_ids','related_links'].map(k=>[k,c[k]]));
  async function remediate(finding,taskId){
    const task=(await get('/tasks',cid)).find(t=>t.finding_id===finding.finding_id&&(!taskId||t.task_id===taskId));
    await patch('/tasks/'+task.task_id,{status:'in_progress'});
    await patch('/tasks/'+task.task_id,{status:'done'});
    expect((await get('/findings/'+finding.finding_id)).status).toBe('remediated');
    return post('/findings/'+finding.finding_id+'/validate',{rationale:'DEMO: independently sampled corrective operation and verified effectiveness'});
  }

  const checkpoints=[],events=[];
  for (let year = startYear; year <= endYear; year++) {
    clock(year + '-01-15');
    if(year>startYear){
      await post('/policies/'+policy.policy_id+'/approval-subject',{version:String(year-startYear+1),external_reference:'https://documents.example.test/synthetic-policy',external_version:'demo-v'+(year-startYear+1)});
      const request=await post('/policies/'+policy.policy_id+'/submit-review');
      await post('/policies/'+policy.policy_id+'/approve',{approval_request_id:request.approval_request_id});
    }
    if(year===2029){
      expect(firstClosed.status).toBe('closed');
      const reopened=await patch('/findings/'+firstFinding.finding_id,{status:'open',expected_updated_at:firstClosed.updated_at});
      expect(reopened.status).toBe('open');
      expect(reopened.decision_history).toEqual(firstClosed.decision_history);
      reopenedAction=await post('/tasks',{client_id:cid,title:'Revalidate changed supplier operation',source_type:'finding',source_id:firstFinding.finding_id,assignee_id:owner});
      expect(reopenedAction.task_id).not.toBe(originalAction.task_id);
      for(const field of ['review_id','occurrence_id'])expect(reopenedAction[field]).toBe(firstClosed[field]);
      expect((await get('/findings/'+firstFinding.finding_id)).status).toBe('in_remediation');
      events.push({at:'2029-01-15',event:'finding_reopened',finding_id:firstFinding.finding_id,new_action_id:reopenedAction.task_id,original_action_id:originalAction.task_id});
    }
    const profile = await get('/clients/' + cid + '/profile');
    await patch('/clients/' + cid + '/profile', {section:'organization', values:{employees:20 + (year-2027)*5}, expected_updated_at:profile.updated_at});
    if (framework === 'soc-2') await patch('/frameworks/soc-2/configuration', {
      client_id:cid, categories:['security'], system_description:'Synthetic scoped service; organization-defined controls',
      period_start:year+'-01-01', period_end:year+'-12-31'
    });
    const changes = {status:year === 2027 ? 'in_progress' : 'addressed', implementation:'DEMO — SYNTHETIC DATA. Year '+year+' implementation review.', owner_id:year>=changeYear?nextOwner.user_id:owner};
    if (framework === 'iso-27001') Object.assign(changes, year < changeYear ? {
      status:'not_applicable', soa_applicability:'excluded', soa_justification:'No outsourced development in the original service boundary'
    } : {status:'in_progress', soa_applicability:'included', soa_justification:'Scope now includes an outsourced development supplier; treatment underway'});
    const managementControl = {
      control_id:'access-review', name:'Access entitlement review', description:year < changeYear ? 'Review access decisions' : 'Review access and new supplier decisions',
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
    if (year === changeYear) {
      await patch('/assets/' + asset.asset_id, {name:'Synthetic scoped service with supplier dependency', expected_updated_at:asset.updated_at});
      const currentVendor=await get('/vendors/'+vendor.vendor_id);
      await patch('/vendors/'+vendor.vendor_id,{business_owner_id:nextOwner.user_id,service:'Expanded supplier access and managed operations',expected_updated_at:currentVendor.updated_at});
    }

    // Complete due work in chronological order. Year three deliberately runs late.
    let due, executions = 0;
    while ((due = (await get('/reviews', cid)).filter(r => r.due_date && r.due_date.slice(0,10) <= year+'-12-31' && !['completed','cancelled'].includes(r.status)).sort((a,b)=>a.due_date.localeCompare(b.due_date))[0])) {
      if (++executions > 120) throw new Error('Review schedule failed to advance within one year: '+due.title+' '+due.due_date);
      const probeDue=due.review_id===probe.review_id;
      let completion=due.due_date.slice(0,10);
      if(probeDue&&completion===timeline.month_end_probe.first_due)completion=timeline.month_end_probe.early_completion;
      else if(probeDue&&completion==='2027-03-31')completion=timeline.month_end_probe.late_completion;
      else if(probeDue&&timeline.month_end_probe.missed_due_dates.includes(completion))completion=timeline.month_end_probe.catch_up;
      else if(year===2029&&completion.slice(5,7)!=='12')completion=addDays(completion,8);
      clock(new Date(Math.max(Date.now(),Date.parse(completion+'T14:00:00Z'))).toISOString());
      await post('/reviews/' + due.review_id + '/start', {occurrence_id:due.current_occurrence_id});
      const evidence = await post('/evidence', {client_id:cid, linked_type:'review', linked_id:due.review_id, occurrence_id:due.current_occurrence_id,
        filename:framework+'-'+due.period+'.txt', mime_type:'text/plain', content_base64:btoa('DEMO — SYNTHETIC DATA'.replace('—','-'))});
      if (!firstEvidence && due.framework_safeguards?.includes(definition)) {
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
      if(year===2029&&!laterFinding&&due.framework_safeguards?.includes(definition)){
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
      if(due.iso_audit){
        due=await get('/reviews/'+due.review_id);
        for(const item of auditPackage(due.iso_audit.package_key).items){
          due=await patch('/reviews/'+due.review_id+'/iso-audit/'+item.key,{...blankAuditItem(),status:'reviewed',result:'conforming',notes:'Synthetic walkthrough executed',evidence_ids:[evidence.evidence_id],occurrence_id:due.current_occurrence_id,expected_updated_at:due.updated_at??null});
        }
        due=await patch('/reviews/'+due.review_id+'/iso-audit',{report_evidence_id:evidence.evidence_id,occurrence_id:due.current_occurrence_id,expected_updated_at:due.updated_at??null});
      }
      const command={occurrence_id:due.current_occurrence_id};
      const completed = await post('/reviews/'+due.review_id+'/complete', command);
      expect((await post('/reviews/'+due.review_id+'/complete',command)).occurrence).toEqual(completed.occurrence);
      expect(completed.occurrence.evidence.map(e=>e.evidence_id)).toContain(evidence.evidence_id);
      occurrenceSnapshots.set(completed.occurrence.occurrence_id, copy(completed.occurrence));
      histories.set(due.review_id, (histories.get(due.review_id)||0)+1);
      if (completed.review.status !== 'completed') {
        expect(completed.review.current_occurrence_id).not.toBe(due.current_occurrence_id);
        expect(completed.review.due_date > due.due_date).toBe(true);
        expect((await get('/evidence/catalog',cid,{entity_type:'reviews',entity_id:due.review_id})).total).toBe(0);
      } else expect(completed.occurrence.status).toBe('completed');
    }
    clock(year+'-12-31');
    if(year===2027)await post('/risks/'+risk.risk_id+'/accept',{rationale:'Synthetic controlled residual exposure',expiry_date:'2028-06-30'});
    if(year===2028)expect((await get('/risks/'+risk.risk_id)).acceptance_expires_at.slice(0,10)).toBe('2028-06-30');
    if (framework === 'soc-2') {
      const access = (await get('/reviews',cid)).find(r=>r.framework_safeguards?.includes(definition));
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
      firstClosed=copy(await remediate(firstFinding));
      originalAction=copy((await get('/tasks',cid)).find(t=>t.finding_id===firstFinding.finding_id));
      if(auditFinding)await remediate(auditFinding);
      expect((await get(path)).status).toBe(changes.status);
    }
    if(year===2029){
      const closed=await remediate(firstFinding,reopenedAction.task_id);
      expect(closed.status).toBe('closed');
      expect(closed.decision_history.slice(0,firstClosed.decision_history.length)).toEqual(firstClosed.decision_history);
      expect(closed.decision_history.filter(h=>h.action==='validated')).toHaveLength(2);
      expect(closed.closed_at>firstClosed.closed_at).toBe(true);
      expect(await get('/tasks/'+originalAction.task_id)).toEqual(originalAction);
      expect((await get('/tasks/'+handoff.task_id)).assignee_id).toBeNull();
      events.push({at:'2029-12-31',event:'reopened_finding_validated',finding_id:closed.finding_id,validations:2,pending_validation_observed:true,first_decision_preserved:true});
    }
    if(year===endYear){
      expect(laterFinding).toBeTruthy();
      if(framework==='cis-ig1'){
        const remaining=(await get('/tasks',cid)).find(t=>t.finding_id===laterFinding.finding_id);
        await patch('/tasks/'+remaining.task_id,{status:'in_progress'});
      }else await remediate(laterFinding);
      if(improvement)await patch('/tasks/'+improvement.task_id,{status:'done'});
    }
    expect((await get(path)).assessment_history[0]).toEqual(firstAssessmentHistory);
    expect((await get('/clients/'+cid+'/profile')).baseline).toEqual(originalBaseline);
    const currentProbe=await get('/reviews/'+probe.review_id);
    if(year===2028){
      expect(currentProbe.occurrences.some(o=>o.due_date?.slice(0,10)===timeline.month_end_probe.leap_day)).toBe(true);
      const before=copy(currentProbe.occurrences);
      const pending=copy(await get('/tasks/'+handoff.task_id));
      const disabled=await patch('/users/'+departing.user_id,{status:'disabled'});
      expect(disabled.status).toBe('disabled');
      expect(await get('/reviews/'+probe.review_id)).toEqual(currentProbe);
      expect(await get('/tasks/'+handoff.task_id)).toEqual(pending);
      expect((await get('/clients/'+cid+'/assignees')).items.map(u=>u.user_id)).not.toContain(departing.user_id);
      const unassigned=await patch('/tasks/'+handoff.task_id,{assignee_id:null});
      expect(unassigned.assignee_id).toBeNull();
      expect(unassigned.status).toBe('open');
      const unowned=await patch('/reviews/'+probe.review_id,{owner_id:null,expected_updated_at:currentProbe.updated_at??null,expected_occurrence_id:currentProbe.current_occurrence_id});
      expect(unowned.owner_id).toBeNull();
      expect(unowned.occurrences).toEqual(before);
      await patch('/reviews/'+probe.review_id,{title:'Organization-selected quarterly governance checkpoint',owner_id:nextOwner.user_id,recurrence:'quarterly',expected_updated_at:unowned.updated_at??null,expected_occurrence_id:unowned.current_occurrence_id});
      expect((await get('/reviews/'+probe.review_id)).occurrences).toEqual(before);
      events.push({at:'2028-12-31',event:'owner_departed',user_id:departing.user_id,review_id:probe.review_id,unassigned_action_id:handoff.task_id,preserved_occurrences:before.length});
    }
    const live=await get('/reviews',cid),today=year+'-12-31',dash=await get('/dashboard',cid),tasks=await get('/tasks',cid),findings=await get('/findings',cid);
    expect(dash.kpis.overdue_reviews).toBe(live.filter(r=>!['completed','cancelled'].includes(r.status)&&r.due_date&&r.due_date.slice(0,10)<today).length);
    expect(dash.kpis.overdue_actions).toBe(tasks.filter(t=>!['done','cancelled'].includes(t.status)&&t.due_date&&t.due_date.slice(0,10)<today).length);
    expect(dash.kpis.open_findings).toBe(findings.filter(f=>!['closed','accepted','cancelled'].includes(f.status)).length);
    const calendar=await get('/calendar',cid,{start:year+'-12-01',end:today,scope:'all'}),entries=Object.values(calendar.reviews).flat(),expected=[];
    const inWindow=row=>row.due_date&&year+'-12-01'<=row.due_date.slice(0,10)&&row.due_date.slice(0,10)<=today;
    for(const review of live){
      if(inWindow(review))expected.push('review:'+review.review_id+':'+review.current_occurrence_id);
      for(const occurrence of review.occurrences||[])if(inWindow(occurrence))expected.push('review:'+review.review_id+':'+occurrence.occurrence_id);
    }
    expect(entries.map(e=>e.key).sort()).toEqual(expected.sort());
    expect(entries.every(e=>e.client_id===cid)).toBe(true);
    const counts={framework,at:today,reviews:live.length,occurrences:live.reduce((n,r)=>n+(r.occurrences?.length||0),0),calendar_review_entries:entries.length,kpis:dash.kpis,events:copy(events)};
    checkpoints.push(counts);
    if(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR){
      const fs=jest.requireActual('fs'),nodePath=jest.requireActual('path');fs.mkdirSync(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,{recursive:true});
      fs.writeFileSync(nodePath.join(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,framework+'-'+year+'.json'),JSON.stringify({synthetic_lifecycle_fixture:true,client_id:cid,checkpoint:counts,store:JSON.parse(sessionStorage.getItem(STORE_KEY))}));
    }
  }
  clock(endYear+'-12-31');
  const finalReviews = await get('/reviews',cid);
  for (const r of finalReviews) {
    expect(r.occurrences).toHaveLength(histories.get(r.review_id));
    for (const occurrence of r.occurrences) expect(occurrence).toEqual(occurrenceSnapshots.get(occurrence.occurrence_id));
  }
  expect((await get('/findings/'+firstFinding.finding_id)).status).toBe('closed');
  const policyHistory=(await get('/policies/'+policy.policy_id)).approval_history;
  expect(policyHistory.slice(0,approvedPolicy.approval_history.length)).toEqual(approvedPolicy.approval_history);
  expect(policyHistory.filter(h=>h.action==='approved')).toHaveLength(years);
  await post('/risks/'+risk.risk_id+'/close',{reason:'remediated'});
  expect((await get('/risks/'+risk.risk_id+'/review-history')).length).toBeGreaterThan(0);
  for(const status of ['offboarding','inactive'])await patch('/vendors/'+vendor.vendor_id,{status});
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
  expect(snapshot.evidence.reduce((bytes,e)=>bytes+(e.content_base64?.length||0)*2,0)).toBeLessThanOrEqual(64*1024);
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
    fs.writeFileSync(nodePath.join(process.env.FRAMEWORK_LIFECYCLE_EXPORT_DIR,framework+'.json'),JSON.stringify({synthetic_lifecycle_fixture:true,client_id:cid,events,store:JSON.parse(sessionStorage.getItem(STORE_KEY))}));
  }
  const finalProbe=finalReviews.find(r=>r.review_id===probe.review_id);
  expect(finalProbe.occurrences[0].completed_at.slice(0,10)).toBe(timeline.month_end_probe.early_completion);
  expect(finalProbe.occurrences.find(o=>o.due_date.slice(0,10)==='2027-03-31').completed_at.slice(0,10)).toBe(timeline.month_end_probe.late_completion);
  expect(finalProbe.occurrences.filter(o=>timeline.month_end_probe.missed_due_dates.includes(o.due_date.slice(0,10))).map(o=>o.completed_at.slice(0,10))).toEqual([timeline.month_end_probe.catch_up,timeline.month_end_probe.catch_up]);
  if(years===3)expect(finalProbe.due_date.slice(0,10)).toBe(timeline.month_end_probe.next_after_change.at(-1));
  console.info('Framework lifecycle', {framework,years,checkpoints,reviews:histories.size, occurrences:occurrenceSnapshots.size,
    evidence:snapshot.evidence.filter(e=>e.client_id===cid).length, storeCharacters:sessionStorage.getItem(STORE_KEY).length});
}, 180000);
