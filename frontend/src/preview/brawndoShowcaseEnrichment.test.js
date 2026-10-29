import {seedStore,buildLegacyDemoStore,clone} from './store';
import {enrichBrawndoReportingHistory} from './brawndoReportingHistory';
import {BRAWNDO_HISTORY_VERSION} from './brawndoHistoryScenario';
import {CIS_SHOWCASE_VERSION} from '../lib/demoClients';
import {captureDemoReporting} from './portfolioReporting';
import {performance} from 'perf_hooks';
import {createHash} from 'crypto';

const AT='2026-10-28T12:00:00.000Z',ANCHOR='2026-10-28T00:00:00.000Z';
const CID='demo_brawndo',PROGRAM=CID+':cis-ig1';
beforeEach(()=>jest.useFakeTimers().setSystemTime(new Date(AT)));
afterEach(()=>jest.useRealTimers());

test('repeated legacy enrichment preserves the complete installed showcase graph',()=>{
  const db=seedStore(new Date(AT)),before=clone(db),input=JSON.stringify(db);
  const reporting=require('./portfolioReporting'),original=reporting.demoCurrentPositions;
  let calls=0,projectionMs=0;
  const projection=jest.spyOn(reporting,'demoCurrentPositions').mockImplementation((...args)=>{
    calls++;const started=performance.now();
    try{return original(...args);}finally{projectionMs+=performance.now()-started;}
  });
  const started=performance.now();
  try{
    for(let index=0;index<20;index++)expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(false);
    const elapsed=performance.now()-started;
    expect(db).toEqual(before);
    if(process.env.CIS_DEMO_TIMING_DIAGNOSTICS==='true')console.info('CIS_LEGACY_TIMING',JSON.stringify({
      phase:process.env.CIS_DEMO_PROFILE_PHASE,iterations:20,raw_chars:input.length,
      input_sha256:createHash('sha256').update(input).digest('hex'),
      legacy_projection_calls:calls,projection_ms:projectionMs,enrichment_elapsed_ms:elapsed
    }));
  }finally{projection.mockRestore();}
});

test('fresh source-qualified showcase does not invoke the superseded legacy projection or change any record',()=>{
  const db=seedStore(new Date(AT)),before=clone(db);
  expect(db.cis_demo_refresh.clients[CID]).toMatchObject({version:CIS_SHOWCASE_VERSION,state:'fresh_fixture'});
  expect(db.cis_demo_scenario_history[CID]).toMatchObject({version:CIS_SHOWCASE_VERSION,client_id:CID,program_id:PROGRAM});
  expect(db.portfolio_reporting.fixture_versions?.[BRAWNDO_HISTORY_VERSION]).toBeUndefined();
  const projection=jest.spyOn(require('./portfolioReporting'),'demoCurrentPositions')
    .mockImplementation(()=>{throw new Error('Superseded legacy projection was invoked');});
  try{
    expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(false);
    expect(projection).not.toHaveBeenCalled();
    expect(db).toEqual(before);
  }finally{projection.mockRestore();}
});

test.each(['retained','unknown-outer','unknown-member','unknown-context','missing-context','foreign-context','anchor-mismatch','future-anchor'])(
  '%s marker cannot suppress retained legacy enrichment',variant=>{
    const original=buildLegacyDemoStore(new Date(AT));
    // Install the accepted native baseline and its real legacy join first.
    // Bare construction is an earlier initialization stage, not a joined session.
    captureDemoReporting(original,null,AT);
    enrichBrawndoReportingHistory(original,new Date(AT));
    expect(original.portfolio_reporting.fixture_versions?.[BRAWNDO_HISTORY_VERSION]?.join_snapshot_id).toBeTruthy();
    delete original.portfolio_reporting.fixture_versions[BRAWNDO_HISTORY_VERSION].join_snapshot_id;
    const expected=clone(original),expectedResult=enrichBrawndoReportingHistory(expected,new Date(AT));
    const db=clone(original);
    db.cis_demo_refresh={version:CIS_SHOWCASE_VERSION,timezone:'UTC',anchor:ANCHOR,
      clients:{[CID]:{version:CIS_SHOWCASE_VERSION,state:'fresh_fixture'}}};
    db.cis_demo_scenario_history={...db.cis_demo_scenario_history,[CID]:{version:CIS_SHOWCASE_VERSION,
      client_id:CID,program_id:PROGRAM,implementation_group:1,anchor:ANCHOR}};
    if(variant==='retained')db.cis_demo_refresh.clients[CID].state='retained_without_rewrite';
    if(variant==='unknown-outer')db.cis_demo_refresh.version='unknown';
    if(variant==='unknown-member')db.cis_demo_refresh.clients[CID].version='unknown';
    if(variant==='unknown-context')db.cis_demo_scenario_history[CID].version='unknown';
    if(variant==='missing-context')delete db.cis_demo_scenario_history[CID];
    if(variant==='foreign-context')db.cis_demo_scenario_history[CID].client_id='other-client';
    if(variant==='anchor-mismatch')db.cis_demo_scenario_history[CID].anchor='2026-10-27T00:00:00.000Z';
    if(variant==='future-anchor')db.cis_demo_refresh.anchor=db.cis_demo_scenario_history[CID].anchor='2026-10-29T00:00:00.000Z';
    const marker=clone(db.cis_demo_refresh),context=clone(db.cis_demo_scenario_history);
    const projection=jest.spyOn(require('./portfolioReporting'),'demoCurrentPositions');
    try{
      expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(expectedResult);
      expect(projection).toHaveBeenCalled();
      expect(db.framework_assessments).toEqual(expected.framework_assessments);
      expect(db.portfolio_reporting).toEqual(expected.portfolio_reporting);
      expect(db.cis_demo_refresh).toEqual(marker);
      expect(db.cis_demo_scenario_history).toEqual(context);
    }finally{projection.mockRestore();}
  });

test('standard mode remains excluded without projecting or modifying its data',()=>{
  const db=seedStore(new Date(AT));db.user.workspace_mode='standard';
  const before=clone(db),projection=jest.spyOn(require('./portfolioReporting'),'demoCurrentPositions');
  try{
    expect(enrichBrawndoReportingHistory(db,new Date(AT))).toBe(false);
    expect(projection).not.toHaveBeenCalled();
    expect(db).toEqual(before);
  }finally{projection.mockRestore();}
});
