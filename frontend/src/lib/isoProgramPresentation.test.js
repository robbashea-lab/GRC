import {isoProgramPresentation,isoSoaCounts} from './isoProgramPresentation';
import {frameworkDashboardFixture} from '../testUtils/frameworkDashboard';

const present=fixture=>isoProgramPresentation(fixture.source,fixture.client.client_id);
const nativeRows=fixture=>fixture.source.assessments;
const isControl=row=>row.definition_id.startsWith('A.');
function freeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);Object.values(value).forEach(freeze);
  }
  return value;
}
beforeEach(()=>jest.useFakeTimers().setSystemTime(new Date('2026-10-31T12:00:00Z')));
afterEach(()=>jest.useRealTimers());

test('overall is the reconciled native weighted population, never an average or a second SoA assessment',()=>{
  const fixture=frameworkDashboardFixture();
  for(const row of nativeRows(fixture))row.status=isControl(row)?'not_assessed':'addressed';
  const controls=nativeRows(fixture).filter(isControl);
  Object.assign(controls[0],{status:'addressed',soa_applicability:'included'});
  Object.assign(controls[1],{status:'addressed',soa_applicability:'excluded'});
  Object.assign(controls[2],{status:'addressed',soa_applicability:'',soa_justification:''});
  fixture.refresh();const result=present(fixture),position=fixture.source.implementation_position;
  expect(result.available).toBe(true);
  expect(result.overall).toMatchObject({total:123,applicable:121,addressed:31,partial:0,gap:0,notAssessed:90,assessed:31,na:1,scopeUndetermined:1,available:true});
  expect(result.requirements).toMatchObject({total:30,applicable:30,addressed:30,assessed:30});
  expect(result.annex).toMatchObject({total:93,applicable:91,addressed:1,assessed:1,na:1,scopeUndetermined:1});
  expect(result.overall.addressed/result.overall.applicable*100).toBe(position.percentage);
  expect(result.overall.addressed/result.overall.applicable).not.toBe((result.requirements.addressed/result.requirements.applicable+result.annex.addressed/result.annex.applicable)/2);
  expect(result.overall.applicable).toBe(result.requirements.applicable+result.annex.applicable);
  expect(result.soa).toMatchObject({total:93,applicable:91,excluded:1,undetermined:1,decided:92,documented:92,missingJustification:0,outstanding:1,available:true,countsAvailable:true});
});

test('all four saved status buckets and assessed coverage reconcile independently of verification',()=>{
  const fixture=frameworkDashboardFixture();
  nativeRows(fixture).forEach((row,index)=>{row.status=['addressed','in_progress','needs_attention','not_assessed'][index%4];row.verification=index%2?'verified':'not_verified';});
  fixture.refresh();const result=present(fixture),rows=nativeRows(fixture);
  const counts=Object.fromEntries(['addressed','in_progress','needs_attention','not_assessed'].map(key=>[key,rows.filter(row=>row.status===key).length]));
  expect(result.overall).toMatchObject({applicable:rows.length,addressed:counts.addressed,partial:counts.in_progress,gap:counts.needs_attention,notAssessed:counts.not_assessed,assessed:rows.length-counts.not_assessed});
  nativeRows(fixture).forEach(row=>{row.verification=row.verification==='verified'?'not_verified':'verified';});
  expect(present(fixture).overall).toEqual(result.overall);
});

