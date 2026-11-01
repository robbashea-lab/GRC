const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {preflightArguments, verifyConfigurations, parseConfiguration} = require('./config-preflight.cjs');

const frontend = path.resolve(__dirname, '../..');
const directory = path.join(frontend, 'scripts/iso-pr110-summary-cost');
const generalJS = '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$';
const route = require.resolve('@craco/craco/dist/lib/features/jest/jest-babel-transform', {paths: [frontend]});
const target = path.join(frontend, 'src/preview/portfolioReporting.js');
const exact = '^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
const copy = value => JSON.parse(JSON.stringify(value));

function fixture() {
  // Captured actual Jest 27 --showConfig shape uses `name`, not the later-version `id` field.
  const baseline = {version: '27.5.1', configs: [{name: '2ee5835a14a50748b009977c1e5fa54b', rootDir: frontend,
    clearMocks: false, resetMocks: true, testTimeout: 5000, testEnvironment: '/approved/jsdom',
    testMatch: ['**/*.test.js'], setupFiles: ['/approved/setup'], setupFilesAfterEnv: [path.join(frontend, 'src/setupTests.js')],
    moduleNameMapper: [['^@/(.*)$', '<rootDir>/src/$1'], ['^@catalogs/(.*)$', '<rootDir>/../shared/catalogs/$1']],
    transform: [[generalJS, route, {}], ['^.+\\.css$', '/approved/css', {}]],
    globals: {retained: true, _cracoConfig: {babel: {presets: ['preset'], plugins: [null], loaderOptions: {cacheDirectory: true}},
      plugins: [{plugin: null, options: {native: true}}], jest: {babel: {addPresets: true, addPlugins: true},
        configure: {moduleNameMapper: {'^@/(.*)$': '<rootDir>/src/$1'}}}}}}],
    globalConfig: {runTestsByPath: true, maxWorkers: 1, watch: false, watchAll: false,
      nonFlagArgs: ['src/preview/frameworkFiveYear.test.js'], testPathPattern: 'src/preview/frameworkFiveYear.test.js',
      passWithNoTests: false, bail: 0, coverageProvider: 'babel'}};
  const diagnostic = copy(baseline);
  diagnostic.configs[0].transform.unshift([exact, path.join(directory, 'transform.cjs'), {}]);
  delete diagnostic.configs[0].globals._cracoConfig.jest.configure;
  return {baseline, diagnostic};
}

test('preflight arguments construct only two real configuration-only modes without lifecycle setup/reporters', () => {
  const runner = path.join(frontend, 'node_modules/@craco/craco/dist/bin/craco.js');
  const baseline = preflightArguments(frontend, false, runner), diagnostic = preflightArguments(frontend, true, runner);
  assert.deepEqual(baseline, [runner, 'test', '--watchAll=false', '--runInBand', '--runTestsByPath',
    'src/preview/frameworkFiveYear.test.js', '--showConfig']);
  assert.deepEqual(diagnostic, [runner, 'test', '--config', path.join(directory, 'diagnostic-craco.config.cjs'),
    ...baseline.slice(2)]);
  for (const args of [baseline, diagnostic]) {
    assert.equal(args.filter(value => value === '--showConfig').length, 1);
    assert(!args.some(value => /setupFilesAfterEnv|reporters|outputFile|testNamePattern/.test(value)));
  }
  assert.throws(() => preflightArguments('relative', false, runner), /absolute path/);
  assert.throws(() => preflightArguments(frontend, 'diagnostic', runner), /explicit/);
});

test('configuration parsing accepts only the complete exact JSON document and retains parse errors', () => {
  const value = {configs: [{}], globalConfig: {retained: true}, futureField: {kept: 1}};
  assert.deepEqual(parseConfiguration(' \n' + JSON.stringify(value) + '\n'), value);
  for (const raw of ['log prefix\n' + JSON.stringify(value), JSON.stringify(value) + '\nlog suffix', '{}{}', '{"configs":'])
    assert.throws(() => parseConfiguration(raw), SyntaxError);
  for (const raw of ['null', '[]', '1', '"config"']) assert.throws(() => parseConfiguration(raw), /object root/);
  assert.throws(() => parseConfiguration(Buffer.from('{}')), /decoded text/);
});

