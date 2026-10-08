import {describeGuidedContext, prioritizeGuidedLifecycle, recordedDate} from './guidedLifecycle';

const work = extra => ({context_complete: true, finding_ids: [], review_ids: [], action_ids: [], open_findings: 0, open_actions: 0, overdue_reviews: 0, overdue_actions: 0, next_review_due: null, ...extra});
const row = (id, extra = {}) => ({definition_id: id, client_id: 'client-a', framework_assessment_id: `assessment-${id}`, status: 'addressed', verification: 'verified', work: work(), ...extra});
const fingerprint = 'a'.repeat(64);
const draft = extra => ({client_id: 'client-a', assessment_id: 'assessment-1.1', user_id: 'actor-a', revision: 3, version: 'original-version', step: 2, completed: false, answers: {practice: 'Partially'}, base_assessment_token: '2026-09-01T12:00:00Z', base_scope_fingerprint: fingerprint, current_scope_fingerprint: fingerprint, lineage_known: true, lineage_stale: false, ...extra});
const context = extra => ({record: row('1.1', {last_assessed: '2026-09-01T12:00:00Z', assessment_history: []}), draft: null, draftLoaded: true, workLoaded: true, historyComplete: true, supportedVersions: ['original-version'], expectedIdentity: {client_id: 'client-a', assessment_id: 'assessment-1.1', user_id: 'actor-a'}, ...extra});
const source = d => ({version: d.version, revision: d.revision, generated_at: d.generated_at, by: d.user_id, origin: 'guided-assessment-pilot'});

test('priority follows implementation position; overdue work never overrides the order', () => {
  const result = prioritizeGuidedLifecycle([
    row('1.4', {work: work({next_review_due: '2026-10-10', overdue_reviews: 9})}),
    row('1.3', {status: 'in_progress'}),
    row('1.2', {status: 'needs_attention'}),
    row('1.1', {status: 'not_assessed'})
  ], {contextComplete: true, limit: 10});
  expect(result.recommendations.map(r => r.definition_id)).toEqual(['1.1', '1.2', '1.3', '1.4']);
  expect(result.recommendations.map(r => r.reasonCode)).toEqual(['not_assessed', 'not_implemented', 'partial_or_unresolved', 'verification_or_review']);
  expect(result.recommendations[1].signals.openFindings).toBe(0);
  expect(result.overdue).toEqual([{definition_id: '1.4', reviewCount: 9, actionCount: 0}]);
});

test('routine native actions stay in the final work bucket even with Immediate priority', () => {
  const result = prioritizeGuidedLifecycle([
    row('1.1', {work: work({open_actions: 1, task_ids: ['routine'], priority_records: [{kind: 'tasks', id: 'routine', open_gap: false, priority: 'immediate'}]})}),
    row('1.2', {status: 'not_assessed'}), row('1.3', {status: 'needs_attention'}), row('1.4', {status: 'in_progress'}),
    row('1.5', {work: work({open_actions: 1, task_ids: ['gap-task'], priority_records: [{kind: 'tasks', id: 'gap-task', open_gap: true, priority: 'low'}]})}),
    row('1.6', {work: work({next_review_due: '2026-10-08'})})
  ], {contextComplete: true, limit: 10});
  expect(result.recommendations.map(r => r.definition_id)).toEqual(['1.2', '1.3', '1.4', '1.5', '1.1', '1.6']);
  const routine = result.recommendations.find(r => r.definition_id === '1.1');
  expect(routine).toMatchObject({rank: 3, reasonCode: 'verification_or_review', reason: 'Linked native Action Item remains open.', action: 'findings'});
  expect(routine.signals.hasOpenGapAction).toBe(false);
  expect(result.counts.partialOrUnresolved).toBe(2);
  expect(result.counts.verificationOrReview).toBe(2);
});

test('open action count alone never establishes a gap classification', () => {
  const result = prioritizeGuidedLifecycle([row('1.1', {work: work({open_actions: 1})})], {contextComplete: true});
  expect(result.recommendations[0]).toMatchObject({rank: 3, reason: 'Linked native Action Item remains open.'});
  expect(result.recommendations[0].signals.hasOpenGapAction).toBeNull();
  expect(result.counts.partialOrUnresolved).toBe(0);
});

