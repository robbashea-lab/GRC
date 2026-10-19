import {enrichBrawndoReportingHistory,getBrawndoScenarioContext,getBrawndoScenarioDateMetadata,createBrawndoScenarioDateSelector} from './brawndoReportingHistory';
import {buildBrawndoScenario,BRAWNDO_HISTORY_VERSION,canonicalScenarioStates} from './brawndoHistoryScenario';
import {forecastImplementation,canConnectHistoryPositions,historyWindow,isDemoScenarioPosition} from '../lib/portfolioProgress';
import {seedStore,readStore,saveStore,STORE_KEY,clone} from './store';
import {captureDemoReporting,compactPortfolioReporting,demoCurrentPositions,portfolioReportingRequest,restorePortfolioReporting} from './portfolioReporting';
import {activeDefinitions} from '../lib/frameworks';
import axios from 'axios';
import {previewAdapter} from './adapter';
import {adjustProgram} from './onboardingHandoff';

const AT='2026-10-18T18:00:00.000Z',PROGRAM='demo_brawndo:cis-ig1';
const report=(db,range='3m')=>portfolioReportingRequest(db,'/portfolio/reporting/history',{client_id:'demo_brawndo',program_key:'cis-ig1',range});
const fixtures=db=>db.portfolio_reporting.snapshots.filter(row=>row.observation_kind==='demo_fixture');
beforeEach(()=>{jest.useFakeTimers().setSystemTime(new Date(AT));sessionStorage.clear();});
afterEach(()=>jest.useRealTimers());

test('an installed joined scenario needs no native projection during migration checks',async()=>{
  await axios.create({adapter:previewAdapter}).post('/demo/enter');
  const db=readStore(),before=clone(db);
  expect(db.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].join_snapshot_id).toBeTruthy();
  const projection=jest.spyOn(require('./portfolioReporting'),'demoCurrentPositions');
  try{
    expect(enrichBrawndoReportingHistory(db)).toBe(false);
    expect(projection).not.toHaveBeenCalled();
    expect(db).toEqual(before);
  }finally{projection.mockRestore();}
});

test('carried scenario boundary retains its original identity and provenance after the clock advances',async()=>{
  await axios.create({adapter:previewAdapter}).post('/demo/enter');
  const db=readStore(),before=clone(db);
  jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
  for(const range of ['1m','3m','6m','12m']){
    const result=portfolioReportingRequest(db,'/portfolio/reporting/history',{
      client_id:'demo_brawndo',program_key:'cis-ig1',range,demo_scenario:BRAWNDO_HISTORY_VERSION
    });
    const points=historyWindow(result.snapshots,result.period_start,result.as_of,result.comparison);
    const boundary=points[0],original=fixtures(db).find(row=>row.snapshot_id===boundary.snapshot_id);
    expect(boundary.carried).toBe(true);
    expect(boundary.observation_kind).toBe('demo_fixture');
    expect(original).toBeDefined();
    expect(boundary.display_at).toBe(result.period_start);
    expect(boundary.effective_at).toBe(original.effective_at);
    expect(boundary.captured_at).toBe(original.captured_at);
    expect(boundary.provenance.kind).toBe('demo_fixture');
    expect(isDemoScenarioPosition(boundary,result.scenario_context)).toBe(true);
    expect(canConnectHistoryPositions(boundary,points[1],{demoScenario:result.scenario_context})).toBe(true);
    expect(canConnectHistoryPositions({...boundary,snapshot_id:'foreign-position'},points[1],{demoScenario:result.scenario_context})).toBe(false);
  }
  expect(db).toEqual(before);
});