test('section/group SoA documentation uses the same recognized-decision and native-rationale rule',()=>{
  const rows=freeze([
    {specification:'isms_clause',status:'addressed',soa_applicability:'included',soa_justification:'Does not turn a clause into a control'},
    {specification:'annex_control',status:'not_assessed',soa_applicability:'included',soa_justification:'Actual saved scope basis'},
    {specification:'annex_control',status:'addressed',soa_applicability:'excluded',soa_justification:'Actual saved exclusion basis'},
    {specification:'annex_control',status:'addressed',soa_applicability:'included',soa_justification:' \n '},
    {specification:'annex_control',status:'addressed',soa_applicability:'',soa_justification:'Context alone is not a decision'},
    {specification:'annex_control',status:'in_progress',soa_applicability:'excluded'},
  ]),before=JSON.stringify(rows);
  expect(isoSoaCounts(rows)).toEqual({total:5,applicable:2,excluded:2,undetermined:1,decided:4,documented:2,missingJustification:2,outstanding:3});
  expect(isoSoaCounts()).toEqual({total:0,applicable:0,excluded:0,undetermined:0,decided:0,documented:0,missingJustification:0,outstanding:0});
  expect(JSON.stringify(rows)).toBe(before);
});

test('native catalog specification remains authoritative when a saved record repeats stale mapping metadata',()=>{
  const fixture=frameworkDashboardFixture(),before=present(fixture);
  nativeRows(fixture).find(isControl).specification='isms_clause';
  expect(present(fixture).soa).toEqual(before.soa);expect(present(fixture).overall).toEqual(before.overall);
});

test('audit work, unrelated framework rows outside this source and presentation metadata never enter the implementation population',()=>{
  const fixture=frameworkDashboardFixture(),before=present(fixture);
  fixture.source.audit_program={status:'completed',complete:500,total:500};
  fixture.source.reviews=[{iso_audit:{items:{fake:{status:'reviewed',result:'conforming'}}}}];
  fixture.source.system_description_complete=true;
  expect(present(fixture)).toEqual(before);
});

test('all excluded Annex controls have no applicable implementation denominator or invented completion',()=>{
  const fixture=frameworkDashboardFixture();
  nativeRows(fixture).filter(isControl).forEach(row=>Object.assign(row,{soa_applicability:'excluded',status:'addressed'}));
  nativeRows(fixture).filter(row=>!isControl(row)).forEach(row=>{row.status='not_assessed';});
  fixture.refresh();const result=present(fixture);
  expect(result.available).toBe(true);
  expect(result.annex).toMatchObject({total:93,applicable:0,addressed:0,assessed:0,na:93,scopeUndetermined:0});
  expect(result.overall).toMatchObject({applicable:30,addressed:0,notAssessed:30,na:93});
  expect(result.soa).toMatchObject({documented:93,outstanding:0});
});

test('undetermined applicability is honest even when every control retains an Implemented conclusion',()=>{
  const fixture=frameworkDashboardFixture();
  nativeRows(fixture).filter(isControl).forEach(row=>Object.assign(row,{soa_applicability:'',soa_justification:'Retained context is not an applicability decision',status:'addressed'}));
  fixture.refresh();const result=present(fixture);
  expect(result.available).toBe(true);expect(result.annex).toMatchObject({applicable:0,addressed:0,scopeUndetermined:93});
  expect(result.soa).toMatchObject({decided:0,documented:0,missingJustification:0,outstanding:93});
  expect(result.overall.addressed).toBe(result.requirements.addressed);
});

test('recorded SoA decisions lacking required rationale remain diagnostic outstanding; implementation stays unavailable',()=>{
  const fixture=frameworkDashboardFixture(),controls=nativeRows(fixture).filter(isControl);
  Object.assign(controls[0],{soa_applicability:'included',soa_justification:' \n '});
  Object.assign(controls[1],{soa_applicability:'excluded',soa_justification:''});
  Object.assign(controls[2],{soa_applicability:'',soa_justification:''});
  fixture.refresh();const before=JSON.stringify(fixture.source),result=present(fixture);
  expect(result.available).toBe(false);
  for(const summary of [result.overall,result.requirements,result.annex])expect(summary).toMatchObject({available:false,addressed:null,applicable:null,assessed:null});
  expect(result.soa).toMatchObject({available:false,countsAvailable:true,total:93,decided:92,documented:90,missingJustification:2,outstanding:3});
  expect(JSON.stringify(fixture.source)).toBe(before);
});

