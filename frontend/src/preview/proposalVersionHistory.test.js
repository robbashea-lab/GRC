import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {buildLegacyDemoStore,readStore,saveStore} from './store';
import {FRAMEWORKS} from '../lib/frameworks';
import baseline from '@catalogs/onboardingCatalog.json';
import {socGuidedCatalog,socQuestions,socGuidedResult} from '../lib/socGuidedAssessment';
import {isoGuidedCatalog,isoQuestions,isoGuidedResult} from '../lib/isoGuidedAssessment';

const api=axios.create({adapter:previewAdapter});
const copy=value=>JSON.parse(JSON.stringify(value));
const families=[
  ['SOC','soc-2','CC1.1',socGuidedCatalog,socQuestions,socGuidedResult,'soc2-assessment-rollout-1','soc2-assessment-rollout-2'],
  ['ISO','iso-27001','4.1',isoGuidedCatalog,isoQuestions,isoGuidedResult,'iso27001-assessment-rollout-1','iso27001-assessment-rollout-2'],
];
const concerns=[
  ['gap',{additional_gap:'Yes',gaps:'A scoped practice is confirmed missing.'},'needs_attention'],
  ['confirmation',{additional_confirmation:'Yes',unknowns:'Confirm the unresolved scoped practice.'},'not_assessed'],
];
const scenarios=families.flatMap(family=>concerns.map(concern=>[family[0],concern[0],family,concern]));
const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(policy=>[policy.key,'unsure'])),
  requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,['soc-2','iso-27001'].includes(framework.key)?'applies':'does_not_apply'])),
  reviews:[],framework_reviews:{}};
const source=draft=>Object.fromEntries(['version','revision','generated_at'].map(key=>[key,draft[key]]));
const write=draft=>({version:draft.version,answers:draft.answers,step:draft.step,completed:draft.completed,
  narrative:draft.narrative,result:draft.result,summary_review:draft.summary_review,expected_revision:draft.revision});

function complete(id,questions,version,extra){
  const answers={};
  for(let pass=0;pass<30;pass++){
    const missing=questions(id,answers,version).filter(question=>!Object.hasOwn(answers,question.id));
    if(!missing.length)break;
    for(const question of missing)answers[question.id]=question.type==='text'?'':question.type==='context'?'Relevant':question.optional?'No':'Yes';
  }
  return {...answers,...extra};
}

async function assessment(framework,id){
  const client=(await api.post('/clients',{name:'SYNTHETIC proposal-version history fixture'})).data;
  await api.post('/onboarding/baseline',{client_id:client.client_id,state,finalize:true});
  const workspace=(await api.get('/frameworks/'+framework,{params:{client_id:client.client_id}})).data;
  const row=workspace.assessments.find(item=>item.definition_id===id);
  expect(row).toBeTruthy();
  const path='/framework_assessments/'+row.framework_assessment_id;
  return {client,path,route:path+'/guided-assessment',native:(await api.get(path)).data};
}

beforeEach(async()=>{
  localStorage.clear();sessionStorage.clear();
  // Disposable native-route fixture; normal bundled-fresh installation has separate coverage.
  saveStore(buildLegacyDemoStore(new Date('2026-11-02T12:00:00.000Z')));
  await api.post('/demo/enter');
});

