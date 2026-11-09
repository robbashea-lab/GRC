import registry from '@catalogs/assessmentRolloutPresentation.json';
import {assessmentRolloutEntry, assessmentQuestionPresentation} from './assessmentRolloutPresentation';

test('all package views are represented without selecting a questionnaire or carrying answers', () => {
  expect(registry.coverage).toEqual({records: 554, presentations: 4948, normativeHolds: 235, optionalRegistrations: 277});
  expect(registry.records).toHaveLength(554);
  expect(new Set(registry.records.map(record => record.key)).size).toBe(554);
  expect(registry.records.reduce((count, record) => count + record.questions.length, 0)).toBe(4948);
  expect(registry.records.filter(record => record.frameworkKey === 'cis-ig1')).toHaveLength(153);
  for (const record of registry.records) {
    expect(record).not.toHaveProperty('answers');
    expect(record).not.toHaveProperty('status');
    expect(record).not.toHaveProperty('eligible');
    expect(record).not.toHaveProperty('permissions');
    expect(record).not.toHaveProperty('score');
  }
});

test('native framework keys and exact identity are required', () => {
  expect(assessmentRolloutEntry('cis-ig1', '1.1')).toMatchObject({id: '1.1', module: 'safeguard'});
  expect(assessmentRolloutEntry('cis-ig2', '1.1')).toBeNull();
  expect(assessmentRolloutEntry('CIS', '1.1')).toBeNull();
  expect(assessmentRolloutEntry('cis-ig1', ' 1.1')).toBeNull();
  expect(assessmentRolloutEntry('cis-ig1', null)).toBeNull();
  expect(assessmentRolloutEntry('cis-ig1', '1.1', {module: 'criterion'})).toBeNull();
});

test('ambiguous ISO implementation versus SoA requires the actual module', () => {
  expect(assessmentRolloutEntry('iso-27001', 'A.5.1')).toBeNull();
  expect(assessmentRolloutEntry('iso-27001', 'A.5.1', {module: 'annex_a'}))
    .toMatchObject({module: 'annex_a', requirement: null, hold: {fallback: 'unchanged_native_content'}});
  expect(assessmentRolloutEntry('iso-27001', 'A.5.1', {module: 'statement_of_applicability'}))
    .toMatchObject({module: 'statement_of_applicability', requirement: {text: expect.any(String)}});
  expect(assessmentRolloutEntry('iso-27001', '4-1', {module: 'internal_audit', packageKey: 'governance-risk'}))
    .toMatchObject({id: '4-1', definitionId: '4.1', packageKey: 'governance-risk'});
  expect(assessmentRolloutEntry('iso-27001', '4-1', {module: 'internal_audit', packageKey: 'wrong'})).toBeNull();
});

test('all 235 holds contain no candidate normative body, trigger or question guidance', () => {
  const held = registry.records.filter(record => record.hold);
  expect(held).toHaveLength(235);
  for (const record of held) {
    expect(record.requirement).toBeNull();
    for (const question of record.questions) {
      expect(question.guidance).toBeNull();
      expect(question).not.toHaveProperty('prompt');
      expect(question).not.toHaveProperty('sourceReference');
      for (const row of question.rows || []) expect(row.guidance).toBeNull();
    }
  }
});

test('nested native matrices use exact saved container and row text', () => {
  const entry = assessmentRolloutEntry('cis-ig1', '1.1');
  const matrix = entry.questions.find(question => question.questionId === 'coverage');
  const row = matrix.rows[0].row;
  expect(assessmentQuestionPresentation('cis-ig1', '1.1', 'coverage',
    {row, version: 'cis-v8.1-control1-5'})).toMatchObject({questionId: 'coverage', row});
  expect(assessmentQuestionPresentation('cis-ig1', '1.1', 'coverage',
    {row: row + ' ', version: 'cis-v8.1-control1-5'})).toBeNull();
  expect(assessmentQuestionPresentation('cis-ig1', '1.1', 'coverage',
    {row, version: 'cis-v8.1-control1-4'})).toBeNull();
});