test('fresh native seed has dated fixture observations with exact scope and four reconciled counts in every range',async()=>{
  await axios.create({adapter:previewAdapter}).post('/demo/enter');
  const db=readStore(),before=clone(db);
  expect(fixtures(db)).toHaveLength(buildBrawndoScenario(db.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].anchor).positions.length);
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
      if(point.observation_kind==='demo_fixture')expect(point.provenance).toMatchObject({kind:'demo_fixture',label:'Illustrative initial demo scenario'});
      else expect(point.provenance.kind).toBe(point.observation_kind);
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
  expect(saved.last_saved).toBe('2026-10-18T18:01:00.000Z');
  const reopened=readStore();
  expect(reopened.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id)).toMatchObject({status:'addressed',last_saved:saved.last_saved});
  expect(fixtures(reopened)).toEqual(original);
  const history=(await api.get('/portfolio/reporting/history',{params:{client_id:'demo_brawndo',program_key:'cis-ig1',range:'12m'}})).data;
  expect(history.current.implemented).toBe(33);
  expect(history.current.denominator).toBe(56);
  const visibleFixtures=original.filter(point=>Date.parse(point.effective_at)>=Date.parse(history.period_start));
  expect(history.snapshots).toHaveLength(visibleFixtures.length+2);
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
  expect(observations).toHaveLength(buildBrawndoScenario(db.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].anchor).positions.length);
  for(const point of observations){
    expect(point.program_id).toBe(PROGRAM);
    expect(point.framework_key).toBe('cis-ig1');
    expect(point.current.denominator).toBe(56);
    expect(point.current.included_counts.reduce((sum,row)=>sum+row.count,0)).toBe(56);
  }
  expect(report(db,'12m').snapshots.filter(point=>point.observation_kind==='demo_fixture').length).toBeLessThanOrEqual(observations.length);
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
  const fixtureCount=fixtures(restored).length;expect(fixtureCount).toBeGreaterThan(11);
  expect(report(restored).current.implemented).toBe(report(preserved).current.implemented);
  const stored=sessionStorage.getItem(STORE_KEY);readStore();expect(sessionStorage.getItem(STORE_KEY)).toBe(stored);
  const prior=clone(restored);
  const changed=restored.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  changed.status='not_assessed';
  captureDemoReporting(restored,prior,'2026-10-18T18:01:00.000Z');
  expect(restored.portfolio_reporting.snapshots.at(-1).observation_kind).toBe('committed_event');
  expect(fixtures(restored)).toHaveLength(fixtureCount);
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
  const count=fixtures(readStore()).length;expect(count).toBeGreaterThan(11);
  expect(fixtures(readStore())).toHaveLength(count);
});

test('scenario resolves exact native terminal states, four deltas and explicitly scoped positive forecast',()=>{
  const db=seedStore();saveStore(db);const saved=readStore(),before=clone(saved);
  const context=getBrawndoScenarioContext(saved);expect(context).not.toBeNull();
  const marker=saved.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION];
  expect(marker.terminal).toEqual(canonicalScenarioStates());
  for(const record of saved.framework_assessments.filter(row=>row.client_id==='demo_brawndo'&&row.framework_key==='cis-ig1')){
    const metadata=getBrawndoScenarioDateMetadata(saved,record);
    if(record.status==='not_assessed')expect(metadata).toBeNull();
    else expect(metadata).toMatchObject({assessment_id:record.framework_assessment_id,status:record.status,provenance:'demo_fixture'});
  }
  for(const range of ['1m','3m','6m','12m']){
    const result=portfolioReportingRequest(saved,'/portfolio/reporting/history',{client_id:'demo_brawndo',program_key:'cis-ig1',range,demo_scenario:BRAWNDO_HISTORY_VERSION,as_of:marker.anchor});
    expect(result.scenario_context.version).toBe(BRAWNDO_HISTORY_VERSION);
    expect(result.comparison.comparable).toBe(true);
    expect(result.comparison.change_pp).toBeCloseTo(({ '1m':4,'3m':8,'6m':18,'12m':28 }[range])/56*100,10);
    expect(forecastImplementation(result.forecast_snapshots,result.current,result.as_of,{demoScenario:result.scenario_context}).ok).toBe(true);
    expect(forecastImplementation(result.forecast_snapshots,result.current,result.as_of).ok).toBe(false);
  }
  expect(saved).toEqual(before);
});