test('unfinished interviews have a separate resume list and do not promote a clean safeguard', () => {
  const result = prioritizeGuidedLifecycle([row('1.1'), row('1.2', {status: 'not_assessed'})], {
    contextComplete: true, drafts: {'1.1': {revision: 5, completed: false}, '1.2': {revision: 2, completed: true}}
  });
  expect(result.resume.map(r => r.definition_id)).toEqual(['1.1']);
  expect(result.recommendations.map(r => r.definition_id)).toEqual(['1.2']);
  expect(result.counts.resumable).toBe(1);
});

test('complete scope counts deduplicate safeguards and shared native work IDs', () => {
  const a = row('13.10', {status: 'not_assessed', work: work({finding_ids: ['f-a', 'f-a'], review_ids: ['r-a'], action_ids: ['t-a'], open_findings: 1, open_actions: 1})});
  const b = row('13.9', {status: 'not_assessed', work: work({finding_ids: ['f-a', 'f-b'], review_ids: ['r-a'], action_ids: ['t-a', 't-b'], open_findings: 2, open_actions: 2})});
  const result = prioritizeGuidedLifecycle([a, b, a, row('18.5', {in_active_scope: false})], {contextComplete: true});
  expect(result.recommendations.map(r => r.definition_id)).toEqual(['13.9', '13.10']);
  expect(result.counts).toMatchObject({safeguards: 2, notAssessed: 2, openFindings: 2, linkedReviews: 1, openActions: 2});
});

test.each([
  {contextComplete: false},
  {contextComplete: true, missing: {work: undefined}},
  {contextComplete: true, missing: {work: work({context_complete: false})}},
  {contextComplete: true, missing: {framework_assessment_id: null}},
  {contextComplete: true, missing: {status: null}}
])('incomplete scope never displays zero aggregate facts: %j', ({contextComplete, missing}) => {
  const result = prioritizeGuidedLifecycle([row('1.1', missing)], {contextComplete});
  expect(Object.values(result.counts).every(value => value === null)).toBe(true);
  expect(result.contextComplete).toBe(false);
});

test('native task_ids are deduplicated consistently without an action_ids alias', () => {
  const result = prioritizeGuidedLifecycle([
    row('1.1', {work: work({action_ids: undefined, task_ids: ['t-a', 't-a'], open_actions: 1})}),
    row('1.2', {work: work({action_ids: undefined, task_ids: ['t-a', 't-b'], open_actions: 2})})
  ], {contextComplete: true});
  expect(result.counts.openActions).toBe(2);
  expect(result.recommendations[0].signals.actionIds).toEqual(['t-a']);
});

test('verification and actual scheduled Reviews qualify; cadence and narrative dates do not', () => {
  const result = prioritizeGuidedLifecycle([
    row('1.1', {verification: 'not_verified'}),
    row('1.2', {work: work({next_review_due: '2030-04-01'})}),
    row('1.3', {cadence: 'annual', implementation: 'Annual review should be in December.'}),
    row('1.4')
  ], {contextComplete: true});
  expect(result.recommendations.map(r => r.definition_id)).toEqual(['1.1', '1.2']);
  expect(result.recommendations[1].signals.nextReview).toBe('2030-04-01');
});

test('an unresolved Finding remains visible alongside a verified implementation position', () => {
  const record = row('1.1', {work: work({finding_ids: ['f-a'], open_findings: 1})});
  const priority = prioritizeGuidedLifecycle([record], {contextComplete: true});
  expect(priority.recommendations[0]).toMatchObject({reasonCode: 'partial_or_unresolved', action: 'findings'});
  const result = describeGuidedContext(context({record}));
  expect(result.saved.status).toBe('addressed');
  expect(result.saved.verification).toBe('verified');
  expect(result.actions).toContain('findings');
  expect(result.summary).toContain('1 open Finding remains');
});

