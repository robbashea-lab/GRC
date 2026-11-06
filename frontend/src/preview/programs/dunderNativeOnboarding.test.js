import fs from 'fs';
import path from 'path';
import {prepareDunderNativeOnboarding} from './dunderNativeOnboarding';
import {buildLegacyDemoStore,seedStore,saveStore,readStore} from '../store';
import {saveBaseline,baselineRecordVersions} from '../baseline';
import catalog from '@catalogs/onboardingCatalog.json';

const CID='demo_dunder',CLOCK=new Date('2026-11-02T12:00:00Z');
const options={clock:CLOCK,purpose:'native_onboarding_qa'};
let source,originalFlag,originalPreview;
beforeAll(()=>{source=buildLegacyDemoStore(CLOCK);});
beforeEach(()=>{originalFlag=process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA;originalPreview=process.env.REACT_APP_PREVIEW;sessionStorage.clear();localStorage.clear();});
afterEach(()=>{if(originalFlag===undefined)delete process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA;else process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA=originalFlag;if(originalPreview===undefined)delete process.env.REACT_APP_PREVIEW;else process.env.REACT_APP_PREVIEW=originalPreview;sessionStorage.clear();localStorage.clear();});

test('prepare only canonical Dunder, retaining full backup, accounts, contacts, identity and every other client',()=>{
  const before=JSON.stringify(source),result=prepareDunderNativeOnboarding(source,options),db=result.db;
  expect(JSON.stringify(source)).toBe(before);
  expect(JSON.stringify(result.backup)).toBe(before);
  expect(db.users).toEqual(source.users);expect(db.contacts).toEqual(source.contacts);
  for(const [key,rows] of Object.entries(source))if(Array.isArray(rows)&&!['clients','users','contacts'].includes(key)) {
    expect(db[key]).toEqual(rows.filter(row=>row.client_id!==CID));
  }
  expect(db.clients.filter(row=>row.client_id!==CID)).toEqual(source.clients.filter(row=>row.client_id!==CID));
  const prior=source.clients.find(row=>row.client_id===CID),client=db.clients.find(row=>row.client_id===CID);
  for(const key of Object.keys(prior).filter(key=>!['initial_program_baseline','onboarding_baseline','iso_audit_program'].includes(key)))expect(client[key]).toEqual(prior[key]);
  expect(db.baselines[CID]).toMatchObject({version:3,step:0,completed:false,updated_at:null});
  expect(result.inventory.framework_assessments).toBe(123);
  if(process.env.ISO_SOC_ONBOARDING_OUTPUT) {
    fs.mkdirSync(process.env.ISO_SOC_ONBOARDING_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.ISO_SOC_ONBOARDING_OUTPUT,'DUNDER-ONBOARDING-SOURCE-BACKUP.json'),before);
  }
});

test.each([
  ['wrong purpose',db=>db,{...options,purpose:'ordinary_reload'}],
  ['wrong day',db=>db,{...options,clock:new Date('2026-11-03T12:00:00Z')}],
  ['authenticated actor',db=>{db.user.workspace_mode='standard';return db;},options],
  ['read-only actor',db=>{db.user.role='client_readonly';return db;},options],
  ['disabled actor',db=>{db.user.status='disabled';return db;},options],
  ['wrong environment',db=>{db.clients.find(row=>row.client_id===CID).environment='Production';return db;},options],
  ['foreign inbound link',db=>{db.tasks.push({task_id:'foreign',client_id:'demo_prestige',finding_id:db.findings.find(row=>row.client_id===CID).finding_id});return db;},options],
  ['foreign evidence relationship',db=>{db.evidence.push({evidence_id:'foreign',client_id:'demo_prestige',relationships:[{kind:'reviews',id:db.reviews.find(row=>row.client_id===CID).review_id}]});return db;},options],
  ['foreign organizational control assessment',db=>{db.organizational_controls.push({control_id:'foreign',client_id:'demo_prestige',assessment_ids:[db.framework_assessments.find(row=>row.client_id===CID).framework_assessment_id]});return db;},options],
  ['nested foreign assurance evidence',db=>{db.vendors.push({vendor_id:'foreign',client_id:'demo_prestige',assurance_records:[{evidence_ids:[db.evidence.find(row=>row.client_id===CID).evidence_id]}]});return db;},options],
  ['conflicting guided ownership',db=>{const id=db.framework_assessments.find(row=>row.client_id===CID).framework_assessment_id;db.guided_assessment_pilot={[id+':actor']:{client_id:'demo_prestige',assessment_id:id}};return db;},options],
  ['conflicting reporting ownership',db=>{db.portfolio_reporting.snapshots.push({client_id:CID,program_id:'demo_prestige:soc-2'});return db;},options],
])('%s fails without changing the input',(_label,change,args)=>{
  const db=change(JSON.parse(JSON.stringify(source))),before=JSON.stringify(db);
  expect(()=>prepareDunderNativeOnboarding(db,args)).toThrow();expect(JSON.stringify(db)).toBe(before);
});

