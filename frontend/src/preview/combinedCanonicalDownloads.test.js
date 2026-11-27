import axios from 'axios';
import crypto from 'crypto';
import fixture from './programs/prestigeEightYearFixtureData.json';
import {DUNDER_ARTIFACT_DEFINITIONS} from './programs/dunderEightYearArtifacts';
import {seedStore, saveStore, readStore, STORE_KEY} from './store';
import {previewAdapter} from './adapter';
import {clearFileCache, getEvidenceCacheRevision} from './evidenceStorage';

const api = axios.create({adapter: previewAdapter});
const cases = [
  ...DUNDER_ARTIFACT_DEFINITIONS.map(row => ({...row, client_id: 'demo_dunder'})),
  ...fixture.payload.collections.evidence.map(row => ({...row, client_id: 'demo_prestige'})),
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
let previous, saved, source;
beforeAll(() => {
  previous = Object.fromEntries(['REACT_APP_PREVIEW', 'REACT_APP_DUNDER_EIGHT_YEAR_QA',
    'REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA', 'REACT_APP_PRESTIGE_EIGHT_YEAR_ONBOARDING_QA'].map(key => [key, process.env[key]]));
  process.env.REACT_APP_PREVIEW = 'true';
  for (const key of Object.keys(previous).slice(1)) delete process.env[key];
  sessionStorage.clear(); clearFileCache();
  source = seedStore(new Date('2026-11-08T12:00:00.000Z'));
  saveStore(source, {resetFiles: true});
  saved = sessionStorage.getItem(STORE_KEY);
});
beforeEach(() => { sessionStorage.setItem(STORE_KEY, saved); sessionStorage.setItem('grc_demo_entered', 'true'); clearFileCache(); });
afterAll(() => {
  for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  sessionStorage.clear(); clearFileCache();
});

test('the normal full five-client cohort retains all32 Dunder and14 Prestige file identities within native storage limits', () => {
  expect(source.clients).toHaveLength(5);
  expect(cases.filter(row => row.client_id === 'demo_dunder')).toHaveLength(32);
  expect(cases.filter(row => row.client_id === 'demo_prestige')).toHaveLength(14);
  expect(saved.length * 2).toBeLessThanOrEqual(5 * 1024 * 1024);
  const cold = readStore();
  for (const item of cases) expect(cold.evidence.filter(row => row.evidence_id === item.evidence_id)).toHaveLength(1);
});

test.each(cases.map(row => [row.client_id, row.evidence_id, row]))(
  'cold native download %s / %s retains exact bytes without cache or storage repair', async (cid, id, expected) => {
    const cold = readStore(), row = cold.evidence.find(item => item.evidence_id === id);
    const expectedBytes = Buffer.from(source.evidence.find(item => item.evidence_id === id).content_base64, 'base64');
    expect(hash(expectedBytes)).toBe(expected.sha256);
    const before = sessionStorage.getItem(STORE_KEY), cache = getEvidenceCacheRevision();
    const response = (await api.get('/evidence/' + id + '/download', {params: {client_id: cid}})).data;
    const bytes = Buffer.from(response.content_base64, 'base64');
    expect(bytes).toEqual(expectedBytes);
    expect(hash(bytes)).toBe(expected.sha256);
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
    expect(getEvidenceCacheRevision()).toBe(cache);
    // Native aggregate allocation may legitimately retain a small original inline.
    expect(readStore().evidence.find(item => item.evidence_id === id).content_base64).toBe(row.content_base64);
  });