test('all approved project/global/Babel settings survive with only the exact declared differences', () => {
  const {baseline, diagnostic} = fixture(), before = JSON.stringify({baseline, diagnostic});
  const result = verifyConfigurations(baseline, diagnostic, frontend);
  assert.equal(result.valid, true); assert.equal(result.project_count, 1);
  assert.deepEqual(result.approved_routes, baseline.configs[0].transform);
  assert.deepEqual(result.diagnostic_routes, diagnostic.configs[0].transform);
  assert.equal(JSON.stringify({baseline, diagnostic}), before);
  assert.deepEqual(result.project_names, {approved: baseline.configs[0].name, diagnostic: baseline.configs[0].name});
  assert.equal(Object.hasOwn(baseline.configs[0], 'id'), false);
  assert.equal(Object.hasOwn(diagnostic.configs[0], 'id'), false);
  assert(!result.permitted_differences.includes('configs[0].name'));
  assert(!result.permitted_differences.includes('configs[0].id'));
  assert.equal(result.source_files.babel_transform_factory.path,
    require.resolve('@craco/craco/dist/lib/features/jest/create-jest-babel-transform', {paths: [frontend]}));
  for (const file of Object.values(result.source_files)) {
    assert(path.isAbsolute(file.path)); assert(file.bytes > 0); assert.match(file.sha256, /^[a-f0-9]{64}$/);
  }
});

test('a stock CRA shortcut or changed/reordered approved routes cannot qualify', () => {
  for (const change of [
    f => { f.baseline.configs[0].transform[0][1] = '/wrong/stock-CRA-transform'; },
    f => { f.diagnostic.configs[0].transform[1][1] = '/wrong/stock-CRA-transform'; },
    f => { f.diagnostic.configs[0].transform.reverse(); },
    f => { f.diagnostic.configs[0].transform[0][0] = '^.*portfolioReporting'; },
    f => { f.diagnostic.configs[0].transform[0][1] = '/wrong/diagnostic-transform'; },
    f => { f.diagnostic.configs[0].transform[0][2].plugins = ['unapproved']; },
    f => { f.diagnostic.configs[0].transform.pop(); },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyConfigurations(f.baseline, f.diagnostic, frontend), /route|transform/);
  }
});

test('original setup, mapping, timeouts, matching and every Babel flag are protected', () => {
  for (const change of [
    config => { config.setupFilesAfterEnv = []; },
    config => { config.setupFiles.push('/additional/setup'); },
    config => { config.testTimeout = 180001; },
    config => { config.testMatch = ['**/another.test.js']; },
    config => { config.moduleNameMapper[0][1] = '/wrong'; },
    config => { config.globals._cracoConfig.babel.plugins = []; },
    config => { config.globals._cracoConfig.babel.presets = []; },
    config => { config.globals._cracoConfig.jest.babel.addPlugins = false; },
    config => { config.globals._cracoConfig.babel.loaderOptions.cacheDirectory = false; },
    config => { delete config.globals.retained; },
    config => { config.globals._cracoConfig.plugins[0].options.native = false; },
  ]) {
    const f = fixture(); change(f.diagnostic.configs[0]);
    assert.throws(() => verifyConfigurations(f.baseline, f.diagnostic, frontend), /Unapproved configuration difference/);
  }
});

test('unknown fields and actual global CLI semantics are compared, never blindly ignored', () => {
  for (const change of [
    root => { root.globalConfig.nonFlagArgs = []; },
    root => { root.globalConfig.runTestsByPath = false; },
    root => { root.globalConfig.passWithNoTests = true; },
    root => { root.globalConfig.newUnreviewedField = 'changed'; },
    root => { root.configs[0].newUnreviewedField = 'changed'; },
    root => { root.newRootField = true; },
    root => { root.version = 'different'; },
  ]) {
    const f = fixture(); change(f.diagnostic);
    assert.throws(() => verifyConfigurations(f.baseline, f.diagnostic, frontend), /Unapproved configuration difference at/);
  }
  const f = fixture(); f.baseline.globalConfig.future = {preserved: true}; f.diagnostic.globalConfig.future = {preserved: true};
  assert.equal(verifyConfigurations(f.baseline, f.diagnostic, frontend).valid, true);
});

test('captured Jest 27 name remains exact; neither invented ids nor unknown fields are ignored', () => {
  const matching = fixture();
  assert.equal(verifyConfigurations(matching.baseline, matching.diagnostic, frontend).valid, true);
  for (const change of [
    f => { f.diagnostic.configs[0].name = 'different-project'; },
    f => { f.diagnostic.configs[0].id = 'not-an-allowed-difference'; },
    f => { f.baseline.configs[0].id = 'not-an-allowed-difference'; },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyConfigurations(f.baseline, f.diagnostic, frontend), /Unapproved configuration difference/);
  }
});

test('only the specific serialized configure omission is permitted and project identity is required', () => {
  for (const change of [
    f => { delete f.baseline.configs[0].globals._cracoConfig.jest.configure; },
    f => { f.diagnostic.configs[0].globals._cracoConfig.jest.configure = null; },
    f => { f.diagnostic.configs[0].globals._cracoConfig.jest.configure = {}; },
    f => { delete f.diagnostic.configs[0].name; },
    f => { f.diagnostic.configs[0].name = ''; },
    f => { f.diagnostic.configs.push(copy(f.diagnostic.configs[0])); },
    f => { f.diagnostic.configs[0].globals = {}; },
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => verifyConfigurations(f.baseline, f.diagnostic, frontend));
  }
});
