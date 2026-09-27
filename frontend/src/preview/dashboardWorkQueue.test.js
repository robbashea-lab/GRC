import axios from 'axios';
import {previewAdapter} from './adapter';
import {loadClientDashboard} from '../lib/loadClientDashboard';
import {cisSummary} from '../lib/cisVerification';
import {readStore,saveStore} from './store';
const api=axios.create({adapter:previewAdapter});
beforeEach(()=>{localStorage.clear();sessionStorage.clear();});
test('bounded queue pages reconcile every total and use authoritative CIS records without mutations',async()=>{
  await api.post('/demo/enter');
  const cid='demo_brawndo';
  const before=(await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data;
  const loaded=await loadClientDashboard(api,{clientId:cid,user:(await api.get('/auth/me')).data,scope:{kind:'org'},workQueue:true});
  expect(loaded.programs.map(p=>p.key)).toEqual(['cis-ig1']);
  expect(cisSummary(loaded.cisRows)).toMatchObject({addressed:33,assessed:49,total:56});
  for(const [key,group] of Object.entries(loaded.queue.groups)) {
    expect(group.items.length).toBe(Math.min(9,group.total));
    const all=[];
    for(let offset=0;offset<group.total;offset+=25) {
      const {data}=await api.get('/dashboard',{params:{client_id:cid,work_queue:true,detail:key,offset,limit:25}});
      expect(data.total).toBe(group.total);all.push(...data.items);
    }
    expect(all).toHaveLength(group.total);
    expect(new Set(all.map(r=>r.key)).size).toBe(group.total);
    expect(all.slice(0,9)).toEqual(group.items);
    expect(all.every(r=>!r.record&&!r.assessment_history)).toBe(true);
  }
  expect((await api.get('/frameworks/cis-ig1',{params:{client_id:cid}})).data.assessments).toEqual(before.assessments);
  const normal=(await api.get('/dashboard',{params:{client_id:cid}})).data;
  expect(normal.posture).toBeDefined();expect(normal.groups).toBeUndefined();
  await expect(api.get('/dashboard',{params:{client_id:cid,work_queue:true,detail:'all',offset:-1}})).rejects.toThrow();
});
test('queue preserves Demo authentication and tenant boundaries including detail pages',async()=>{
  await expect(api.get('/dashboard',{params:{client_id:'demo_brawndo',work_queue:true}})).rejects.toMatchObject({response:{status:401}});
  await api.post('/demo/enter');
  const db=readStore();db.user={...db.user,role:'client_readonly',client_ids:['demo_brawndo']};saveStore(db);
  const {data}=await api.get('/dashboard',{params:{client_id:'demo_brawndo',work_queue:true}});
  expect(data.groups.all.total).toBeGreaterThan(9);
  for(const detail of [undefined,'all'])await expect(api.get('/dashboard',{params:{client_id:'demo_initech',work_queue:true,detail}})).rejects.toMatchObject({response:{status:403}});
  const reload=axios.create({adapter:previewAdapter});
  expect((await reload.get('/dashboard',{params:{client_id:'demo_brawndo',work_queue:true}})).data).toEqual(data);
});
