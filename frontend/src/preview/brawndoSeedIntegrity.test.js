import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
import {activePlans,belowSource} from '../lib/frameworks';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const cis=()=>readStore().framework_assessments.filter(a=>a.client_id===cid&&a.framework_key==='cis-ig1');
test('seeded safeguards carry explicit, varied verification independent of status',()=>{
  const rows=cis(),count=v=>rows.filter(r=>r.verification===v).length;
  expect(rows).toHaveLength(56);
  for(const v of ['verified','needs_validation','gap_identified'])expect(count(v)).toBeGreaterThan(0);
  expect(rows.filter(r=>r.status==='not_assessed').map(r=>r.definition_id).sort()).toEqual(['11.4','14.8']);
  expect(rows.filter(r=>r.status==='not_assessed').every(r=>r.verification===null)).toBe(true);
  expect(rows.filter(r=>r.status==='needs_attention').every(r=>r.verification==='gap_identified')).toBe(true);
  // Implemented does not imply Verified.
  expect(rows.some(r=>r.status==='addressed'&&r.verification!=='verified')).toBe(true);
});
test('seeded safeguard Findings retain the observed gap and distinguish completed work from validated closure',()=>{
  const db=readStore();
  const findings=db.findings.filter(f=>f.client_id===cid&&f.framework_assessment_id);
  expect(findings).toHaveLength(9);
  expect(findings.filter(f=>f.status==='in_remediation')).toHaveLength(6);
  expect(findings.filter(f=>f.status==='remediated')).toHaveLength(1);
  expect(findings.filter(f=>f.status==='closed')).toHaveLength(2);
  for(const f of findings){
    const a=db.framework_assessments.find(x=>x.framework_assessment_id===f.framework_assessment_id);
    expect(a?.last_assessed).toBeTruthy();
    expect(Date.parse(f.identified_at||f.created_at)).toBeGreaterThanOrEqual(Date.parse(a.assessment_history[0].at)-86400000);
    const identified=f.identified_at||f.created_at;
    const observed=a.assessment_history.filter(event=>event.at<=identified).at(-1);
    expect(observed).toBeDefined();expect(['in_progress','needs_attention']).toContain(observed.status);
    const task=db.tasks.find(row=>row.task_id===f.primary_task_id&&row.finding_id===f.finding_id);
    expect(task).toBeDefined();expect(task.framework_assessment_id).toBe(a.framework_assessment_id);
    if(f.status==='in_remediation'){
      expect(a.status).not.toBe('addressed');expect(task.status).not.toBe('done');
    }else{
      expect(a.status).toBe('addressed');expect(task.status).toBe('done');
      expect(task.completed_at).toBeTruthy();expect(task.completed_at>=identified).toBe(true);
      if(f.status==='closed'){
        expect(f.validated_at).toBeTruthy();expect(f.closed_at).toBe(f.validated_at);
        expect(f.validated_at>=task.completed_at).toBe(true);
        expect(f.decision_history).toContainEqual(expect.objectContaining({action:'validated',at:f.validated_at}));
      }else{
        expect(f.validated_at).toBeUndefined();expect(f.closed_at).toBeUndefined();expect(a.verification).toBe('needs_validation');
      }
    }
  }
});
test('Brawndo selects source-minimum plans without inventing an optional endpoint tracker',()=>{
  const reviews=readStore().reviews.filter(r=>r.client_id===cid&&r.framework_plan_key);
  expect(reviews.map(r=>r.framework_plan_key).sort()).toEqual(activePlans('cis-ig1',{implementation_group:1}).filter(plan=>plan.source_minimum).map(plan=>plan.key).sort());
  expect(reviews.some(r=>r.framework_plan_key==='endpoint-validation')).toBe(false);
  for(const r of reviews)expect(r.governance_context.cadence_source).toBe('organization_defined');
});
test('other demo clients keep their original cadence provenance',()=>{
  for(const r of readStore().reviews.filter(r=>!['demo_brawndo','demo_initech','demo_krusty_krab'].includes(r.client_id)&&r.governance_context))
    // Dunder's ISO 27001 plans are legitimately 'recommended'; only CIS-catalog plans are checked here.
    {if(!String(r.framework_plan_key||'').startsWith('iso-'))expect(r.governance_context.cadence_source).not.toBe('recommended');expect(r.governance_context.cadence_rationale||'').not.toMatch(/Omnisciente recommended validation interval|Management adopted the most frequent CIS-stated interval/);}
});

test('canonical adopted schedules document their choice and retain every native source minimum',()=>{
  const groups={demo_brawndo:1,demo_initech:2,demo_krusty_krab:3};
  const reviews=readStore().reviews.filter(r=>Object.hasOwn(groups,r.client_id)&&r.framework_plan_key);
  expect([...new Set(reviews.map(r=>r.client_id))].sort()).toEqual(Object.keys(groups).sort());
  expect(reviews.some(r=>r.framework_drivers.every(driver=>!driver.framework_source_minimum))).toBe(true);
  for(const r of reviews){
    const hasMinimum=r.framework_drivers.some(driver=>driver.framework_source_minimum);
    const plan=activePlans('cis-ig1',{implementation_group:groups[r.client_id]}).find(plan=>plan.key===r.framework_plan_key);
    expect(plan).toBeDefined();expect(hasMinimum).toBe(!!plan.source_minimum);
    // No catalog minimum does not make a selected operating duty optional.
    expect(r.governance_context.cadence_source).toBe('organization_defined');expect(belowSource(plan,r)).toBe(false);
    expect(r.governance_context.cadence_rationale).toBeTruthy();
  }
});
