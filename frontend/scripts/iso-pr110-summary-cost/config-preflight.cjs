// Diagnostic-only admission check. Both inputs come from real --showConfig children, never lifecycle bodies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');

const GENERAL_JS = '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$';
const ORIGINAL_SUITE = 'src/preview/frameworkFiveYear.test.js';
const own = (value, key) => Object.hasOwn(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireThat = (condition, message) => { if (!condition) throw Error(message); };

function locations(frontend) {
  requireThat(typeof frontend === 'string' && path.isAbsolute(frontend), 'Configuration frontend must be an absolute path');
  const root = path.resolve(frontend), directory = path.join(root, 'scripts/iso-pr110-summary-cost');
  return {frontend: root, overlay: path.join(directory, 'diagnostic-craco.config.cjs'),
    target: path.join(root, 'src/preview/portfolioReporting.js'), transform: path.join(directory, 'transform.cjs')};
}

function preflightArguments(frontend, diagnostic = false, runner) {
  const files = locations(frontend);
  requireThat(typeof diagnostic === 'boolean', 'Configuration preflight mode must be explicit');
  const executable = runner === undefined ? require.resolve('@craco/craco/dist/bin/craco.js', {paths: [files.frontend]}) : runner;
  requireThat(typeof executable === 'string' && path.isAbsolute(executable), 'Configuration runner must be an absolute path');
  return [executable, 'test', ...(diagnostic ? ['--config', files.overlay] : []),
    '--watchAll=false', '--runInBand', '--runTestsByPath', ORIGINAL_SUITE, '--showConfig'];
}

function parseConfiguration(stdout) {
  requireThat(typeof stdout === 'string', 'Configuration stdout must be exact decoded text');
  // Preserve JSON.parse's failure: a log prefix, suffix, truncation or second document is not config evidence.
  const parsed = JSON.parse(stdout);
  requireThat(record(parsed), 'Configuration JSON must have an object root');
  return parsed;
}

function difference(left, right, location = 'configuration') {
  if (isDeepStrictEqual(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return location + '.length';
    for (let i = 0; i < left.length; i++) {
      const child = difference(left[i], right[i], location + '[' + i + ']');
      if (child) return child;
    }
  } else if (record(left) && record(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!own(left, key) || !own(right, key)) return location + '.' + key + ' presence';
      const child = difference(left[key], right[key], location + '.' + key);
      if (child) return child;
    }
  }
  return location;
}

function project(parsed, label) {
  requireThat(record(parsed) && Array.isArray(parsed.configs) && parsed.configs.length === 1,
    label + ' must contain exactly one actual project config');
  requireThat(record(parsed.configs[0]) && record(parsed.globalConfig), label + ' project/global configuration is missing');
  const value = parsed.configs[0];
  // Installed Jest 27 normalizes a project `name`; both actual children must retain it unchanged.
  requireThat(own(value, 'name') && typeof value.name === 'string' && value.name.length > 0, label + ' actual project name is missing');
  requireThat(Array.isArray(value.transform) && value.transform.every(route => Array.isArray(route)
    && route.length >= 2 && typeof route[0] === 'string' && typeof route[1] === 'string'), label + ' transform routes are malformed');
  requireThat(record(value.globals) && record(value.globals._cracoConfig)
    && record(value.globals._cracoConfig.jest), label + ' actual CRACO globals are missing');
  return value;
}

function sourceFile(file) {
  const status = fs.lstatSync(file);
  requireThat(status.isFile() && !status.isSymbolicLink(), 'Configuration source must be an ordinary file: ' + file);
  const bytes = fs.readFileSync(file);
  return {path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}

function verifyConfigurations(baselineParsed, diagnosticParsed, frontend) {
  const files = locations(frontend), baseline = project(baselineParsed, 'Approved config'), diagnostic = project(diagnosticParsed, 'Diagnostic config');
  const cracoRoute = require.resolve('@craco/craco/dist/lib/features/jest/jest-babel-transform', {paths: [files.frontend]});
  const general = baseline.transform.filter(route => route[0] === GENERAL_JS);
  requireThat(general.length === 1 && general[0][1] === cracoRoute,
    'Approved general JS route must be the actual configured CRACO transformer');
  const exact = '^' + files.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  requireThat(!baseline.transform.some(route => route[0] === exact), 'Approved config already contains the diagnostic-only target route');
  requireThat(diagnostic.transform.length === baseline.transform.length + 1,
    'Diagnostic must add exactly one transform route');
  requireThat(diagnostic.transform[0][0] === exact && diagnostic.transform[0][1] === files.transform
    && diagnostic.transform[0].length === 3 && record(diagnostic.transform[0][2])
    && Object.keys(diagnostic.transform[0][2]).length === 0,
  'Diagnostic target route must be exact, first and free of unapproved transformer options');
  requireThat(isDeepStrictEqual(diagnostic.transform.slice(1), baseline.transform),
    'Diagnostic changed an existing approved transform route/options/order');

  const approvedJest = baseline.globals._cracoConfig.jest, diagnosticJest = diagnostic.globals._cracoConfig.jest;
  requireThat(own(approvedJest, 'configure') && record(approvedJest.configure),
    'Approved configure value is not the expected serialized native object');
  requireThat(!own(diagnosticJest, 'configure'),
    'Diagnostic configure must be the omitted serialized function, not an unknown replacement');
  const {configure: ignoredConfigure, ...approvedJestRest} = approvedJest;
  const normalizedBaseline = {...baselineParsed, configs: [{...baseline,
    globals: {...baseline.globals, _cracoConfig: {...baseline.globals._cracoConfig, jest: approvedJestRest}}}]};
  const normalizedDiagnostic = {...diagnosticParsed, configs: [{...diagnostic, transform: diagnostic.transform.slice(1)}]};
  const changed = difference(normalizedBaseline, normalizedDiagnostic);
  requireThat(!changed, 'Unapproved configuration difference at ' + changed);

  return {valid: true, project_count: 1, project_names: {approved: baseline.name, diagnostic: diagnostic.name},
    permitted_differences: ['configs[0].transform exact-target prefix', 'configs[0].globals._cracoConfig.jest.configure'],
    approved_routes: baseline.transform, diagnostic_routes: diagnostic.transform,
    source_files: {
      approved_config: sourceFile(path.join(files.frontend, 'craco.config.js')),
      diagnostic_config: sourceFile(files.overlay),
      craco_factory: sourceFile(require.resolve('@craco/craco/dist/lib/features/jest/merge-jest-config', {paths: [files.frontend]})),
      babel_transform_factory: sourceFile(require.resolve('@craco/craco/dist/lib/features/jest/create-jest-babel-transform', {paths: [files.frontend]})),
      cra_factory: sourceFile(require.resolve('react-scripts/scripts/utils/createJestConfig', {paths: [files.frontend]})),
      approved_transform: sourceFile(cracoRoute), diagnostic_transform: sourceFile(files.transform),
    }};
}

module.exports = {preflightArguments, verifyConfigurations, parseConfiguration};
