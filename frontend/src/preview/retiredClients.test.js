import {removeRetiredDemoClients} from './retiredClients';
import {seedStore,saveStore,readStore} from './store';

test('removing a provider client does not change Brawndo internal-owner rotation',()=>{
  const db=seedStore();
  const assessments=db.framework_assessments.filter(a=>a.client_id==='demo_brawndo');
  expect(assessments).toHaveLength(56);
  expect(new Set(assessments.map(a=>a.owner_id))).toEqual(new Set(['demo_brawndo_user_0','demo_brawndo_user_1','demo_brawndo_user_2']));
  expect(assessments.filter(a=>a.owner_id==='demo_brawndo_user_2')).toHaveLength(18);
});

test('stale Dunder is replaced by the canonical ISO client without resetting surviving work',()=>{
  sessionStorage.clear();
  const db=seedStore();
  const preserved=JSON.stringify(db.framework_assessments.filter(a=>a.client_id!=='demo_dunder'&&a.client_id!=='demo_initech'));
  const custom={client_id:'custom',name:'User-created demo client'};
  db.clients.push(custom,{client_id:'demo_dunder'},{client_id:'demo_initech'});
  db.users.push({user_id:'demo_dunder_user_0',client_ids:['demo_dunder']});
  db.user.client_ids.push('demo_dunder');
  db.user.favorite_client_ids=['demo_dunder','demo_prestige'];
  db.reviews.push({client_id:'demo_dunder',review_id:'retired'});
  db.evidence.push({client_id:'demo_dunder',evidence_id:'retired-file',linked_id:'retired'});
  db.baselines.demo_dunder={retired:true};db.drafts.demo_initech={retired:true};
  db.riskSequences.demo_dunder=7;
  db.ai_intake={demo_dunder:{usage:'yes'},custom:{usage:'no'}};
  db.ai_counters={demo_initech:2};
  db.logs.push({entity_type:'users',entity_id:'demo_dunder_user_0'});
  saveStore(db);
  const migrated=readStore();
  expect(migrated.clients.map(c=>c.client_id)).toEqual(['demo_brawndo','demo_prestige','custom','demo_dunder','demo_initech']);
  expect(JSON.stringify(migrated.framework_assessments.filter(a=>a.client_id!=='demo_dunder'&&a.client_id!=='demo_initech'))).toBe(preserved);
  expect(migrated.reviews.some(r=>r.review_id==='retired')).toBe(false);
  expect(migrated.evidence.some(r=>r.evidence_id==='retired-file')).toBe(false);
  expect(migrated.clients.find(c=>c.client_id==='demo_dunder').demo_program_version).toBe('iso27001-year2-v1');
  expect(migrated.users.some(u=>u.user_id==='demo_dunder_user_0')).toBe(true);
  expect(migrated.user.favorite_client_ids).toEqual(['demo_prestige']);
  expect(migrated.baselines.demo_dunder).toBeDefined();
  expect(migrated.drafts.demo_initech).toBeUndefined();
  expect(migrated.riskSequences.demo_dunder).toBeDefined();
  expect(migrated.ai_intake.custom).toEqual({usage:'no'});
  expect(migrated.ai_counters).toEqual({});
  expect(migrated.logs.some(r=>r.entity_id==='demo_dunder_user_0')).toBe(false);
  expect(removeRetiredDemoClients(migrated)).toBe(false);
  expect(readStore()).toEqual(migrated);
});

test('a retired simulated identity returns to the existing explorer; missing explorer fails closed',()=>{
  for(const users of [[{user_id:'demo_admin',role:'super_admin'}],[]]){
    const db={users,user:{user_id:'demo_initech_user_0'}};
    expect(removeRetiredDemoClients(db)).toBe(true);
    expect(db.user).toEqual(users[0]||null);
    expect(removeRetiredDemoClients(db)).toBe(false);
  }
});
