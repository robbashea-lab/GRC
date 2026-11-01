// Retain the approved CRACO/Jest configuration; prepend one exact diagnostic transform route.
const path = require('node:path');
const {deepMergeWithArray} = require('@craco/craco/dist/lib/utils');
const approved = require(path.resolve(__dirname, '../../craco.config.js'));
const configure = approved.jest?.configure;
const target = path.resolve(__dirname, '../../src/preview/portfolioReporting.js');
const transform = path.join(__dirname, 'transform.cjs');
const stock = require.resolve('react-scripts/config/jest/babelTransform');
const JS = '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$';
const exact = '^' + target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';

function configureDiagnostic(jestConfig, context) {
  const current = typeof configure === 'function' ? configure(jestConfig, context)
    : deepMergeWithArray({}, jestConfig, configure || {});
  if (!current || current.transform?.[JS] !== stock || Object.hasOwn(current.transform, exact)) {
    throw Error('Approved CRA transform routing differs from the sealed diagnostic expectation');
  }
  return {...current, transform: {[exact]: transform, ...current.transform}};
}
module.exports = {...approved, jest: {...approved.jest, configure: configureDiagnostic}};
Object.defineProperty(module.exports, '_test', {value: {configureDiagnostic, target, transform, stock, JS, exact}});
