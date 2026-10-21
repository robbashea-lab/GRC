// JSDOM 16 omits the encoding APIs used by the installed real router.
const {TextEncoder, TextDecoder} = require('node:util');
if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder;
if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder;

// JSDOM lacks the browser Web Crypto API used by real save/request identities.
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  writable: true,
  value: require('node:crypto').webcrypto,
});
