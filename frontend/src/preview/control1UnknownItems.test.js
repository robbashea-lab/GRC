import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {catalogForVersion} from '../lib/guidedAssessment';
import {omniCisSummary} from '../lib/omniCisSummary';

const api=axios.create({adapter:previewAdapter}),version='cis-v8.1-control1-5',catalog=catalogForVersion(version);
beforeEach(async()=>{
  sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');
  const current=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  await api.patch('/frameworks/cis-ig1/configuration',{client_id:'demo_brawndo',implementation_group:3,expected_updated_at:current.configuration.expected_updated_at},
    {headers:{'Idempotency-Key':'synthetic-root-confirmation-scope'}});
});

test.each(['1.3','1.4','1.5'])('%s Demo native apply produces genuine root clarification and unchanged repeat retains Item notes and assessment history',async id=>{
  const workspace=(await api.get('/frameworks/cis-ig1',{params:{client_id:'demo_brawndo'}})).data;
  const row=workspace.assessments.find(row=>row.definition_id===id),path='/framework_assessments/'+row.framework_assessment_id,root=catalog.definitions[id].root;
  const initial=(await api.get(path+'/guided-assessment')).data;
  const answers={[root]:'Not sure',[root+'_detail']:'Synthetic QA cannot confirm this practice.',additional_gap:'No',additional_confirmation:'No'};
  for(const q of catalog.safeguards[id])if(['coverage','frequency','inventory_update'].includes(q.id))answers[q.id]=q.choices.includes('No')?'No':q.choices[0];
  const result=omniCisSummary(id,answers,version,'Synthetic QA','2026-10-13').result;
  expect(result.status).toBe('not_assessed');expect(result.narrative).not.toContain('Controls in place');
  const body={version,answers,result,narrative:result.narrative,completed:true,step:0,expected_revision:initial.revision,
    base_assessment_token:initial.base_assessment_token,base_scope_fingerprint:initial.base_scope_fingerprint};
  const draft=(await api.put(path+'/guided-assessment',body)).data;
  expect((await api.put(path+'/guided-assessment',{...body,expected_revision:draft.revision})).data.revision).toBe(draft.revision);
  const source=Object.fromEntries(['version','revision','generated_at'].map(key=>[key,draft[key]]));
  const native={implementation:draft.narrative,status:draft.result.status,guided_assessment_source:source};
  const saved=(await api.patch(path,{...native,expected_last_assessed:row.last_saved??row.last_assessed??null})).data;
  expect(saved.status).toBe('not_assessed');expect(saved.verification).toBe(row.verification);expect(saved.items_to_address).toHaveLength(1);
  const item=saved.items_to_address[0];expect(item).toMatchObject({question_id:root,kind:'verification',state:'open'});
  expect(item.text).toContain(answers[root+'_detail']);expect(item.source_version).toBe(version);
  const resolved=(await api.patch(path+'/items/'+encodeURIComponent(item.item_id),{expected_revision:saved.items_revision,state:'resolved',resolution:'Synthetic retained analyst confirmation note.'})).data;
  const repeated=(await api.patch(path,{...native,expected_last_assessed:resolved.last_saved??resolved.last_assessed??null})).data;
  for(const key of ['items_to_address','items_revision','assessment_history','status','verification','implementation','last_saved'])expect(repeated[key]).toEqual(resolved[key]);
  expect(repeated.items_to_address[0].item_id).toBe(item.item_id);
  expect((await api.get(path)).data.items_to_address).toEqual(resolved.items_to_address);
});
