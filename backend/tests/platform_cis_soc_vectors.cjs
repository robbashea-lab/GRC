// Existing pure engines serialize QA vectors; source fixtures choose expected outcomes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const json = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const pureModules = new Set(['guidedAssessment', 'guidedLifecycle', 'focusedOmni', 'refinedOmni', 'omniInventorySummary', 'omniCisSummary', 'socGuidedAssessment', 'inlineAssessment', 'programTriage', 'managementDates', 'grcWork']);
const pureData = new Set(['grcRules.json']);
const modules = new Map();
class AssessmentDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-09T12:00:00Z'])); }
  static now() { return new Date('2026-10-09T12:00:00Z').getTime(); }
}
function engine(name) {
  assert(pureModules.has(name), 'Only inspected pure assessment modules may run');
  if (modules.has(name)) return modules.get(name);
  const parameters = ['Date'], inputs = [AssessmentDate];
  let source = fs.readFileSync(path.join(root, 'frontend/src/lib', name + '.js'), 'utf8');
  source = source.replace(/^import (.+?) from ['"](.+?)['"];\r?\n/gm, (_, binding, reference) => {
    parameters.push(binding);
    if (reference.startsWith('@catalogs/')) inputs.push(json('shared/catalogs/' + reference.slice(10)));
    else {
      assert(reference.startsWith('./'));
      const dependency = reference.slice(2);
      if (dependency.endsWith('.json')) {
        assert(pureData.has(dependency), 'Only inspected pure assessment data may load');
        inputs.push(json('frontend/src/lib/' + dependency));
      } else inputs.push(engine(dependency));
    }
    return '';
  });
  const exports = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]);
  const result = new Function(...parameters, source.replace(/\bexport /g, '') + '\nreturn {' + exports.join(',') + '};')(...inputs);
  modules.set(name, result);
  return result;
}
const cis = json('shared/catalogs/cisIG1.json'), soc = json('shared/catalogs/soc2.json');
const guided = engine('guidedAssessment'), refined = engine('refinedOmni'), summary = engine('omniCisSummary'), socEngine = engine('socGuidedAssessment');
const sourceCases = Object.fromEntries([1, 2, 3].map(group => [group, json('docs/omni-cis-rollout/ig' + group + '-status-cases.json').cases]));
const reviewedMappings = [...json('docs/omni-cis-rollout/ig2-review.json').rows, ...json('docs/omni-cis-rollout/ig3-review.json').rows];
// Only these authored supplements were retired by the approved Navigator reconciliation.
const retiredCriteria = {'11.1': ['11.1-guided-backup-procedures'], '17.5': ['17.5-guided-third-parties']};
const clone = value => JSON.parse(JSON.stringify(value));
const clients = {cis1: 'Synthetic platform acceptance CIS IG1', cis2: 'Synthetic platform acceptance CIS IG2', cis3: 'Synthetic platform acceptance CIS IG3',
  soc38: 'Synthetic platform acceptance SOC Security Availability Confidentiality', soc61: 'Synthetic platform acceptance SOC all-category derivative'};
