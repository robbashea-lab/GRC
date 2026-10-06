// Regression for GHSA-pqg4-j6r4-53mv; never execute generated shell text.
const assert = require('node:assert/strict');
const {quote, parse} = require('shell-quote');
assert.throws(() => quote([{comment: 'synthetic'}, '\n echo SYNTHETIC']), TypeError);
assert.deepEqual(parse(quote(['safe value', 'literal$token'])), ['safe value', 'literal$token']);
console.log('shell-quote rejects comment/newline injection and preserves normal tokens');
