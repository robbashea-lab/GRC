import {activeDefinitions,frameworkCatalog} from '../lib/frameworks';
import {cisSummary} from '../lib/cisVerification';
import {isoProgramMetrics} from '../lib/isoProgramMetrics';
import {captureDemoReporting,compactPortfolioReporting,restorePortfolioReporting,demoCurrentPositions,demoRangeStart,portfolioReportingRequest} from './portfolioReporting';
import {frameworkRequest} from './frameworks';
import {saveStore,STORE_KEY} from './store';
import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {isoGuidedCatalog,isoQuestions,isoGuidedResult} from '../lib/isoGuidedAssessment';
import {FRAMEWORKS} from '../lib/frameworks';
import baseline from '@catalogs/onboardingCatalog.json';

const AS_OF='2026-10-13T18:00:00.000Z';
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(keys=['cis-ig1'],configuration={}){
  const client={client_id:'isolated',name:'Isolated local reporting fixture',status:'active',framework_settings:configuration};
  return {user:{user_id:'owner',role:'super_admin',name:'Demo Owner'},users:[],clients:[client],baselines:{isolated:{completed:true}},requirements:keys.map(key=>({requirement_id:key,client_id:client.client_id,baseline_key:key,baseline_response:'applies',status:'active'})),
    framework_assessments:keys.flatMap(key=>activeDefinitions(key,key==='cis-ig1'?configuration[key]||{implementation_group:1}:configuration[key]).map(d=>({...d,definition_id:d.id,framework_assessment_id:key+':'+d.id,client_id:client.client_id,framework_key:key,framework_version:frameworkCatalog(key).version,status:'not_assessed',created_at:'2026-07-01T00:00:00.000Z'}))),findings:[],risks:[],policies:[],evidence:[],logs:[],tasks:[],reviews:[],vendors:[]};
}
const request=(db,kind,params={})=>portfolioReportingRequest(db,'/portfolio/reporting/'+kind,{client_ids:'isolated',...params});
beforeEach(()=>jest.useFakeTimers().setSystemTime(new Date(AS_OF)));
afterEach(()=>jest.useRealTimers());

test.each([false,true])('scope-only and mixed growth disclose exact common-member status changes (mixed=%s)',mixed=>{
  const db=fixture(),rows=db.framework_assessments;
  rows.slice(0,23).forEach(row=>row.status='addressed');
  rows.slice(-2).forEach(row=>Object.assign(row,{status:'not_applicable',na_rationale:'Isolated test exclusion'}));
  captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');const previous=copy(db);
  rows.slice(-2).forEach(row=>row.status='not_assessed');
  if(mixed)rows[0].status='in_progress';
  captureDemoReporting(db,previous,AS_OF);const before=copy(db);
  const result=request(db,'history',{client_id:'isolated',program_key:'cis-ig1',range:'3m'}),change=result.scope_changes.at(-1);
  expect(change.before.denominator).toBe(54);expect(change.after.denominator).toBe(56);
  expect(change.added_ids).toEqual(rows.slice(-2).map(row=>row.definition_id).sort());
  expect(change.status_changes_known).toBe(true);
  expect(change.status_changes).toEqual(mixed?[{definition_id:rows[0].definition_id,before_status:'addressed',after_status:'in_progress'}]:[]);
  expect(change.before.implemented).toBe(23);expect(change.after.implemented).toBe(mixed?22:23);
  expect(change.after.included_counts.reduce((sum,row)=>sum+row.count,0)).toBe(56);
  expect(db).toEqual(before);
});

test('scope differences with missing source vectors remain explicitly unknown',()=>{
  const db=fixture();captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');const previous=copy(db);
  Object.assign(db.framework_assessments[0],{status:'not_applicable',na_rationale:'Isolated test'});
  captureDemoReporting(db,previous,AS_OF);
  for(const snapshot of db.portfolio_reporting.snapshots)delete snapshot.current.provenance.source_references;
  for(const change of db.portfolio_reporting.scope_events){delete change.before.provenance.source_references;delete change.after.provenance.source_references;}
  const result=request(db,'history',{client_id:'isolated',program_key:'cis-ig1'});
  expect(result.scope_changes.every(change=>change.status_changes_known===false)).toBe(true);
});

test('same-timestamp scope substitutions keep each transition membership separate',()=>{
  const db=fixture(), [first,second]=db.framework_assessments;
  captureDemoReporting(db,null,AS_OF);
  let previous=copy(db);
  Object.assign(first,{status:'not_applicable',na_rationale:'Isolated exclusion'});
  captureDemoReporting(db,previous,AS_OF);
  previous=copy(db);
  first.status='not_assessed';
  Object.assign(second,{status:'not_applicable',na_rationale:'Isolated replacement'});
  captureDemoReporting(db,previous,AS_OF);
  const changes=request(db,'history',{client_id:'isolated',program_key:'cis-ig1'}).scope_changes;
  expect(changes[0].removed_ids).toEqual([first.definition_id]);
  expect(changes[1].added_ids).toEqual([first.definition_id]);
  expect(changes[1].removed_ids).toEqual([second.definition_id]);
});

test('program metadata uses every native supported catalog and the actual CIS group',()=>{
  for(const [key,unit] of [['cis-ig1','safeguards'],['nist-csf-2','subcategories'],['soc-2','criteria'],['iso-27001','requirements and controls']]){
    const position=demoCurrentPositions(fixture([key]),fixture([key]).clients,AS_OF)[0];
    expect(position.unit_label).toBe(unit);expect(position.framework_version).toBe(frameworkCatalog(key).version);
    expect(position.program_title).toContain(position.framework_version);expect(position.program_id).toBe('isolated:'+key);
  }
  const ig3=fixture(['cis-ig1'],{'cis-ig1':{implementation_group:3}});
  expect(demoCurrentPositions(ig3,ig3.clients,AS_OF)[0].program_title).toContain('Implementation Group 3');
});

test('legacy exact scope identities normalize on GET and the next atomic commit without synthetic observations',()=>{
  const db=fixture();captureDemoReporting(db,null,AS_OF);
  delete db.portfolio_reporting.identities;
  for(const snapshot of db.portfolio_reporting.snapshots){delete snapshot.current.scope.enrollment_ids;snapshot.current.scope_signature=JSON.stringify(snapshot.current.scope);snapshot.current.status_signature='legacy full signature';snapshot.source_revision=snapshot.current.source_revision='legacy source signature';}
  const before=copy(db),initial=request(db,'history',{client_id:'isolated',program_key:'cis-ig1'});
  expect(initial.scope_changes).toEqual([]);expect(initial.snapshots[0].scope_signature).toBe(initial.current.scope_signature);
  expect(db).toEqual(before);
  captureDemoReporting(db,before,AS_OF);
  expect(db.portfolio_reporting.snapshots).toHaveLength(1);expect(db.logs).toEqual(before.logs);
  expect(request(copy(db),'history',{client_id:'isolated',program_key:'cis-ig1'}).scope_changes).toEqual([]);
  expect(demoCurrentPositions(db,db.clients,AS_OF)[0].current.scope_signature).toBe(initial.current.scope_signature);
  const previous=copy(db),row=db.framework_assessments[0],oldRevision=demoCurrentPositions(db,db.clients,AS_OF)[0].current.source_revision;
  row.implementation='Reviewed wording only';row.last_saved=AS_OF;
  captureDemoReporting(db,previous,AS_OF);
  expect(db.portfolio_reporting.snapshots).toHaveLength(1);
  const current=demoCurrentPositions(db,db.clients,AS_OF)[0].current;
  expect(current.source_revision).not.toBe(oldRevision);expect(current.status_signature).toBe(initial.current.status_signature);
  expect(request(db,'overview').programs[0].current.source_revision).toBe(current.source_revision);
  expect(frameworkRequest(db,'/frameworks/cis-ig1','get',{client_id:'isolated'},null).implementation_position.source_revision).toBe(current.source_revision);
});

