import axios from 'axios';
import crypto from 'crypto';
import {buildLegacyDemoStore, readStore, seedStore, STORE_KEY} from './store';
import {createDunderEightYearCandidate} from './programs/dunderEightYearScenario';
import {DUNDER_ARTIFACT_DEFINITIONS} from './programs/dunderEightYearArtifacts';
import {DUNDER_ID as CID, EIGHT_YEAR_ANCHOR, copy} from './programs/isoSocEightYearSupport';
import {registerDunderDemoArtifacts, restoredDunderDemoEvidence} from './dunderDemoEvidence';
import {compactPortfolioReporting} from './portfolioReporting';
import {lightweightStore, clearFileCache, getEvidenceCacheRevision} from './evidenceStorage';
import {writeDemoStore} from './demoStorageCodec';
import {previewAdapter} from './adapter';

const api=axios.create({adapter:previewAdapter});
const sha=base64=>crypto.createHash('sha256').update(Buffer.from(base64,'base64')).digest('hex');
let db,saved,originalPreview,originalQa;
beforeAll(()=>{
  jest.useFakeTimers({doNotFake:['performance']});jest.setSystemTime(new Date(EIGHT_YEAR_ANCHOR));
  db=createDunderEightYearCandidate(buildLegacyDemoStore(new Date(EIGHT_YEAR_ANCHOR)),{clock:new Date(EIGHT_YEAR_ANCHOR)}).db;
  const packed=compactPortfolioReporting(lightweightStore(db));
  writeDemoStore({setItem(_key,value){if(value.length*2>5*1024*1024)throw Object.assign(new Error('Controlled 5 MiB budget'),{name:'QuotaExceededError'});saved=value;}},'fixture',JSON.stringify(packed));
  originalPreview=process.env.REACT_APP_PREVIEW;originalQa=process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;
});
beforeEach(()=>{sessionStorage.clear();localStorage.clear();clearFileCache();sessionStorage.setItem(STORE_KEY,saved);sessionStorage.setItem('grc_demo_entered','true');});
afterAll(()=>{
  jest.useRealTimers();sessionStorage.clear();localStorage.clear();clearFileCache();
  if(originalPreview===undefined)delete process.env.REACT_APP_PREVIEW;else process.env.REACT_APP_PREVIEW=originalPreview;
  if(originalQa===undefined)delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;else process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA=originalQa;
});

test.each(DUNDER_ARTIFACT_DEFINITIONS)('$filename: native authorized download returns exact original bytes after cold reload',async definition=>{
  const before=readStore().evidence.find(row=>row.evidence_id===definition.evidence_id);
  expect(before.content_base64).toBeUndefined();expect(before.demo_file_storage).toBe('session_only');
  const response=(await api.get('/evidence/'+definition.evidence_id+'/download',{params:{client_id:CID}})).data;
  expect(response.filename).toBe(definition.filename);expect(response.size).toBe(definition.size);
  expect(response.content_base64).toBe(definition.content_base64);expect(sha(response.content_base64)).toBe(definition.sha256);
  // Download fallback returns bytes without turning the native temporary cache into storage.
  expect(readStore().evidence.find(row=>row.evidence_id===definition.evidence_id).content_base64).toBeUndefined();
});

test('current editable records, historical parents and metadata cannot rewrite the frozen original file',()=>{
  const cold=readStore(),definition=DUNDER_ARTIFACT_DEFINITIONS[0],row=cold.evidence.find(item=>item.evidence_id===definition.evidence_id);
  Object.assign(row,{display_name:'Reviewed archive title',notes:'Visitor note',evidence_type:'Other',evidence_date:'2026-11-01',archived_at:EIGHT_YEAR_ANCHOR,relationships:[]});
  cold.clients.find(client=>client.client_id===CID).status='archived';
  cold.framework_assessments.find(item=>item.client_id===CID).implementation='Changed current assessment';
  for(const policy of cold.policies.filter(item=>item.client_id===CID))policy.summary='Changed current policy text';
  const before=JSON.stringify(cold),revision=getEvidenceCacheRevision();
  const result=restoredDunderDemoEvidence(cold,row);
  expect(result.content_base64).toBe(definition.content_base64);expect(result.notes).toBe('Visitor note');expect(result.archived_at).toBe(EIGHT_YEAR_ANCHOR);
  expect(JSON.stringify(cold)).toBe(before);expect(getEvidenceCacheRevision()).toBe(revision);
});

