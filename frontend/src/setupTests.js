// JSDOM lacks the browser Web Crypto API used by real save/request identities.
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  writable: true,
  value: require('node:crypto').webcrypto,
});