test('same-denominator Annex membership changes keep distinct exact scope identities and reset scope coverage',()=>{
  const db=fixture(['iso-27001']),annex=db.framework_assessments.filter(row=>row.specification==='annex_control');
  Object.assign(annex[0],{soa_applicability:'included',soa_justification:'Actual local inclusion'});
  captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');const previous=copy(db);
  Object.assign(annex[0],{soa_applicability:'excluded',soa_justification:'Actual local exclusion'});
  Object.assign(annex[1],{soa_applicability:'included',soa_justification:'Actual local inclusion'});
  captureDemoReporting(db,previous,AS_OF);
  const result=request(db,'history',{client_id:'isolated',program_key:'iso-27001',range:'1m'});
  expect(result.snapshots).toHaveLength(1);expect(result.comparison.baseline.denominator).toBe(result.snapshots[0].denominator);
  expect(result.comparison.baseline.scope_signature).not.toBe(result.snapshots[0].scope_signature);
  expect(result.scope_changes).toHaveLength(1);expect(result.comparison.scope_changed).toBe(true);
});

test('large portfolio history sends compact genuine points while retaining each full stored source proof',()=>{
  const db=fixture(['cis-ig1'],{'cis-ig1':{implementation_group:3}}),native=copy(db);
  db.clients=[];db.requirements=[];db.framework_assessments=[];db.baselines={};
  for(let client=0;client<20;client++){
    const id='isolated'+client;
    db.clients.push({...native.clients[0],client_id:id});db.baselines[id]={completed:true};
    db.requirements.push({...native.requirements[0],client_id:id,requirement_id:id+':program'});
    db.framework_assessments.push(...native.framework_assessments.map(row=>({...row,client_id:id,framework_assessment_id:id+':'+row.definition_id})));
  }
  captureDemoReporting(db,null,AS_OF);
  const positions=db.portfolio_reporting.snapshots;
  db.portfolio_reporting.snapshots=positions.flatMap(position=>Array.from({length:90},(_,index)=>{
    const at=new Date(Date.parse(AS_OF)-(89-index)*86400000).toISOString();
    return {...position,snapshot_id:position.snapshot_id+':'+index,captured_at:at,effective_at:at,observation_sequence:index+1};
  }));
  const before=JSON.stringify(db),overview=portfolioReportingRequest(db,'/portfolio/reporting/overview');
  expect(overview.programs).toHaveLength(20);expect(overview.programs.every(position=>position.snapshots_90d.length===90)).toBe(true);
  const point=overview.programs[0].snapshots_90d[0];
  expect(point.scope).toBeUndefined();expect(point.components).toBeUndefined();expect(point.provenance.source_references).toBeUndefined();
  expect(point.source_revision.length).toBeLessThan(150);expect(point.scope_signature.length).toBeLessThan(100);
  expect(JSON.stringify(point).length).toBeLessThan(2200);expect(JSON.stringify(overview).length).toBeLessThan(5*1024*1024);
  expect(db.portfolio_reporting.snapshots[0].current.scope.definition_ids).toHaveLength(153);
  expect(db.portfolio_reporting.snapshots[0].current.provenance.source_references).toHaveLength(153);
  expect(JSON.stringify(db)).toBe(before);
});

test('failed Demo storage preserves both native source and persisted scope/source identities',()=>{
  const db=fixture();sessionStorage.setItem(STORE_KEY,JSON.stringify(db));saveStore(db);
  const previous=sessionStorage.getItem(STORE_KEY),edited=JSON.parse(previous);edited.framework_assessments[0].status='addressed';
  const failure=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Isolated quota failure','QuotaExceededError');});
  try{expect(()=>saveStore(edited)).toThrow();expect(sessionStorage.getItem(STORE_KEY)).toBe(previous);}
  finally{failure.mockRestore();sessionStorage.removeItem(STORE_KEY);}
});

test('storage pools roundtrip each historical scope/source proof independently and preserve legacy data without read writes',()=>{
  const db=fixture(['iso-27001']),annex=db.framework_assessments.filter(row=>row.specification==='annex_control');
  Object.assign(annex[0],{soa_applicability:'included',soa_justification:'First actual membership'});
  captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');const previous=copy(db);
  Object.assign(annex[0],{soa_applicability:'excluded',soa_justification:'Changed actual membership',last_saved:AS_OF});
  Object.assign(annex[1],{soa_applicability:'included',soa_justification:'Replacement membership',last_saved:AS_OF});
  captureDemoReporting(db,previous,AS_OF);
  // A pre-field observation has unknown enrollment lineage; decoding must not
  // inherit today's enrollment IDs into that historical point.
  delete db.portfolio_reporting.snapshots[0].current.scope.enrollment_ids;
  const original=copy(db),packed=compactPortfolioReporting(db),raw=JSON.stringify(packed),restored=restorePortfolioReporting(JSON.parse(raw));
  expect(db).toEqual(original);expect(packed.portfolio_reporting.snapshots[0].current.scope).toBeUndefined();
  expect(packed.portfolio_reporting.snapshots[0].current.provenance.source_references).toBeUndefined();
  expect(restored.portfolio_reporting.snapshots).toEqual(original.portfolio_reporting.snapshots);
  expect(restored.portfolio_reporting.scope_events).toEqual(original.portfolio_reporting.scope_events);
  expect(restored.framework_assessments).toEqual(original.framework_assessments);
  expect(Object.hasOwn(restored.portfolio_reporting.snapshots[0].current.scope,'enrollment_ids')).toBe(false);
  expect(packed.portfolio_reporting.snapshots[0].current._portfolio_scope_index).toBe(0);
  const invalidScope=JSON.parse(raw);invalidScope.portfolio_reporting.snapshots[0].current._portfolio_scope_index=999;
  expect(()=>restorePortfolioReporting(invalidScope)).toThrow(/scope reference/);
  const invalidSource=JSON.parse(raw);invalidSource.portfolio_reporting.snapshots[0].current.provenance._portfolio_source_index=999;
  expect(()=>restorePortfolioReporting(invalidSource)).toThrow(/source reference/);
  expect(portfolioReportingRequest(restored,'/portfolio/reporting/history',{client_id:'isolated',program_key:'iso-27001',range:'1m'}))
    .toEqual(portfolioReportingRequest(db,'/portfolio/reporting/history',{client_id:'isolated',program_key:'iso-27001',range:'1m'}));
  expect(JSON.stringify(packed)).toBe(raw);
  restored.portfolio_reporting.snapshots[1].current.scope.applicability[annex[0].definition_id]='locally mutated';
  restored.portfolio_reporting.scope_events[0].before.provenance.source_references[0].status='locally mutated';
  expect(restored.portfolio_reporting.snapshots[0].current.scope).toEqual(original.portfolio_reporting.snapshots[0].current.scope);
  expect(restored.portfolio_reporting.snapshots[0].current.provenance.source_references).toEqual(original.portfolio_reporting.snapshots[0].current.provenance.source_references);
  expect(JSON.stringify(packed)).toBe(raw);
  expect(restorePortfolioReporting(original)).toEqual(original);
});

