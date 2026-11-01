const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const commonjs = require('@babel/plugin-transform-modules-commonjs');
const transformer = require('./transform.cjs');
const {plugin, appendDiagnosticPlugin, createJestBabelTransform, SOURCE_SHA, BASELINE, TARGET,
  STOCK_PATH, ownSHA, stockSHA, factorySHA} = transformer._test;
const stock = require(STOCK_PATH);
// Windows checkout fixtures use CRLF; the actual diagnostic transformer accepts only exact hosted LF bytes.
const source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');
const fixture = `import {cisSummary} from '../lib/cisVerification';
export function demoCurrentPositions(included,key) { const summary=cisSummary(included),metrics=null; return summary; }`;

function transformFixture(text = fixture, report = () => {}) {
  return babel.transformSync(text, {filename: TARGET, plugins: [[plugin, {report}], commonjs],
    babelrc: false, configFile: false, sourceMaps: true});
}
function loadFixture(text, summary, measure = fn => fn()) {
  const binding = {cisSummary: summary}, exports = {}, loaded = [];
  const context = {exports, require: name => {
    assert.equal(name, '../lib/cisVerification');return binding;
  }, __ISO_SUMMARY_COST__: {measure, loaded: value => loaded.push(value)}};
  vm.runInNewContext(transformFixture(text).code, context);
  return {run: exports.demoCurrentPositions, binding, loaded};
}
function options() {
  const frontend = path.resolve(__dirname, '../..');
  return {config: {cwd: frontend, rootDir: frontend}, configString: JSON.stringify({cwd: frontend, rootDir: frontend}),
    instrument: false, supportsDynamicImport: false, supportsExportNamespaceFrom: false,
    supportsStaticESM: false, supportsTopLevelAwait: false};
}
function withEnvironment(values, run) {
  const prior = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); }
  finally { for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}

