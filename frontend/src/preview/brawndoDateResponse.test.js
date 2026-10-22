import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore,STORE_KEY} from './store';
import * as reporting from './portfolioReporting';

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

test('date projection agrees across workspace, direct record and accepted response without persisting synthetic native fields',async()=>{
  const row=find(readStore());
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

test('new accepted completion date is acknowledged after capture and survives reopening',async()=>{
  const row=find(readStore(),'1.1');
  jest.setSystemTime(new Date('2026-10-18T18:02:00.000Z'));
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'addressed',expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(saved.demo_date_metadata).toMatchObject({kind:'implementation_transition',provenance:'accepted_native',effective_date:'2026-10-18',before_status:'needs_attention'});
  const {data:reopened}=await api.get('/framework_assessments/'+row.framework_assessment_id);
  expect(reopened.demo_date_metadata).toEqual(saved.demo_date_metadata);
  const {data:workspace}=await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}});
  expect(workspace.assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id).demo_date_metadata).toEqual(saved.demo_date_metadata);
  expect(find(readStore(),'1.1').demo_date_metadata).toBeUndefined();
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