test('changing native Annex scopes and guided saves retain all positions within actual Demo storage',async()=>{
  sessionStorage.clear();localStorage.clear();const api=axios.create({adapter:previewAdapter});
  const actualSet=Storage.prototype.setItem;let footprint,matchedFootprint;
  const measure=jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
    if(key===STORE_KEY){const parsed=JSON.parse(value),history=parsed.portfolio_reporting||{};
      footprint={total:value.length,snapshots:JSON.stringify(history.snapshots||[]).length,scope_events:JSON.stringify(history.scope_events||[]).length,identities:JSON.stringify(history.identities||[]).length,source_vectors:JSON.stringify(history.source_vectors||[]).length,
        native:JSON.stringify({...parsed,portfolio_reporting:undefined}).length,snapshot_count:history.snapshots?.length||0,scope_event_count:history.scope_events?.length||0};}
    if(footprint?.snapshot_count===40&&footprint.scope_event_count===19)matchedFootprint=footprint;
    return actualSet.call(this,key,value);
  });
  try{
    await api.post('/demo/enter');const cid=(await api.post('/clients',{name:'Isolated actual changing scope storage fixture'})).data.client_id;
    const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(policy=>[policy.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,framework.key==='iso-27001'?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}};
    await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
    const ws=(await api.get('/frameworks/iso-27001',{params:{client_id:cid}})).data,selected=ws.assessments.filter(row=>row.specification==='annex_control'||isoGuidedCatalog.definitions[row.definition_id].specification==='annex_control').slice(0,25);
    expect(selected).toHaveLength(25);
    for(let row of selected){
      const path='/framework_assessments/'+row.framework_assessment_id;
      jest.advanceTimersByTime(1000);
      row=(await api.patch(path,{soa_applicability:'included',soa_justification:'Synthetic risk treatment scope decision',expected_last_assessed:row.last_saved||row.last_assessed||null})).data;
      const draft=(await api.get(path+'/guided-assessment')).data,answers={};
      for(let pass=0;pass<30;pass++){const missing=isoQuestions(row.definition_id,answers).filter(question=>!(question.id in answers));if(!missing.length)break;for(const question of missing)answers[question.id]=question.type==='text'?'':question.type==='context'?'Relevant':question.optional?'No':'Yes';}
      const result=isoGuidedResult(row.definition_id,answers,draft.version,'Synthetic storage regression');
      const reviewed=(await api.put(path+'/guided-assessment',{version:draft.version,answers,summary_review:{version:draft.version,answers},step:0,completed:true,narrative:result.narrative,result,expected_revision:draft.revision,base_assessment_token:draft.current_assessment_token,base_scope_fingerprint:draft.current_scope_fingerprint})).data;
      jest.advanceTimersByTime(1000);
      const saved=(await api.patch(path,{implementation:reviewed.narrative,status:reviewed.result.status,guided_assessment_source:Object.fromEntries(['version','revision','generated_at'].map(field=>[field,reviewed[field]])),expected_last_assessed:row.last_saved})).data;
      expect(saved.assessment_history.slice(0,-1)).toEqual(row.assessment_history);expect(saved.implementation).toBe(result.narrative);
    }
    const saved=restorePortfolioReporting(JSON.parse(sessionStorage.getItem(STORE_KEY))),history=portfolioReportingRequest(saved,'/portfolio/reporting/history',{client_id:cid,program_key:'iso-27001'});
    expect(history.snapshots).toHaveLength(51);expect(history.scope_changes).toHaveLength(26);
    expect(history.scope_changes[0].before).toBeNull();
    expect(history.scope_changes.filter(change=>change.before&&change.after)).toHaveLength(25);
    expect(history.current.implemented).toBe(25);expect(history.current.denominator).toBe(55);
    expect(saved.framework_assessments.filter(row=>row.client_id===cid&&row.status==='addressed')).toHaveLength(25);
    expect(footprint.total).toBeLessThan(5000000);
  }finally{console.info('Changing ISO storage footprint (code units)',{matched_prefix:matchedFootprint,final:footprint});measure.mockRestore();sessionStorage.clear();localStorage.clear();}
},120000);

test('normal native ISO save supplies last activity while rejected and no-op receipts never replace it',()=>{
  const db=fixture(['iso-27001']),row=db.framework_assessments.find(row=>row.definition_id==='A.5.1');
  Object.assign(row,{implementation:'',technology:'',notes:'',na_rationale:'',related_links:[]});
  captureDemoReporting(db,null,AS_OF);const previous=copy(db);
  frameworkRequest(db,'/framework_assessments/'+row.framework_assessment_id,'patch',{},
    {expected_last_assessed:null,status:'addressed',implementation:'Actual native implementation',soa_applicability:'included',soa_justification:'Actual scope decision'});
  captureDemoReporting(db,previous,AS_OF);
  const activity=request(db,'overview').clients[0].last_activity;
  expect(activity).toEqual({at:AS_OF,label:'Assessment saved'});
  const retained=copy(db);db.logs.unshift({...db.logs[0],audit_id:'noop-receipt'});
  captureDemoReporting(db,retained,AS_OF);
  expect(db.portfolio_reporting.activity_proofs['noop-receipt'].eligible).toBe(false);
  expect(request(db,'overview').clients[0].last_activity).toEqual(activity);
  expect(request(db,'activity').total).toBe(1);
});

test.each(['legacy','pooled'])('initialized %s native/guided reads preserve complete saved bytes; export and writes retain their persistence',async shape=>{
  sessionStorage.clear();localStorage.clear();const db=fixture(),row=db.framework_assessments[0],path='/framework_assessments/'+row.framework_assessment_id;
  Object.assign(row,{implementation:'',technology:'',notes:'',na_rationale:'',related_links:[]});
  saveStore(db);
  if(shape==='legacy'){
    const legacy=restorePortfolioReporting(JSON.parse(sessionStorage.getItem(STORE_KEY)));
    delete legacy.portfolio_reporting.storage_version;delete legacy.portfolio_reporting.source_vectors;
    sessionStorage.setItem(STORE_KEY,JSON.stringify(legacy));
  }
  sessionStorage.setItem('grc_demo_entered','true');
  const api=axios.create({adapter:previewAdapter}),before=sessionStorage.getItem(STORE_KEY),savedBefore=restorePortfolioReporting(JSON.parse(before));
  const writes=jest.spyOn(Storage.prototype,'setItem');
  try{
    for(const url of ['/frameworks/cis-ig1',path,path+'/related',path+'/activity',path+'/guided-assessment',path+'/guided-assessment/history'])await api.get(url,{params:{client_id:'isolated'}});
    expect(writes).not.toHaveBeenCalled();expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
    for(const [index,url] of ['/frameworks/cis-ig1/export','/frameworks/cis-ig1/export/'].entries()){
      const file=(await api.get(url,{params:{client_id:'isolated'}})).data;
      expect(file).toBeInstanceOf(Blob);expect(writes).toHaveBeenCalledTimes(index+1);
    }
    const exported=restorePortfolioReporting(JSON.parse(sessionStorage.getItem(STORE_KEY)));
    expect(exported.logs[0].action).toBe('CIS assessment export');
    expect(exported.logs.filter(log=>log.action==='CIS assessment export')).toHaveLength(2);
    expect(exported.portfolio_reporting.snapshots).toEqual(savedBefore.portfolio_reporting.snapshots);
    const changed=(await api.patch(path,{expected_last_assessed:null,status:'in_progress',implementation:'Actual persisted native work'})).data;
    expect(changed.status).toBe('in_progress');expect(writes).toHaveBeenCalledTimes(3);
    const persisted=restorePortfolioReporting(JSON.parse(sessionStorage.getItem(STORE_KEY)));
    expect(persisted.framework_assessments.find(record=>record.framework_assessment_id===row.framework_assessment_id).implementation).toBe('Actual persisted native work');
    expect(persisted.portfolio_reporting.snapshots).toHaveLength(savedBefore.portfolio_reporting.snapshots.length+1);
    expect(persisted.portfolio_reporting.snapshots.at(-1).observation_kind).toBe('committed_event');
  }finally{writes.mockRestore();sessionStorage.clear();localStorage.clear();}
});

