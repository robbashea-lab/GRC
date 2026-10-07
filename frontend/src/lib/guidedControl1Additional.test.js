import additional from '@catalogs/guidedControl1Additional.json';
import metadata from '@catalogs/guidedControl1.json';
import cis from '@catalogs/cisIG1.json';
import {generateResult, visibleQuestions, validateAnswers} from './guidedAssessment';

// Test the content contract independently of the lead-owned assessment engine.
const ids = ['1.3', '1.4', '1.5'];
const questions = id => additional.safeguards[id];
const question = (id, element) => questions(id).find(q => q.id === element);
const visible = (id, answers) => questions(id).filter(q =>
  !q.when || Object.entries(q.when).every(([key, values]) => values.includes(answers[key]))
);
const required = ['id', 'prompt', 'help', 'type', 'choices', 'critical', 'element',
  'status_impact', 'narrative_template', 'gap_template', 'unknown_template',
  'next_step_template', 'evidence_guidance', 'safeguard_id', 'question_set_version',
  'question_id', 'conditional_follow_up'];

test('one additional question array per safeguard, with groups only in lead metadata', () => {
  expect(Object.keys(additional)).toEqual(['safeguards']);
  expect(Object.keys(additional.safeguards)).toEqual(ids);
  for (const id of ids) {
    const requirement = cis.requirements.find(r => r.id === id);
    expect(requirement.version).toBe('8.1');
    expect(requirement.control).toBe(1);
    expect(metadata.definitions[id].title).toBe(requirement.title);
    expect(metadata.definitions[id].groups).toEqual(
      [1, 2, 3].filter(group => group >= requirement.implementation_group)
    );
    expect(metadata.definitions[id].source).toBe(requirement.source);
    for (const q of questions(id)) {
      expect(q).not.toHaveProperty('groups');
      expect(q).not.toHaveProperty('implementation_group');
    }
  }
});

// The updated lead-owned engine now consumes this pack; verify observable results too.
test.each(ids)('%s consumed content handles roots, cadence, gaps and uncertainty separately', id => {
  const root = metadata.definitions[id].root;
  const complete = Object.fromEntries(questions(id).filter(q => q.critical)
    .map(q => [q.id, q.id === 'frequency' ? (id === '1.3' ? 'Daily' : 'Weekly') : 'Yes']));
  expect(generateResult(id, complete).status).toBe('addressed');
  expect(generateResult(id, {...complete, system: '', owner: ''}).status).toBe('addressed');

  const absent = {...complete, [root]: 'No', system: 'Stale tool', owner: 'Stale team'};
  const absentResult = generateResult(id, absent);
  expect(absentResult.status).toBe('needs_attention');
  expect(absentResult.narrative).not.toMatch(/Stale tool|Stale team/);
  expect(visibleQuestions(id, absent).some(q => q.id === 'frequency')).toBe(false);
  expect(generateResult(id, {[root]: 'Not sure'}).status).toBe('not_assessed');
  expect(generateResult(id, {...complete, [root]: 'Partially'}).status).toBe('in_progress');

  const frequency = question(id, 'frequency');
  for (const value of frequency.choices) {
    const result = generateResult(id, {...complete, frequency: value});
    expect(result.status).toBe(value === 'Not sure' || frequency.deficient_values.includes(value)
      ? 'in_progress' : 'addressed');
    expect(result.signals.some(s => s.questionId === 'frequency' && s.kind === 'gap'))
      .toBe(frequency.deficient_values.includes(value));
    expect(result.signals.some(s => s.questionId === 'frequency' && s.kind === 'verification'))
      .toBe(value === 'Not sure');
  }
  const {frequency: omitted, ...missingFrequency} = complete;
  expect(generateResult(id, missingFrequency).status).toBe('in_progress');

  const gap = 'Confirmed: one connected segment is omitted.';
  const uncertainty = 'Unconfirmed: ask the provider whether that segment is covered.';
  const gapResult = generateResult(id, {...complete, gaps: gap});
  expect(gapResult.status).toBe('in_progress');
  expect(gapResult.gaps.join(' ')).toContain(gap);
  expect(gapResult.unknowns).toEqual([]);
  const uncertainAnswers = validateAnswers(id, {...complete, unknowns: uncertainty});
  const unknownResult = generateResult(id, uncertainAnswers);
  expect(unknownResult.status).toBe('in_progress');
  expect(unknownResult.unknowns.join(' ')).toContain(uncertainty);
  expect(unknownResult.gaps).toEqual([]);
  expect(unknownResult.nextSteps.join(' ')).toContain(uncertainty);
  const combined = generateResult(id, {...complete, gaps: gap, unknowns: uncertainty});
  expect(combined.gaps.join(' ')).not.toContain(uncertainty);
  expect(combined.unknowns.join(' ')).not.toContain(gap);
  const narrative = generateResult(id, {...complete, system: 'Reported source', owner: 'Reported team'}).narrative;
  expect(narrative.match(/Reported source/g)).toHaveLength(1);
  expect(narrative.match(/Reported team/g)).toHaveLength(1);
  expect(narrative).not.toContain('{recorded_answer}');
});