test('scenario metadata round trips, unknown fixture mutation is rejected, and narrative saves do not invent new dates',async()=>{
  const api=axios.create({adapter:previewAdapter});await api.post('/demo/enter');
  const db=readStore(),row=db.framework_assessments.find(row=>row.client_id==='demo_brawndo'&&row.definition_id==='2.1');
  const date=getBrawndoScenarioDateMetadata(db,row);expect(date.kind).toBe('implementation_transition');
  jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
  await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Owned synthetic QA narrative',expected_last_assessed:row.last_saved??row.last_assessed??null});
  const reopened=readStore(),updated=reopened.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  expect(getBrawndoScenarioDateMetadata(reopened,updated)).toEqual(date);
  const modified=clone(reopened);fixtures(modified)[0].current.implemented++;
  expect(getBrawndoScenarioContext(modified)).toBeNull();
});

test('accepted regression and reimplementation create a new completion episode without resetting native data',async()=>{
  const api=axios.create({adapter:previewAdapter});await api.post('/demo/enter');
  const before=readStore(),row=before.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.definition_id==='2.1');
  const original=getBrawndoScenarioDateMetadata(before,row);
  jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
  const {data:regressed}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'in_progress',expected_last_assessed:row.last_saved??row.last_assessed??null});
  expect(getBrawndoScenarioDateMetadata(readStore(),regressed)).toBeNull();
  jest.setSystemTime(new Date('2026-10-18T18:02:00.000Z'));
  const {data:completed}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{status:'addressed',expected_last_assessed:regressed.last_saved});
  const metadata=getBrawndoScenarioDateMetadata(readStore(),completed);
  expect(metadata).toMatchObject({kind:'implementation_transition',before_status:'in_progress',provenance:'accepted_native',effective_date:'2026-10-18'});
  expect(metadata.event_id).not.toBe(original.event_id);
});

function legacySession(){
  const db=seedStore();delete db.portfolio_reporting;captureDemoReporting(db,null,AT);
  const client=db.clients.find(row=>row.client_id==='demo_brawndo'),definitions=activeDefinitions('cis-ig1',{implementation_group:1});
  const rows=db.framework_assessments.filter(row=>row.client_id==='demo_brawndo'&&row.framework_key==='cis-ig1');
  const targets=[[360,8,12,10],[300,12,14,10],[240,16,16,8],[180,20,16,8],[120,24,16,6],[75,26,16,6],[45,28,16,6],[21,29,16,6],[14,30,15,6],[7,30,16,6],[2,31,15,6]];
  const snapshots=targets.map(([days,addressed,partial,gaps],index)=>{
    const at=new Date(Date.parse(AT)-days*86400000).toISOString();
    const simulated=definitions.map((definition,i)=>({...rows.find(row=>row.definition_id===definition.id),
      status:i<addressed?'addressed':i<addressed+partial?'in_progress':i<addressed+partial+gaps?'needs_attention':'not_assessed',created_at:at,last_saved:at,last_assessed:at}));
    const position=demoCurrentPositions({...db,portfolio_reporting:undefined,framework_assessments:simulated},[client],at).find(row=>row.program_id===PROGRAM);
    const snapshot_id=`demo-fixture:brawndo-cis-ig1-history-v1:${AT}:${index}`;
    return {...position,snapshot_id,captured_at:at,effective_at:at,observation_sequence:index+1,observation_kind:'demo_fixture',source_revision:snapshot_id,source_event:null,
      current:{...position.current,source_revision:snapshot_id,observation_kind:'demo_fixture',provenance:{...position.current.provenance,kind:'demo_fixture',label:'Sample Demo program position',fixture_version:'brawndo-cis-ig1-history-v1',fixture_anchor:AT}}};
  });
  db.portfolio_reporting.snapshots=[...snapshots,...db.portfolio_reporting.snapshots];
  db.portfolio_reporting.fixture_versions={'brawndo-cis-ig1-history-v1':{anchor:AT,count:11}};
  return db;
}

