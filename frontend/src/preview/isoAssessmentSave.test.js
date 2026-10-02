import axios from 'axios';
import {previewAdapter} from './adapter';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
// Dunder keeps no history on routine Implemented controls (storage budget); saving one must work
// and start its history from this save without inventing earlier entries.
test('Dunder ISO assessment without stored history saves and starts its history',async()=>{
  const ws=(await api.get('/frameworks/iso-27001',{params:{client_id:'demo_dunder'}})).data;
  const row=ws.assessments.find(a=>a.status==='addressed'&&!a.assessment_history);
  expect(row).toBeTruthy();
  const {data}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{notes:'Re-confirmed in QA',expected_last_assessed:row.last_assessed??null});
  expect(data).toMatchObject({client_id:'demo_dunder',notes:'Re-confirmed in QA',status:'addressed'});
  expect(data.assessment_history).toHaveLength(1);
  expect(data.assessment_history[0]).toMatchObject({notes:'Re-confirmed in QA'});
});
