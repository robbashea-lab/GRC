import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const origin = 'https://omnisciente-staging.mr-robbashea.workers.dev';
const env = { API_ORIGIN: 'https://api.example.test', ASSETS: {
  fetch: async () => new Response('frontend shell'),
} };

test('ordinary client routes use assets; API requests never fall back to the SPA', async () => {
  assert.equal(await (await worker.fetch(new Request(origin + '/clients/fictional'), env)).text(), 'frontend shell');
  for (const path of ['/api', '/api/auth/me', '/api/not-a-route']) {
    const response = await worker.fetch(new Request(origin + path), { ...env, API_ORIGIN: '' });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('rejects unsafe upstream configuration without making a request', async () => {
  for (const API_ORIGIN of ['http://api.example.test', 'https://user:pass@api.example.test',
    'https://api.example.test/other', origin, 'https://api.example.test?other=1']) {
    assert.equal((await worker.fetch(new Request(origin + '/api/auth/login'), { ...env, API_ORIGIN })).status, 503);
  }
});

test('preserves application credentials, Origin, body and idempotency; strips edge credentials', async t => {
  t.mock.method(globalThis, 'fetch', async (request, options) => {
    assert.equal(request.url, 'https://api.example.test/api/clients?scope=fictional');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('origin'), 'https://untrusted.example.test');
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic');
    assert.equal(request.headers.get('cookie'), 'access_token=synthetic; session_token=synthetic-session');
    assert.equal(request.headers.get('idempotency-key'), 'synthetic-retry');
    assert.equal(request.headers.get('x-forwarded-for'), null);
    assert.equal(request.headers.get('cf-access-jwt-assertion'), null);
    assert.equal(await request.text(), '{"name":"Fictional"}');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.cf.cacheTtl, 0);
    return new Response('denied', { status: 403 });
  });
  const response = await worker.fetch(new Request(origin + '/api/clients?scope=fictional', {
    method: 'POST', body: '{"name":"Fictional"}', headers: {
      Origin: 'https://untrusted.example.test', Authorization: 'Bearer synthetic',
      Cookie: 'CF_Authorization=edge-token; access_token=synthetic; session_token=synthetic-session; other=ignored',
      'Idempotency-Key': 'synthetic-retry', 'X-Forwarded-For': 'forged',
      'CF-Access-Jwt-Assertion': 'edge-token',
    },
  }), env);
  assert.equal(response.status, 403);
  assert.equal(await response.text(), 'denied');
});

test('preserves multiple Secure cookies and binary evidence downloads without caching', async t => {
  const headers = new Headers({ 'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="fictional.bin"' });
  const cookies = ['access_token=synthetic; HttpOnly; Secure; SameSite=Lax; Path=/',
    'session_token=; Max-Age=0; Path=/'];
  cookies.forEach(cookie => headers.append('Set-Cookie', cookie));
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([0, 255, 1]), { headers }));
  const response = await worker.fetch(new Request(origin + '/api/evidence/fictional/download'), env);
  assert.deepEqual(response.headers.getSetCookie(), cookies);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 255, 1]);
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="fictional.bin"');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('keeps backend redirects on the frontend origin and refuses foreign redirects', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, {
    status: 307, headers: { Location: 'http://api.example.test/api/' },
  }));
  const response = await worker.fetch(new Request(origin + '/api'), env);
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), origin + '/api/');
  globalThis.fetch.mock.mockImplementation(async () => new Response(null, {
    status: 302, headers: { Location: 'https://foreign.example.test/steal' },
  }));
  assert.equal((await worker.fetch(new Request(origin + '/api'), env)).status, 502);
});

test('reports upstream failures without exposing diagnostics or pretending success', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('private upstream diagnostic'); });
  const response = await worker.fetch(new Request(origin + '/api/auth/login'), env);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { detail: 'Staging API is unavailable' });
});

test('allows an idle host to wake but aborts at the bounded header timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  t.mock.method(globalThis, 'fetch', async (_request, options) => {
    signal = options.signal;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  const pending = worker.fetch(new Request(origin + '/api/'), env);
  t.mock.timers.tick(60000);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(30000);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { detail: 'Staging API is unavailable' });
});
