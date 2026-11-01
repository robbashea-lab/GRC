// Diagnostic-only transformation. Persisted application and normal Jest sources stay unchanged.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadCracoConfig} = require('@craco/craco/dist/lib/config');
const FACTORY_PATH = require.resolve('@craco/craco/dist/lib/features/jest/create-jest-babel-transform');
const {createJestBabelTransform} = require(FACTORY_PATH);

const BASELINE = '2303f958dd0fd8e02881aab3bbd7ac82450be469';
const SOURCE_SHA = '85547886be517c229959d413cea383c8e57987db39d13787f973b522b351a730';
const FRONTEND = path.resolve(__dirname, '../..');
const TARGET = path.join(FRONTEND, 'src/preview/portfolioReporting.js');
const STOCK_PATH = require.resolve('@craco/craco/dist/lib/features/jest/jest-babel-transform');
const approvedConfiguration = loadCracoConfig({env: process.env.NODE_ENV});
const stock = createJestBabelTransform(approvedConfiguration);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ownSHA = hash(fs.readFileSync(__filename));
const stockSHA = hash(fs.readFileSync(STOCK_PATH));
const factorySHA = hash(fs.readFileSync(FACTORY_PATH));
const isTarget = filename => path.resolve(filename) === TARGET;
const requireThat = (condition, message) => { if (!condition) throw Error(message); };

function plugin({types: t}, {report = () => {}} = {}) {
  return {
    name: 'iso-summary-cost-only',
    pre() { this.matches = 0; },
    visitor: {
      CallExpression(call) {
        if (!t.isIdentifier(call.node.callee, {name: 'cisSummary'})
          || call.node.arguments.length !== 1 || !t.isIdentifier(call.node.arguments[0], {name: 'included'})) return;
        const declaration = call.parentPath;
        if (!declaration.isVariableDeclarator() || declaration.node.init !== call.node
          || !t.isIdentifier(declaration.node.id, {name: 'summary'})) return;
        const owner = call.findParent(parent => parent.isFunctionDeclaration()
          && t.isIdentifier(parent.node.id, {name: 'demoCurrentPositions'}));
        if (!owner || !owner.parentPath.isExportNamedDeclaration()) return;
        const binding = call.scope.getBinding('cisSummary');
        if (!binding?.path.isImportSpecifier() || !t.isIdentifier(binding.path.node.imported, {name: 'cisSummary'})
          || binding.path.parentPath.node.source?.value !== '../lib/cisVerification') return;
        this.matches++;
        const original = t.cloneNode(call.node, true);
        const observer = t.memberExpression(t.identifier('globalThis'), t.identifier('__ISO_SUMMARY_COST__'));
        const observed = t.callExpression(t.memberExpression(observer, t.identifier('measure')),
          [t.arrowFunctionExpression([], t.cloneNode(original, true))]);
        call.replaceWith(t.conditionalExpression(
          t.binaryExpression('===', t.identifier('key'), t.stringLiteral('iso-27001')), observed, original));
        call.skip();
      },
      Program: {
        exit(program) {
          requireThat(this.matches === 1, 'Expected exactly one bound ISO-summary call site; found ' + this.matches);
          program.unshiftContainer('body', t.expressionStatement(t.callExpression(
            t.memberExpression(t.memberExpression(t.identifier('globalThis'), t.identifier('__ISO_SUMMARY_COST__')), t.identifier('loaded')),
            [t.stringLiteral(SOURCE_SHA)])));
          report({matches: this.matches, original_source_sha256: SOURCE_SHA});
        },
      },
    },
  };
}

function appendDiagnosticPlugin(configuration, diagnosticPlugin) {
  requireThat(configuration?.jest?.babel?.addPlugins === true, 'Approved CRACO Jest plugin additions are disabled');
  const babel = configuration.babel || {}, plugins = Array.isArray(babel.plugins) ? babel.plugins : [];
  return {...configuration, babel: {...babel, plugins: [...plugins, diagnosticPlugin]}};
}
let transformed = null;
// Reuse the same processed native CRACO presets/plugins; append only the diagnostic target observer.
const target = createJestBabelTransform(appendDiagnosticPlugin(approvedConfiguration,
  [plugin, {report: proof => { transformed = proof; }}]));

