import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore,STORE_KEY,buildLegacyDemoStore} from './store';
import * as reporting from './portfolioReporting';
import {safeguardDateFooter} from '../lib/brawndoSafeguardDates';
import {getCisDemoScenarioContext} from './cisDemoHistoryContext';
import {CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';

const AT='2026-10-18T18:00:00.000Z';
let api;
beforeEach(async()=>{
  jest.useFakeTimers().setSystemTime(new Date(AT));
  sessionStorage.clear();
  api=axios.create({adapter:previewAdapter});
  await api.post('/demo/enter');
});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();});
const find=(db,id='2.1')=>db.framework_assessments.find(row=>row.client_id==='demo_brawndo'&&row.definition_id===id);
const copy=value=>JSON.parse(JSON.stringify(value));
function retainedLegacyFixture(){
  saveStore(buildLegacyDemoStore(new Date(AT)),{resetFiles:true});
  const retained=readStore();
  expect(retained.cis_demo_refresh.clients.demo_brawndo.state).toBe('retained_without_rewrite');
  return retained;
}

test('retained legacy date projection agrees across workspace, direct record and accepted response without persisting synthetic native fields',async()=>{
  const row=find(retainedLegacyFixture());
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}});
  const {data:direct}=await api.get('/framework_assessments/'+row.framework_assessment_id);
  expect(workspace.assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id).demo_date_metadata).toEqual(direct.demo_date_metadata);
  expect(direct.demo_date_metadata.kind).toBe('implementation_transition');
  jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Synthetic QA wording',expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(saved.demo_date_metadata).toEqual(direct.demo_date_metadata);
  expect(find(readStore()).demo_date_metadata).toBeUndefined();
  expect(saved.last_saved).toBe('2026-10-18T18:01:00.000Z');
});

test('retained legacy accepted completion date is acknowledged after capture and survives reopening',async()=>{
  const row=find(retainedLegacyFixture(),'1.1');
  jest.setSystemTime(new Date('2026-10-18T18:02:00.000Z'));
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'addressed',expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(saved.demo_date_metadata).toMatchObject({kind:'implementation_transition',provenance:'accepted_native',effective_date:'2026-10-18',before_status:'needs_attention'});
  const {data:reopened}=await api.get('/framework_assessments/'+row.framework_assessment_id);
  expect(reopened.demo_date_metadata).toEqual(saved.demo_date_metadata);
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}});
  expect(workspace.assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id).demo_date_metadata).toEqual(saved.demo_date_metadata);
  expect(find(readStore(),'1.1').demo_date_metadata).toBeUndefined();
});

test('fresh showcase partial dates are actual native saved dates across workspace and direct reads; unknown remains unassessed',async()=>{
  const db=readStore(),row=find(db);
  expect(row.status).toBe('in_progress');
  expect(getCisDemoScenarioContext(db,'demo_brawndo',AT)).toMatchObject({version:CIS_SHOWCASE_VERSION});
  const latest=row.assessment_history.at(-1);
  expect(row.last_saved).toBe(latest.at);
  expect(row.last_assessed).toBe(latest.at.slice(0,10));
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}});
  const {data:direct}=await api.get('/framework_assessments/'+row.framework_assessment_id);
  const workspaceRow=workspace.assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  for(const response of [workspaceRow,direct]){
    expect(response).toMatchObject({framework_assessment_id:row.framework_assessment_id,status:'in_progress',last_saved:latest.at,last_assessed:latest.at.slice(0,10)});
    expect(response.demo_date_metadata).toBeUndefined();
    expect(safeguardDateFooter(response)).toMatchObject({label:'Last saved:',dateTime:new Date(row.last_saved).toISOString()});
  }
  const unknown=db.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.status==='not_assessed');
  expect(unknown).toBeTruthy();
  const {data:unassessed}=await api.get('/framework_assessments/'+unknown.framework_assessment_id);
  expect(unassessed.last_saved).toBeNull();
  expect(unassessed.last_assessed).toBeNull();
  expect(unassessed.assessment_history).toEqual([]);
  expect(safeguardDateFooter(unassessed)).toEqual({text:'Not yet assessed.'});
});

test('fresh showcase narrative save acknowledges the exact native timestamp without inventing a completion episode',async()=>{
  const row=find(readStore()),savedAt='2026-10-18T18:01:00.000Z';
  expect(row.status).toBe('in_progress');
  jest.setSystemTime(new Date(savedAt));
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,
    {implementation:'Synthetic showcase wording; coverage remains partial.',expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(saved).toMatchObject({status:'in_progress',last_saved:savedAt,last_assessed:savedAt});
  const {data:reopened}=await api.get('/framework_assessments/'+row.framework_assessment_id);
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}});
  const workspaceRow=workspace.assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  for(const response of [saved,reopened,workspaceRow]){
    expect(response.last_saved).toBe(savedAt);
    expect(response.demo_date_metadata).toBeUndefined();
    expect(safeguardDateFooter(response)).toMatchObject({label:'Last saved:',dateTime:savedAt});
  }
  const stored=find(readStore());
  expect(stored.demo_date_metadata).toBeUndefined();
  expect(stored.assessment_history.at(-1)).toMatchObject({status:'in_progress',at:savedAt});
  expect(getCisDemoScenarioContext(readStore(),'demo_brawndo',savedAt)).toBeTruthy();
});