test.each(['4.1','A.5.1'])('legacy invalid N/A on %s never earns implementation credit or a smaller denominator',id=>{
  const fixture=frameworkDashboardFixture(),row=nativeRows(fixture).find(item=>item.definition_id===id);
  row.status='not_applicable';row.na_rationale='Retained invalid implementation exclusion';
  fixture.refresh();const before=JSON.stringify(fixture.source),result=present(fixture);
  expect(result.available).toBe(false);expect(result.overall.applicable).toBeNull();expect(result.overall.addressed).toBeNull();
  expect(result.soa.countsAvailable).toBe(true);expect(JSON.stringify(fixture.source)).toBe(before);
});

test.each([
  ['missing record',fixture=>{fixture.source.assessments.pop();}],
  ['duplicate definition record',fixture=>{fixture.source.assessments.push({...fixture.source.assessments[0],framework_assessment_id:'duplicate-native-id'});}],
  ['duplicate assessment identity',fixture=>{fixture.source.assessments[1].framework_assessment_id=fixture.source.assessments[0].framework_assessment_id;}],
  ['foreign client',fixture=>{fixture.source.assessments[0].client_id='foreign';}],
  ['foreign framework',fixture=>{fixture.source.assessments[0].framework_key='soc-2';}],
  ['wrong assessment version',fixture=>{fixture.source.assessments[0].framework_version='unsupported-version';}],
  ['wrong catalog version',fixture=>{fixture.source.framework={...fixture.source.framework,version:'unsupported-version'};}],
  ['missing definition',fixture=>{fixture.source.definitions=fixture.source.definitions.slice(1);}],
  ['duplicate definition',fixture=>{fixture.source.definitions=[...fixture.source.definitions,fixture.source.definitions[0]];}],
  ['changed native mapping',fixture=>{fixture.source.definitions=fixture.source.definitions.map((row,index)=>index?row:{...row,control:'invented'});}],
  ['mismatched canonical program',fixture=>{fixture.source.implementation_position={...fixture.source.implementation_position,program_id:'foreign:iso-27001'};}],
  ['mismatched canonical framework',fixture=>{fixture.source.implementation_position.scope={...fixture.source.implementation_position.scope,framework_key:'soc-2'};}],
  ['mismatched canonical catalog',fixture=>{fixture.source.implementation_position.scope={...fixture.source.implementation_position.scope,catalog_version:'unsupported-version'};}],
  ['mismatched canonical subject scope',fixture=>{fixture.source.implementation_position.scope={...fixture.source.implementation_position.scope,definition_ids:[]};}],
  ['mismatched active scope',fixture=>{fixture.source.active_definition_ids=[];}],
  ['malformed source',fixture=>{fixture.source.assessments=[null];}],
  ['malformed rationale type',fixture=>{fixture.source.assessments.find(isControl).soa_justification=42;}],
])('%s fails closed for implementation and cannot become a trusted SoA diagnostic',(_name,change)=>{
  const fixture=frameworkDashboardFixture();change(fixture);const before=JSON.stringify(fixture.source),result=present(fixture);
  expect(result.available).toBe(false);expect(result.reason).toBeTruthy();
  expect(result.overall).toMatchObject({available:false,total:null,addressed:null,applicable:null});
  expect(result.soa).toMatchObject({available:false,countsAvailable:false,total:null,documented:null,outstanding:null});
  expect(result.sourceAsOf).toBeNull();expect(JSON.stringify(fixture.source)).toBe(before);
});

test.each(['unavailable','partial'])('canonical %s availability never falls back to a row-only percentage',availability=>{
  const fixture=frameworkDashboardFixture();fixture.source.implementation_position={...fixture.source.implementation_position,availability};
  const result=present(fixture);
  expect(result.available).toBe(false);expect(result.overall.addressed).toBeNull();
  expect(result.soa).toMatchObject({available:false,countsAvailable:true,total:93,documented:93,outstanding:0});
});