test('flattened matrix display criterion never replaces its native container or exact row', () => {
  const row = 'Anti-malware software is deployed on all enterprise assets.';
  const presentation = assessmentQuestionPresentation('cis-ig1', '10.1', 'requirements_0',
    {row, version: 'cis-v8.1-program-5'});
  expect(presentation).toMatchObject({presentationId: '10.1-c2', questionId: 'requirements_0', row, criterionId: '10.1-c2'});
  expect(assessmentQuestionPresentation('cis-ig1', '10.1', '10.1-c2',
    {row, version: 'cis-v8.1-program-5'})).toBeNull();
  expect(assessmentQuestionPresentation('cis-ig1', '10.1', 'requirements_0')).toBeNull();
  expect(assessmentQuestionPresentation('cis-ig1', '10.1', 'requirements_0',
    {row: row.slice(0, -1), version: 'cis-v8.1-program-5'})).toBeNull();
});

test('new optional text metadata requires its exact registered version', () => {
  const questionId = 'CC1.1-implementation-method';
  expect(assessmentQuestionPresentation('soc-2', 'CC1.1', questionId)).toBeNull();
  expect(assessmentQuestionPresentation('soc-2', 'CC1.1', questionId, {version: 'soc2-omni-2'})).toBeNull();
  expect(assessmentQuestionPresentation('soc-2', 'CC1.1', questionId,
    {version: 'soc2-assessment-rollout-1'})).toMatchObject({questionId, version: 'soc2-assessment-rollout-1'});
  expect(assessmentQuestionPresentation('soc-2', 'CC1.1', 'CC1.1-expectations',
    {version: 'soc2-omni-1'})).toBeNull();
  expect(assessmentQuestionPresentation('soc-2', 'CC1.1', 'CC1.1-expectations',
    {version: 'soc2-omni-2'})).not.toBeNull();
});

test('prospective presentation versions retain exact R1 registration and reject unrelated versions', () => {
  let checked = 0;
  const successors = {
    'soc2-assessment-rollout-1': 'soc2-assessment-rollout-2',
    'iso27001-assessment-rollout-1': 'iso27001-assessment-rollout-2',
  };
  for (const record of registry.records) {
    for (const question of record.questions.filter(item => item.version)) {
      const options = {module: record.module, packageKey: record.packageKey, row: question.row};
      const original = assessmentQuestionPresentation(record.frameworkKey, record.id, question.questionId,
        {...options, version: question.version});
      expect(original).not.toBeNull();
      expect(assessmentQuestionPresentation(record.frameworkKey, record.id, question.questionId,
        {...options, version: successors[question.version]})).toEqual(original);
      expect(original.version).toBe(question.version);
      expect(assessmentQuestionPresentation(record.frameworkKey, record.id, question.questionId,
        {...options, version: record.frameworkKey === 'soc-2' ? 'soc2-omni-2' : 'iso27001-omni-2'})).toBeNull();
      expect(assessmentQuestionPresentation(record.frameworkKey, record.id, question.questionId,
        {...options, version: 'unregistered-proposal-version'})).toBeNull();
      checked++;
    }
  }
  expect(checked).toBe(277);
});

test('SoA display IDs explicitly retain native field mapping rather than becoming answer keys', () => {
  const result = assessmentQuestionPresentation('iso-27001', 'A.5.1', 'soa_applicability',
    {module: 'statement_of_applicability'});
  expect(result).toMatchObject({presentationId: 'SOA-A.5.1-necessary', questionId: null,
    nativeMapping: {native_field: 'soa_applicability'}});
  expect(assessmentQuestionPresentation('iso-27001', 'A.5.1', 'soa_applicability')).toBeNull();
});

