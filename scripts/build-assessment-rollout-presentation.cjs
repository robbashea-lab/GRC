/* Offline package normalization only; never imports or evaluates application code.
 * Usage: node scripts/build-assessment-rollout-presentation.cjs PACKAGE_DIRECTORY NEW_OUTPUT
 * Output is CreateNew so rebuilding cannot silently replace reviewed metadata.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const [packageDirectory, output] = process.argv.slice(2);
assert(packageDirectory && output, 'Supply the package directory and a NEW output path.');
const hashes = {};
function read(relative) {
  const bytes = fs.readFileSync(path.join(packageDirectory, relative));
  hashes[relative] = crypto.createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes.toString('utf8'));
}
const rollout = read('specifications/ROLLOUT.json');
const holds = read('quality-assurance/CONTENT-HOLDS.json');
const registrations = read('specifications/OPTIONAL-QUESTION-REGISTRATION.json');
const soaNativeFields = read('reference/SOA-NATIVE-FIELD-MAP.json');
assert.equal(hashes['specifications/ROLLOUT.json'], '7217be1d3e0ccd78b4314affb45eec8d4514d10d9c1b38780f097dff461ac9a4');
assert.equal(hashes['quality-assurance/CONTENT-HOLDS.json'], 'b0b447290e505b2c56f07ce6b3fbd1e76afa4a33d199fed5a7892fba78f99eeb');
assert.equal(hashes['specifications/OPTIONAL-QUESTION-REGISTRATION.json'], 'b6533f3b00a1c0664e15f0a95fbd87b85350f0c40bd39f1e67e58b3bb83559fb');
assert.equal(hashes['reference/SOA-NATIVE-FIELD-MAP.json'], 'aa53c2ab49b7ab49295ec2bf61a9247d2aee2740faabdad0f3fe7391103277b5');
assert.equal(rollout.entries.length, 554);
assert.equal(holds.records.length, 235);
assert.equal(registrations.questions.length, 277);
const held = new Map(holds.records.map(row => [row.record_key, row.reason]));
const optional = new Map(registrations.questions.map(row => [row.record_key + '#' + row.question_id, row]));
const frameworkKeys = {cis: 'cis-ig1', soc2: 'soc-2', iso27001: 'iso-27001'};
const sources = [], tools = [];
const sourceKeys = new Map(), toolKeys = new Map();
function intern(value, list, keys) {
  const key = JSON.stringify(value);
  if (!keys.has(key)) { keys.set(key, list.length); list.push(value); }
  return keys.get(key);
}
function versions(entry) {
  if (entry.family === 'cis') return [
    ['1.1', '1.2', '1.3', '1.4', '1.5'].includes(entry.id)
      ? 'cis-v8.1-control1-5' : 'cis-v8.1-program-5',
  ];
  if (entry.module_key === 'criterion') return ['soc2-omni-2', 'soc2-assessment-rollout-1'];
  if (['isms', 'annex_a'].includes(entry.module_key)) return ['iso27001-omni-2', 'iso27001-assessment-rollout-1'];
  return [];
}
function guidance(callout, help) {
  const text = typeof callout === 'string' ? callout : callout?.text;
  if (!text && !help) return null;
  const contextOnly = typeof callout === 'object' && /implementation context/i.test(callout?.label || callout?.classification || '');
  return contextOnly ? {context: text || help} : {
    ...(text ? {requirement: text} : {}),
    ...(callout?.highlight ? {highlight: callout.highlight} : {}),
    ...(help && help !== text ? {context: help} : {}),
  };
}
function nativeQuestionId(entry, question) {
  const registered = optional.get(entry.record_key + '#' + question.id);
  const id = registered?.question_id || question.native_question_id || question.native_id || null;
  return entry.family === 'cis' && id?.startsWith(entry.id + ':') ? id.slice(entry.id.length + 1) : id;
}
let presentations = 0, registeredCount = 0;
const records = rollout.entries.map(entry => {
  const hold = held.get(entry.record_key);
  const record = {
    key: entry.record_key,
    frameworkKey: frameworkKeys[entry.family],
    module: entry.module_key,
    id: entry.native_id,
    definitionId: entry.native_module_identity.definition_id,
    packageKey: entry.native_module_identity.package_key,
    reference: entry.reference || entry.native_module_identity.definition_id,
    versions: versions(entry),
    requirement: hold ? null : {text: entry.requirement_summary, trigger: entry.required_trigger},
    sourceIds: (entry.official_sources || []).map(source => intern(source, sources, sourceKeys)),
    ...(hold ? {hold: {reason: hold, fallback: 'unchanged_native_content'}} : {}),
    questions: entry.all_question_presentations.map(question => {
      presentations++;
      const registration = optional.get(entry.record_key + '#' + question.id);
      if (registration) registeredCount++;
      const soa = entry.module_key === 'statement_of_applicability';
      const questionGuidance = hold ? null : guidance(question.requirement_callout, question.help);
      if (soa) {
        assert.equal(hold, undefined, 'SoA presentation must not bypass a content hold.');
        assert.equal(question.native_question_id, null);
        assert.equal(typeof question.prompt, 'string');
        assert(question.prompt.trim());
        const prefix = 'SOA-' + entry.native_id + '-';
        assert(question.id.startsWith(prefix));
        assert.deepEqual(question.native_mapping, soaNativeFields[question.id.slice(prefix.length)]);
        assert.equal(typeof question.requirement_callout?.source_reference, 'string');
        assert(question.requirement_callout.source_reference.trim());
        assert(questionGuidance);
        questionGuidance.sourceReference = question.requirement_callout.source_reference;
      }
      const result = {
        presentationId: question.id,
        questionId: nativeQuestionId(entry, question),
        ...(soa ? {prompt: question.prompt} : {}),
        ...(question.native_mapping ? {nativeMapping: question.native_mapping} : {}),
        ...(question.type === 'select_matrix_row' ? {row: question.native_matrix_key} : {}),
        ...(question.criterion_id ? {criterionId: question.criterion_id} : {}),
        ...(registration ? {version: registration.version} : {}),
        guidance: questionGuidance,
      };
      // Controls 1–9 nest exact row text; Controls 10–18 use flattened presentations.
      if (question.row_questions?.length) result.rows = question.row_questions.map(row => ({
        row: row.native_matrix_row,
        ...(row.criterion_id ? {criterionId: row.criterion_id} : {}),
        guidance: hold ? null : guidance(row.requirement_callout, row.help),
      }));
      if (question.tool_capability || question.tool_capability_resolved) {
        const options = (question.tool_options || []).map(option => ({
          id: option.id, label: option.label, scopeLimit: option.scope_limit,
        }));
        result.toolId = intern({
          capability: question.tool_capability_resolved || question.tool_capability,
          manualOnly: options.length === 0,
          options,
        }, tools, toolKeys);
      }
      return result;
    }),
  };
  assert(record.frameworkKey && record.id && record.module, entry.record_key);
  return record;
});
assert.equal(presentations, 4948);
assert.equal(registeredCount, 277);
assert.equal(new Set(records.map(record => record.key)).size, records.length);
assert.equal(records.filter(record => record.hold).length, 235);
const soaRecords = records.filter(record => record.module === 'statement_of_applicability');
assert.equal(soaRecords.length, 93);
assert.equal(soaRecords.reduce((count, record) => count + record.questions.length, 0), 558);
for (const record of records) {
  for (const question of record.questions) {
    if (question.row !== undefined) assert.equal(typeof question.row, 'string');
    for (const row of question.rows || []) assert.equal(typeof row.row, 'string');
    if (record.hold) {
      assert.equal(question.guidance, null);
      assert((question.rows || []).every(row => row.guidance === null));
    }
  }
}
const metadata = {
  schemaVersion: 1,
  purpose: 'Presentation only; native scope, questions, permissions, answers, scoring and persistence remain authoritative.',
  provenance: {package: 'package-ab309d62', sourceRevision: rollout.source_revision, sha256: hashes},
  coverage: {records: records.length, presentations, normativeHolds: held.size, optionalRegistrations: registeredCount},
  sources, tools, records,
};
fs.writeFileSync(output, JSON.stringify(metadata, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
console.log(JSON.stringify({output, ...metadata.coverage}));
