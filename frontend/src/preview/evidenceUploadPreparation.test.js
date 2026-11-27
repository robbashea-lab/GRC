import crypto from 'crypto';
import {buildLegacyDemoStore} from './store';
import {prepareDemoEvidenceUpload} from './evidence';
import {occurrenceId} from '../lib/reviewOccurrences';

const CID = 'demo_prestige';
let db;
beforeAll(() => { db = buildLegacyDemoStore(new Date('2026-11-02T12:00:00.000Z')); });
const body = () => ({client_id: CID, filename: 'synthetic-unicode.txt', mime_type: 'text/plain',
  content_base64: Buffer.from('Fictional evidence — café / 日本語\n', 'utf8').toString('base64')});

test('reuse the native byte digest, version and actual recorder without mutating caller intent', async () => {
  const input = {...body(), version: 99, size: 0, uploaded_by: 'forged', sha256: 'forged'};
  const before = JSON.stringify(input), bytes = Buffer.from(input.content_base64, 'base64');
  const result = await prepareDemoEvidenceUpload(db, input);
  expect(JSON.stringify(input)).toBe(before);
  expect(result).toMatchObject({filename: input.filename, content_base64: input.content_base64,
    version: 1, size: bytes.length, uploaded_by: db.user.user_id, uploaded_by_email: db.user.email,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex')});
  expect(Number.isFinite(Date.parse(result.uploaded_at))).toBe(true);
});

test('missing Web Crypto removes an unverified caller digest instead of claiming integrity', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', {configurable: true, value: {}});
    const result = await prepareDemoEvidenceUpload(db, {...body(), sha256: 'forged'});
    expect(result).not.toHaveProperty('sha256');
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});

test.each(['immutable version', 'oversized', 'incomplete parent', 'foreign parent', 'completed Review', 'stale occurrence'])
('retain native rejection for %s', async mode => {
  const source = JSON.parse(JSON.stringify(db)), input = body();
  if (mode === 'oversized') input.content_base64 = Buffer.alloc(1024 * 1024 + 1).toString('base64');
  if (mode === 'incomplete parent') input.linked_type = 'risk';
  if (mode === 'foreign parent') {
    input.linked_type = 'risk'; input.linked_id = source.risks.find(row => row.client_id !== CID).risk_id;
  }
  if (['completed Review', 'stale occurrence'].includes(mode)) {
    const review = source.reviews.find(row => row.client_id === CID);
    input.linked_type = 'review'; input.linked_id = review.review_id;
    input.occurrence_id = mode === 'stale occurrence' ? 'wrong-period' : occurrenceId(review);
    if (mode === 'completed Review') review.status = 'completed';
  }
  const before = JSON.stringify(source);
  await expect(prepareDemoEvidenceUpload(source, input, mode === 'immutable version' ? 'existing' : null)).rejects.toThrow();
  expect(JSON.stringify(source)).toBe(before);
});
