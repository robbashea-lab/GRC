import {enrichBrawndoReportingHistory} from './brawndoReportingHistory';
import {seedStore,readStore,saveStore,STORE_KEY,clone} from './store';
import {captureDemoReporting,demoCurrentPositions,portfolioReportingRequest,restorePortfolioReporting} from './portfolioReporting';
import axios from 'axios';
import {previewAdapter} from './adapter';
import {adjustProgram} from './onboardingHandoff';

const AT='2026-10-18T18:00:00.000Z',PROGRAM='demo_brawndo:cis-ig1';
const report=(db,range='3m')=>portfolioReportingRequest(db,'/portfolio/reporting/history',{client_id:'demo_brawndo',program_key:'cis-ig1',range});
const fixtures=db=>db.portfolio_reporting.snapshots.filter(row=>row.observation_kind==='demo_fixture');
beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date(AT));sessionStorage.clear();});
afterEach(()=>jest.useRealTimers());

test('fresh native seed has dated fixture observations with exact scope and four reconciled counts in every range',()=>{
  const db=seedStore(),before=clone(db);
  expect(fixtures(db)).toHaveLength(11);
  for(const range of ['1m','3m','6m','12m']){
    const result=report(db,range);
    expect(result.snapshots.length).toBeGreaterThanOrEqual(4);
    for(const point of result.snapshots){
      expect(point.program_id).toBe(PROGRAM);
      expect(point.included_counts.reduce((sum,row)=>sum+row.count,0)).toBe(point.denominator);
      expect(point.included_counts).toHaveLength(4);
      expect(point.percentage).toBe(point.implemented/point.denominator*100);
      expect(point.measure_version).toBe(result.current.measure_version);
      expect(point.scope_signature).toBe(result.current.scope_signature);
      expect(point.continuity_proven).not.toBe(true);
      expect(point.provenance).toMatchObject({kind:'demo_fixture',label:'Sample Demo program position'});
    }
  }
  expect(db).toEqual(before); // reporting GETs are reads
  expect(enrichBrawndoReportingHistory(db)).toBe(false);
  expect(db).toEqual(before);
});

test('native saved status reloads into current summaries and appends history without replacing fixtures',async()=>{
  const api=axios.create({adapter:previewAdapter});
  await api.post('/demo/enter');
  const before=readStore(),original=clone(fixtures(before));
  const row=before.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.definition_id==='1.1');
  expect(row.status).toBe('needs_attention');
  expect(report(before).current.implemented).toBe(32);
  jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
  const {data:saved}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'addressed',expected_last_assessed:row.last_saved??row.last_assessed??null});
  const reopened=readStore();
  expect(reopened.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id)).toMatchObject({status:'addressed',last_saved:saved.last_saved});
  expect(fixtures(reopened)).toEqual(original);
  const history=(await api.get('/portfolio/reporting/history',{params:{client_id:'demo_brawndo',program_key:'cis-ig1',range:'12m'}})).data;
  expect(history.current.implemented).toBe(33);
  expect(history.current.denominator).toBe(56);
  expect(history.snapshots).toHaveLength(13);
  expect(history.snapshots.at(-1)).toMatchObject({implemented:33,denominator:56,observation_kind:'committed_event'});
  const native=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  expect(native.implementation_position.implemented).toBe(history.current.implemented);
});

test('existing sessions with an earlier enabled framework enrich only the exact CIS program',()=>{
  const db=seedStore();delete db.portfolio_reporting;
  adjustProgram(db,'demo_brawndo','hipaa',{applicability:'applies'});
  db.requirements.find(row=>row.client_id==='demo_brawndo'&&row.baseline_key==='hipaa').status='active';
  const client=db.clients.find(row=>row.client_id==='demo_brawndo');
  expect(demoCurrentPositions(db,[client],AT)[0].program_id).toBe('demo_brawndo:hipaa');
  captureDemoReporting(db,null,AT);
  const before=clone(db);
  expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(true);
  const observations=fixtures(db);
  expect(observations).toHaveLength(11);
  for(const point of observations){
    expect(point.program_id).toBe(PROGRAM);
    expect(point.framework_key).toBe('cis-ig1');
    expect(point.current.denominator).toBe(56);
    expect(point.current.included_counts.reduce((sum,row)=>sum+row.count,0)).toBe(56);
  }
  expect(report(db,'12m').snapshots.filter(point=>point.observation_kind==='demo_fixture')).toHaveLength(11);
  expect(db.framework_assessments).toEqual(before.framework_assessments);
  expect(db.requirements).toEqual(before.requirements);
  expect(db.logs).toEqual(before.logs);
  for(const point of before.portfolio_reporting.snapshots)expect(db.portfolio_reporting.snapshots).toContainEqual(point);
  const enriched=clone(db);
  expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(false);
  expect(db).toEqual(enriched);
});

