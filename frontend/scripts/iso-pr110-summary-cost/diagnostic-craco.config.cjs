// Retain the approved CRACO/Jest configuration; prepend one exact diagnostic transform route.
const path = require('node:path');
const {getArgs} = require('@craco/craco/dist/lib/args');
const {deepMergeWithArray} = require('@craco/craco/dist/lib/utils');

function consumeOwnedConfigArgument(argv, parsedConfig = getArgs().config) {
  const matches = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--config' && typeof argv[i + 1] === 'string'
      && path.resolve(argv[i + 1]) === __filename) matches.push(i);
  }
  const parsedMatches = typeof parsedConfig === 'string' && path.resolve(parsedConfig) === __filename;
  if (matches.length > 1 || matches.length === 1 && !parsedMatches)
    throw Error('Diagnostic CRACO config argument is duplicated or was not parsed by CRACO');
  const before = argv.slice();
  if (matches.length) argv.splice(matches[0], 2);
  const expected = matches.length ? before.slice(0, matches[0]).concat(before.slice(matches[0] + 2)) : before;
  const unchanged = argv.length === expected.length && argv.every((value, index) => value === expected[index]);
  if (!unchanged) throw Error('Diagnostic CRACO config consumption changed unrelated arguments');
  return Object.freeze({consumed_pairs: matches.length, removed_argument_count: matches.length * 2,
    parsed_config_matches: parsedMatches, other_arguments_unchanged: unchanged});
}
// CRACO has already selected this file. Consume only its control pair before CRA copies argv for Jest.
const control = consumeOwnedConfigArgument(process.argv);
const approved = require(path.resolve(__dirname, '../../craco.config.js'));
const configure = approved.jest?.configure;
const target = path.resolve(__dirname, '../../src/preview/portfolioReporting.js');
const transform = path.join(__dirname, 'transform.cjs');
const stock = require.resolve('@craco/craco/dist/lib/features/jest/jest-babel-transform');
const JS = '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$';
const exact = '^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
let observedRoute = null;

function configureDiagnostic(jestConfig, context) {
  const current = typeof configure === 'function' ? configure(jestConfig, context)
    : deepMergeWithArray({}, jestConfig, configure || {});
  if (!current || current.transform?.[JS] !== stock || Object.hasOwn(current.transform, exact)) {
    throw Error('Approved CRACO transform routing differs from the sealed diagnostic expectation');
  }
  observedRoute = current.transform[JS];
  return {...current, transform: {[exact]: transform, ...current.transform}};
}
module.exports = {...approved, jest: {...approved.jest, configure: configureDiagnostic}};
Object.defineProperty(module.exports, '_test', {value: {configureDiagnostic, consumeOwnedConfigArgument, target, transform, stock, JS, exact,
  controlProof: () => ({...control, general_route_matches: observedRoute === stock})}});