function provenance() {
  requireThat(process.env.ISO_SUMMARY_COST_APP_SHA === BASELINE, 'Summary-cost application baseline differs');
  requireThat(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || ''), 'Summary-cost diagnostic commit is missing');
  return {application_baseline_sha: BASELINE, observed_source_sha: process.env.GITHUB_SHA};
}
function verifySource(source, filename) {
  requireThat(isTarget(filename), 'Summary-cost transform received the wrong target');
  requireThat(hash(source) === SOURCE_SHA, 'Original ISO-summary source bytes differ');
}
function writeProof(source, result, proof) {
  const output = process.env.ISO_SUMMARY_COST_OUTPUT;
  requireThat(typeof output === 'string' && path.isAbsolute(output), 'Summary-cost transform output must be absolute');
  const stat = fs.lstatSync(output);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'Summary-cost transform output must be an ordinary directory');
  requireThat(typeof result?.code === 'string' && result.map && proof?.matches === 1,
    'Summary-cost transformation or source map is incomplete');
  const record = {version: 1, diagnostic_only: true, qualification: false, ...provenance(),
    target: 'frontend/src/preview/portfolioReporting.js', source_sha256: hash(source), original_source_sha256: hash(source),
    generated_code_sha256: hash(result.code), source_map_sha256: hash(JSON.stringify(result.map)),
    harness_sha256: ownSHA, stock_transform_sha256: stockSHA, native_route_sha256: stockSHA, native_factory_sha256: factorySHA,
    native_route: '@craco/craco/dist/lib/features/jest/jest-babel-transform',
    native_factory: '@craco/craco/dist/lib/features/jest/create-jest-babel-transform',
    config_control: require('./diagnostic-craco.config.cjs')._test.controlProof(), matches: proof.matches, matched_calls: proof.matches,
    actual_transform_pid: process.pid, source_map_preserved: true,
    original_sources_content_preserved: Array.isArray(result.map.sourcesContent) && result.map.sourcesContent.includes(source)};
  requireThat(record.original_sources_content_preserved, 'Original source content is missing from the diagnostic source map');
  const text = JSON.stringify(record);
  requireThat(Buffer.byteLength(text) <= 4096, 'Summary-cost transform proof exceeds its cap');
  const destination = path.join(output, 'transform-proof.json'), temporary = path.join(output, '.transform-proof.tmp');
  requireThat(!fs.existsSync(destination) && !fs.existsSync(temporary), 'Summary-cost target transformed more than once');
  fs.writeFileSync(temporary, text, {flag: 'wx'});
  fs.renameSync(temporary, destination);
}

module.exports = {
  canInstrument: stock.canInstrument,
  getCacheKey(source, filename, options) {
    if (!isTarget(filename)) return stock.getCacheKey(source, filename, options);
    verifySource(source, filename);
    const sourceProof = provenance();
    return hash(target.getCacheKey(source, filename, options) + '\0' + ownSHA + '\0' + stockSHA
      + '\0' + factorySHA + '\0' + sourceProof.observed_source_sha + '\0' + SOURCE_SHA);
  },
  process(source, filename, options) {
    if (!isTarget(filename)) return stock.process(source, filename, options);
    verifySource(source, filename); provenance(); transformed = null;
    const result = target.process(source, filename, options), proof = transformed;
    transformed = null;
    writeProof(source, result, proof);
    return result;
  },
  _test: {plugin, appendDiagnosticPlugin, createJestBabelTransform, isTarget, verifySource,
    BASELINE, SOURCE_SHA, TARGET, STOCK_PATH, FACTORY_PATH, ownSHA, stockSHA, factorySHA},
};