test.each(['raw','compacted-restored'])('owned %s v1 upgrade reuses its exact anchor and preserves edited records/native observations',shape=>{
  const original=legacySession(),db=shape==='raw'?original:restorePortfolioReporting(JSON.parse(JSON.stringify(compactPortfolioReporting(original))));
  const row=db.framework_assessments.find(row=>row.client_id==='demo_brawndo'&&row.definition_id==='1.1');
  const before=clone(db);row.notes='Owned preserved manual wording';
  expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(true);
  expect(db.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].anchor).toBe(AT);
  expect(db.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id).notes).toBe('Owned preserved manual wording');
  for(const snapshot of before.portfolio_reporting.snapshots.filter(value=>value.observation_kind!=='demo_fixture'))expect(db.portfolio_reporting.snapshots).toContainEqual(snapshot);
  expect(db.logs).toEqual(before.logs);
  expect(db.drafts).toEqual(before.drafts);
  const packed=restorePortfolioReporting(JSON.parse(JSON.stringify(compactPortfolioReporting(db))));
  expect(getBrawndoScenarioContext(packed)).not.toBeNull();
  const unchanged=clone(packed);expect(enrichBrawndoReportingHistory(packed)).toBe(false);expect(packed).toEqual(unchanged);
});

test('unknown or modified v1 payloads and unsafe edited joins remain byte-for-byte intact',()=>{
  const modified=legacySession();fixtures(modified)[0].current.provenance.label='Retain unknown user modification';
  const before=clone(modified);expect(enrichBrawndoReportingHistory(modified)).toBe(false);expect(modified).toEqual(before);
  const unsafe=legacySession();unsafe.portfolio_reporting.snapshots=fixtures(unsafe);
  const row=unsafe.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.definition_id==='2.1');row.status='in_progress';row.last_saved=AT;
  const saved=clone(unsafe);expect(enrichBrawndoReportingHistory(unsafe)).toBe(false);expect(unsafe).toEqual(saved);
});

test('scenario policy is opt-in and cannot be selected for another program or damaged provenance',()=>{
  const db=seedStore();saveStore(db);const saved=readStore();
  const request=changes=>portfolioReportingRequest(saved,'/portfolio/reporting/history',{client_id:'demo_brawndo',program_key:'cis-ig1',...changes});
  expect(request({}).scenario_context).toBeUndefined();
  expect(request({demo_scenario:'arbitrary'}).scenario_context).toBeUndefined();
  expect(request({demo_scenario:BRAWNDO_HISTORY_VERSION}).scenario_context.version).toBe(BRAWNDO_HISTORY_VERSION);
  delete saved.clients.find(row=>row.client_id==='demo_brawndo').initial_program_baseline;
  expect(request({demo_scenario:BRAWNDO_HISTORY_VERSION}).scenario_context).toBeUndefined();
});

test.each(['unknown-kind','nested-provenance','source-event','foreign-scope','invalid-effective','invalid-captured','reversed-time','future-capture','calendar-rollover'])(
  'native join proof rejects %s instead of trusting an observation label',variant=>{
    const db=seedStore();saveStore(db);const saved=readStore();
    expect(getBrawndoScenarioContext(saved)).not.toBeNull();
    const marker=saved.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION];
    const join=saved.portfolio_reporting.snapshots.find(row=>row.snapshot_id===marker.join_snapshot_id);
    if(variant==='unknown-kind')join.observation_kind='unknown_import';
    if(variant==='nested-provenance')join.current.provenance.kind='demo_fixture';
    if(variant==='source-event')join.current.provenance.source_event='foreign-event';
    if(variant==='foreign-scope')join.current.scope.definition_ids[0]='foreign-safeguard';
    if(variant==='invalid-effective')join.effective_at='invalid';
    if(variant==='invalid-captured')join.captured_at='2026-10-18';
    if(variant==='reversed-time')join.effective_at='2026-10-18T18:00:01.000Z';
    if(variant==='future-capture')join.captured_at='2026-10-18T18:01:00.000Z';
    if(variant==='calendar-rollover')join.effective_at='2026-02-30T00:00:00Z';
    expect(getBrawndoScenarioContext(saved)).toBeNull();
    const row=saved.framework_assessments.find(record=>record.client_id==='demo_brawndo'&&record.definition_id==='2.1');
    expect(getBrawndoScenarioDateMetadata(saved,row)).toBeNull();
  });