test('all calendar ranges clamp month ends and the forecast horizon remains 90 elapsed days',()=>{
  expect(demoRangeStart('2024-03-31T12:00:00Z','1m')).toBe('2024-02-29T12:00:00.000Z');
  expect(demoRangeStart('2024-05-31T12:00:00Z','3m')).toBe('2024-02-29T12:00:00.000Z');
  expect(demoRangeStart('2024-02-29T12:00:00Z','36m')).toBe('2021-02-28T12:00:00.000Z');
  const db=fixture();captureDemoReporting(db,null,'2026-07-20T18:00:00.000Z');
  let previous=copy(db);db.framework_assessments[0].status='in_progress';captureDemoReporting(db,previous,'2026-09-01T18:00:00.000Z');
  previous=copy(db);db.framework_assessments[0].status='addressed';captureDemoReporting(db,previous,AS_OF);
  const one=request(db,'history',{client_id:'isolated',program_key:'cis-ig1',range:'1m'}),threeYears=request(db,'history',{client_id:'isolated',program_key:'cis-ig1',range:'36m'});
  expect(one.snapshots).toHaveLength(1);expect(threeYears.snapshots).toHaveLength(3);
  expect(one.forecast_snapshots).toEqual(threeYears.forecast_snapshots);
  expect(one.comparison.baseline_effective_at_start).toBe(true);
  expect(one.forecast_snapshots.map(snapshot=>snapshot.observation_kind)).toEqual(['current_baseline','committed_event','committed_event']);
});

test('Demo profile reads and metadata do not become progress votes; disable and reenable retain scope history',()=>{
  const db=fixture();captureDemoReporting(db,null,AS_OF);
  let previous=copy(db);db.clients[0].industry='Updated metadata';captureDemoReporting(db,previous,AS_OF);
  expect(db.portfolio_reporting.snapshots).toHaveLength(1);
  previous=copy(db);db.requirements[0].baseline_response='does_not_apply';captureDemoReporting(db,previous,AS_OF);
  expect(request(db,'overview').programs).toHaveLength(0);
  previous=copy(db);db.requirements[0].baseline_response='applies';captureDemoReporting(db,previous,AS_OF);
  const history=request(db,'history',{client_id:'isolated',program_key:'cis-ig1'});
  expect(history.scope_changes).toHaveLength(2);
  expect(db.portfolio_reporting.snapshots).toHaveLength(2);
  expect(db.portfolio_reporting.snapshots[0].current.continuity_proven).not.toBe(true);
  expect(history.current.program_id).toBe('isolated:cis-ig1');
  db.user={user_id:'reader',role:'client_readonly',client_ids:['isolated']};
  expect(request(db,'history',{client_id:'isolated',program_key:'cis-ig1'}).current.denominator).toBe(56);
  expect(()=>request(db,'overview')).toThrow(/internal admins/);
  expect(()=>request(db,'history',{client_id:'foreign',program_key:'cis-ig1'})).toThrow(/Forbidden/);
});

const assessmentItem=changes=>({item_id:'item_private_fixture',question_id:'practice',kind:'gap',state:'open',
  text:'PRIVATE ITEM TEXT',resolution:'PRIVATE ITEM RESOLUTION',notes:'PRIVATE LEGACY ITEM NOTES',finding_id:null,
  source_version:'fixture-version',source_fingerprint:'fixture-fingerprint',created_at:'2026-10-12T18:00:00.000Z',
  updated_at:'2026-10-12T18:00:00.000Z',history:[],...changes});
const itemReceipt=(row,audit_id,extra={})=>({audit_id,entity_type:'framework_assessments',entity_id:row.framework_assessment_id,
  client_id:row.client_id,action:'Assessment item updated',at:AS_OF,user_id:'owner',user_name:'Demo Owner',
  meta:{item_id:row.items_to_address[0].item_id,state:row.items_to_address[0].state},...extra});

test.each([['state','resolved'],['resolution','PRIVATE CHANGED RESOLUTION'],['text','PRIVATE CHANGED ITEM TEXT'],
  ['notes','PRIVATE CHANGED LEGACY NOTES'],['finding_id','fnd_private_item_link']])('Demo Items %s delta emits one minimal Assessments event',(field,value)=>{
  const db=fixture(),row=db.framework_assessments[0];
  Object.assign(row,{status:'needs_attention',verification:'verified',implementation:'Retained native implementation',
    last_assessed:'2026-10-12T18:00:00.000Z',last_saved:'2026-10-12T18:00:00.000Z',
    assessment_history:[{at:'2026-10-12T18:00:00.000Z',by:'owner',status:'needs_attention'}],
    items_to_address:[assessmentItem()],items_revision:1});
  db.findings=[{finding_id:'fnd_private_item_link',client_id:'isolated',title:'Private retained Finding',status:'open'}];
  captureDemoReporting(db,null,AS_OF);const previous=copy(db),native=copy(row),position=copy(demoCurrentPositions(db,db.clients,AS_OF)[0].current);
  delete native.items_to_address;delete native.items_revision;
  Object.assign(row.items_to_address[0],{[field]:value,updated_at:AS_OF});row.items_revision++;
  db.logs.unshift(itemReceipt(row,'items-'+field));captureDemoReporting(db,previous,AS_OF);
  const activity=request(db,'activity');expect(activity.total).toBe(1);expect(activity.events).toHaveLength(1);
  expect(activity.events[0].type).toBe('Assessments');expect(activity.events[0].source.entity_id).toBe(row.framework_assessment_id);
  expect(db.portfolio_reporting.activity_proofs['items-'+field].changed_fields).toEqual(['items_to_address']);
  expect(request(db,'overview').recent_changes_count).toBe(1);
  const payload=JSON.stringify(activity);
  for(const secret of ['item_private_fixture','PRIVATE ITEM TEXT','PRIVATE ITEM RESOLUTION','PRIVATE LEGACY ITEM NOTES',
    'PRIVATE CHANGED RESOLUTION','PRIVATE CHANGED ITEM TEXT','PRIVATE CHANGED LEGACY NOTES','fnd_private_item_link'])expect(payload).not.toContain(secret);
  const after=copy(row);delete after.items_to_address;delete after.items_revision;
  expect(after).toEqual(native);expect(demoCurrentPositions(db,db.clients,AS_OF)[0].current).toEqual(position);
  expect(db.portfolio_reporting.snapshots).toHaveLength(1);
});

