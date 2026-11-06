import fs from 'fs';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import {seedStore,readStore,saveStore,STORE_KEY} from './store';
import {previewAdapter} from './adapter';
import {lightweightStore,clearFileCache} from './evidenceStorage';
import {compactPortfolioReporting} from './portfolioReporting';
import {writeDemoStore,decodeDemoStore,MAX_DEMO_DECODE_BYTES} from './demoStorageCodec';
import {DUNDER_ARTIFACT_DEFINITIONS} from './programs/dunderEightYearArtifacts';
import {DUNDER_ID as CID,EIGHT_YEAR_ANCHOR} from './programs/isoSocEightYearSupport';

const api=axios.create({adapter:previewAdapter});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const runtime='2026-11-03T12:00:00.000Z';
let db,baseline,saved,prior;
beforeAll(()=>{
  prior=Object.fromEntries(['REACT_APP_PREVIEW','REACT_APP_DUNDER_EIGHT_YEAR_QA','REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA'].map(key=>[key,process.env[key]]));
  process.env.REACT_APP_PREVIEW='true';delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA;delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA;
  jest.useFakeTimers({doNotFake:['performance']});jest.setSystemTime(new Date(runtime));
  sessionStorage.clear();localStorage.clear();clearFileCache();
  baseline=seedStore(new Date(EIGHT_YEAR_ANCHOR));
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_QA='true';
  db=seedStore(new Date(runtime));
});
afterAll(()=>{
  for(const [key,value] of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;
  jest.useRealTimers();sessionStorage.clear();localStorage.clear();clearFileCache();
});

test('actual private seedStore plus canonical refresh retains the fixed source and unchanged native budgets',()=>{
  expect(new Date().toISOString()).toBe(runtime);expect(db.dunder_demo_artifacts.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(db.cis_demo_refresh.anchor).toBe(EIGHT_YEAR_ANCHOR);
  expect(db.clients.map(row=>row.client_id).sort()).toEqual(['demo_brawndo','demo_dunder','demo_initech','demo_krusty_krab','demo_prestige'].sort());
  for(const [kind,rows] of Object.entries(baseline))if(Array.isArray(rows)&&kind!=='users')
    expect(db[kind].filter(row=>row.client_id!==CID)).toEqual(rows.filter(row=>row.client_id!==CID));
  for(const user of baseline.users)expect(db.users.find(row=>row.user_id===user.user_id)).toEqual(user);
  const foreign=point=>(point.client_id||point.program_id?.split(':')[0])!==CID;
  for(const key of ['snapshots','identities','scope_events'])expect((db.portfolio_reporting[key]||[]).filter(foreign))
    .toEqual((baseline.portfolio_reporting[key]||[]).filter(foreign));
  const reviews=db.reviews.filter(row=>row.client_id===CID);
  expect(reviews).toHaveLength(129);expect(reviews.reduce((total,row)=>total+row.occurrences.length,0)).toBe(524);
  expect(db.framework_assessments.filter(row=>row.client_id===CID)).toHaveLength(123);
  expect(db.ai_intake[CID]).toMatchObject({usage:'yes',indicators:['Third-party AI tools internally'],updated_at:EIGHT_YEAR_ANCHOR});
  const json=JSON.stringify(db),packed=compactPortfolioReporting(lightweightStore(db)),serialized=JSON.stringify(packed);
  expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(MAX_DEMO_DECODE_BYTES);
  writeDemoStore({setItem(_key,value){if(value.length*2>5*1024*1024)throw Object.assign(new Error('Controlled 5 MiB budget'),{name:'QuotaExceededError'});saved=value;}},'fixture',serialized);
  expect(decodeDemoStore(saved)).toEqual(packed);
  const files=db.evidence.filter(row=>row.client_id===CID);expect(files).toHaveLength(32);
  for(const definition of DUNDER_ARTIFACT_DEFINITIONS){
    const row=files.find(item=>item.evidence_id===definition.evidence_id);
    expect(sha(Buffer.from(row.content_base64,'base64'))).toBe(definition.sha256);
  }
  const report={source:'Actual private seedStore including refreshCanonicalCisDemo; isolated baseline49db, not root combined CIS checkpoint',runtime,fixture_anchor:EIGHT_YEAR_ANCHOR,
    raw_chars:json.length,packed_utf8_bytes:Buffer.byteLength(serialized),stored_utf16_bytes:saved.length*2,
    source_sha256:sha(json),client_ids:db.clients.map(row=>row.client_id),reviews:reviews.length,occurrences:524,
    unchanged_foreign_arrays:true,unchanged_original_users:true,
    hashes:files.map(row=>({evidence_id:row.evidence_id,filename:row.filename,size:row.size,sha256:sha(Buffer.from(row.content_base64,'base64'))}))};
  if(process.env.ISO_SOC_DUNDER_OUTPUT){
    fs.mkdirSync(process.env.ISO_SOC_DUNDER_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.ISO_SOC_DUNDER_OUTPUT,'PRIVATE-STARTUP.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(process.env.ISO_SOC_DUNDER_OUTPUT,'PRIVATE-STARTUP-SOURCE.json'),json);
  }
});

test('actual private fresh data reloads without reseeding and native archive/historical downloads remain exact',async()=>{
  sessionStorage.setItem(STORE_KEY,saved);sessionStorage.setItem('grc_demo_entered','true');clearFileCache();
  const visitor=readStore();visitor.clients.find(row=>row.client_id===CID).notes='Native private startup visitor edit retained';
  saveStore(visitor);clearFileCache();
  expect(readStore().clients.find(row=>row.client_id===CID).notes).toBe('Native private startup visitor edit retained');
  for(const definition of [DUNDER_ARTIFACT_DEFINITIONS[0],DUNDER_ARTIFACT_DEFINITIONS.find(row=>row.key.startsWith('milestone_'))]){
    const response=(await api.get('/evidence/'+definition.evidence_id+'/download',{params:{client_id:CID}})).data;
    expect(sha(Buffer.from(response.content_base64,'base64'))).toBe(definition.sha256);
    expect(readStore().evidence.find(row=>row.evidence_id===definition.evidence_id).content_base64).toBeUndefined();
  }
});

test.each(['yes','no','unsure'])('native intake %s survives save and reload without changing AI approvals or historical files',async usage=>{
  sessionStorage.setItem(STORE_KEY,saved);sessionStorage.setItem('grc_demo_entered','true');clearFileCache();
  const before=readStore(),systems=before.ai_systems.filter(row=>row.client_id===CID),historical=before.reviews.filter(row=>row.client_id===CID).map(row=>row.occurrences);
  const intake=(await api.get('/ai-intake',{params:{client_id:CID}})).data;
  expect(intake).toMatchObject({usage:'yes',updated_at:EIGHT_YEAR_ANCHOR});
  const body={client_id:CID,usage,indicators:usage==='yes'?['Third-party AI tools internally']:[],expected_updated_at:intake.updated_at};
  const response=(await api.post('/ai-intake',body)).data;
  clearFileCache();const reloaded=readStore();
  expect((await api.get('/ai-intake',{params:{client_id:CID}})).data).toEqual(response);
  expect(response.usage).toBe(usage);expect(reloaded.ai_intake[CID].updated_at).toBe(runtime);
  expect(reloaded.ai_systems.filter(row=>row.client_id===CID)).toEqual(systems);
  expect(systems.every(row=>row.approval_status===undefined&&!row.approval_history)).toBe(true);
  expect(reloaded.reviews.filter(row=>row.client_id===CID).map(row=>row.occurrences)).toEqual(historical);
  expect(reloaded.evidence.filter(row=>row.client_id===CID)).toHaveLength(32);
  for(const [id,value] of Object.entries(before.ai_intake))if(id!==CID)expect(reloaded.ai_intake[id]).toEqual(value);
  await expect(api.post('/ai_systems/'+systems[0].ai_system_id+'/approval',{status:'approved',note:'Not authorized for this program',expected_updated_at:systems[0].updated_at})).rejects.toThrow(/configured CIS program/);
  expect(readStore().ai_systems.filter(row=>row.client_id===CID)).toEqual(systems);
});