test.each(['2026-02-30T00:00:00Z','2026-10-18T18:01:00Z'])(
  'legacy anchor %s is rejected without rewriting existing data',anchor=>{
    const db=legacySession();db.portfolio_reporting.fixture_versions['brawndo-cis-ig1-history-v1'].anchor=anchor;
    const before=clone(db);expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(false);expect(db).toEqual(before);
  });

test('date metadata respects the supplied historical context clock rather than a later wallclock',async()=>{
  await axios.create({adapter:previewAdapter}).post('/demo/enter');
  const db=readStore(),context=getBrawndoScenarioContext(db,new Date(AT));
  const row=db.framework_assessments.find(record=>record.client_id==='demo_brawndo'&&record.definition_id==='2.1');
  expect(getBrawndoScenarioDateMetadata(db,row,context)).not.toBeNull();
  expect(getBrawndoScenarioDateMetadata(db,row,context,new Date('2026-10-18T17:59:00Z'))).toBeNull();
});

test('duplicate owned fixture IDs are retained but cannot enter scenario calculations or date metadata',async()=>{
  await axios.create({adapter:previewAdapter}).post('/demo/enter');
  const db=readStore(),duplicate=clone(fixtures(db)[0]);duplicate.current.implemented++;
  db.portfolio_reporting.snapshots.push(duplicate);const before=clone(db);
  expect(getBrawndoScenarioContext(db)).toBeNull();
  expect(getBrawndoScenarioDateMetadata(db,db.framework_assessments.find(row=>row.client_id==='demo_brawndo'&&row.definition_id==='2.1'))).toBeNull();
  expect(enrichBrawndoReportingHistory(db)).toBe(false);expect(db).toEqual(before);
});

test('legacy upgrade does not skip an earlier nonterminal native position to join a later canonical reversion',()=>{
  const db=legacySession(),first=db.portfolio_reporting.snapshots.find(row=>row.observation_kind==='current_baseline');
  const reverted=clone(first),reference=first.current.provenance.source_references.find(row=>row.status==='addressed');
  reference.status='in_progress';first.current.implemented--;
  const adjusted=first.current.included_counts.map(row=>({...row,count:row.count+(row.key==='addressed'?-1:row.key==='in_progress'?1:0)}));
  first.current.counts=clone(adjusted);first.current.included_counts=clone(adjusted);
  first.current.percentage=31/56*100;
  reverted.snapshot_id='native-later-canonical';reverted.source_event=reverted.current.source_event=reverted.current.provenance.source_event=reverted.snapshot_id;
  reverted.effective_at=reverted.captured_at='2026-10-18T18:01:00.000Z';
  db.portfolio_reporting.snapshots.push(reverted);jest.setSystemTime(new Date('2026-10-18T18:02:00.000Z'));
  const before=clone(db);expect(enrichBrawndoReportingHistory(db)).toBe(false);expect(db).toEqual(before);
});

