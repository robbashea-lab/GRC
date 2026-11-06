import {seedStore} from './store';
import {clearFileCache} from './evidenceStorage';
import {CIS_CANONICAL_SCENARIO_REVISION} from './cisCanonicalArtifactBooks';
import currentCohort from '../testUtils/cisCanonicalCohort.20261104.v3.json';
import futureCohort from '../testUtils/cisCanonicalCohort.20300515.v3.json';

const {createHash} = require('crypto');
const {writeFileSync} = require('fs');
const {join} = require('path');
const digest = value => createHash('sha256').update(value).digest('hex');
const canonicalClients = new Set(['demo_brawndo', 'demo_initech', 'demo_krusty_krab']);
// Frozen from complete unmodified16e8200 construction, before the formatter-source proposal.
const originalCohorts = {'2026-11-04T12:00:00.000Z': currentCohort, '2030-05-15T12:00:00.000Z': futureCohort};
const fixtureFlags = ['REACT_APP_PREVIEW', 'REACT_APP_DEMO_ONBOARDING_CLIENT',
  'REACT_APP_CIS_BRAWNDO_CANDIDATE_QA', 'REACT_APP_CIS_INITECH_CANDIDATE_QA',
  'REACT_APP_CIS_KRUSTY_CANDIDATE_QA'];
let savedFlags;

beforeEach(() => {
  savedFlags = fixtureFlags.map(key => [key, process.env[key]]);
  fixtureFlags.forEach(key => { delete process.env[key]; });
});

// Preserve the complete pre-change output, including property/array order and foreign clients.
function fingerprint(db) {
  for (const clientId of canonicalClients) {
    expect(db.cis_demo_refresh.clients[clientId].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
  }
  const serialized = JSON.stringify(db);
  const collections = Object.fromEntries(Object.entries(db).map(([key, value]) => [key, {
    count: Array.isArray(value) ? value.length : null,
    sha256: digest(JSON.stringify(value)),
  }]));
  const files = db.evidence.map(row => {
    const bytes = typeof row.content_base64 === 'string' ? Buffer.from(row.content_base64, 'base64') : null;
    if (canonicalClients.has(row.client_id)) {
      expect(bytes).not.toBeNull();
      expect(bytes.length).toBeGreaterThan(0);
      expect(bytes.length).toBe(row.size);
      expect(bytes.toString('base64')).toBe(row.content_base64);
      expect(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)).toBe(true);
    }
    return {
      evidence_id: row.evidence_id,
      client_id: row.client_id,
      filename: row.filename,
      mime_type: row.mime_type,
      size: row.size,
      bytes_sha256: bytes ? digest(bytes) : null,
      metadata_sha256: digest(JSON.stringify(row)),
      ordered_relationships_sha256: digest(JSON.stringify(row.relationships ?? null)),
    };
  });
  return {raw_chars: serialized.length, sha256: digest(serialized), collections, files};
}

afterEach(() => {
  clearFileCache();
  jest.useRealTimers();
  for (const [key, value] of savedFlags) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test.each(['2026-11-04T12:00:00.000Z', '2030-05-15T12:00:00.000Z'])(
  'complete native cohort preserves original records, bytes and ordered links at %s',
  at => {
    const clock = new Date(at);
    jest.useFakeTimers().setSystemTime(clock);
    const original = fingerprint(seedStore(clock));
    clearFileCache();
    const repeated = fingerprint(seedStore(clock));
    expect(repeated).toEqual(original);
    expect(original).toEqual(originalCohorts[at]);
    if (process.env.CIS_REBUILD_AUDIT_OUTPUT) {
      writeFileSync(join(process.env.CIS_REBUILD_AUDIT_OUTPUT, 'COHORT-' + at.slice(0, 10) + '.json'),
        JSON.stringify(original, null, 2) + '\n', {flag: 'wx'});
    }
  },
  120000,
);