test('Demo Items bookkeeping, reordered lists and ordinary reviewed history saves are not activity',()=>{
  const changes=[
    ['item clocks and history',row=>Object.assign(row.items_to_address[0],{created_at:AS_OF,updated_at:AS_OF,history:[{at:AS_OF,event:'reconciled'}]})],
    ['source reconciliation',row=>Object.assign(row.items_to_address[0],{source_version:'new-version',source_fingerprint:'new-fingerprint',previous_state:'resolved'})],
    ['revision',row=>{row.items_revision++;}],['list order',row=>row.items_to_address.reverse()],
    ['reviewed save',row=>{row.last_saved=AS_OF;row.last_assessed=AS_OF;row.assessment_history.push({at:AS_OF,by:'owner',status:row.status});}],
  ];
  for(const [name,change] of changes){
    const db=fixture(),row=db.framework_assessments[0];
    Object.assign(row,{status:'needs_attention',items_to_address:[assessmentItem(),assessmentItem({item_id:'item_private_second',question_id:'verification',kind:'verification'})],
      items_revision:2,assessment_history:[],last_saved:'2026-10-12T18:00:00.000Z',last_assessed:'2026-10-12T18:00:00.000Z'});
    captureDemoReporting(db,null,AS_OF);const previous=copy(db);change(row);
    db.logs.unshift(itemReceipt(row,'noise-'+name,name==='reviewed save'?{action:'Framework assessment updated',meta:{changed_fields:['assessment_history','last_saved']}}:{}));
    captureDemoReporting(db,previous,AS_OF);
    expect(request(db,'activity').total).toBe(0);expect(request(db,'overview').recent_changes_count).toBe(0);
    expect(db.portfolio_reporting.snapshots).toHaveLength(1);
  }
});

test('Demo same-clock resolve open resolve keeps three actual receipt IDs and replay adds no activity',()=>{
  const db=fixture(),row=db.framework_assessments[0];Object.assign(row,{items_to_address:[assessmentItem({resolution:''})],items_revision:0});
  captureDemoReporting(db,null,AS_OF);
  for(const [index,state] of ['resolved','open','resolved'].entries()){
    const previous=copy(db);Object.assign(row.items_to_address[0],{state,resolution:state==='resolved'?'PRIVATE SAME RESOLUTION':'',updated_at:AS_OF});
    row.items_revision++;db.logs.unshift(itemReceipt(row,'same-clock-items-'+index));captureDemoReporting(db,previous,AS_OF);
    expect(request(db,'activity').total).toBe(index+1);
  }
  const events=request(db,'activity').events;expect(new Set(events.map(event=>event.event_id))).toEqual(new Set(['demo:same-clock-items-0','demo:same-clock-items-1','demo:same-clock-items-2']));
  expect(events.every(event=>event.type==='Assessments'&&event.at===AS_OF)).toBe(true);
  const previous=copy(db);db.logs.unshift(copy(db.logs[0]));captureDemoReporting(db,previous,AS_OF);
  captureDemoReporting(db,copy(db),AS_OF);expect(request(db,'activity').events).toEqual(events);
  expect(request(db,'overview').recent_changes_count).toBe(3);
});

test('Demo failed receipts, unlogged Items edits, no-ops and unchanged reviewed rows create no activity',()=>{
  for(const scenario of ['failed','unlogged','noop','unchanged reviewed']){
    const db=fixture(),row=db.framework_assessments[0];row.items_to_address=[assessmentItem()];
    captureDemoReporting(db,null,AS_OF);const previous=copy(db);
    if(['failed','unlogged'].includes(scenario))row.items_to_address[0].state='resolved';
    if(scenario!=='unlogged')db.logs.unshift(itemReceipt(row,'no-event-'+scenario,
      scenario==='failed'?{outcome:'failed'}:scenario==='unchanged reviewed'?{action:'Framework assessment updated',meta:{changed_fields:['status']}}:{}));
    captureDemoReporting(db,previous,AS_OF);expect(request(db,'activity').total).toBe(0);
  }
});

test('Demo explicit SOC recording requires actual advanced judgment and matching retained source history',()=>{
  const scenarios=['genuine','flag only','unchanged judgment clock','backward judgment clock','without intent','string intent',
    'wrong action','wrong framework','unknown status','not assessed','missing history','mismatched history','lost history prefix'];
  for(const scenario of scenarios){
    const db=fixture([scenario==='wrong framework'?'cis-ig1':'soc-2']),row=db.framework_assessments[0],old='2026-10-12T18:00:00.000Z';
    Object.assign(row,{status:scenario==='unknown status'?'legacy_unknown':scenario==='not assessed'?'not_assessed':'addressed',
      implementation:'Retained native SOC implementation',assessment_recorded_at:old,assessment_recorded_by:'owner',last_saved:old,last_assessed:old});
    row.assessment_history=[{at:old,by:'owner',status:row.status,implementation:row.implementation,assessment_recorded_at:old,assessment_recorded_by:'owner'}];
    captureDemoReporting(db,null,AS_OF);const previous=copy(db);
    if(scenario!=='flag only'){
      Object.assign(row,{last_saved:AS_OF,last_assessed:AS_OF,assessment_recorded_at:AS_OF});
      row.assessment_history.push({at:AS_OF,by:'owner',status:row.status,implementation:row.implementation,assessment_recorded_at:AS_OF,assessment_recorded_by:'owner'});
    }
    if(scenario==='unchanged judgment clock')row.assessment_recorded_at=old;
    if(scenario==='backward judgment clock')row.assessment_recorded_at='2026-10-11T18:00:00.000Z';
    if(scenario==='missing history')row.assessment_history=copy(previous.framework_assessments[0].assessment_history);
    if(scenario==='mismatched history')row.assessment_history.at(-1).assessment_recorded_by='different-actor';
    if(scenario==='lost history prefix')row.assessment_history.shift();
    db.logs.unshift({audit_id:'soc-intent-'+scenario,entity_type:'framework_assessments',entity_id:row.framework_assessment_id,client_id:row.client_id,
      action:scenario==='wrong action'?'Assessment item updated':'Framework assessment updated',at:AS_OF,user_id:'owner',user_name:'Demo Owner',
      meta:{record_assessment:scenario==='without intent'?false:scenario==='string intent'?'true':true,status:row.status}});
    captureDemoReporting(db,previous,AS_OF);
    const activity=request(db,'activity');expect(activity.total).toBe(scenario==='genuine'?1:0);
    if(scenario==='genuine'){
      expect(activity.events[0].type).toBe('Assessments');expect(activity.events[0].event_id).toBe('demo:soc-intent-genuine');
      expect(row.assessment_history.slice(0,-1)).toEqual(previous.framework_assessments[0].assessment_history);
      const replay=copy(db);db.logs.unshift({...copy(db.logs[0]),audit_id:'soc-identical-row-receipt'});captureDemoReporting(db,replay,AS_OF);
      expect(request(db,'activity').total).toBe(1);
    }
  }
});