test.each(ids)('%s retains schema, unique identities and exact required elements', id => {
  const qs = questions(id);
  expect(new Set(qs.map(q => q.id)).size).toBe(qs.length);
  expect(qs.filter(q => q.critical).map(q => q.element).sort())
    .toEqual([...metadata.definitions[id].requirement_elements].sort());
  for (const q of qs) {
    for (const field of required) {
      expect(q).toHaveProperty(field);
      if (typeof q[field] === 'string') expect(q[field].trim()).not.toBe('');
    }
    expect(q.safeguard_id).toBe(id);
    expect(q.question_set_version).toBe(metadata.version);
    expect(q.question_set_version).toBe('cis-v8.1-control1-2');
    expect(q.question_id).toBe(id + ':' + q.id);
    expect(q.element).toBe(q.id);
    expect(['select', 'text', 'matrix', 'multi', 'date']).toContain(q.type);
    expect(Array.isArray(q.choices)).toBe(true);
    if (q.type === 'select' && q.critical) {
      expect(q.choices).toContain('Not sure');
      expect(q.deficient_values.length).toBeGreaterThan(0);
      expect(q.deficient_values).not.toContain('Not sure');
      for (const value of q.deficient_values) expect(q.choices).toContain(value);
    }
    for (const [key, values] of Object.entries(q.when || {})) {
      const parent = question(id, key);
      expect(parent).toBeDefined();
      for (const value of values) expect(parent.choices).toContain(value);
    }
  }
});

test.each(ids)('%s root contract and hidden follow-ups preserve evidence on every branch', id => {
  const root = metadata.definitions[id].root;
  const q = question(id, root);
  expect(q.critical).toBe(true);
  expect(q.choices).toEqual(['Yes', 'Partially', 'No', 'Not sure']);
  expect(q.deficient_values).toEqual(['Partially', 'No']);
  expect(q.status_impact).toContain('No => not_implemented');
  expect(q.status_impact).toContain('Not sure => not_assessed');
  for (const answer of [undefined, 'No', 'Not sure', 'Yes', 'Partially']) {
    const shown = visible(id, {[root]: answer}).map(q => q.id);
    expect(shown).toContain(root);
    expect(shown).toContain('evidence');
    expect(shown).toContain('gaps');
    expect(shown).toContain('unknowns');
    expect(shown.includes('existing')).toBe(['No', 'Not sure'].includes(answer));
    for (const element of metadata.definitions[id].requirement_elements.filter(e => e !== root)) {
      expect(shown.includes(element)).toBe(['Yes', 'Partially'].includes(answer));
      expect(question(id, element).status_impact).toContain('=> partial');
      expect(question(id, element).status_impact).toContain('=> addressed');
    }
  }
  expect(question(id, 'evidence').critical).toBe(false);
  expect(question(id, 'evidence').evidence_guidance).toMatch(/unverified/);
  expect(question(id, 'context').critical).toBe(false);
});

