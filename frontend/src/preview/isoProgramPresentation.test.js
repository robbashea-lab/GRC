import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {readStore,STORE_KEY} from './store';
import {FRAMEWORKS,frameworkCatalog} from '../lib/frameworks';
import {isoProgramPresentation} from '../lib/isoProgramPresentation';
import baseline from '@catalogs/onboardingCatalog.json';

// This is the native Demo adapter over Jest's disposable in-memory storage,
// not an authenticated backend or a native-browser/reload acceptance check.
const api=axios.create({adapter:previewAdapter}),KEY='iso-27001';
const catalog=frameworkCatalog(KEY),definitions=catalog.requirements;
const state=programs=>({version:3,step:3,policies:Object.fromEntries(baseline.policies.map(policy=>[policy.key,'unsure'])),requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,programs.includes(framework.key)?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}});
const workspace=async(clientId,framework=KEY,connection=api)=>(await connection.get('/frameworks/'+framework,{params:{client_id:clientId}})).data;
const configure=(clientId,programs)=>api.post('/onboarding/baseline',{client_id:clientId,state:state(programs),finalize:true});
const create=async name=>(await api.post('/clients',{name})).data.client_id;
const patch=(row,body)=>api.patch('/framework_assessments/'+row.framework_assessment_id,{...body,expected_last_assessed:row.last_saved??row.last_assessed??null});
const joinedRows=source=>source.definitions.map(definition=>({...definition,...source.assessments.find(row=>row.definition_id===definition.id)}));
const nativeRecords=(clientId,iso=true)=>readStore().framework_assessments.filter(row=>row.client_id===clientId&&(iso?row.framework_key===KEY:row.framework_key!==KEY));

function present(source,clientId){
  const original=JSON.stringify(source),persisted=sessionStorage.getItem(STORE_KEY),result=isoProgramPresentation(source,clientId);
  expect(JSON.stringify(source)).toBe(original);expect(sessionStorage.getItem(STORE_KEY)).toBe(persisted);
  return result;
}

function reconcile(source,clientId){
  const result=present(source,clientId),rows=joinedRows(source),clauses=rows.filter(row=>row.specification==='isms_clause'),controls=rows.filter(row=>row.specification==='annex_control'),included=controls.filter(row=>row.soa_applicability==='included');
  expect(result.available).toBe(true);expect(result.soa.countsAvailable).toBe(true);
  for(const [summary,population,eligible] of [[result.overall,rows,[...clauses,...included]],[result.requirements,clauses,clauses],[result.annex,controls,included]]){
    expect(summary.total).toBe(population.length);expect(summary.applicable).toBe(eligible.length);
    expect(summary.addressed).toBe(eligible.filter(row=>row.status==='addressed').length);
    expect(summary.partial).toBe(eligible.filter(row=>row.status==='in_progress').length);
    expect(summary.gap).toBe(eligible.filter(row=>row.status==='needs_attention').length);
    expect(summary.notAssessed).toBe(eligible.filter(row=>row.status==='not_assessed').length);
    expect(summary.assessed).toBe(eligible.filter(row=>row.status!=='not_assessed').length);
    expect(summary.addressed+summary.partial+summary.gap+summary.notAssessed).toBe(summary.applicable);
  }
  expect(result.overall.applicable).toBe(source.implementation_position.denominator);
  expect(result.overall.addressed).toBe(source.implementation_position.implemented);
  expect(result.overall.total).toBe(definitions.length);
  expect(result.overall.applicable).toBe(result.requirements.applicable+result.annex.applicable);
  expect(result.soa.total).toBe(controls.length);
  expect(result.soa.decided).toBe(controls.filter(row=>['included','excluded'].includes(row.soa_applicability)).length);
  expect(result.soa.documented).toBe(controls.filter(row=>['included','excluded'].includes(row.soa_applicability)&&typeof row.soa_justification==='string'&&!!row.soa_justification.trim()).length);
  expect(result.soa.outstanding).toBe(result.soa.total-result.soa.documented);
  expect(result.overall.na).toBe(result.soa.excluded);expect(result.overall.scopeUndetermined).toBe(result.soa.undetermined);
  expect(result.sourceAsOf).toBe(new Date(source.implementation_position.provenance.source_as_of).toISOString());
  return result;
}

beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});

test('canonical Dunder native workspace reconciles clauses, included controls and SoA without touching current records or history',async()=>{
  const source=await workspace('demo_dunder'),before=nativeRecords('demo_dunder');
  expect(source.selected).toBe(true);expect(source.framework.version).toBe(catalog.version);
  expect(source.active_definition_ids).toEqual(definitions.map(definition=>definition.id));
  expect(new Set(source.assessments.map(row=>row.framework_assessment_id)).size).toBe(definitions.length);
  const result=reconcile(source,'demo_dunder');
  expect(result.requirements.applicable).toBe(definitions.filter(definition=>definition.specification==='isms_clause').length);
  expect(result.soa.excluded).toBeGreaterThan(0);expect(result.soa.undetermined).toBeGreaterThan(0);
  expect(result.overall.addressed).toBeGreaterThan(0);expect(result.overall.partial).toBeGreaterThan(0);expect(result.overall.gap).toBeGreaterThan(0);expect(result.overall.notAssessed).toBeGreaterThan(0);
  expect(nativeRecords('demo_dunder')).toEqual(before);
});

