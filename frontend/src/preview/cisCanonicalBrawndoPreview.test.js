import {seedStore,saveStore,readStore} from './store';
import {clearFileCache} from './evidenceStorage';
import {CIS_CANONICAL_SCENARIO_REVISION} from './cisCanonicalArtifactBooks';

const CID='demo_brawndo',CLOCK=new Date('2026-11-02T12:00:00.000Z');
const keys=['REACT_APP_PREVIEW','REACT_APP_DEMO_ONBOARDING_CLIENT',
  'REACT_APP_CIS_BRAWNDO_CANDIDATE_QA','REACT_APP_CIS_INITECH_CANDIDATE_QA','REACT_APP_CIS_KRUSTY_CANDIDATE_QA'];
let original;
beforeEach(()=>{
  original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  for(const key of keys)delete process.env[key];
  jest.useFakeTimers().setSystemTime(CLOCK);
  sessionStorage.clear();clearFileCache();
});
afterEach(()=>{
  for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
  sessionStorage.clear();clearFileCache();jest.useRealTimers();
});

test('a private Brawndo flag has no effect on ordinary Demo initialization when preview is false',()=>{
  process.env.REACT_APP_PREVIEW='false';
  const ordinary=seedStore(CLOCK);
  process.env.REACT_APP_CIS_BRAWNDO_CANDIDATE_QA='true';
  const db=seedStore(CLOCK);
  expect(db).toEqual(ordinary);
  expect(db.cis_demo_refresh.clients[CID].canonical_revision).toBe(CIS_CANONICAL_SCENARIO_REVISION);
  expect(db.evidence.some(row=>row.evidence_id.startsWith(CID+'_canonical_evidence_'))).toBe(true);
});

test('private fresh initialization uses the candidate, while reload preserves visitor edits and the original anchor',()=>{
  process.env.REACT_APP_PREVIEW='true';
  process.env.REACT_APP_CIS_BRAWNDO_CANDIDATE_QA='true';
  const db=seedStore(CLOCK),others=db.clients.filter(row=>row.client_id!==CID);
  const risk=db.risks.find(row=>row.client_id===CID);
  risk.description+=' Visitor QA edit retained.';
  const reviews=db.reviews.filter(row=>row.client_id===CID);
  expect(db.framework_assessments.filter(row=>row.client_id===CID&&row.status==='addressed')).toHaveLength(48);
  expect(db.evidence.filter(row=>row.client_id===CID)).toHaveLength(31);
  saveStore(db);
  jest.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));
  clearFileCache();
  const restored=readStore();
  expect(restored.risks.find(row=>row.risk_id===risk.risk_id).description).toBe(risk.description);
  expect(restored.cis_demo_refresh.anchor).toBe('2026-11-02T00:00:00.000Z');
  expect(restored.reviews.filter(row=>row.client_id===CID)).toEqual(reviews);
  expect(restored.clients.filter(row=>row.client_id!==CID)).toEqual(others);
  expect(new Set(restored.evidence.map(row=>row.evidence_id)).size).toBe(restored.evidence.length);
});
