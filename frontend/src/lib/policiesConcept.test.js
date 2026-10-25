import { annualPolicyReview } from './policiesConcept';

const annual = {review_id:'annual',client_id:'client',baseline_key:'policy-review',review_type:'policy',recurrence:'annual',status:'upcoming',due_date:'2027-02-07',current_occurrence_id:'annual-current'};

test('annual card selects only the exact client canonical annual program Review', () => {
  const individual = {...annual,review_id:'individual',policy_id:'policy',due_date:'2020-01-01'};
  const unrelated = {...annual,review_id:'other-client',client_id:'other',due_date:'2019-01-01'};
  const monthly = {...annual,review_id:'monthly',recurrence:'monthly',due_date:'2018-01-01'};
  const archived = {...annual,review_id:'archived',archived_at:'2026-01-01'};
  expect(annualPolicyReview([individual,unrelated,monthly,archived,annual],'client').review).toBe(annual);
  expect(annualPolicyReview([individual,unrelated,monthly,archived],'client').review).toBeNull();
  expect(annualPolicyReview([annual],null)).toEqual({review:null,lastClosed:null});
});

test('annual history excludes cancelled and invalid completions and keeps native identity immutable', () => {
  const review = Object.freeze({...annual,occurrences:Object.freeze([
    {status:'completed',completed_at:'2026-02-06'},
    {status:'cancelled',completed_at:'2026-12-01'},
    {status:'upcoming',completed_at:'2026-12-02'},
    {status:'completed',completed_at:'2026-12-03',review_id:'foreign-review'},
    {status:'completed',completed_at:'2026-12-04',client_id:'foreign-client'},
    {status:'completed',completed_at:'invalid'},
  ])});
  const result = annualPolicyReview([review],'client');
  expect(result).toEqual({review,lastClosed:'2026-02-06'});
  expect(result.review.current_occurrence_id).toBe('annual-current');
  expect(annualPolicyReview([{...annual,status:'completed',completion_date:'2026-02-07'}],'client')).toEqual({review:null,lastClosed:'2026-02-07'});
});

test('new active annual Review retains the last completion from prior canonical annual history', () => {
  const previous = {...annual,review_id:'previous',status:'completed',completion_date:'2026-02-06'};
  const archived = {...previous,review_id:'archived',archived:true,completion_date:'2026-12-01'};
  const individual = {...previous,review_id:'individual',policy_id:'policy',completion_date:'2026-12-02'};
  expect(annualPolicyReview([annual,previous,archived,individual],'client')).toEqual({review:annual,lastClosed:'2026-02-06'});
});