test('Demo native Items caller captures same-clock transitions, preserves judgment, and rejects stale/read-only changes',()=>{
  const db=fixture(),row=db.framework_assessments[0],path='/framework_assessments/'+row.framework_assessment_id;
  Object.assign(row,{items_to_address:[assessmentItem({resolution:''})],items_revision:0,status:'needs_attention',
    verification:'verified',implementation:'Native conclusion',last_saved:'2026-10-12T18:00:00.000Z',
    last_assessed:'2026-10-12T18:00:00.000Z',assessment_history:[]});
  const native=copy(row);delete native.items_to_address;delete native.items_revision;
  captureDemoReporting(db,null,AS_OF);
  for(const state of ['resolved','open','resolved']){
    const previous=copy(db);frameworkRequest(db,path+'/items/'+encodeURIComponent(row.items_to_address[0].item_id),'patch',{},
      {expected_revision:row.items_revision,state,resolution:''});captureDemoReporting(db,previous,AS_OF);
  }
  expect(request(db,'activity').total).toBe(3);
  expect(new Set(request(db,'activity').events.map(event=>event.event_id)).size).toBe(3);
  const previous=copy(db);frameworkRequest(db,path+'/items/'+encodeURIComponent(row.items_to_address[0].item_id),'patch',{},
    {expected_revision:row.items_revision,state:'resolved',resolution:''});captureDemoReporting(db,previous,AS_OF);
  expect(request(db,'activity').total).toBe(3);
  expect(()=>frameworkRequest(db,path+'/items/'+encodeURIComponent(row.items_to_address[0].item_id),'patch',{},
    {expected_revision:0,state:'open',resolution:''})).toThrow(/changed in another window/);
  db.user={...db.user,role:'client_readonly',client_ids:['isolated']};
  expect(()=>frameworkRequest(db,path+'/items/'+encodeURIComponent(row.items_to_address[0].item_id),'patch',{},
    {expected_revision:row.items_revision,state:'open',resolution:''})).toThrow(/Read-only/);
  const saved=copy(row);delete saved.items_to_address;delete saved.items_revision;expect(saved).toEqual(native);
});

test('Demo native Finding caller captures a retained unlinked Item once without duplicate Finding or Action',()=>{
  const db=fixture(),row=db.framework_assessments[0],path='/framework_assessments/'+row.framework_assessment_id;
  db.tasks=[];row.items_to_address=[assessmentItem()];row.items_revision=0;
  const body={item_id:row.items_to_address[0].item_id,title:'Explicit native follow-up',remediation_title:'Address saved gap',request_id:'first'};
  const finding=frameworkRequest(db,path+'/findings','post',{},body);
  // Model an existing native Finding whose assessment-local link was not retained.
  row.items_to_address[0].finding_id=null;row.items_to_address[0].history=[];row.items_revision=0;db.logs=[];
  captureDemoReporting(db,null,AS_OF);const previous=copy(db);
  frameworkRequest(db,path+'/findings','post',{}, {...body,request_id:'repair-link'});captureDemoReporting(db,previous,AS_OF);
  expect(request(db,'activity').events.filter(event=>event.type==='Assessments')).toHaveLength(1);
  expect(db.logs.filter(log=>log.action==='Assessment item updated')).toHaveLength(1);
  expect(row.items_to_address[0]).toMatchObject({state:'open',finding_id:finding.finding_id});
  const linked=copy(db);frameworkRequest(db,path+'/findings','post',{}, {...body,request_id:'another-intent'});captureDemoReporting(db,linked,AS_OF);
  expect(request(db,'activity').total).toBe(1);expect(db.findings).toHaveLength(1);expect(db.tasks).toHaveLength(1);
  expect(row.items_revision).toBe(1);expect(row.items_to_address[0].history).toHaveLength(1);
});

test.each(['needs_attention','not_applicable'])('Demo native SOC caller records explicit %s reaffirmation but ordinary saves remain no-ops',status=>{
  const db=fixture(['soc-2']),row=db.framework_assessments[0],old='2026-10-12T18:00:00.000Z';db.contacts=[];
  Object.assign(row,{status,implementation:'Existing native conclusion',technology:'',notes:'',na_rationale:status==='not_applicable'?'Saved native exclusion rationale':'',
    owner_id:null,process_owner_id:null,last_saved:old,last_assessed:old,
    assessment_recorded_at:old,assessment_recorded_by:'owner',assessment_history:[]});
  captureDemoReporting(db,null,AS_OF);const previous=copy(db),path='/framework_assessments/'+row.framework_assessment_id;
  frameworkRequest(db,path,'patch',{}, {record_assessment:true,expected_last_assessed:old});captureDemoReporting(db,previous,AS_OF);
  expect(db.logs[0].meta.record_assessment).toBe(true);expect(request(db,'activity').total).toBe(1);
  const recorded=copy(db);frameworkRequest(db,path,'patch',{}, {implementation:row.implementation,expected_last_assessed:row.last_saved});
  captureDemoReporting(db,recorded,AS_OF);expect(request(db,'activity').total).toBe(1);
  expect(db.portfolio_reporting.snapshots).toHaveLength(1);
});

test('current positions reuse native cumulative CIS counts and do not credit verified drafts',()=>{
  for(const group of [1,2,3]){
    const db=fixture(['cis-ig1'],{'cis-ig1':{implementation_group:group}}),rows=db.framework_assessments;
    rows[0].status='addressed';rows[1].status='in_progress';rows[2].status='needs_attention';
    rows[3].verification='verified';rows[3].guided_assessment_source={status:'addressed'};
    const native=cisSummary(rows),position=demoCurrentPositions(db,db.clients,AS_OF)[0];
    expect(position.program_key).toBe('cis-ig'+group);
    expect(position.current.total).toBe({1:56,2:130,3:153}[group]);
    expect(position.current.implemented).toBe(native.addressed);
    expect(position.current.percentage).toBe(native.addressed/native.applicable*100);
  }
});

test('ISO mandatory clauses, included Annex A, and unresolved SoA remain separate',()=>{
  const db=fixture(['iso-27001']);const row=id=>db.framework_assessments.find(r=>r.definition_id===id);
  row('4.1').status='addressed';Object.assign(row('A.5.1'),{status:'addressed',soa_applicability:'included',soa_justification:'Isolated local inclusion'});
  Object.assign(row('A.5.2'),{status:'addressed',soa_applicability:'excluded',soa_justification:'Isolated local exclusion'});
  const native=isoProgramMetrics(db.framework_assessments),current=demoCurrentPositions(db,db.clients,AS_OF)[0].current;
  expect(current.implemented).toBe(native.requirements.implemented+native.annex.implemented);
  expect(current.denominator).toBe(31);expect(current.excluded).toBe(1);expect(current.scope_undetermined).toBe(91);
  expect(current.components.find(c=>c.key==='soa').included).toBe(1);
  expect(current.components.find(c=>c.key==='isms').denominator).toBe(30);
});

test('SOC categories are selected native scope and incomplete positions never look complete',()=>{
  const db=fixture(['soc-2'],{'soc-2':{categories:['security','availability','confidentiality']}});
  let current=demoCurrentPositions(db,db.clients,AS_OF)[0].current;expect(current.total).toBe(38);
  expect(current.components.map(c=>c.key)).toEqual(['availability','confidentiality','security']);
  db.framework_assessments.pop();current=demoCurrentPositions(db,db.clients,AS_OF)[0].current;
  expect(current.percentage).toBeNull();expect(current.missing_records).toBe(1);
  expect(current.availability).toBe('partial');
  const unsupported=fixture(['cmmc']),overview=request(unsupported,'overview');
  expect(overview.frameworks).toEqual([]);expect(overview.programs).toHaveLength(1);
  expect(overview.programs[0].current.availability).toBe('unavailable');
  expect(unsupported.requirements[0].baseline_response).toBe('applies');
});

test('capture occurs at actual local commit dates, skips unchanged state, and reporting reads do not mutate',()=>{
  const db=fixture();captureDemoReporting(db,null,AS_OF);const first=copy(db);
  expect(db.portfolio_reporting.snapshots).toHaveLength(1);
  const result=request(db,'history',{client_id:'isolated',program_key:'cis-ig1',range:'12m'});
  expect(result.snapshots).toHaveLength(1);expect(result.comparison.baseline).toBeNull();expect(result.comparison.change_pp).toBeNull();
  expect(result.snapshots[0].captured_at).toBe(AS_OF);expect(db).toEqual(first);
  captureDemoReporting(db,first,'2026-10-13T18:01:00.000Z');expect(db.portfolio_reporting.snapshots).toHaveLength(1);
  const previous=copy(db);db.framework_assessments[0].status='addressed';captureDemoReporting(db,previous,'2026-10-13T18:02:00.000Z');
  expect(db.portfolio_reporting.snapshots).toHaveLength(2);expect(db.portfolio_reporting.snapshots[1].current.implemented).toBe(1);
  expect(db.portfolio_reporting.snapshots[0].captured_at).toBe(AS_OF);
});

