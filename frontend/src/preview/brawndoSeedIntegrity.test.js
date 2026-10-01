import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore} from './store';
const api=axios.create({adapter:previewAdapter}),cid='demo_brawndo';
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
const cis=()=>readStore().framework_assessments.filter(a=>a.client_id===cid&&a.framework_key==='cis-ig1');
test('seeded safeguards carry explicit, varied verification independent of status',()=>{
  const rows=cis(),count=v=>rows.filter(r=>r.verification===v).length;
  expect(rows).toHaveLength(56);
  for(const v of ['verified','needs_validation','gap_identified','not_verified'])expect(count(v)).toBeGreaterThan(0);
  expect(rows.filter(r=>r.status==='not_assessed').every(r=>r.verification==='not_verified')).toBe(true);
  expect(rows.filter(r=>r.status==='needs_attention').every(r=>r.verification==='gap_identified')).toBe(true);
  // Implemented does not imply Verified.
  expect(rows.some(r=>r.status==='addressed'&&r.verification!=='verified')).toBe(true);
});
test('seeded safeguard Findings are raised no earlier than the assessment they came from',()=>{
  const db=readStore();
  for(const f of db.findings.filter(f=>f.client_id===cid&&f.framework_assessment_id)){
    const a=db.framework_assessments.find(x=>x.framework_assessment_id===f.framework_assessment_id);
    expect(a?.last_assessed).toBeTruthy();
    expect(Date.parse(f.identified_at||f.created_at)).toBeGreaterThanOrEqual(Date.parse(a.assessment_history[0].at)-86400000);
    expect(a.status).not.toBe('addressed');
  }
});
test('CIS review cadence provenance distinguishes recommended from CIS-stated intervals',()=>{
  const reviews=readStore().reviews.filter(r=>r.client_id===cid&&r.framework_plan_key);
  const endpoint=reviews.find(r=>r.framework_plan_key==='endpoint-validation');
  expect(endpoint.governance_context.cadence_source).toBe('recommended');
  for(const r of reviews.filter(r=>r!==endpoint))expect(r.governance_context.cadence_source).toBe('organization_defined');
});
test('other demo clients keep their original cadence provenance',()=>{
  for(const r of readStore().reviews.filter(r=>r.client_id!==cid&&r.governance_context))
    // Dunder's ISO 27001 plans are legitimately 'recommended'; only CIS-catalog plans are checked here.
    {if(!String(r.framework_plan_key||'').startsWith('iso-'))expect(r.governance_context.cadence_source).not.toBe('recommended');expect(r.governance_context.cadence_rationale||'').not.toMatch(/Omnisciente recommended validation interval|Management adopted the most frequent CIS-stated interval/);}
});
