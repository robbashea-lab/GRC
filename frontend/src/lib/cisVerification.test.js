import {freshness,verificationLadder,cisSummary,stackCapability,verificationChecks} from './cisVerification';
import cis from './cisIG1.json';
import {matchesAssessment} from './frameworkWorkspace';
const today=new Date('2026-09-24T12:00:00Z');
const row=(over={})=>({definition_id:'10.1',status:'addressed',technology:'',implementation:'EDR on all endpoints',last_assessed:'2026-09-01',work:{evidence_count:1,latest_evidence_at:'2026-09-01',review_ids:['r'],overdue_reviews:0,open_findings:0,overdue_actions:0},...over});

test('every IG1 safeguard has tailored verification checks',()=>{
  for(const d of cis.requirements)expect(verificationChecks(d.id).length).toBeGreaterThanOrEqual(2);
});
test('freshness is derived from the last assessment date',()=>{
  expect(freshness(row(),today).state).toBe('current');
  expect(freshness(row({last_assessed:'2025-12-01'}),today).state).toBe('aging');
  expect(freshness(row({last_assessed:'2025-01-01'}),today).state).toBe('stale');
  expect(freshness(row({status:'not_assessed'}),today).state).toBe('never');
});
test('a service stack only presumes capability; it never verifies implementation',()=>{
  expect(stackCapability('10.1',['EDR/XDR'])).toBe('EDR/XDR');
  const ladder=verificationLadder(row({status:'not_assessed',implementation:'',work:{}}),{stack:['EDR/XDR'],today});
  expect(ladder.find(s=>s.key==='capability').state).toBe('partial');
  expect(ladder.find(s=>s.key==='validated').state).toBe('missing');
});
test('Implemented without evidence or with stale validation is not shown as verified',()=>{
  expect(verificationLadder(row({work:{evidence_count:0}}),{today}).find(s=>s.key==='validated').state).toBe('partial');
  expect(verificationLadder(row({last_assessed:'2024-01-01'}),{today}).find(s=>s.key==='validated').state).toBe('partial');
  expect(verificationLadder(row(),{today}).find(s=>s.key==='validated').state).toBe('done');
});
test('overdue remediation counts safeguards, matching its filtered view, not inherited Actions per safeguard',()=>{
  const inherited={...row().work,overdue_actions:2};
  const rows=[row({work:inherited}),row({definition_id:'5.1',work:inherited}),row({definition_id:'6.1',work:{...inherited,overdue_actions:1}}),row({definition_id:'6.2'})];
  const s=cisSummary(rows,today);
  expect(s.overdueActions).toBe(rows.filter(r=>matchesAssessment(r,'overdue_actions')).length);
  expect(s.overdueActions).toBe(3);
});
test('coverage and implementation are separate measures',()=>{
  const s=cisSummary([row(),row({status:'in_progress',work:{}}),row({status:'not_assessed',last_assessed:null,work:{}}),row({status:'not_applicable'})],today);
  expect(s).toMatchObject({applicable:3,assessed:2,coverage:67,implemented:33,unremediated:1,unevidenced:0});
});