test('no captured Demo history returns the current actual read and never seeds earlier dates',()=>{
  const db=fixture(),before=copy(db),result=request(db,'history',{client_id:'isolated',program_key:'cis-ig1'});
  expect(result.snapshots).toHaveLength(0);expect(result.current.denominator).toBe(56);expect(result.current.observation_kind).toBe('current_source');
  expect(result.comparison.baseline).toBeNull();expect(result.coverage.started_at).toBeNull();expect(db).toEqual(before);
});

test('genuine local observations spanning IG expansion retain scope-change treatment',()=>{
  const db=fixture(['cis-ig1'],{'cis-ig1':{implementation_group:1}});
  captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');const previous=copy(db);
  db.clients[0].framework_settings['cis-ig1'].implementation_group=2;
  const baseline=new Set(db.framework_assessments.map(r=>r.definition_id));
  db.framework_assessments.push(...fixture(['cis-ig1'],{'cis-ig1':{implementation_group:2}}).framework_assessments.filter(r=>!baseline.has(r.definition_id)));
  captureDemoReporting(db,previous,'2026-10-01T00:00:00.000Z');
  const result=request(db,'history',{client_id:'isolated',program_key:'cis-ig2',range:'30d'});
  expect(result.comparison.scope_changed).toBe(true);expect(result.comparison.comparable).toBe(false);expect(result.comparison.change_pp).toBe(0);expect(result.comparison.baseline_effective_at_start).toBe(true);
  expect(result.scope_changes).toHaveLength(1);expect(result.comparison.baseline.captured_at).toBe('2026-09-01T00:00:00.000Z');
});

test('activity count and feed use one eligible cohort, deduplicate audit IDs, and preserve historical actors',()=>{
  const db=fixture();db.risks=[{risk_id:'r1',client_id:'isolated',status:'open'}];
  const log={audit_id:'event-1',entity_type:'risks',entity_id:'r1',client_id:'isolated',action:'Risk reassessed',at:AS_OF,user_id:'retired-actor',user_name:'Historical Name',meta:{token:'sensitive-token',title:'Sensitive free text'}};
  db.logs=[log,copy(log),{...log,audit_id:'noise',action:'Risk updated'},{...log,audit_id:'foreign',client_id:'foreign'}];
  const overview=request(db,'overview'),activity=request(db,'activity');
  expect(overview.recent_changes_count).toBe(1);expect(activity.total).toBe(1);expect(activity.events).toHaveLength(1);
  expect(activity.events[0].actor.name).toBe('Historical Name');expect(JSON.stringify(activity)).not.toMatch(/sensitive-token|Sensitive free text/);
  db.risks=[];const unavailable=request(db,'activity').events[0];expect(unavailable.source.available).toBe(false);expect(unavailable.source.to).toBeNull();
});

test('tied activity pagination is stable and cannot cross filter or identity scope',()=>{
  const db=fixture();db.risks=[{risk_id:'r1',client_id:'isolated',status:'open'}];
  db.logs=['a','b','c'].map(audit_id=>({audit_id,entity_type:'risks',entity_id:'r1',client_id:'isolated',action:'Risk reassessed',at:AS_OF}));
  const first=request(db,'activity',{limit:2}),second=request(db,'activity',{limit:2,as_of:first.as_of,cursor:first.next_cursor});
  expect(first.total).toBe(3);expect(second.total).toBe(3);expect(new Set([...first.events,...second.events].map(e=>e.event_id)).size).toBe(3);
  expect(()=>request(db,'activity',{limit:2,as_of:first.as_of,cursor:first.next_cursor,type:'Policies'})).toThrow(/different Demo view/);
});

test('native approval, committed assessment, evidence, and scope metadata supply their own business categories',()=>{
  const db=fixture();db.policies=[{policy_id:'p1',client_id:'isolated',status:'approved'}];db.evidence=[{evidence_id:'e1',client_id:'isolated'}];
  db.logs=[['policies','p1','approved',{}],['evidence','e1','upload',{}],['clients','isolated','CIS scope updated',{before:1,after:2}],['clients','isolated','CIS scope updated',{before:2,after:2}]].map(([entity_type,entity_id,action,meta],i)=>({audit_id:'native-'+i,entity_type,entity_id,client_id:'isolated',action,meta,at:AS_OF}));
  captureDemoReporting(db,null,AS_OF);const previous=copy(db);
  db.framework_assessments[0].implementation='A committed local implementation change';
  db.logs.unshift({audit_id:'actual-assessment',entity_type:'framework_assessments',entity_id:db.framework_assessments[0].framework_assessment_id,client_id:'isolated',action:'Framework assessment updated',meta:{changed_fields:['implementation']},at:AS_OF});
  captureDemoReporting(db,previous,AS_OF);
  const result=request(db,'activity');expect(result.total).toBe(4);expect(new Set(result.events.map(e=>e.type))).toEqual(new Set(['Policies','Assessments','Evidence','Scope']));
  expect(request(db,'activity',{type:'Policies'}).total).toBe(1);
});

test('modeled Demo role and wrong-client requests are rejected independently of malformed inputs',()=>{
  const db=fixture();db.user={user_id:'limited',role:'platform_admin',client_ids:['isolated']};
  expect(()=>request(db,'overview',{client_ids:'foreign'})).toThrow(/Forbidden/);
  expect(()=>request(db,'overview',{client_ids:'invalid!'})).toThrow(/Invalid portfolio/);
  db.user.role='client_readonly';expect(()=>request(db,'overview')).toThrow(/internal admins/);
});

test('Demo calendar months use real month ends and leap years',()=>{
  expect(demoRangeStart('2024-08-31T12:00:00Z','6m')).toBe('2024-02-29T12:00:00.000Z');
  expect(demoRangeStart('2024-02-29T12:00:00Z','12m')).toBe('2023-02-28T12:00:00.000Z');
});

test('same-timestamp distinct source transitions keep distinct snapshot IDs and replay adds none',()=>{
  const db=fixture();captureDemoReporting(db,null,AS_OF);
  let previous=copy(db);db.framework_assessments[0].status='in_progress';captureDemoReporting(db,previous,AS_OF);
  previous=copy(db);db.framework_assessments[0].status='addressed';captureDemoReporting(db,previous,AS_OF);
  expect(db.portfolio_reporting.snapshots).toHaveLength(3);
  expect(new Set(db.portfolio_reporting.snapshots.map(s=>s.snapshot_id)).size).toBe(3);
  expect(db.portfolio_reporting.snapshots.map(s=>s.captured_at)).toEqual([AS_OF,AS_OF,AS_OF]);
  captureDemoReporting(db,copy(db),AS_OF);expect(db.portfolio_reporting.snapshots).toHaveLength(3);
});

