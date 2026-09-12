import axios from 'axios';
import { previewAdapter } from './adapter';
import { aggregateClientDashboard } from '../lib/clientDashboard';
import { assessedRisk, representedFinding, riskDue } from '../lib/grcWork';
const api = axios.create({adapter:previewAdapter});
beforeEach(async () => { localStorage.clear(); sessionStorage.clear(); await api.post('/auth/login'); });

test('decisions cannot be forged through ordinary or bulk edits', async () => {
  const c = (await api.post('/clients',{name:'Decision QA'})).data;
  const p = (await api.post('/policies',{client_id:c.client_id,title:'Policy'})).data;
  for (const change of [{status:'approved'}, {approved_at:'2026-01-01'}, {approval_history:[{by:'someone'}]}]) {
    await expect(api.patch(`/policies/${p.policy_id}`,change)).rejects.toBeTruthy();
    await expect(api.post('/bulk',{kind:'policies',ids:[p.policy_id],action:'update',payload:change})).rejects.toBeTruthy();
  }
  await expect(api.post('/policies',{client_id:c.client_id,title:'Forged',status:'approved'})).rejects.toBeTruthy();
  expect((await api.post(`/policies/${p.policy_id}/approve`,{})).data.approver_id).toBeTruthy();
});

test('review occurrences freeze evidence and reject stale rewrites', async () => {
  const c = (await api.post('/clients',{name:'Review QA'})).data;
  const r = (await api.post('/reviews',{client_id:c.client_id,title:'Access review',review_type:'access',recurrence:'annual',due_date:'2026-09-09'})).data;
  const action = {occurrence_id:r.current_occurrence_id};
  await expect(api.post(`/reviews/${r.review_id}/complete`,{})).rejects.toBeTruthy();
  const e = (await api.post('/evidence',{...action,client_id:c.client_id,filename:'sample.txt',content_base64:'eA==',linked_type:'review',linked_id:r.review_id})).data;
  const result = (await api.post(`/reviews/${r.review_id}/complete`,action)).data;
  expect(result.occurrence.evidence[0].evidence_id).toBe(e.evidence_id);
  expect(result.occurrence.outcome).toBe('no_findings');
  await expect(api.delete(`/evidence/${e.evidence_id}`)).rejects.toBeTruthy();
  await expect(api.patch(`/reviews/${r.review_id}`,{notes:'rewrite',expected_occurrence_id:r.current_occurrence_id})).rejects.toBeTruthy();
  const repeated = (await api.post(`/reviews/${r.review_id}/complete`,action)).data;
  expect(repeated.review.review_id).toBe(r.review_id);
  expect(repeated.review.occurrences).toHaveLength(1);
  expect(repeated.occurrence).toEqual(result.occurrence);
});

test('pending validation, unscheduled reviews and unassessed risks remain visible', () => {
  const f = {client_id:'a',finding_id:'f',title:'Validate',status:'remediated',owner_id:'owner'};
  const records = {findings:[f], reviews:[{client_id:'a',review_id:'r',title:'Schedule',status:'needs_scheduling',owner_id:'owner'}], risks:[{client_id:'a',risk_id:'k',title:'Assess',impact:'high',status:'open',owner_id:'owner'}]};
  const result = aggregateClientDashboard(records,{clientId:'a',user:{user_id:'owner'}});
  expect(result.attention.map(r => r.id).sort()).toEqual(['f','k','r']);
  expect(assessedRisk(records.risks[0]).risk_level).toBeNull();
  expect(assessedRisk({likelihood_score:5,impact_score:3}).risk_level).toBe('critical');
  expect(riskDue({status:'accepted',next_review:'2028-01-01',acceptance_expires_at:'2027-01-01'})).toBe('2027-01-01');
  expect(representedFinding(f,[{client_id:'a',finding_id:'f',status:'done',assignee_id:'owner'}])).toBe(false);
});