test('tasks-only work remains visible and exposes native linked-record navigation', () => {
  const result = describeGuidedContext(context({record: row('1.1', {work: work({open_actions: 2, action_ids: ['t-a', 't-b']})})}));
  expect(result.signals.openFindings).toBe(0);
  expect(result.summary).toContain('2 open Action Items remain');
  expect(result.summary).not.toContain('No immediate interview');
  expect(result.actions).toContain('findings');
});

test('a verification gap remains explicit alongside reported implementation without changing the status', () => {
  const record = row('1.1', {verification: 'gap_identified'});
  const result = describeGuidedContext(context({record}));
  expect(result.saved.status).toBe('addressed');
  expect(result.saved.verification).toBe('gap_identified');
  expect(result.summary).toContain('while the saved verification records a gap');
  expect(result.actions).toEqual(expect.arrayContaining(['current', 'changes', 'reassess', 'findings']));
  expect(record.status).toBe('addressed');
});

test.each([
  [{overdue_reviews: 1}, '1 overdue Review'],
  [{overdue_actions: 2}, '2 overdue Action Items']
])('existing overdue-only work remains visible without inventing a next Review: %j', (extra, label) => {
  const result = describeGuidedContext(context({record: row('1.1', {work: work(extra)})}));
  expect(result.summary).toContain(label);
  expect(result.summary).toContain('Existing schedule signals');
  expect(result.dates.nextReview).toBeNull();
  expect(result.actions).toContain('findings');
  expect(result.summary).not.toContain('No immediate interview');
});

test('an actual future scheduled Review exposes its native record without an invented due threshold', () => {
  const result = describeGuidedContext(context({record: row('1.1', {work: work({next_review_due: '2030-01-01'})})}));
  expect(result.dates.nextReview).toBe('2030-01-01');
  expect(result.actions).toContain('findings');
});

test('newly provisioned Not Assessed rows and saved manual assessments have different context', () => {
  expect(describeGuidedContext(context({record: row('1.1', {status: 'not_assessed', verification: null})}))).toMatchObject({state: 'initial', actions: ['start', 'current']});
  const manual = describeGuidedContext(context({record: row('1.1', {implementation: 'A saved implementation statement.', assessment_origin: 'manual'})}));
  expect(manual.state).toBe('saved');
  expect(manual.saved.origin).toBe('manual');
  expect(manual.actions).not.toContain('start');
  const legacy = describeGuidedContext(context());
  expect(legacy.saved.hasPosition).toBe(true);
  expect(legacy.saved.origin).toBe('unknown');
});

test('clean verified context offers change review while full reassessment remains explicit', () => {
  const result = describeGuidedContext(context());
  expect(result.actions).toEqual(['changes', 'current', 'reassess']);
  expect(result.summary).toContain('No immediate interview is suggested');
  expect(result.result).toBeNull();
});

test('saved unfinished interviews retain their original version and persisted answers', () => {
  const d = draft();
  const input = context({draft: d});
  const before = JSON.stringify(input);
  expect(describeGuidedContext(input)).toMatchObject({state: 'resume', interviewState: 'unfinished', actions: ['resume', 'current', 'reassess']});
  expect(JSON.stringify(input)).toBe(before);
});

test.each([
  {lineage_stale: true},
  {base_assessment_token: 'an-older-write'},
  {current_scope_fingerprint: 'b'.repeat(64)},
  {lineage_known: false}
])('changed or unknown lineage blocks fresh application claims: %j', change => {
  const result = describeGuidedContext(context({draft: draft({completed: true, narrative: 'Persisted historical text.', ...change})}));
  expect(result.state).toBe('stale');
  expect(result.result.narrative).toBe('Persisted historical text.');
  expect(result.actions).toEqual(['current', 'result', 'reassess']);
});