test.each([
  ['standard actor',value=>{value.user.workspace_mode='standard';}],
  ['foreign reader',value=>{value.user.role='client_readonly';value.user.client_ids=['demo_prestige'];}],
  ['disabled actor',value=>{value.user.status='disabled';}],
  ['missing installation proof',value=>{delete value.dunder_demo_artifacts;}],
  ['wrong source revision',value=>{value.dunder_demo_artifacts.source_version='unknown';}],
  ['changed approved source hash',value=>{value.dunder_demo_artifacts.source_sha256='0'.repeat(64);}],
  ['wrong fixture revision',value=>{value.dunder_demo_artifacts.fixture_version='unknown';}],
  ['shifted anchor',value=>{value.dunder_demo_artifacts.anchor='2026-11-03T00:00:00.000Z';}],
  ['unexpected source payload',value=>{value.dunder_demo_artifacts.payload='untrusted';}],
  ['duplicate Evidence identity',value=>{value.evidence.push(copy(value.evidence.find(row=>row.client_id===CID)));}],
  ['duplicate canonical client',value=>{value.clients.push(copy(value.clients.find(row=>row.client_id===CID)));}],
  ['malformed inventory',value=>{value.dunder_demo_artifacts.artifacts=[];}],
  ['unknown source key',value=>{Object.values(value.dunder_demo_artifacts.artifacts)[0].key='unknown';}],
  ['changed source fingerprint',value=>{Object.values(value.dunder_demo_artifacts.artifacts)[0].fingerprint='changed';}],
])('%s cannot gain fallback bytes or mutate the store',(_label,change)=>{
  const cold=readStore();change(cold);const before=JSON.stringify(cold);
  expect(restoredDunderDemoEvidence(cold,cold.evidence.find(row=>row.client_id===CID))).toBeNull();
  expect(JSON.stringify(cold)).toBe(before);
});

test.each([
  ['filename','changed.txt'],['mime_type','text/html'],['size',1],['version',2],['linked_id','foreign-record'],
  ['occurrence_id','changed'],['created_at','2026-11-03T00:00:00.000Z'],['uploaded_at','2026-11-03T00:00:00.000Z'],
  ['uploaded_by','another-user'],['uploaded_by_email','another@example.test'],['sha256','0'.repeat(64)],
])('changed immutable %s is rejected', (field,value)=>{
  const cold=readStore(),row=cold.evidence.find(item=>item.client_id===CID);row[field]=value;
  expect(restoredDunderDemoEvidence(cold,row)).toBeNull();
});

test('Clear and existing bytes win; custom, other-demo and prototype descriptors receive no source bytes',()=>{
  const cold=readStore(),row=cold.evidence.find(item=>item.client_id===CID);
  row.demo_file_storage='cleared';expect(restoredDunderDemoEvidence(cold,row)).toBeNull();
  row.demo_file_storage='session_only';row.content_base64='eA==';expect(restoredDunderDemoEvidence(cold,row)).toBeNull();delete row.content_base64;
  for(const clientId of ['demo_prestige','demo_brawndo','demo_initech','demo_krusty_krab','demo_dunder_mifflin','custom']){
    const other={...row,client_id:clientId,evidence_id:clientId+'_copied'};cold.evidence.push(other);
    expect(restoredDunderDemoEvidence(cold,other)).toBeNull();
  }
  const unknown={...row,evidence_id:'custom-upload'};cold.evidence.push(unknown);expect(restoredDunderDemoEvidence(cold,unknown)).toBeNull();
  const descriptor=cold.dunder_demo_artifacts.artifacts[row.evidence_id];
  Object.setPrototypeOf(descriptor,{extra:true});expect(restoredDunderDemoEvidence(cold,row)).toBeNull();
});

test('native no-session and foreign-client authorization precede fallback',async()=>{
  const id=DUNDER_ARTIFACT_DEFINITIONS[0].evidence_id;
  sessionStorage.removeItem('grc_demo_entered');
  await expect(api.get('/evidence/'+id+'/download')).rejects.toMatchObject({response:{status:401}});
  const foreign=copy(db);foreign.user={...foreign.user,role:'client_readonly',client_ids:['demo_prestige']};
  const packed=JSON.stringify(compactPortfolioReporting(lightweightStore(foreign)));
  writeDemoStore(sessionStorage,STORE_KEY,packed);sessionStorage.setItem('grc_demo_entered','true');clearFileCache();
  await expect(api.get('/evidence/'+id+'/download',{params:{client_id:CID}})).rejects.toMatchObject({response:{status:403}});
});