test('exact bound call transforms once and preserves original source-map content', () => {
  let proof;
  const result = transformFixture(fixture, value => { proof = value; });
  assert.equal(proof.matches, 1);assert.equal(proof.original_source_sha256, SOURCE_SHA);
  assert.deepEqual(result.map.sourcesContent, [fixture]);
  assert.match(result.code, /__ISO_SUMMARY_COST__\.measure/);
});
test('ISO evaluation invokes the unchanged import exactly once and returns its exact identity without metadata reads', () => {
  const returned = {}, included = {};let calls = 0, observations = 0, getters = 0;
  Object.defineProperty(included, 'status', {get() { getters++;throw Error('must not read'); }});
  const loaded = loadFixture(fixture, value => { calls++;assert.equal(value, included);return returned; }, fn => { observations++;return fn(); });
  assert.deepEqual(loaded.loaded, [SOURCE_SHA]);
  assert.equal(loaded.run(included, 'iso-27001'), returned);
  assert.equal(calls, 1);assert.equal(observations, 1);assert.equal(getters, 0);
});
test('non-ISO call remains direct and dynamic imported-binding replacements are retained', () => {
  const first = {}, second = {};let observations = 0, calls = 0;
  const loaded = loadFixture(fixture, () => { calls++;return first; }, fn => { observations++;return fn(); });
  assert.equal(loaded.run([], 'cis-ig1'), first);assert.equal(observations, 0);
  loaded.binding.cisSummary = () => { calls++;return second; };
  assert.equal(loaded.run([], 'iso-27001'), second);assert.equal(observations, 1);assert.equal(calls, 2);
});
test('original thrown object crosses the diagnostic thunk unchanged', () => {
  const failure = {};let calls = 0;
  const loaded = loadFixture(fixture, () => { calls++;throw failure; });
  assert.throws(() => loaded.run([], 'iso-27001'), error => error === failure);assert.equal(calls, 1);
});
test('shadowed or wrong named imports and wrong owner/argument refuse structural matching', () => {
  for (const text of [
    fixture.replace("'../lib/cisVerification'", "'../lib/other'"),
    fixture.replace('export function demoCurrentPositions(included,key)', 'export function elsewhere(included,key)'),
    fixture.replace('cisSummary(included),metrics', 'cisSummary(key),metrics'),
    fixture.replace('const summary=', 'const cisSummary=()=>0; const summary='),
  ]) assert.throws(() => transformFixture(text), /exactly one bound ISO-summary call/);
});
test('zero and multiple exact matches fail closed', () => {
  assert.throws(() => transformFixture(fixture.replace('cisSummary(included)', 'other(included)')), /found 0/);
  const multiple = `import {cisSummary} from '../lib/cisVerification'; export function demoCurrentPositions(included,key) {
    { const summary=cisSummary(included); } { const summary=cisSummary(included); } }`;
  assert.throws(() => transformFixture(multiple), /found 2/);
});
test('target file and original bytes are exact and mismatched source cannot be transformed', () => {
  transformer._test.verifySource(source, TARGET);
  assert.throws(() => transformer._test.verifySource(source + '\n', TARGET), /bytes differ/);
  assert.throws(() => transformer._test.verifySource(source, TARGET + '.other'), /wrong target/);
  assert.throws(() => transformer.process(source + '\n', TARGET, options()), /bytes differ/);
});
test('non-target transformation delegates unchanged to the configured native CRACO transformer', () => {
  withEnvironment({NODE_ENV: 'test'}, () => {
    const filename = path.join(path.dirname(TARGET), 'unrelated.js'), text = 'export const value=1;';
    assert.deepEqual(transformer.process(text, filename, options()), stock.process(text, filename, options()));
    assert.equal(transformer.getCacheKey(text, filename, options()), stock.getCacheKey(text, filename, options()));
  });
});
test('actual target transformation retains source maps, emits one bounded proof and salts diagnostic cache identity', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'iso-summary-transform-'));
  try {
    withEnvironment({NODE_ENV: 'test', ISO_SUMMARY_COST_OUTPUT: output, ISO_SUMMARY_COST_APP_SHA: BASELINE, GITHUB_SHA: 'd'.repeat(40)}, () => {
      const firstKey = transformer.getCacheKey(source, TARGET, options());
      process.env.GITHUB_SHA = 'e'.repeat(40);
      assert.notEqual(transformer.getCacheKey(source, TARGET, options()), firstKey);
      const result = transformer.process(source, TARGET, options());
      assert.equal(typeof result.code, 'string');assert.ok(result.map.sourcesContent.includes(source));
      const proofFile = path.join(output, 'transform-proof.json'), proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
      assert.equal(proof.matched_calls, 1);assert.equal(proof.original_source_sha256, SOURCE_SHA);
      assert.equal(proof.harness_sha256, ownSHA);assert.equal(proof.observed_source_sha, 'e'.repeat(40));
      assert.equal(proof.native_route_sha256, stockSHA);assert.equal(proof.native_factory_sha256, factorySHA);
      assert.equal(proof.config_control.other_arguments_unchanged, true);
      assert.equal(proof.original_sources_content_preserved, true);assert.equal(proof.actual_transform_pid, process.pid);
      assert.ok(fs.statSync(proofFile).size <= 4096);
      assert.throws(() => transformer.process(source, TARGET, options()), /more than once/);
    });
  } finally {
    const resolved = path.resolve(output);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('iso-summary-transform-'));
    fs.rmSync(resolved, {recursive: true, force: true});
  }
});
test('wrong diagnostic provenance refuses target transform before source execution', () => {
  withEnvironment({NODE_ENV: 'test', ISO_SUMMARY_COST_APP_SHA: 'a'.repeat(40), GITHUB_SHA: 'd'.repeat(40)}, () => {
    assert.throws(() => transformer.getCacheKey(source, TARGET, options()), /baseline differs/);
  });
  withEnvironment({NODE_ENV: 'test', ISO_SUMMARY_COST_APP_SHA: BASELINE, GITHUB_SHA: undefined}, () => {
    assert.throws(() => transformer.getCacheKey(source, TARGET, options()), /commit is missing/);
  });
});
test('native presets/plugins remain intact and only a cloned target configuration receives the diagnostic plugin', () => {
  const nativePlugin = () => ({}), diagnosticPlugin = () => ({}), presets = ['retained-native-preset'];
  const configuration = {jest: {babel: {addPlugins: true, addPresets: true}}, babel: {plugins: [nativePlugin], presets, extra: 'retained'}};
  const result = appendDiagnosticPlugin(configuration, diagnosticPlugin);
  assert.notEqual(result, configuration);assert.notEqual(result.babel, configuration.babel);
  assert.deepEqual(result.babel.plugins, [nativePlugin, diagnosticPlugin]);
  assert.deepEqual(configuration.babel.plugins, [nativePlugin]);assert.equal(result.babel.presets, presets);
  assert.equal(result.babel.extra, 'retained');assert.equal(result.jest, configuration.jest);
  assert.throws(() => appendDiagnosticPlugin({jest: {babel: {addPlugins: false}}}, diagnosticPlugin), /additions are disabled/);
});
test('the installed CRACO factory retains a native plugin alongside the diagnostic observer', () => {
  withEnvironment({NODE_ENV: 'test'}, () => {
    let report;
    const native = ({types: t}) => ({visitor: {Program(program) {
      program.unshiftContainer('body', t.expressionStatement(t.stringLiteral('NATIVE_CONFIGURED_PLUGIN_RETAINED')));
    }}});
    const configuration = {jest: {babel: {addPlugins: true, addPresets: true}}, babel: {plugins: [native]}};
    const compiled = createJestBabelTransform(appendDiagnosticPlugin(configuration,
      [plugin, {report: value => {report = value;}}])).process(fixture, TARGET, options());
    assert.match(compiled.code, /NATIVE_CONFIGURED_PLUGIN_RETAINED/);
    assert.match(compiled.code, /__ISO_SUMMARY_COST__\.measure/);assert.equal(report.matches, 1);
    assert.ok(compiled.map.sourcesContent.includes(fixture));assert.deepEqual(configuration.babel.plugins, [native]);
  });
});
test('only the already-parsed owned CRACO config pair is consumed before Jest arguments are copied', () => {
  withEnvironment({NODE_ENV: 'test'}, () => {
    const helper = require('./diagnostic-craco.config.cjs')._test;
    const own = require.resolve('./diagnostic-craco.config.cjs');
    const argv = ['node', 'test.js', '--config', own, '--watchAll=false', '--json', '--runInBand'];
    const result = helper.consumeOwnedConfigArgument(argv, own);
    assert.deepEqual(argv, ['node', 'test.js', '--watchAll=false', '--json', '--runInBand']);
    assert.deepEqual(result, {consumed_pairs: 1, removed_argument_count: 2, parsed_config_matches: true, other_arguments_unchanged: true});
    const unrelated = ['node', 'test.js', '--config', 'unrelated-jest.config.cjs', '--json'];
    const original = unrelated.slice();const absent = helper.consumeOwnedConfigArgument(unrelated, 'unrelated-jest.config.cjs');
    assert.deepEqual(unrelated, original);assert.equal(absent.consumed_pairs, 0);
    for (const pair of [
      {argv: ['node', 'test.js', '--config', own], parsed: 'other.cjs'},
      {argv: ['node', 'test.js', '--config', own, '--config', own], parsed: own},
    ]) {
      const before = pair.argv.slice();
      assert.throws(() => helper.consumeOwnedConfigArgument(pair.argv, pair.parsed), /duplicated or was not parsed/);
      assert.deepEqual(pair.argv, before);
    }
  });
});
test('CRACO overlay retains the actual native route, approved mapper/options and all other routes', () => {
  withEnvironment({NODE_ENV: 'test'}, () => {
    const overlay = require('./diagnostic-craco.config.cjs'), helper = overlay._test;
    const base = {testEnvironment: 'jsdom', customField: {retained: true},
      moduleNameMapper: {'existing': 'unchanged'}, transform: {[helper.JS]: helper.stock, '^.+\\.css$': 'css', 'fallback': 'file'}};
    const result = helper.configureDiagnostic(base, {}), route = Object.keys(result.transform)[0];
    assert.equal(route, helper.exact);assert.equal(result.transform[route], helper.transform);
    assert.equal(new RegExp(route).test(helper.target), true);assert.equal(new RegExp(route).test(helper.target + '.other'), false);
    assert.equal(result.testEnvironment, base.testEnvironment);assert.deepEqual(result.customField, base.customField);
    assert.equal(result.moduleNameMapper.existing, 'unchanged');assert.equal(result.moduleNameMapper['^@/(.*)$'], '<rootDir>/src/$1');
    for (const [key, value] of Object.entries(base.transform)) assert.equal(result.transform[key], value);
    assert.deepEqual(base.moduleNameMapper, {'existing': 'unchanged'});
    assert.equal(helper.controlProof().general_route_matches, true);
    assert.throws(() => helper.configureDiagnostic({...base, transform: {[helper.JS]: 'unexpected'}}, {}), /routing differs/);
  });
});
