// Diagnostic only. Explicit suite order replaces only Jest's ordering decision.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const Sequencer = require(require.resolve('@jest/test-sequencer', {paths: [process.cwd()]})).default;

const MANIFEST_SHA256 = '4248cdb5d7eebb3d289eb9fc6269bf9512d1cf6484157af7aecb622f3a8dec88';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
function requireThat(condition, message) { if (!condition) throw new Error(message); }
function loadContract() {
  const file = process.env.PRESTIGE_ORIGINAL_ORDER_MANIFEST;
  const output = process.env.PRESTIGE_ORIGINAL_ORDER_OUTPUT;
  requireThat(file && path.isAbsolute(file) && output && path.isAbsolute(output), 'Absolute diagnostic manifest/output paths required');
  const bytes = fs.readFileSync(file);
  requireThat(sha256(bytes) === MANIFEST_SHA256, 'Original-order manifest bytes differ');
  const manifest = JSON.parse(bytes);
  requireThat(manifest.schema_version === 1 && manifest.suite_count === 189 && manifest.case_count === 7307
    && manifest.baseline_commit === 'f6a15b8d84726a49d7cd62d7f77063f8d6ac3e70'
    && manifest.expected_node === 'v22.23.4' && manifest.expected_jest === '27.5.1'
    && manifest.default_timeout_ms === 5000, 'Diagnostic baseline/configuration differs');
  requireThat(Array.isArray(manifest.paths) && manifest.paths.length === 189
    && new Set(manifest.paths).size === 189
    && manifest.paths.every(file => /^src\/.+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
      && !file.includes('\\') && !file.split('/').includes('..'))
    && manifest.paths[84] === 'src/preview/programs/prestigeCapacityPreflight.test.js', 'Invalid explicit suite inventory/order');
  requireThat(same(Object.keys(manifest.cases).sort(), [...manifest.paths].sort())
    && Object.values(manifest.cases).every(value => Number.isInteger(value.count) && value.count > 0 && /^[a-f0-9]{64}$/.test(value.identity_sha256))
    && Object.values(manifest.cases).reduce((sum, value) => sum + value.count, 0) === 7307, 'Invalid original case census');
  fs.mkdirSync(output, {recursive: true});
  return {manifest, output, manifest_sha256: MANIFEST_SHA256};
}
function normalized(file, root = process.cwd()) {
  requireThat(typeof file === 'string' && path.isAbsolute(file), 'Absolute suite path required');
  const relative = path.relative(root, file).split(path.sep).join('/');
  requireThat(relative && !relative.startsWith('../') && !path.isAbsolute(relative), 'Suite outside frontend');
  return relative;
}
function identityCensus(cases) {
  requireThat(Array.isArray(cases), 'Missing native assertion rows');
  const identities = cases.map(value => {
    requireThat(typeof value.fullName === 'string' && typeof value.title === 'string'
      && Array.isArray(value.ancestorTitles) && value.ancestorTitles.every(title => typeof title === 'string'), 'Invalid native case identity');
    return JSON.stringify([value.fullName, value.title, value.ancestorTitles]);
  }).sort();
  return {count: identities.length, identity_sha256: sha256(JSON.stringify(identities))};
}
class OriginalOrderSequencer extends Sequencer {
  sort(tests) {
    const started = process.hrtime.bigint();
    const contract = loadContract(), byPath = new Map();
    for (const test of tests) {
      requireThat(test.context.config.rootDir === process.cwd(), 'Unexpected Jest project root');
      const relative = normalized(test.path);
      requireThat(!byPath.has(relative), 'Duplicate selected suite: ' + relative);
      byPath.set(relative, test);
    }
    requireThat(same([...byPath.keys()].sort(), [...contract.manifest.paths].sort()), 'Selected suites differ from the exact original shard3 set');
    const ordered = contract.manifest.paths.map(file => byPath.get(file));
    fs.writeFileSync(path.join(contract.output, 'sequencer-order.json'), JSON.stringify({schema_version: 1,
      kind: 'diagnostic-only explicit sequencer output', manifest_sha256: contract.manifest_sha256,
      source_sha: process.env.GITHUB_SHA || null, paths: ordered.map(test => normalized(test.path)),
      sequencing_ms_before_receipt_write: Number(process.hrtime.bigint() - started) / 1e6,
      receipt_write_cost_excluded: true}), {flag: 'wx'});
    return ordered;
  }
}
module.exports = OriginalOrderSequencer;
module.exports.contract = {MANIFEST_SHA256, loadContract, normalized, identityCensus, same, requireThat};