test('scope changes and applicability changes that revert still invalidate a sampled interval',()=>{
  for(const dimension of ['scope','applicability']){
    const db=fixture(['cis-ig1'],{'cis-ig1':{implementation_group:1}});
    captureDemoReporting(db,null,'2026-09-01T00:00:00.000Z');let previous=copy(db);
    if(dimension==='scope')db.clients[0].framework_settings['cis-ig1'].implementation_group=2;
    else Object.assign(db.framework_assessments[0],{status:'not_applicable',na_rationale:'Isolated genuine exclusion'});
    captureDemoReporting(db,previous,'2026-10-01T00:00:00.000Z');previous=copy(db);
    if(dimension==='scope')db.clients[0].framework_settings['cis-ig1'].implementation_group=1;
    else {db.framework_assessments[0].status='not_assessed';delete db.framework_assessments[0].na_rationale;}
    captureDemoReporting(db,previous,AS_OF);
    const result=request(db,'history',{client_id:'isolated',program_key:'cis-ig1',range:'30d'});
    expect(result.comparison.baseline.scope_signature).toBe(result.snapshots.at(-1).scope_signature);
    expect(result.scope_changes).toHaveLength(2);expect(result.comparison.scope_changed).toBe(true);
    expect(result.comparison.comparable).toBe(false);expect(result.comparison.change_pp).toBe(0);expect(result.comparison.baseline_effective_at_start).toBe(true);
    expect(request(db,'activity').total).toBe(0);
  }
});

test('forward commit proofs cover actual native records and exclude failed, no-op and duplicate receipts',()=>{
  const db=fixture(['cis-ig1','soc-2'],{'soc-2':{categories:['security']}});
  db.reviews=[{review_id:'rev1',client_id:'isolated',status:'upcoming'}];
  db.organizational_controls=[{control_id:'ctl1',client_id:'isolated',name:'Recorded control',design:'not_assessed'}];
  db.policies=[{policy_id:'p1',client_id:'isolated',status:'draft'}];
  db.evidence=[{evidence_id:'ev1',client_id:'isolated',display_name:'Original',relationships:[]}];
  const commit=(kind,id,action,change,extra={})=>{
    const previous=copy(db);change();
    db.logs.unshift({audit_id:id,entity_type:kind,entity_id:{reviews:'rev1',organizational_controls:'ctl1',policies:'p1',evidence:'ev1',clients:'isolated'}[kind],client_id:'isolated',action,at:AS_OF,user_id:'actor',user_name:'Recorded Actor',...extra});
    captureDemoReporting(db,previous,AS_OF);
  };
  commit('reviews','review-start','Review started',()=>{db.reviews[0].status='in_progress';});
  commit('organizational_controls','control-change','Control updated',()=>{db.organizational_controls[0].design='adequate';});
  commit('evidence','metadata','Evidence metadata changed',()=>{db.evidence[0].display_name='Changed';});
  commit('evidence','relationship','Evidence relationship added',()=>{db.evidence[0].relationships.push({kind:'reviews',id:'rev1'});});
  commit('policies','policy-change','update',()=>{db.policies[0].status='approved';});
  commit('clients','soc-change','SOC 2 readiness scope updated',()=>{db.clients[0].framework_settings['soc-2'].categories.push('availability');});
  const first=request(db,'activity');expect(first.total).toBe(6);
  expect(first.events.filter(e=>e.type==='Assessments')).toHaveLength(2);
  expect(first.events.filter(e=>e.type==='Evidence')).toHaveLength(2);
  expect(first.events.find(e=>e.event_id==='demo:review-start').source.to).toContain('/reviews?');
  expect(first.events.find(e=>e.event_id==='demo:control-change').source.to).toContain('/controls?');
  commit('evidence','noop','Evidence metadata changed',()=>{});
  commit('reviews','failed','Review completed',()=>{db.reviews[0].status='completed';},{outcome:'failed'});
  expect(request(db,'activity').total).toBe(6);expect(request(db,'overview').recent_changes_count).toBe(6);
  const previous=copy(db);db.reviews[0].status='in_progress';
  db.logs.unshift(...['generic','domain'].map((audit_id,i)=>({audit_id,entity_type:'reviews',entity_id:'rev1',client_id:'isolated',action:i?'Review started':'update',at:AS_OF})));
  captureDemoReporting(db,previous,AS_OF);
  expect(request(db,'activity').total).toBe(7);
  expect(request(db,'activity').events.filter(e=>['demo:generic','demo:domain'].includes(e.event_id))).toHaveLength(1);
  captureDemoReporting(db,copy(db),AS_OF);expect(request(db,'activity').total).toBe(7);
});

test('retained receipts exclude explicit failures, technical changes and unproven same-value metadata saves',()=>{
  const db=fixture();db.evidence=[{evidence_id:'e1',client_id:'isolated'}];db.reviews=[{review_id:'r1',client_id:'isolated'}];
  db.logs=[
    {audit_id:'failed',entity_type:'reviews',entity_id:'r1',action:'Review completed',outcome:'failed'},
    {audit_id:'denied',entity_type:'reviews',entity_id:'r1',action:'Review started',meta:{outcome:'denied'}},
    {audit_id:'technical',entity_type:'framework_assessments',entity_id:db.framework_assessments[0].framework_assessment_id,action:'Framework assessment updated',meta:{changed_fields:['last_saved']}},
    {audit_id:'unproved',entity_type:'evidence',entity_id:'e1',action:'Evidence metadata changed'},
    {audit_id:'field-list-only',entity_type:'framework_assessments',entity_id:db.framework_assessments[0].framework_assessment_id,action:'Framework assessment updated',meta:{changed_fields:['implementation']}},
    {audit_id:'evidence-field-list-only',entity_type:'evidence',entity_id:'e1',action:'Evidence metadata changed',meta:{changed_fields:['display_name']}},
    {audit_id:'control-field-list-only',entity_type:'organizational_controls',entity_id:'c1',action:'Control updated',meta:{changed_fields:['design']}},
  ].map(log=>({...log,at:AS_OF,client_id:'isolated'}));
  expect(request(db,'activity').total).toBe(0);
});

test('ISO record stamps and repeated archive stamps are technical changes while audit business values remain eligible',()=>{
  const db=fixture();db.reviews=[{review_id:'r1',client_id:'isolated',status:'upcoming',iso_audit:{package_key:'governance-risk',items:{'4-1':{status:'reviewed',result:'conforming',notes:'Same saved note',updated_at:'2026-10-12T12:00:00Z',updated_by:'original-actor'}}}}];
  db.evidence=[{evidence_id:'e1',client_id:'isolated',filename:'Recorded file',archived_at:'2026-10-12T12:00:00Z'}];
  captureDemoReporting(db,null,AS_OF);let previous=copy(db);
  Object.assign(db.reviews[0].iso_audit.items['4-1'],{updated_at:AS_OF,updated_by:'retry-actor'});
  db.evidence[0].archived_at=AS_OF;
  db.logs=[{audit_id:'stamp',entity_type:'reviews',entity_id:'r1',action:'Audit work updated'},{audit_id:'archive-stamp',entity_type:'evidence',entity_id:'e1',action:'archive'}].map(log=>({...log,client_id:'isolated',at:AS_OF}));
  captureDemoReporting(db,previous,AS_OF);expect(request(db,'activity').total).toBe(0);expect(request(db,'overview').recent_changes_count).toBe(0);
  previous=copy(db);db.reviews[0].iso_audit.items['4-1'].notes='A substantive saved audit note';
  db.logs.unshift({audit_id:'business',entity_type:'reviews',entity_id:'r1',action:'Audit work updated',client_id:'isolated',at:AS_OF});
  captureDemoReporting(db,previous,AS_OF);expect(request(db,'activity').total).toBe(1);expect(request(db,'activity').events[0].event_id).toBe('demo:business');
});