test('canonical count mismatch never falls back to an independently invented implementation result',()=>{
  const fixture=frameworkDashboardFixture();fixture.source.implementation_position={...fixture.source.implementation_position,implemented:999};
  const result=present(fixture);expect(result.available).toBe(false);expect(result.overall.addressed).toBeNull();expect(result.soa.countsAvailable).toBe(true);
});

test('an unknown saved implementation status remains unavailable without suppressing valid SoA documentation diagnostics',()=>{
  const fixture=frameworkDashboardFixture();nativeRows(fixture)[0].status='unrecognized-native-value';fixture.refresh();
  const before=JSON.stringify(fixture.source),result=present(fixture);
  expect(result.available).toBe(false);expect(result.overall.addressed).toBeNull();expect(result.overall.notAssessed).toBeNull();
  expect(result.soa).toMatchObject({available:false,countsAvailable:true,documented:93,outstanding:0});
  expect(JSON.stringify(fixture.source)).toBe(before);
});

test('empty and unconfigured native scopes remain unavailable, not zero or 100-percent complete',()=>{
  for(const source of [null,{}, {selected:true,configured:false,definitions:[],assessments:[]}]){
    const result=isoProgramPresentation(source,'synthetic-empty');
    expect(result.available).toBe(false);expect(result.overall.applicable).toBeNull();expect(result.overall.addressed).toBeNull();
    expect(result.soa.countsAvailable).toBe(false);expect(result.sourceAsOf).toBeNull();
  }
});

test('As of uses only the validated native source timestamp, without assessment-judgment or current-time claims',()=>{
  const fixture=frameworkDashboardFixture();
  fixture.source.implementation_position.provenance.source_as_of='2026-10-20T09:15:00-07:00';
  fixture.source.implementation_position.generated_at='2026-10-30T10:00:00Z';
  fixture.source.implementation_position.captured_at='2026-10-31T12:00:00Z';
  nativeRows(fixture)[0].assessment_recorded_at='2026-10-29T12:00:00Z';
  expect(present(fixture).sourceAsOf).toBe('2026-10-20T16:15:00.000Z');
});

test.each([undefined,null,'','not-a-date','2026-10-20','2026-10-20T09:15:00','2026-02-30T12:00:00Z','2026-10-20T25:00:00Z','2026-11-01T00:00:00Z'])('missing, invalid, ambiguous or future source As-of %p has no substitute',value=>{
  const fixture=frameworkDashboardFixture();fixture.source.implementation_position.provenance.source_as_of=value;
  fixture.source.implementation_position.generated_at='2026-10-30T10:00:00Z';
  fixture.source.implementation_position.captured_at='2026-10-31T12:00:00Z';
  expect(present(fixture).sourceAsOf).toBeNull();
});

test('immutable current, new and later-enrolled sources use the same native presentation without changing other frameworks',()=>{
  for(const clientId of ['demo_dunder','synthetic-new-iso','synthetic-later-mixed']){
    const fixture=frameworkDashboardFixture('iso-27001',undefined,clientId);
    fixture.source.assessments.forEach(row=>{row.implementation='Retained native narrative';row.assessment_history=[{status:row.status,at:'2026-10-01T00:00:00Z',soa_applicability:row.soa_applicability}];});
    const unrelated={framework_key:'cis-ig1',framework_assessment_id:clientId+':cis:1.1',status:'in_progress',implementation:'Keep native CIS data'};
    fixture.db.framework_assessments=[...fixture.db.framework_assessments,unrelated];
    const before=JSON.stringify(fixture.source),other=JSON.stringify(unrelated);freeze(fixture.source);
    const result=present(fixture);
    expect(result.available).toBe(true);expect(result.overall.total).toBe(123);
    expect(JSON.stringify(fixture.source)).toBe(before);expect(JSON.stringify(unrelated)).toBe(other);
  }
});
