import {riskMatchesView,riskReviewDue,riskSummary} from './riskRegister';
import {initializeRiskIds,allocateRiskId} from '../preview/riskIds';

const now = new Date('2026-09-13T12:00:00');
const risk = {status:'accepted',likelihood_score:3,impact_score:4,next_review:'2026-12-12'};
test('accepted exposure remains active and the review horizon includes day 90',()=>{
  expect(riskMatchesView(risk,'all_active',now)).toBe(true);
  expect(riskMatchesView(risk,'high',now)).toBe(true);
  expect(riskMatchesView(risk,'critical',now)).toBe(false);
  expect(riskReviewDue(risk,now)).toBe(true);
  expect(riskReviewDue({...risk,next_review:'2026-12-13'},now)).toBe(false);
  expect(riskReviewDue({...risk,next_review:'2020-01-01'},now)).toBe(true);
  expect(riskReviewDue({...risk,next_review:null,acceptance_expires_at:'2020-01-01'},now)).toBe(false);
});
test('closed and legacy retired risks do not inflate operational presets or cards',()=>{
  for(const status of ['closed','retired']) {
    const row = {...risk,status};
    for(const view of ['all_active','review_due','high','critical','accepted']) expect(riskMatchesView(row,view,now)).toBe(false);
    expect(riskMatchesView(row,'closed',now)).toBe(true);
  }
  expect(riskSummary([risk,{...risk,status:'closed'},{...risk,status:'retired'}],now)).toEqual({open:1,high_crit:1,accepted:1,review_due:1});
});
test('legacy text ratings are not fabricated into numerical scores',()=>{
  expect(riskMatchesView({status:'identified',likelihood:'high',impact:'high'},'high',now)).toBe(false);
});
test('demo identifiers are deterministic, stable and isolated by tenant',()=>{
  const db = {risks:[{risk_id:'b',client_id:'a',created_at:'2026-02-01'},{risk_id:'a',client_id:'a',created_at:'2026-01-01'},{risk_id:'c',client_id:'b'}]};
  initializeRiskIds(db);
  expect(db.risks.map(r=>r.display_id)).toEqual(['RISK-002','RISK-001','RISK-001']);
  initializeRiskIds(db);
  expect(allocateRiskId(db,'a')).toBe('RISK-003');
  db.risks = [];
  expect(allocateRiskId(db,'a')).toBe('RISK-004');
});