test('all 558 SoA presentations preserve exact package prompts, callout citations and native mappings', () => {
  const expected = {
    necessary: {
      prompt: 'Is this control necessary for the organization’s selected treatments or applicable obligations?',
      nativeMapping: {render: 'existing applicability selector', native_field: 'soa_applicability',
        value_map: {Necessary: 'included', 'Not necessary': 'excluded', Undetermined: ''},
        write: 'native SoA save path; preserve exclusion/status validation'},
    },
    rationale: {
      prompt: 'What is the organization-specific reason for including this control or excluding it from the Annex A reference set?',
      nativeMapping: {render: 'existing justification text', native_field: 'soa_justification',
        write: 'native SoA save path; max4000; retain current rationale'},
    },
    'risk-links': {
      prompt: 'Which assessed risks or other obligations support that decision?',
      nativeMapping: {render: 'existing Linked records controls', native_field: null,
        write: 'existing relationship handlers only; no invented questionnaire answer'},
    },
    implementation: {
      prompt: 'If necessary, is the control implemented?',
      nativeMapping: {render: 'existing Implementation status control, not a duplicate yes/no question', native_field: 'status',
        write: 'existing assessment Save path; applicability decision does not change implementation'},
    },
    owner: {
      prompt: 'Who is responsible for the decision and its maintenance?',
      nativeMapping: {render: 'existing Assessment details ownership controls', native_field: 'owner_id / process_owner_id',
        write: 'existing native assignment controls and eligibility rules; no inferred actor IDs'},
    },
    'review-trigger': {
      prompt: 'What organizational changes or planned review arrangements will prompt reconsideration?',
      nativeMapping: {render: 'existing linked Review scheduling through native management controls', native_field: null,
        write: 'existing FrameworkReviewSetup/Review handlers; no new trigger storage field or automatic review creation'},
    },
  };
  const soa = registry.records.filter(record => record.module === 'statement_of_applicability');
  expect(soa).toHaveLength(93);
  let count = 0;
  for (const record of soa) {
    expect(record.questions).toHaveLength(6);
    expect(record.questions.map(question => question.presentationId))
      .toEqual(Object.keys(expected).map(suffix => `SOA-${record.id}-${suffix}`));
    for (const [suffix, fields] of Object.entries(expected)) {
      const result = assessmentQuestionPresentation('iso-27001', record.id, `SOA-${record.id}-${suffix}`,
        {module: 'statement_of_applicability'});
      expect(result.questionId).toBeNull();
      expect(result.prompt).toBe(fields.prompt);
      expect(result.nativeMapping).toEqual(fields.nativeMapping);
      expect(result.reference).toBe(record.id);
      expect(result.sourceReference).toBe('ISO/IEC 27001:2022 · 6.1.3(d)');
      expect(result.guidance).toEqual({
        requirement: 'The SoA records necessary controls, inclusion reasons, implementation and justified Annex A exclusions. The decision must reflect this organization, rather than a default answer.',
        highlight: 'organization-specific justification',
        sourceReference: 'ISO/IEC 27001:2022 · 6.1.3(d)',
      });
      expect(result).not.toHaveProperty('answers');
      count++;
    }
  }
  expect(count).toBe(558);
  for (const record of registry.records.filter(record => record.module !== 'statement_of_applicability')) {
    for (const question of record.questions) {
      expect(question).not.toHaveProperty('prompt');
      expect(question.guidance || {}).not.toHaveProperty('sourceReference');
    }
  }
});

test('tool metadata preserves labels and capability limitations, with manual-only alternatives', () => {
  const tool = assessmentQuestionPresentation('cis-ig1', '1.1', 'system').tool;
  expect(tool.options).toHaveLength(11);
  expect(tool.options.find(option => option.id === 'intune'))
    .toMatchObject({label: 'Microsoft Intune', scopeLimit: expect.stringContaining('managed')});
  expect(assessmentQuestionPresentation('cis-ig1', '3.11', 'system').tool)
    .toMatchObject({manualOnly: true, options: []});
  expect(assessmentQuestionPresentation('cis-ig1', '4.9', 'system').tool).toBeNull();
  expect(Object.isFrozen(tool.options)).toBe(true);
});