test('a joinless initial scenario adopts a subsequently captured genuine baseline once, retaining the anchor',()=>{
  const db=seedStore();
  // Owned isolated unit data only: remove seed save metadata to exercise the
  // otherwise-unavailable joinless branch. Never clear a hosted/user record.
  db.framework_assessments.filter(row=>row.client_id==='demo_brawndo'&&row.framework_key==='cis-ig1').forEach(row=>delete row.last_saved);
  enrichBrawndoReportingHistory(db,new Date(AT));
  const original=clone(db),anchor=db.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].anchor;
  // Equivalent to an initialization capture, retained separately until the
  // single accepted storage commit installs its metadata and baseline together.
  const capture={...clone(db),portfolio_reporting:undefined};captureDemoReporting(capture,null,AT);
  const baseline=capture.portfolio_reporting.snapshots.find(row=>row.program_id===PROGRAM);
  db.portfolio_reporting={...capture.portfolio_reporting,snapshots:[...db.portfolio_reporting.snapshots,...capture.portfolio_reporting.snapshots],
    fixture_versions:db.portfolio_reporting.fixture_versions};
  expect(enrichBrawndoReportingHistory(db)).toBe(true);
  const marker=db.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION];
  expect(marker.anchor).toBe(anchor);expect(marker.join_snapshot_id).toBe(baseline.snapshot_id);
  expect(getBrawndoScenarioContext(db)).not.toBeNull();
  const legacyWithoutRegistry=clone(db);delete legacyWithoutRegistry.portfolio_reporting.identities;
  expect(getBrawndoScenarioContext(legacyWithoutRegistry)).not.toBeNull();
  expect(db.framework_assessments).toEqual(original.framework_assessments);
  expect(enrichBrawndoReportingHistory(db)).toBe(false);
  sessionStorage.setItem(STORE_KEY,JSON.stringify(compactPortfolioReporting(db)));
  const prior=readStore(),changed=clone(prior),row=changed.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.definition_id==='2.1');
  row.status='in_progress';row.last_saved='2026-10-18T18:01:00.000Z';
  jest.setSystemTime(new Date(row.last_saved));saveStore(changed);
  const reopened=readStore();expect(getBrawndoScenarioContext(reopened)).not.toBeNull();
  expect(reopened.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].anchor).toBe(anchor);
});

test.each(['narrative','verification','ownership'])(
  'accepted %s source refresh preserves explicit endpoint continuity without creating posture votes',async kind=>{
    const api=axios.create({adapter:previewAdapter});await api.post('/demo/enter');
    const before=readStore(),row=before.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.definition_id==='2.1');
    const snapshots=clone(before.portfolio_reporting.snapshots),date=getBrawndoScenarioDateMetadata(before,row);
    const body=kind==='narrative'?{implementation:'Synthetic QA accepted unchanged status'}:kind==='verification'?{verification:'not_verified'}:{owner_id:null};
    jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
    await api.patch('/framework_assessments/'+row.framework_assessment_id,{...body,expected_last_assessed:row.last_saved??row.last_assessed??null});
    const after=readStore(),context=getBrawndoScenarioContext(after);
    expect(context).not.toBeNull();expect(context.held_snapshot_id).toBeTruthy();
    expect(context.current_source_revision).not.toBe(context.held_source_revision);
    expect(after.portfolio_reporting.snapshots).toEqual(snapshots);
    expect(after.portfolio_reporting.source_refresh_proofs).toHaveLength(1);
    const current=demoCurrentPositions(after,after.clients.filter(value=>value.client_id==='demo_brawndo'),new Date().toISOString())[0].current;
    const latest=after.portfolio_reporting.snapshots.find(value=>value.snapshot_id===context.held_snapshot_id);
    expect(canConnectHistoryPositions(latest,current,{demoScenario:context})).toBe(true);
    expect(canConnectHistoryPositions(latest,current)).toBe(false);
    const updated=after.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
    expect(getBrawndoScenarioDateMetadata(after,updated,context)).toEqual(date);
  });

test('unlogged source version changes and failed persistence cannot manufacture accepted refresh proofs',async()=>{
  const api=axios.create({adapter:previewAdapter});await api.post('/demo/enter');
  const original=readStore(),tampered=clone(original),row=tampered.framework_assessments.find(value=>value.client_id==='demo_brawndo'&&value.definition_id==='2.1');
  jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));row.last_saved=new Date().toISOString();
  saveStore(tampered);
  expect(readStore().portfolio_reporting.source_refresh_proofs||[]).toHaveLength(0);
  expect(getBrawndoScenarioContext(readStore())).toBeNull();
  sessionStorage.setItem(STORE_KEY,JSON.stringify(compactPortfolioReporting(original)));
  const before=sessionStorage.getItem(STORE_KEY),saved=original.framework_assessments.find(value=>value.framework_assessment_id===row.framework_assessment_id);
  const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  try{await expect(api.patch('/framework_assessments/'+saved.framework_assessment_id,{implementation:'Synthetic QA failed write',expected_last_assessed:saved.last_saved??saved.last_assessed??null})).rejects.toBeTruthy();}
  finally{write.mockRestore();}
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(readStore().portfolio_reporting.source_refresh_proofs||[]).toHaveLength(0);
});

