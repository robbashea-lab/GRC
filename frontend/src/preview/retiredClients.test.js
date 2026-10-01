import {removeRetiredDemoClients} from './retiredClients';
import {seedStore,saveStore,readStore} from './store';

test('retired synthetic tenants are removed on reload without resetting surviving work',()=>{
  sessionStorage.clear();
  const db=seedStore();
  const preserved=JSON.stringify(db.framework_assessments);
  const custom={client_id:'custom',name:'User-created demo client'};
  db.clients.push(custom,{client_id:'demo_dunder'},{client_id:'demo_initech'});
  db.users.push({user_id:'demo_dunder_user_0',client_ids:['demo_dunder']});
  db.user.client_ids.push('demo_dunder');
  db.user.favorite_client_ids=['demo_dunder','demo_prestige'];
  db.reviews.push({client_id:'demo_dunder',review_id:'retired'});
  db.evidence.push({client_id:'demo_dunder',evidence_id:'retired-file',linked_id:'retired'});
  db.baselines.demo_dunder={retired:true};db.drafts.demo_initech={retired:true};
  saveStore(db);
  const migrated=readStore();
  expect(migrated.clients.map(c=>c.client_id)).toEqual(['demo_brawndo','demo_prestige','custom']);
  expect(JSON.stringify(migrated.framework_assessments)).toBe(preserved);
  expect(migrated.reviews.some(r=>r.review_id==='retired')).toBe(false);
  expect(migrated.evidence.some(r=>r.evidence_id==='retired-file')).toBe(false);
  expect(migrated.users.some(u=>u.user_id==='demo_dunder_user_0')).toBe(false);
  expect(migrated.user.favorite_client_ids).toEqual(['demo_prestige']);
  expect(migrated.baselines.demo_dunder).toBeUndefined();
  expect(migrated.drafts.demo_initech).toBeUndefined();
  expect(removeRetiredDemoClients(migrated)).toBe(false);
  expect(readStore()).toEqual(migrated);
});