test.each(families)('%s already-applied R1 acknowledgement is an exact native no-op under R2',async(label,framework,id,catalog,questions,evaluate,r1,r2)=>{
  expect(catalog.version).toBe(r2);
  const {client,path,route,native}=await assessment(framework,id);
  const answers=complete(id,questions,r1,{additional_gap:'No',additional_confirmation:'No'});
  const result=evaluate(id,answers,r1,client.name);
  expect(result.status).toBe('addressed');expect(result.signals).toEqual([]);
  const at='2026-10-01T12:00:00.000Z',db=readStore(),actor=db.user.user_id;
  // Model an already-recorded historical transaction, including its now-stale opaque lineage.
  const old={version:r1,answers,step:0,completed:true,revision:7,narrative:result.narrative,result,
    summary_review:{version:r1,answers},updated_at:at,generated_at:at,client_id:client.client_id,
    assessment_id:native.framework_assessment_id,user_id:actor,base_assessment_token:at,base_scope_fingerprint:'1'.repeat(64)};
  const recordedSource={...source(old),origin:'guided-assessment-pilot',answers,by:actor,
    base_assessment_token:old.base_assessment_token,base_scope_fingerprint:old.base_scope_fingerprint};
  const recorded=db.framework_assessments.find(row=>row.framework_assessment_id===native.framework_assessment_id);
  Object.assign(recorded,{implementation:old.narrative,status:result.status,last_saved:at,last_assessed:at,
    guided_assessment_source:recordedSource,items_to_address:[],items_revision:0,
    assessment_history:[...(recorded.assessment_history||[]),{at,by:actor,status:result.status,implementation:old.narrative,guided_assessment_source:recordedSource}]});
  (db.guided_assessment_pilot||={})[native.framework_assessment_id+':'+actor]=old;saveStore(db);
  const retained=(await api.get(route)).data;
  expect(retained.version).toBe(r1);expect(retained.lineage_stale).toBe(true);
  const before=(await api.get(path)).data,stored=readStore();
  const payload={implementation:old.narrative,status:result.status,guided_assessment_source:source(old),expected_last_assessed:at};
  expect((await api.patch(path,payload)).data).toEqual(before);
  expect(readStore()).toEqual(stored);
  await expect(api.patch(path,{...payload,implementation:old.narrative+' Unreviewed change.'})).rejects.toMatchObject({response:{status:409}});
  expect((await api.get(path)).data).toEqual(before);expect(readStore()).toEqual(stored);
});

test.each(scenarios)('%s retained R1 %s survives reads and only an explicit restart creates empty R2',async(label,concernLabel,family,concern)=>{
  const [,framework,id,catalog,questions,evaluate,r1,r2]=family;
  const [,extra,expectedR2]=concern;
  expect(catalog.version).toBe(r2);
  const {client,path,route,native}=await assessment(framework,id);
  const answers=complete(id,questions,r1,extra),beforeAnswers=copy(answers);
  const historical=evaluate(id,answers,r1,client.name);
  expect(historical.status).toBe('addressed');
  expect(evaluate(id,answers,r2,client.name).status).toBe(expectedR2);
  expect(answers).toEqual(beforeAnswers);
  const old={version:r1,answers,step:1,completed:true,revision:7,
    narrative:'Exact retained client-reviewed R1 wording — '+concernLabel,
    updated_at:'2026-10-01T12:01:00.000Z',generated_at:'2026-10-01T12:00:00.000Z',
    client_id:client.client_id,assessment_id:native.framework_assessment_id,
    result:{...historical,narrative:'Exact retained client-reviewed R1 wording — '+concernLabel},
    summary_review:{version:r1,answers}};
  const db=readStore();old.user_id=db.user.user_id;
  const key=native.framework_assessment_id+':'+old.user_id;
  // Imported pre-lineage R1 state is formed explicitly; defaults stay unpatched for every API read/write.
  (db.guided_assessment_pilot||={})[key]=copy(old);saveStore(db);
  const storedBefore=readStore();
  const retained=(await api.get(route)).data;
  expect(Object.fromEntries(Object.keys(old).map(key=>[key,retained[key]]))).toEqual(old);
  expect(retained.lineage_known).toBe(false);
  expect((await api.get(route+'/history')).data.items).toEqual([]);
  expect((await api.get(path)).data).toEqual(native);
  expect(readStore()).toEqual(storedBefore);

  // A same-version no-op can be acknowledged, but cannot silently change question versions or apply old output.
  expect((await api.put(route,write(old))).data).toEqual(retained);
  await expect(api.put(route,{...write(old),expected_revision:6})).rejects.toMatchObject({response:{status:409}});
  await expect(api.put(route,{...write(old),version:r2})).rejects.toMatchObject({response:{status:409}});
  await expect(api.patch(path,{implementation:old.narrative,status:historical.status,guided_assessment_source:source(old),
    expected_last_assessed:native.last_saved??native.last_assessed??null})).rejects.toMatchObject({response:{status:409}});
  expect(readStore()).toEqual(storedBefore);

  const restart={version:r2,answers:{},step:0,completed:false,narrative:'',summary_review:null,result:null,
    expected_revision:old.revision,restart:true,base_assessment_token:retained.current_assessment_token,
    base_scope_fingerprint:retained.current_scope_fingerprint};
  const fresh=(await api.put(route,restart)).data;
  expect(fresh).toMatchObject({version:r2,answers:{},step:0,completed:false,narrative:'',revision:8,result:null,summary_review:null,lineage_known:true,lineage_stale:false});
  expect(fresh.generated_at).toBeNull();
  expect((await api.get(route)).data).toEqual(fresh);
  expect((await api.get(route+'/history')).data).toEqual({items:[old],has_more:false,next_before_revision:null});
  expect(readStore().guided_assessment_history[key+':7']).toEqual(old);
  await expect(api.put(route,restart)).rejects.toMatchObject({response:{status:409}});
  expect((await api.get(path)).data).toEqual(native);
});