test('complete known provenance distinguishes completed unapplied from unknown application', () => {
  const d = draft({completed: true, narrative: 'Stored result.', generated_at: '2026-09-02T12:00:00Z'});
  expect(describeGuidedContext(context({draft: d}))).toMatchObject({state: 'result', applicationState: 'unapplied'});
  expect(describeGuidedContext(context({draft: d, historyComplete: false}))).toMatchObject({state: 'result', applicationState: 'unknown'});
  expect(describeGuidedContext(context({draft: d, record: row('1.1', {last_assessed: d.base_assessment_token})}))).toMatchObject({applicationState: 'unknown'});
  expect(describeGuidedContext(context({draft: d, expectedIdentity: {client_id: 'client-a', assessment_id: 'assessment-1.1'}}))).toMatchObject({applicationState: 'unknown'});
});

test('current and historical applications match exact actor-aware provenance, without regenerating results', () => {
  const d = draft({completed: true, generated_at: '2026-09-02T12:00:00Z', narrative: 'Exact recorded narrative.', lineage_stale: true});
  const current = describeGuidedContext(context({draft: d, record: row('1.1', {guided_assessment_source: source(d), last_assessed: '2026-09-03T12:00:00Z'})}));
  expect(current).toMatchObject({state: 'result', applicationState: 'current', result: {narrative: 'Exact recorded narrative.'}});
  const previous = describeGuidedContext(context({draft: d, record: row('1.1', {assessment_history: [{guided_assessment_source: source(d)}]})}));
  expect(previous.applicationState).toBe('previous');
  expect(previous.summary).toContain('later position');
  const otherActor = describeGuidedContext(context({draft: d, record: row('1.1', {guided_assessment_source: {...source(d), by: 'actor-b'}, assessment_history: []})}));
  expect(otherActor.applicationState).not.toBe('current');
});

test.each(['client_id', 'assessment_id', 'user_id'])('mismatched %s cannot be treated as this saved interview', key => {
  expect(describeGuidedContext(context({draft: draft({[key]: 'other'})}))).toMatchObject({state: 'unavailable', interviewState: 'unavailable', actions: ['current']});
});

test('loading, missing work and unavailable versions preserve uncertainty', () => {
  const loading = describeGuidedContext(context({draftLoaded: false}));
  expect(loading).toMatchObject({state: 'unavailable', interviewState: 'unavailable'});
  const missingWork = describeGuidedContext(context({record: row('1.1', {work: undefined})}));
  expect(missingWork.signals.openFindings).toBeNull();
  expect(missingWork.summary).not.toContain('No immediate interview');
  expect(describeGuidedContext(context({draft: draft(), supportedVersions: []}))).toMatchObject({state: 'unavailable', interviewState: 'unsupported'});
  expect(describeGuidedContext(context({record: row('1.1', {status: null})}))).toMatchObject({state: 'unavailable'});
});

test('read-only context has no edit, restart, or resume action', () => {
  const result = describeGuidedContext(context({draft: draft(), readOnly: true}));
  expect(result.actions).toEqual(['current']);
  expect(result.readOnly).toBe(true);
});

test.each([
  ['2024-02-29', '2024-02-29'], ['2000-02-29', '2000-02-29'],
  ['1900-02-29', null], ['2026-02-29', null], ['2026-04-31', null], ['2026-13-01', null],
  ['2026-10-07T23:00:00-07:00', '2026-10-07'],
  ['2026-10-07T01:00:00+14:00', '2026-10-07'],
  ['2026-10-07T25:00:00Z', null], ['2026-10-07garbage', null], ['', null], [null, null]
])('recordedDate(%j) returns %j without creating or shifting a date', (value, expected) => {
  expect(recordedDate(value)).toBe(expected);
});

test('assessment, write, evidence, and Review dates retain their distinct existing sources', () => {
  const result = describeGuidedContext(context({record: row('1.1', {
    last_assessed: '2026-08-01T23:00:00-07:00', last_saved: '2026-10-01T00:00:00Z',
    work: work({latest_evidence_at: '2026-09-20', next_review_due: '2026-12-31'})
  })}));
  expect(result.dates).toEqual({lastAssessed: '2026-08-01', lastSaved: '2026-10-01', latestEvidence: '2026-09-20', nextReview: '2026-12-31'});
});