test('fresh showcase accepted implementation change retains exact native date and actual committed source/activity proof after reopening',async()=>{
  const before=readStore(),row=find(before,'1.1'),savedAt='2026-10-18T18:02:00.000Z';
  expect(row.status).toBe('in_progress');
  const context=getCisDemoScenarioContext(before,'demo_brawndo',AT);
  expect(context).toMatchObject({version:CIS_SHOWCASE_VERSION});
  expect(context.point_ids).toHaveLength(6);
  const historicalPayload=point=>({snapshot_id:point.snapshot_id,effective_at:point.effective_at,captured_at:point.captured_at,
    counts:copy(point.current.counts),sources:copy(point.current.provenance.source_references)});
  const originalFixtures=before.portfolio_reporting.snapshots.filter(point=>context.point_ids.includes(point.snapshot_id)).map(historicalPayload);
  const oldSnapshots=new Set(before.portfolio_reporting.snapshots.map(point=>point.snapshot_id));
  const oldLogs=new Set(before.logs.map(log=>log.audit_id));
  jest.setSystemTime(new Date(savedAt));
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,
    {status:'addressed',expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(saved).toMatchObject({framework_assessment_id:row.framework_assessment_id,status:'addressed',last_saved:savedAt,last_assessed:savedAt});
  const {data:reopened}=await api.get('/framework_assessments/'+row.framework_assessment_id);
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}});
  const workspaceRow=workspace.assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  for(const response of [saved,reopened,workspaceRow]){
    expect(response.last_saved).toBe(savedAt);
    expect(response.demo_date_metadata).toBeUndefined();
    expect(safeguardDateFooter(response)).toMatchObject({label:'Last saved:',dateTime:savedAt});
  }
  const stored=readStore(),native=find(stored,'1.1');
  expect(native.demo_date_metadata).toBeUndefined();
  expect(native.assessment_history.at(-1)).toMatchObject({at:savedAt,status:'addressed',by:stored.user.user_id});
  const log=stored.logs.find(value=>!oldLogs.has(value.audit_id)&&value.entity_id===row.framework_assessment_id&&value.action==='Framework assessment updated');
  expect(log).toMatchObject({client_id:'demo_brawndo',entity_type:'framework_assessments',at:savedAt,meta:expect.objectContaining({status:'addressed'})});
  expect(stored.portfolio_reporting.activity_proofs[log.audit_id]).toMatchObject({eligible:true,type:'Assessments',changed_fields:expect.arrayContaining(['status'])});
  const committed=stored.portfolio_reporting.snapshots.filter(point=>!oldSnapshots.has(point.snapshot_id)&&point.client_id==='demo_brawndo'&&point.observation_kind==='committed_event');
  expect(committed).toHaveLength(1);
  expect(stored.portfolio_reporting.snapshots.filter(point=>!oldSnapshots.has(point.snapshot_id))).toEqual(committed);
  expect(stored.portfolio_reporting.fixture_versions?.['brawndo-cis-ig1-history-v2']).toBeUndefined();
  expect(committed[0]).toMatchObject({program_id:'demo_brawndo:cis-ig1',captured_at:savedAt,effective_at:savedAt});
  expect(committed[0].current.provenance.source_references.find(value=>value.id===row.framework_assessment_id))
    .toMatchObject({kind:'framework_assessments',definition_id:'1.1',framework_version:'8.1',status:'addressed',version:savedAt});
  expect(getCisDemoScenarioContext(stored,'demo_brawndo',savedAt)).toEqual(context);
  expect(stored.portfolio_reporting.snapshots.filter(point=>context.point_ids.includes(point.snapshot_id)).map(historicalPayload)).toEqual(originalFixtures);
});

test('saveStore returns the captured committed projection; storage and capture failures do not acknowledge or replace saved data',()=>{
  const db=readStore();
  const committed=saveStore(db);
  expect(committed.portfolio_reporting.snapshots).toEqual(readStore().portfolio_reporting.snapshots);
  const before=sessionStorage.getItem(STORE_KEY);
  const capture=jest.spyOn(reporting,'captureDemoReporting').mockImplementationOnce(()=>{throw new Error('Synthetic capture failure');});
  expect(()=>saveStore(db)).toThrow();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  capture.mockRestore();
  // Both the raw write and its compressed retry must fail to model unavailable storage.
  jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Synthetic quota failure','QuotaExceededError');});
  expect(()=>saveStore(db)).toThrow();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('stale and cancelled changes leave the persisted date episode unchanged',async()=>{
  const row=find(readStore()),before=sessionStorage.getItem(STORE_KEY);
  const localDraft={...row,status:'needs_attention'};
  expect(localDraft.status).not.toBe(row.status);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  await expect(api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'needs_attention',expected_last_assessed:'1999-01-01T00:00:00Z'})).rejects.toMatchObject({response:{status:409}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
