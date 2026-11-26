// Use the existing Render service's deploy detail response as the provider receipt.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {readFileSync} = require('node:fs');

const staging = 'https://omnisciente-staging.onrender.com';
const sourceSha = '5bb03e1219276a01459f2a44be6da44dce71271feb8a17c15a2083e6db397db9';

async function main() {
  const [providerFile, expectedCommit, expectedBundle] = process.argv.slice(2);
  assert.ok(providerFile && /^[a-f0-9]{40}$/.test(expectedCommit || '') &&
    /^[a-f0-9]{64}$/.test(expectedBundle || ''),
  'Usage: node approved-v3-render-smoke.cjs <Render deploy JSON> <expected commit SHA> <expected native bundle SHA-256>');
  const deployment = JSON.parse(readFileSync(providerFile, 'utf8').replace(/^\uFEFF/, ''));
  assert.match(deployment.id, /^dep-[a-z0-9]+$/);
  assert.equal(deployment.status, 'live');
  assert.equal(deployment.commit?.id, expectedCommit);
  const responses = await Promise.all([
    ['/api/', 'application/json', null],
    ['/login', 'text/html', null],
    ['/visual-preview.html', 'text/html', sourceSha],
    ['/approved-v3-native.js', 'text/javascript', expectedBundle],
  ].map(async ([route, accept, expected]) => {
    const response = await fetch(staging + route, {headers:{Accept:accept}, redirect:'error', signal:AbortSignal.timeout(65000)});
    assert.equal(response.status, 200, route);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (expected) assert.equal(sha256, expected, route + ' SHA-256');
    return {route, status:response.status, sha256};
  }));
  console.log(JSON.stringify({staging, deployment:deployment.id, commit:expectedCommit, responses,
    authenticatedReadback:'Requires the existing staging browser session'}, null, 2));
}

main().catch(error => {console.error(error.message);process.exitCode = 1;});