test('native Clear keeps the files explicitly unavailable after reload',async()=>{
  const id=DUNDER_ARTIFACT_DEFINITIONS[0].evidence_id;
  await api.post('/demo/clear-evidence-files');clearFileCache();
  await expect(api.get('/evidence/'+id+'/download')).rejects.toMatchObject({response:{status:400}});
  expect(readStore().evidence.find(row=>row.evidence_id===id).demo_file_storage).toBe('cleared');
});

test('an authenticated workspace cannot synthesize Demo file bytes through the download route',async()=>{
  const standard=copy(db);standard.user.workspace_mode='standard';
  writeDemoStore(sessionStorage,STORE_KEY,JSON.stringify(compactPortfolioReporting(lightweightStore(standard))));clearFileCache();
  await expect(api.get('/evidence/'+DUNDER_ARTIFACT_DEFINITIONS[0].evidence_id+'/download'))
    .rejects.toMatchObject({response:{status:400}});
});

test('native same-client read-only access and visitor edits survive reload without reinstalling',async()=>{
  const visitor=copy(db);visitor.user={...visitor.user,role:'client_readonly',client_ids:[CID]};
  visitor.clients.find(row=>row.client_id===CID).notes='Retained visitor change';
  const packed=JSON.stringify(compactPortfolioReporting(lightweightStore(visitor)));
  writeDemoStore(sessionStorage,STORE_KEY,packed);clearFileCache();
  process.env.REACT_APP_PREVIEW='true';process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA='true';
  const definition=DUNDER_ARTIFACT_DEFINITIONS[0];
  const response=(await api.get('/evidence/'+definition.evidence_id+'/download',{params:{client_id:CID}})).data;
  expect(sha(response.content_base64)).toBe(definition.sha256);
  const retained=readStore();expect(retained.clients.find(row=>row.client_id===CID).notes).toBe('Retained visitor change');
  expect(createDunderEightYearCandidate(retained,{clock:new Date(EIGHT_YEAR_ANCHOR)}).installed).toBe(false);
});

test('invalid final registration cannot commit a partial inventory',()=>{
  const value=copy(db);delete value.dunder_demo_artifacts;
  value.evidence.find(row=>row.evidence_id===DUNDER_ARTIFACT_DEFINITIONS.at(-1).evidence_id).content_base64='eA==';
  const before=JSON.stringify(value);expect(()=>registerDunderDemoArtifacts(value)).toThrow();expect(JSON.stringify(value)).toBe(before);
});

test('two native onboarding sources bind their own policy IDs once without rebinding on download',()=>{
  const second=createDunderEightYearCandidate(buildLegacyDemoStore(new Date(EIGHT_YEAR_ANCHOR)),{clock:new Date(EIGHT_YEAR_ANCHOR)}).db;
  const firstPolicy=db.evidence.find(row=>row.client_id===CID&&row.linked_type==='policy');
  const secondPolicy=second.evidence.find(row=>row.client_id===CID&&row.linked_type==='policy');
  expect(secondPolicy.linked_id).not.toBe(firstPolicy.linked_id);
  expect(second.policies.find(row=>row.policy_id===secondPolicy.linked_id).baseline_key).toBe('policy-backup-restoration-policy');
  const cold=copy(lightweightStore(second)),row=cold.evidence.find(item=>item.evidence_id===secondPolicy.evidence_id);
  expect(restoredDunderDemoEvidence(cold,row).content_base64).toBe(secondPolicy.content_base64);
  row.linked_id=firstPolicy.linked_id;
  expect(restoredDunderDemoEvidence(cold,row)).toBeNull();
});

test('the private complete-fixture flag cannot activate Dunder in standard startup',()=>{
  const previousPreview=process.env.REACT_APP_PREVIEW,previousQa=process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;
  try{
    process.env.REACT_APP_PREVIEW='false';process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA='true';
    const value=seedStore(new Date(EIGHT_YEAR_ANCHOR));
    expect(value.dunder_demo_artifacts).toBeUndefined();
    expect(value.clients.find(row=>row.client_id===CID).demo_program_version).toBe('iso27001-year2-v1');
  }finally{
    if(previousPreview===undefined)delete process.env.REACT_APP_PREVIEW;else process.env.REACT_APP_PREVIEW=previousPreview;
    if(previousQa===undefined)delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;else process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA=previousQa;
  }
});
