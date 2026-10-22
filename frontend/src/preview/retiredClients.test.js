import {removeRetiredDemoClients} from './retiredClients';
import {seedStore,saveStore,readStore} from './store';
beforeEach(()=>{sessionStorage.clear();jest.useFakeTimers().setSystemTime(new Date('2026-10-21T12:00:00.000Z'));});
afterEach(()=>jest.useRealTimers());
test('older fixture versions preserve Dunder and Initech identities and user work',()=>{
  const db=seedStore();
  for(const cid of ['demo_dunder','demo_initech']){
    const client=db.clients.find(c=>c.client_id===cid);client.demo_program_version='older';client.notes='User-authored organization context';
    db.drafts[cid]={notes:'Preserve unsaved draft'};
    db.reviews.push({client_id:cid,review_id:cid+'_custom',notes:'Preserve custom work',status:'in_progress',occurrences:[]});
  }
  const before=JSON.stringify(db);expect(removeRetiredDemoClients(db)).toBe(false);expect(JSON.stringify(db)).toBe(before);
  const retained=JSON.parse(JSON.stringify(Object.fromEntries(['demo_dunder','demo_initech'].map(cid=>[cid,{client:db.clients.find(c=>c.client_id===cid),reviews:db.reviews.filter(r=>r.client_id===cid),draft:db.drafts[cid]}]))));
  saveStore(db);const reloaded=readStore();
  for(const [cid,original] of Object.entries(retained)){
    expect(reloaded.clients.find(c=>c.client_id===cid)).toEqual(original.client);
    expect(reloaded.reviews.filter(r=>r.client_id===cid)).toEqual(original.reviews);
    expect(reloaded.drafts[cid]).toEqual(original.draft);
  }
});
test('unrelated simulated identities, permissions and records are not silently removed',()=>{
  const db={clients:[{client_id:'demo_dunder',demo_program_version:'older'},{client_id:'demo_initech',demo_program_version:'older'},{client_id:'demo_hooli'}],users:[],user:{user_id:'demo_initech_user_0',client_ids:['demo_initech'],favorite_client_ids:['demo_dunder']},policies:[{client_id:'demo_initech',policy_id:'keep',notes:'User-authored'}],drafts:{demo_initech:{notes:'Keep draft'}}};
  const before=JSON.stringify(db);expect(removeRetiredDemoClients(db)).toBe(false);expect(JSON.stringify(db)).toBe(before);
});