test('existing edited session preserves every record and previous observation, and later native capture remains authoritative',()=>{
  const db=seedStore();delete db.portfolio_reporting;
  captureDemoReporting(db,null,'2026-10-17T12:00:00.000Z');
  const row=db.framework_assessments.find(row=>row.client_id==='demo_brawndo'&&row.status==='addressed');
  row.status='in_progress';row.notes='Retain my local edit';row.last_saved=AT;
  const previous=clone(db);captureDemoReporting(db,previous,AT);
  const preserved=clone(db),records=clone(db.framework_assessments);
  sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  const restored=readStore();
  expect(restored.framework_assessments).toEqual(records);
  expect(restored.logs).toEqual(preserved.logs);
  for(const snapshot of preserved.portfolio_reporting.snapshots)expect(restored.portfolio_reporting.snapshots).toContainEqual(snapshot);
  expect(fixtures(restored)).toHaveLength(11);
  expect(report(restored).current.implemented).toBe(report(preserved).current.implemented);
  const stored=sessionStorage.getItem(STORE_KEY);readStore();expect(sessionStorage.getItem(STORE_KEY)).toBe(stored);
  const prior=clone(restored);
  const changed=restored.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  changed.status='not_assessed';
  captureDemoReporting(restored,prior,'2026-10-18T18:01:00.000Z');
  expect(restored.portfolio_reporting.snapshots.at(-1).observation_kind).toBe('committed_event');
  expect(fixtures(restored)).toHaveLength(11);
});

test('native scope changes retain the fixture scope and report the real denominator transition',()=>{
  const db=seedStore();captureDemoReporting(db,null,AT);
  // saveStore first captures the current source, then installs the fixture atomically.
  enrichBrawndoReportingHistory(db);
  const prior=clone(db),row=db.framework_assessments.find(value=>value.client_id==='demo_brawndo');
  Object.assign(row,{status:'not_applicable',na_rationale:'Isolated scope-change fixture'});
  captureDemoReporting(db,prior,AT);
  const result=report(db);
  expect(result.current.denominator).toBe(55);
  expect(result.scope_changes).toHaveLength(1);
  expect(result.scope_changes[0].before.denominator).toBe(56);
  expect(result.scope_changes[0].after.denominator).toBe(55);
  expect(fixtures(db).every(point=>point.current.denominator===56)).toBe(true);
});

test('failed enrichment commit leaves old storage intact and retries safely',()=>{
  const db=seedStore();delete db.portfolio_reporting;saveStore(db);
  const persisted=restorePortfolioReporting(JSON.parse(sessionStorage.getItem(STORE_KEY)));
  persisted.portfolio_reporting.snapshots=persisted.portfolio_reporting.snapshots.filter(row=>row.observation_kind!=='demo_fixture');
  delete persisted.portfolio_reporting.fixture_versions;
  sessionStorage.setItem(STORE_KEY,JSON.stringify(persisted));const before=sessionStorage.getItem(STORE_KEY);
  const stub=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  try{expect(()=>readStore()).toThrow();expect(sessionStorage.getItem(STORE_KEY)).toBe(before);}finally{stub.mockRestore();}
  expect(fixtures(readStore())).toHaveLength(11);
  expect(fixtures(readStore())).toHaveLength(11);
});

test.each(['standard','lookalike','archived','invalid-scope','missing-provenance','imported-id'])('does not enrich %s or other program/client data',variant=>{
  const db=seedStore();delete db.portfolio_reporting;
  if(variant==='standard')db.user.workspace_mode='standard';
  if(variant==='lookalike')db.clients.find(row=>row.client_id==='demo_brawndo').client_id='demo_brawndo_copy';
  if(variant==='archived')db.clients.find(row=>row.client_id==='demo_brawndo').status='archived';
  if(variant==='invalid-scope')db.framework_assessments.find(row=>row.client_id==='demo_brawndo').status='not_applicable';
  if(variant==='missing-provenance')delete db.clients.find(row=>row.client_id==='demo_brawndo').initial_program_baseline;
  if(variant==='imported-id')db.framework_assessments.find(row=>row.client_id==='demo_brawndo').framework_assessment_id='arbitrary-imported-id';
  const before=clone(db);expect(enrichBrawndoReportingHistory(db)).toBe(false);expect(db).toEqual(before);
});