test('validated scenario adds a bounded current-state endpoint to both history views without persistence or forecast votes',async()=>{
  const api=axios.create({adapter:previewAdapter});await api.post('/demo/enter');
  const db=readStore(),before=clone(db),stored=sessionStorage.getItem(STORE_KEY);
  const request=scoped=>portfolioReportingRequest(db,'/portfolio/reporting/history',{client_id:'demo_brawndo',program_key:'cis-ig1',range:'6m',
    ...(scoped?{demo_scenario:BRAWNDO_HISTORY_VERSION}:{})});
  const initial=request(true);jest.setSystemTime(new Date('2026-10-18T18:01:00.000Z'));
  const history=request(true),endpoint=history.snapshots.at(-1),previous=history.snapshots.at(-2);
  expect(endpoint).toMatchObject({observation_kind:'current_state',program_id:PROGRAM,effective_at:history.as_of,
    captured_at:history.as_of,implemented:history.current.implemented,denominator:history.current.denominator,
    included_counts:history.current.included_counts,provenance:{kind:'current_state'}});
  expect(canConnectHistoryPositions(previous,endpoint,{demoScenario:history.scenario_context})).toBe(true);
  expect(history.snapshots.every(point=>Date.parse(point.effective_at)<=Date.parse(history.as_of))).toBe(true);
  expect(endpoint.included_counts.reduce((sum,row)=>sum+row.count,0)).toBe(endpoint.denominator);
  const currentCutoff=Date.parse(history.as_of)-90*86400000;
  expect(history.forecast_snapshots).toEqual(initial.forecast_snapshots.filter(point=>Date.parse(point.effective_at)>=currentCutoff));
  expect(history.forecast_snapshots.some(point=>point.observation_kind==='current_state')).toBe(false);
  expect(request(false).snapshots.some(point=>point.observation_kind==='current_state')).toBe(false);
  expect(db).toEqual(before);expect(sessionStorage.getItem(STORE_KEY)).toBe(stored);
});

test('request-local date selector agrees with single-record projection, returns copies and refreshes after accepted mutation',async()=>{
  const api=axios.create({adapter:previewAdapter});await api.post('/demo/enter');
  const db=readStore(),before=clone(db),bytes=sessionStorage.getItem(STORE_KEY),context=getBrawndoScenarioContext(db);
  const select=createBrawndoScenarioDateSelector(db,context);
  const rows=db.framework_assessments.filter(row=>row.client_id==='demo_brawndo'&&row.framework_key==='cis-ig1');
  for(const id of ['1.1','1.2','2.1','3.5']){
    const row=rows.find(value=>value.definition_id===id);
    expect(select(row)).toEqual(getBrawndoScenarioDateMetadata(db,row,context));
  }
  const implemented=rows.find(row=>row.definition_id==='2.1'),metadata=select(implemented),copy=select(implemented);
  expect(metadata).not.toBe(copy);metadata.effective_date='2000-01-01';
  expect(select(implemented)).toEqual(copy);
  expect(db).toEqual(before);expect(sessionStorage.getItem(STORE_KEY)).toBe(bytes);
  const target=rows.find(row=>row.definition_id==='1.1');jest.setSystemTime(new Date('2026-10-18T18:02:00.000Z'));
  const {data:saved}=await api.patch('/framework_assessments/'+target.framework_assessment_id,{status:'addressed',expected_last_assessed:target.last_saved??target.last_assessed??null});
  expect(select(saved)).toBeNull();
  const reopened=readStore(),next=createBrawndoScenarioDateSelector(reopened);
  expect(next(saved)).toMatchObject({kind:'implementation_transition',provenance:'accepted_native',before_status:'needs_attention',effective_date:'2026-10-18'});
  expect(next(saved)).toEqual(saved.demo_date_metadata);
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