test('native baseline finalization creates unknown ISO records rather than copying old assessments',()=>{
  const {db}=prepareDunderNativeOnboarding(source,options);
  const state={version:3,step:3,selected_policy_keys:[],policies:{},reviews:[],framework_reviews:{},
    requirements:Object.fromEntries(catalog.requirements.map(item=>[item.key,item.key==='iso-27001'?'applies':'does_not_apply']))};
  saveBaseline(db,CID,state,true,{expected_updated_at:null,expected_records:baselineRecordVersions(db,CID)});
  expect(db.baselines[CID].completed).toBe(true);
  const assessments=db.framework_assessments.filter(row=>row.client_id===CID);
  expect(assessments).toHaveLength(123);
  for(const row of assessments){expect(row.status).toBe('not_assessed');expect(row.implementation).toBe('');expect(row.assessment_history).toEqual([]);}
});

test('private seed flag never re-prepares a saved visitor session',()=>{
  process.env.REACT_APP_PREVIEW='true';
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA='true';
  const db=seedStore(CLOCK),client=db.clients.find(row=>row.client_id===CID);
  client.notes='Retained visitor note';
  saveStore(db);
  const saved=readStore();
  expect(saved.clients.find(row=>row.client_id===CID).notes).toBe('Retained visitor note');
  expect(saved.baselines[CID]).toEqual(db.baselines[CID]);
  expect(saved.users).toEqual(db.users);
});

test('a populated session saved before the private flag keeps its completed onboarding and history',()=>{
  const db=JSON.parse(JSON.stringify(source));
  db.clients.find(row=>row.client_id===CID).notes='Existing visitor modification before QA flag';
  saveStore(db);
  process.env.REACT_APP_PREVIEW='true';
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA='true';
  const saved=readStore();
  expect(saved.clients.find(row=>row.client_id===CID).notes).toBe('Existing visitor modification before QA flag');
  expect(saved.baselines[CID]).toEqual(db.baselines[CID]);
  expect(saved.framework_assessments.filter(row=>row.client_id===CID)).toEqual(db.framework_assessments.filter(row=>row.client_id===CID));
  expect(saved.reviews.filter(row=>row.client_id===CID)).toEqual(db.reviews.filter(row=>row.client_id===CID));
});

test('standard mode ignores the private QA flag and retains the original Dunder dataset',()=>{
  process.env.REACT_APP_PREVIEW='false';
  process.env.REACT_APP_DUNDER_EIGHT_YEAR_ONBOARDING_QA='true';
  const db=seedStore(CLOCK);
  expect(db.baselines[CID]).toEqual(source.baselines[CID]);
  expect(db.framework_assessments.filter(row=>row.client_id===CID)).toEqual(source.framework_assessments.filter(row=>row.client_id===CID));
  expect(db.reviews.filter(row=>row.client_id===CID)).toEqual(source.reviews.filter(row=>row.client_id===CID));
  expect(db.clients.find(row=>row.client_id===CID)).toEqual(source.clients.find(row=>row.client_id===CID));
});
