import {independentValidationIssue,workSubmissionPatch} from './r4Remediation';

const submitted=(id,owner,worker,history=[])=>({task_id:id,status:'done',assignee_id:owner,completed_by:worker,completed_at:'2026-11-19T10:00:00Z',submission_history:history});
test('every previous submitter and current owner remains ineligible after reassignment and rework',()=>{
  const actions=[submitted('first','new-owner','worker',[{by:'earlier-worker',at:'2026-01-01'}]),submitted('rework','other-owner','other-worker')];
  for(const id of ['new-owner','worker','earlier-worker','other-owner','other-worker'])expect(independentValidationIssue(actions,id)).toMatch(/different account/);
  expect(independentValidationIssue(actions,'independent-validator')).toBeNull();
});
test('unknown identities and open work fail closed without inferring workers from owners',()=>{
  expect(independentValidationIssue([submitted('legacy','owner',null)],'validator')).toMatch(/unknown legacy/);
  expect(independentValidationIssue([submitted('legacy','owner','worker',[{at:'2026-01-01'}])],'validator')).toMatch(/unknown legacy/);
  expect(independentValidationIssue([{status:'open',assignee_id:'owner'}],'validator')).toMatch(/outstanding/);
});
test('submission retains known and unknown earlier work and no-op completion never rewrites it',()=>{
  const previous={status:'open',completed_at:'2026-01-01',completed_by:null,submission_history:[{by:'first',at:'2025-01-01'}]};
  const result=workSubmissionPatch(previous,{status:'done'},'actual-worker','2026-11-19');
  expect(result.submission_history).toEqual([{by:'first',at:'2025-01-01'},{by:null,at:'2026-01-01'},{by:'actual-worker',at:'2026-11-19'}]);
  expect(previous.submission_history).toEqual([{by:'first',at:'2025-01-01'}]);
  expect(workSubmissionPatch({...previous,...result,status:'done'},{status:'done'},'other','later')).toEqual({});
});
