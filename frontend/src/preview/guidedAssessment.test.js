import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {guidedCatalog} from '../lib/guidedAssessment';
const api=axios.create({adapter:previewAdapter});
let row,path;
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');const w=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;row=w.assessments.find(a=>a.definition_id==='1.1');path='/framework_assessments/'+row.framework_assessment_id+'/guided-assessment';});
const body={version:guidedCatalog.version,answers:{inventory:'No',existing:'Manual list'},step:1,completed:false,expected_revision:0};
test('save and resume leave native assessment evidence and history unchanged',async()=>{
  const first=(await api.put(path,body)).data;expect(first.revision).toBe(1);
  expect((await api.get(path)).data.answers).toEqual(body.answers);
  expect((await api.get('/framework_assessments/'+row.framework_assessment_id)).data).toEqual(row);
  await expect(api.put(path,body)).rejects.toMatchObject({response:{status:409}});
});
test('Apply uses normal save and preserves verification and history attribution',async()=>{
  const draft=(await api.put(path,{...body,completed:true})).data,source=Object.fromEntries(['version','revision','generated_at'].map(k=>[k,draft[k]]));
  const result=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Brawndo reports no inventory.',status:'needs_attention',guided_assessment_source:source})).data;
  expect(result.verification).toBe(row.verification);expect(result.last_assessed).toBeTruthy();
  expect(result.assessment_history.at(-1).guided_assessment_source.answers).toEqual(body.answers);
  expect(result.related_links).toEqual(row.related_links);
  const edited=(await api.patch('/framework_assessments/'+row.framework_assessment_id,{implementation:'Manual correction'})).data;
  expect(edited.guided_assessment_source).toBeNull();
});
test('other clients and frameworks reject interview access',async()=>{
  for(const [framework,cid] of [['cis-ig1','demo_initech'],['soc-2','demo_prestige'],['iso-27001','demo_dunder']]){
    const w=(await api.get('/frameworks/'+framework,{params:{client_id:cid}})).data;
    if(w.assessments?.length)await expect(api.get('/framework_assessments/'+w.assessments[0].framework_assessment_id+'/guided-assessment')).rejects.toMatchObject({response:{status:404}});
  }
});