function checkpoints(id, version, accepted, groupsFor, cisSteps = false) {
  const answers = {}, steps = [];
  for (let index = 0; index < 30; index++) {
    let groups = groupsFor(id, answers, version).filter(group => group.questions.length);
    if (index >= groups.length) break;
    // Re-query within the current group after a parent answer reveals its children.
    for (let pass = 0; pass < 3; pass++) {
      groups = groupsFor(id, answers, version).filter(group => group.questions.length);
      for (const question of groups[index].questions) if (Object.hasOwn(accepted, question.id)) answers[question.id] = clone(accepted[question.id]);
    }
    const next = Math.min(index + 1, groups.length - 1);
    // CIS stores a visible-question index; SOC stores an active-group index.
    const step = cisSteps ? guided.visibleQuestions(id, answers, version).findIndex(question => question.id === groups[next].questions[0].id) : next;
    steps.push({step, answers: clone(answers)});
  }
  assert.deepEqual(answers, accepted, id + ': every accepted active answer must be reachable in its group');
  return steps;
}
function cisVector(native, scenario) {
  const id = native.id, version = guided.versionForSafeguard(id), pack = guided.catalogForVersion(version), questions = pack.safeguards[id];
  const fixtureId = native.implementation_group === 1 ? `IG1-${id}-${scenario === 'adequate' ? 'complete' : 'unknown'}` : `${id}:${scenario === 'adequate' ? 'complete' : 'all_unknown'}`;
  const accepted = sourceCases[native.implementation_group].find(row => row.id === fixtureId);
  assert(accepted, 'Missing independently authored vector: ' + fixtureId);
  let answers = clone(accepted.answers || {});
  if (!accepted.answers) {
    const review = reviewedMappings.find(row => row.id === id);
    for (const [criterion, value] of Object.entries(accepted.criterion_answers)) {
      const mapping = review.atomic_requirements.find(row => row.requirement_id === criterion).answer_mapping;
      if (mapping.type === 'matrix') {
        const question = questions.find(row => row.criterion_ids?.includes(criterion));
        if (!question && version === 'cis-v8.1-program-5' && retiredCriteria[id]?.includes(criterion)) {
          assert(!pack.definitions[id].elements.some(element => element.id === criterion));
          continue;
        }
        assert(question, 'Unmapped source requirement: ' + criterion);
        const label = question.rows[question.criterion_ids.indexOf(criterion)];
        answers[question.id] = {...answers[question.id], [label]: value};
      } else {
        const question = questions.find(row => row.id === mapping.field);
        assert(question);
        answers[question.id] = question.choices.includes(value) ? value : value === 'Yes' ? mapping.accepted[0] : value;
      }
    }
    answers[pack.definitions[id].root] = accepted.aggregate_answer ?? accepted.root_answer ?? (scenario === 'adequate' ? 'Yes' : 'Not sure');
  }
  for (const question of questions.filter(question => question.optional)) answers[question.id] = 'No';
  // Source vectors retain old inactive fields; only active facts enter this new interview.
  const active = guided.visibleQuestions(id, answers, version);
  answers = Object.fromEntries(Object.entries(answers).filter(([key]) => active.some(question => key === question.id || key === question.id + '_detail')));
  guided.validateAnswers(id, answers, version);
  const expected = accepted.expected_native_state || accepted.expected_status;
  assert.equal(expected, scenario === 'adequate' ? 'addressed' : 'not_assessed');
  const client = 'cis' + native.implementation_group;
  const result = summary.omniCisSummary(id, answers, version, clients[client]).result;
  assert.equal(result.status, expected, fixtureId);
  return {framework: 'cis-ig1', id, version, scenario, client, answers, expected_status: expected,
    expected_basis: accepted.justification || accepted.source_reason,
    expected_source: accepted.source || native.source, fixture_id: fixtureId,
    groups: refined.omniGroups(id, answers, version).filter(group => group.questions.length).map(group => group.questions.map(question => question.id)),
    checkpoints: checkpoints(id, version, answers, refined.omniGroups, true), result};
}
function socVector(native, scenario) {
  const id = native.id, version = socEngine.socGuidedCatalog.version;
  let answers = {};
  // Context determines its children before they are answered; hidden children are never injected.
  for (let pass = 0; pass < 3; pass++) for (const question of socEngine.socQuestions(id, answers, version)) {
    if (['text'].includes(question.type) || ['gaps', 'unknowns', 'evidence'].includes(question.id)) continue;
    const value = question.optional ? 'No' : scenario === 'unknown' ? 'Not sure' : question.type === 'context' ? 'Relevant' : 'Yes';
    assert(question.choices.includes(value), `${id}/${question.id}: positive framing/choices require source review`);
    answers[question.id] = value;
  }
  socEngine.validateSocAnswers(id, answers, version); socEngine.validateSocCompletion(id, answers, version);
  const expected = scenario === 'adequate' ? 'addressed' : 'not_assessed';
  const client = ['security', 'availability', 'confidentiality'].includes(native.category) ? 'soc38' : 'soc61';
  const result = socEngine.socGuidedResult(id, answers, version, clients[client]);
  assert.equal(result.status, expected, id + '/' + scenario);
  return {framework: 'soc-2', id, version, scenario, client, answers, expected_status: expected,
    expected_basis: scenario === 'adequate' ? 'All active positively framed substantive practices are affirmed; optional prose/evidence is omitted. Reported readiness is separate from operating assurance.' : 'No substantive practice or affirmative absence is supported. Context uncertainty cannot fabricate implementation or deficiency.',
    expected_source: native.source, fixture_id: `SOC-${id}-${scenario}`,
    groups: socCheckpointGroups(id, answers, version).map(group => group.questions.map(question => question.id)),
    checkpoints: checkpoints(id, version, answers, socCheckpointGroups), result};
}
// The existing popup renders optional presence questions within its last native group.
function socCheckpointGroups(id, answers, version) {
  const groups = socEngine.socGroups(id, answers, version);
  return groups.map((group, index) => index === groups.length - 1
    ? {...group, questions: [...group.questions, ...socEngine.socExtraQuestions(answers, version).filter(question => question.id !== 'evidence')]}
    : group);
}
const vectors = [...cis.requirements.flatMap(row => ['adequate', 'unknown'].map(scenario => cisVector(row, scenario))),
  ...soc.requirements.flatMap(row => ['adequate', 'unknown'].map(scenario => socVector(row, scenario)))];
assert.equal(vectors.length, 428);
assert.equal(new Set(vectors.map(row => row.framework + ':' + row.id)).size, 214);
for (const vector of vectors) {
  assert(vector.expected_basis && vector.expected_source);
  for (const heading of ['OVERVIEW', 'IMPLEMENTATION BREAKDOWN', 'ITEMS TO ADDRESS']) assert.equal(vector.result.narrative.split(heading).length, 2);
}
process.stdout.write(JSON.stringify({kind: 'Actual-engine serialization of source-accepted synthetic inputs, not independent prose approval', assessment_date: '2026-10-09', clients, vectors}));