test.each(ids)('%s optional system and owner capture context only on present-root branches', id => {
  const root = metadata.definitions[id].root;
  for (const key of ['system', 'owner']) {
    const q = question(id, key);
    expect(q.type).toBe('text');
    expect(q.choices).toEqual([]);
    expect(q.critical).toBe(false);
    expect(q.status_impact).toMatch(/Context only/);
    expect(q.help).toMatch(/Optional context/);
    expect(q.help).toMatch(/leave blank if unknown/);
    expect(q.when).toEqual({[root]: ['Yes', 'Partially']});
    for (const answer of [undefined, 'No', 'Not sure', 'Yes', 'Partially']) {
      expect(visible(id, {[root]: answer}).some(q => q.id === key))
        .toBe(['Yes', 'Partially'].includes(answer));
    }
  }
  expect(question(id, 'system').prompt).toMatch(/tool|log sources/);
  expect(question(id, 'owner').help).toMatch(/does not introduce a mandatory owner requirement/);
});

test.each(ids)('%s keeps confirmed gaps separate from unconfirmed narrative context', id => {
  const gaps = question(id, 'gaps');
  const unknowns = question(id, 'unknowns');
  expect(gaps.prompt).toMatch(/confirmed gaps/);
  expect(gaps.prompt).not.toMatch(/unconfirmed/);
  expect(gaps.help).toMatch(/confirmed gaps only/);
  expect(gaps.help).toMatch(/put uncertainty or verification needs in Unconfirmed context/);
  expect(unknowns.prompt).toMatch(/unconfirmed/);
  expect(unknowns.help).toMatch(/not confirmed gaps/);
  expect(unknowns.gap_template).toMatch(/Do not treat unconfirmed context as a confirmed gap/);
  expect(unknowns.narrative_template).toBe('Unconfirmed context: {recorded_answer}.');
  for (const q of [gaps, unknowns]) {
    expect(q.critical).toBe(false);
    expect(q.status_impact).toMatch(/Context only/);
    expect(q).not.toHaveProperty('when');
  }
  for (const q of questions(id)) {
    expect(q.narrative_template).not.toContain(q.prompt);
    expect(q.narrative_template.match(/\{recorded_answer\}/g)).toHaveLength(1);
    expect(q.narrative_template).not.toMatch(/Reported answer:/);
  }
});

test.each(ids)('%s cadence and deficient answers match the source requirement', id => {
  const daily = id === '1.3';
  const frequency = question(id, 'frequency');
  const period = daily ? 'daily' : 'weekly';
  const requirement = cis.requirements.find(r => r.id === id);
  expect(requirement.official_text.toLowerCase()).toContain(period);
  expect(frequency.help.toLowerCase()).toContain(period);
  expect(frequency.choices).toEqual([
    'More frequently than ' + period, daily ? 'Daily' : 'Weekly',
    'Less frequently than ' + period, 'Ad hoc', 'Never', 'Not sure'
  ]);
  expect(frequency.deficient_values).toEqual(['Less frequently than ' + period, 'Ad hoc', 'Never']);
  expect(frequency.critical).toBe(true);
  if (!daily) {
    expect(frequency.prompt).toMatch(/reviewed and used to update/);
    expect(question(id, 'inventory_update').prompt).toMatch(/reviewed and used to update/);
  }
});

test('requirement-specific wording preserves active/passive discovery and DHCP/IPAM alternatives', () => {
  expect(question('1.3', 'tool').prompt).toMatch(/active.*connected.*network/);
  expect(question('1.5', 'tool').prompt).toMatch(/passive.*connected.*network/);
  for (const id of ['1.3', '1.5']) {
    expect(question(id, 'coverage').prompt).toMatch(/connected networks/);
  }
  expect(question('1.4', 'logging').prompt).toMatch(/DHCP logging or an IPAM/);
  expect(question('1.4', 'coverage').help).toMatch(/all DHCP servers/);
  expect(question('1.4', 'coverage').help).toMatch(/IPAM is a permitted alternative/);
  expect(question('1.4', 'approach').choices).toEqual(['DHCP logging', 'IPAM', 'Both', 'Not sure']);
  expect(question('1.4', 'approach').critical).toBe(false);
  expect(question('1.4', 'context').help).toMatch(/CMDB.*not mandatory/);
  expect(question('1.3', 'context').help).toMatch(/Automatic updates.*not an additional critical/);
  for (const id of ids) {
    expect(question(id, 'evidence').evidence_guidance).toMatch(/configuration/);
    expect(question(id, 'evidence').evidence_guidance).toMatch(/dated/);
  }
});
