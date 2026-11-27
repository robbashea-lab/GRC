import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY,readStore} from './store';
import {decodeDemoStore} from './demoStorageCodec';
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS} from '../lib/frameworks';

const api=axios.create({adapter:previewAdapter});
const keys=['cis-ig1','iso-27001','soc-2','hipaa','nist-csf-2','cmmc'];
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});

test.each(keys)('native %s Item Action persists in the existing Demo storage contract without a fabricated Finding',async key=>{
  const cid=(await api.post('/clients',{name:'SYNTHETIC Item Action QA '+key})).data.client_id;
  const state={version:3,step:3,policies:Object.fromEntries(baseline.policies.map(policy=>[policy.key,'unsure'])),
    requirements:Object.fromEntries(FRAMEWORKS.map(framework=>[framework.key,framework.key===key?'applies':'does_not_apply'])),reviews:[],framework_reviews:{}};
  await api.post('/onboarding/baseline',{client_id:cid,state,finalize:true});
  const workspace=(await api.get('/frameworks/'+key,{params:{client_id:cid}})).data;
  const row=workspace.assessments[0],path='/framework_assessments/'+row.framework_assessment_id;
  const before=readStore(),counts=[before.findings.filter(record=>record.client_id===cid).length,before.tasks.filter(record=>record.client_id===cid).length];
  const item_type=keys.indexOf(key)%2?'evidence':'confirmation';
  const added=(await api.post(path+'/items',{expected_revision:row.items_revision||0,request_id:'synthetic_demo_manual_'+key,
    item_type,text:'SYNTHETIC confirm the actual record — München Ω'})).data;
  const item=added.items_to_address.find(item=>item.request_id==='synthetic_demo_manual_'+key);
  expect(added.item_controls[item.item_id]).toMatchObject({origin:'manual',can_create_action:true,can_create_finding:false});
  const body={expected_revision:added.items_revision,title:'SYNTHETIC actual confirmation Action',priority:'medium',description:item.text};
  const options={headers:{'Idempotency-Key':'synthetic_demo_item_task_'+key}},route=path+'/items/'+encodeURIComponent(item.item_id)+'/task';
  const task=(await api.post(route,body,options)).data;
  expect(task).toMatchObject({client_id:cid,framework_assessment_id:row.framework_assessment_id,assessment_item_id:item.item_id,source_type:'other',source_id:null,status:'open'});
  expect(task.finding_id).toBeFalsy();expect((await api.post(route,body,options)).data).toEqual(task);
  expect(task).not.toHaveProperty('item_controls');expect(task).not.toHaveProperty('demo_date_metadata');
  const saved=(await api.get(path)).data,persisted=decodeDemoStore(sessionStorage.getItem(STORE_KEY));
  expect(saved.items_to_address.find(current=>current.item_id===item.item_id)).toMatchObject({task_id:task.task_id,state:'open'});
  expect(saved.item_controls[item.item_id].can_create_action).toBe(false);
  const stored=persisted.framework_assessments.find(current=>current.framework_assessment_id===row.framework_assessment_id);
  expect(stored.items_to_address).toEqual(saved.items_to_address);expect(stored).not.toHaveProperty('item_controls');
  expect(persisted.tasks.filter(current=>current.assessment_item_id===item.item_id)).toHaveLength(1);
  expect(persisted.findings.filter(current=>current.client_id===cid)).toHaveLength(counts[0]);
  expect(persisted.tasks.filter(current=>current.client_id===cid)).toHaveLength(counts[1]+1);
  for(const field of ['status','verification','implementation','last_assessed','last_saved','assessment_history'])expect(saved[field]).toEqual(row[field]);
});