test('fresh explicitly enrolled ISO has truthful unassessed requirements and unresolved SoA, without seeded audit or implementation claims',async()=>{
  const clientId=await create('QA ISO presentation fresh enrollment');
  const inactive=await workspace(clientId);expect(inactive.selected).toBe(false);expect(inactive.assessments).toEqual([]);expect(present(inactive,clientId).available).toBe(false);
  await configure(clientId,[KEY]);const source=await workspace(clientId),result=reconcile(source,clientId);
  expect(source.assessments.every(row=>row.status==='not_assessed'&&!row.implementation)).toBe(true);
  expect(result.requirements.assessed).toBe(0);expect(result.overall.addressed).toBe(0);expect(result.overall.assessed).toBe(0);
  expect(result.annex.applicable).toBe(0);expect(result.soa.decided).toBe(0);expect(result.soa.documented).toBe(0);expect(result.soa.outstanding).toBe(result.soa.total);
  expect(result.overall.applicable).toBe(result.requirements.total);expect(result.overall.scopeUndetermined).toBe(result.soa.total);
  expect((await api.get('/iso-audit',{params:{client_id:clientId}})).data).toEqual({program:null,reviews:[]});
});

test('a native SoA/Annex assessment save updates one implementation population and survives a new adapter reading the saved fixture',async()=>{
  const clientId=await create('QA ISO presentation native save and fixture reload');await configure(clientId,[KEY]);
  const initial=await workspace(clientId),original=initial.assessments.find(row=>row.definition_id==='A.5.1');
  const saved=(await patch(original,{soa_applicability:'included',soa_justification:'Disposable scoped risk-treatment decision',status:'in_progress',implementation:'Recorded partial implementation in the native ISO editor contract.'})).data;
  const after=await workspace(clientId),first=reconcile(after,clientId);
  expect(after.assessments.find(row=>row.definition_id==='A.5.1')).toEqual(saved);
  expect(first.overall.applicable).toBe(first.requirements.total+1);expect(first.overall.partial).toBe(1);expect(first.overall.assessed).toBe(1);
  expect(first.soa.decided).toBe(1);expect(first.soa.documented).toBe(1);expect(first.soa.outstanding).toBe(first.soa.total-1);
  const persisted=nativeRecords(clientId),connection=axios.create({adapter:previewAdapter});
  const reloaded=await workspace(clientId,KEY,connection),second=reconcile(reloaded,clientId);
  expect(second).toEqual(first);expect(nativeRecords(clientId)).toEqual(persisted);
  expect(reloaded.assessments.filter(row=>row.definition_id==='A.5.1')).toEqual([saved]);
  expect(reloaded.assessments.find(row=>row.definition_id==='A.5.1').assessment_history).toEqual(saved.assessment_history);
  expect(new Set(reloaded.assessments.map(row=>row.framework_assessment_id)).size).toBe(definitions.length);
},60000);

test('adding ISO later to a mixed CIS/SOC client is repeatable and presentation preserves existing program records and saved narratives',async()=>{
  const clientId=await create('QA ISO presentation later mixed enrollment');await configure(clientId,['cis-ig1','soc-2']);
  const cis=await workspace(clientId,'cis-ig1'),soc=await workspace(clientId,'soc-2');
  await patch(cis.assessments[0],{notes:'Preserve this pre-existing CIS QA note.'});
  await patch(soc.assessments[0],{notes:'Preserve this pre-existing SOC QA note.'});
  const before=nativeRecords(clientId,false),socConfiguration=soc.configuration;
  for(let attempt=0;attempt<2;attempt++)await api.patch('/onboarding/programs/'+KEY,{client_id:clientId,applicability:'applies'});
  const source=await workspace(clientId),result=reconcile(source,clientId);
  expect(result.overall.addressed).toBe(0);expect(result.soa.undetermined).toBe(result.soa.total);
  expect(nativeRecords(clientId,false)).toEqual(before);
  expect((await workspace(clientId,'soc-2')).configuration).toEqual(socConfiguration);
  expect(new Set(source.assessments.map(row=>row.framework_assessment_id)).size).toBe(definitions.length);
  expect(source.assessments.every(row=>row.client_id===clientId&&row.framework_key===KEY&&row.status==='not_assessed')).toBe(true);
  const saved=readStore();present(await workspace(clientId),clientId);expect(readStore()).toEqual(saved);
},60000);
