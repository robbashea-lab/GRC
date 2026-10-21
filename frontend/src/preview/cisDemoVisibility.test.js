import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
import {visibleCisDemoRows} from './cisDemoVisibility';
import {CIS_DEMO_REVISION} from './cisDemoSelection';

const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{localStorage.clear();sessionStorage.clear();await api.post('/demo/enter');});
test('native strict Policy register omits retired optional fixtures while direct history remains intact',async()=>{
  const db=readStore(),all=db.policies.filter(row=>row.client_id==='demo_brawndo');
  expect(all).toHaveLength(10);
  expect(all.some(row=>row.demo_seed_retired)).toBe(false);
  const retired=[{policy_id:'synthetic-retired-optional',client_id:'demo_brawndo',title:'Synthetic retired optional document',
    status:'retired',demo_seed_retired:{revision:CIS_DEMO_REVISION},
    approval_history:[{action:'approved',at:'2025-01-01',by:'synthetic-original-approver',
      subject:{policy_id:'synthetic-retired-optional',client_id:'demo_brawndo',subject_id:'synthetic-original-subject',version:'1'}}],
    review_history:[{at:'2025-02-01',by:'synthetic-original-reviewer'}]}];
  db.policies.push(...retired);saveStore(db);
  const listed=(await api.get('/policies',{params:{client_id:'demo_brawndo'}})).data;
  expect(listed).toHaveLength(10);
  expect(listed.some(row=>row.demo_seed_retired)).toBe(false);
  for(const row of retired){
    const history=(await api.get('/policies/'+row.policy_id)).data;
    expect(history.approval_history).toEqual(row.approval_history);
    expect(history.review_history).toEqual(row.review_history);
    expect(readStore().policies.find(value=>value.policy_id===row.policy_id)).toEqual(row);
  }
  const reviews=(await api.get('/reviews',{params:{client_id:'demo_brawndo'}})).data;
  expect(reviews.some(row=>row.demo_seed_retired)).toBe(false);
});
test('ambiguous retained markers, foreign identities, stale revision and non-Demo records remain visible',()=>{
  const row={client_id:'demo_brawndo',status:'retired',demo_seed_retired:{revision:CIS_DEMO_REVISION}};
  const fixture={user:{workspace_mode:'demo'},clients:[{client_id:row.client_id,environment:'Demo'}],
    cis_demo_rollout:{clients:{[row.client_id]:{revision:CIS_DEMO_REVISION,ownership:'fresh_fixture'}}}};
  expect(visibleCisDemoRows(fixture,'policies',[row])).toEqual([]);
  for(const ownership of ['retained_unreconciled','untouched_greenfield_revision',undefined]){
    const db={...fixture,cis_demo_rollout:{clients:{[row.client_id]:{revision:CIS_DEMO_REVISION,ownership}}}};
    expect(visibleCisDemoRows(db,'policies',[row])).toEqual([row]);
  }
  expect(visibleCisDemoRows({...fixture,user:{workspace_mode:'standard'}},'policies',[row])).toEqual([row]);
  expect(visibleCisDemoRows(fixture,'policies',[{...row,client_id:'customer'}])).toHaveLength(1);
  expect(visibleCisDemoRows(fixture,'policies',[{...row,status:'draft'}])).toHaveLength(1);
  expect(visibleCisDemoRows(fixture,'policies',[{...row,demo_seed_retired:{revision:'older'}}])).toHaveLength(1);
});
