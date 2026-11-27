// JSDOM 16 omits the encoding APIs used by the installed real router.
const {TextEncoder, TextDecoder} = require('node:util');
if (!globalThis.TextEncoder) globalThis.TextEncoder = TextEncoder;
if (!globalThis.TextDecoder) globalThis.TextDecoder = TextDecoder;

// JSDOM omits the standard browser compression API. Exercise the actual Node
// implementation, including real stream scheduling, rather than a test mock.
if (!globalThis.CompressionStream) globalThis.CompressionStream = require('node:stream/web').CompressionStream;

// Use native browser-compatible encoding APIs instead of JSDOM 16's slow JS
// emulator. Native APIs also enforce the standard required-argument contract.
const {atob, btoa} = require('node:buffer');
globalThis.atob = atob;
globalThis.btoa = btoa;

// JSDOM lacks the browser Web Crypto API used by real save/request identities.
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  writable: true,
  value: require('node:crypto').webcrypto,
});