test.each(scenarios)('%s completed R2 %s requires separate native assessment Save and exact replay adds no history',async(label,concernLabel,family,concern)=>{
  const [,framework,id,catalog,questions,evaluate,,r2]=family;
  const [,extra,expected]=concern;
  expect(catalog.version).toBe(r2);
  const {client,path,route,native}=await assessment(framework,id);
  const initial=(await api.get(route)).data;
  expect(initial).toMatchObject({version:r2,answers:{},revision:0});
  const answers=complete(id,questions,r2,extra),result=evaluate(id,answers,r2,client.name);
  expect(result.status).toBe(expected);
  const body={version:r2,answers,step:0,completed:true,narrative:result.narrative,result,summary_review:{version:r2,answers},
    expected_revision:initial.revision,base_assessment_token:initial.current_assessment_token,base_scope_fingerprint:initial.current_scope_fingerprint};
  const draft=(await api.put(route,body)).data;
  expect(draft.result).toEqual(result);expect(draft.answers).toEqual(answers);
  expect((await api.get(route)).data).toEqual(draft);
  expect((await api.get(path)).data).toEqual(native);
  expect((await api.get(route+'/history')).data.items).toEqual([]);
  await expect(api.put(route,body)).rejects.toMatchObject({response:{status:409}});
  expect((await api.put(route,{...body,expected_revision:draft.revision})).data).toEqual(draft);
  expect((await api.get(path)).data).toEqual(native);

  const payload={implementation:draft.narrative,status:result.status,guided_assessment_source:source(draft),
    expected_last_assessed:native.last_saved??native.last_assessed??null};
  const saved=(await api.patch(path,payload)).data;
  expect(saved.status).toBe(expected);expect(saved.implementation).toBe(draft.narrative);
  expect(saved.verification).toEqual(native.verification);
  expect(saved.owner_id).toEqual(native.owner_id);expect(saved.process_owner_id).toEqual(native.process_owner_id);
  expect(saved.related_links).toEqual(native.related_links);
  expect(saved.assessment_history).toHaveLength((native.assessment_history||[]).length+1);
  expect(saved.assessment_history.slice(0,-1)).toEqual(native.assessment_history||[]);
  expect(saved.guided_assessment_source).toMatchObject({...source(draft),answers,by:draft.user_id});
  expect(saved.assessment_history.at(-1).guided_assessment_source).toEqual(saved.guided_assessment_source);
  expect((await api.get(path)).data).toEqual(saved);
  const afterSave=readStore();
  expect((await api.patch(path,{...payload,expected_last_assessed:saved.last_saved??saved.last_assessed})).data).toEqual(saved);
  expect(readStore()).toEqual(afterSave);
});
