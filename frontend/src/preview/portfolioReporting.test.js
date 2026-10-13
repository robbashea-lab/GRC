import {activeDefinitions,frameworkCatalog} from '../lib/frameworks';
import {cisSummary} from '../lib/cisVerification';
import {isoProgramMetrics} from '../lib/isoProgramMetrics';
import {captureDemoReporting,demoCurrentPositions,demoRangeStart,portfolioReportingRequest} from './portfolioReporting';

const AS_OF='2026-10-13T18:00:00.000Z';
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(keys=['cis-ig1'],configuration={}){
  const client={client_id:'isolated',name:'Isolated local reporting fixture',status:'active',framework_settings:configuration};
  return {user:{user_id:'owner',role:'super_admin',name:'Demo Owner'},users:[],clients:[client],baselines:{isolated:{completed:true}},requirements:keys.map(key=>({requirement_id:key,client_id:client.client_id,baseline_key:key,baseline_response:'applies',status:'active'})),
    framework_assessments:keys.flatMap(key=>activeDefinitions(key,key==='cis-ig1'?configuration[key]||{implementation_group:1}:configuration[key]).map(d=>({...d,definition_id:d.id,framework_assessment_id:key+':'+d.id,client_id:client.client_id,framework_key:key,framework_version:frameworkCatalog(key).version,status:'not_assessed',created_at:'2026-10-01T00:00:00.000Z'}))),findings:[],risks:[],policies:[],evidence:[],logs:[]};
}
const request=(db,kind,params={})=>portfolioReportingRequest(db,'/portfolio/reporting/'+kind,{client_ids:'isolated',...params});
beforeEach(()=>jest.useFakeTimers().setSystemTime(new Date(AS_OF)));
afterEach(()=>jest.useRealTimers());

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
  expect(result.snapshots).toHaveLength(1);expect(result.snapshots[0].provenance.label).toMatch(/no earlier saved history/);
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
  expect(result.comparison.scope_changed).toBe(true);expect(result.comparison.comparable).toBe(false);expect(result.comparison.change_pp).toBeNull();
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
  db.logs=[['policies','p1','approved',{}],['framework_assessments',db.framework_assessments[0].framework_assessment_id,'Framework assessment updated',{changed_fields:['implementation']}],['evidence','e1','upload',{}],['clients','isolated','CIS scope updated',{before:1,after:2}],['clients','isolated','CIS scope updated',{before:2,after:2}]].map(([entity_type,entity_id,action,meta],i)=>({audit_id:'native-'+i,entity_type,entity_id,client_id:'isolated',action,meta,at:AS_OF}));
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
    expect(result.snapshots[0].scope_signature).toBe(result.snapshots.at(-1).scope_signature);
    expect(result.scope_changes).toHaveLength(2);expect(result.comparison.scope_changed).toBe(true);
    expect(result.comparison.comparable).toBe(false);expect(result.comparison.change_pp).toBeNull();
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
  ].map(log=>({...log,at:AS_OF,client_id:'isolated'}));
  expect(request(db,'activity').total).toBe(0);
});
