import {r4ServicesRequest} from './r4ServicesTools';

const path = '/tool-catalog/ninjaone/usage';
const snapshot = db => JSON.stringify(db);
function fixture() {
  const user = {user_id:'provider',role:'platform_admin',status:'active',client_ids:['a']};
  return {user, users:[user], clients:[
    {client_id:'a',name:'Accessible client',status:'active',updated_at:'a1',profile:{services:{areas:{
      endpoint:{tool_ids:['ninjaone']},patching:{tool_ids:['ninjaone','ninjaone']},retained_area:{tool_ids:['ninjaone']}}}}},
    {client_id:'b',name:'Private foreign client',status:'active',profile:{services:{areas:{endpoint:{tool_ids:['ninjaone']}}}}},
    {client_id:'archived',name:'Retained archived client',status:'archived',profile:{services:{areas:{endpoint:{tool_ids:['ninjaone']}}}}},
    {client_id:'empty',name:'Retained partial services',profile:{services:{}}},
  ], reviews:[],framework_assessments:[],requirements:[],r4_tool_catalog:[],logs:[]};
}
function read(db, requestPath = path) {
  const before = snapshot(db);
  const result = r4ServicesRequest(db,requestPath,'get');
  expect(snapshot(db)).toBe(before);
  return result;
}
function refused(db, status, requestPath = path) {
  const before = snapshot(db);
  let failure;
  try { r4ServicesRequest(db,requestPath,'get'); } catch (error) { failure = error; }
  expect(failure).toMatchObject({status});
  expect(snapshot(db)).toBe(before);
  return failure;
}

test('Demo usage reads count actual accessible distinct Client/area selections without writes',()=>{
  const db = fixture();
  expect(read(db)).toEqual({tool_id:'ninjaone',expected_updated_at:null,scope:'authorized_clients',client_count:1,selection_count:3,
    clients:[{client_id:'a',name:'Accessible client',status:'active',expected_updated_at:'a1',areas:[
      {area_id:'endpoint',name:'Endpoint management & inventory'},
      {area_id:'patching',name:'Patch management'},{area_id:'retained_area',name:'retained_area'}]}]});
  db.user = {...db.user,role:'super_admin'};
  const data = read(db);
  expect([data.client_count,data.selection_count]).toEqual([3,5]);
  expect(data.clients.map(row=>row.client_id)).toEqual(['a','archived','b']);
  expect(data.clients[1]).toMatchObject({status:'archived',expected_updated_at:null});
});

test('Demo usage distinguishes known zero selections, unknown tools and current catalog versions',()=>{
  const db = fixture();
  expect(read(db,'/tool-catalog/connectsecure/usage')).toMatchObject({client_count:0,selection_count:0,clients:[]});
  refused(db,404,'/tool-catalog/unknown-tool/usage');
  db.r4_tool_catalog.push({tool_id:'ninjaone',name:'Retained tool',retired:true,updated_at:'catalog-v1'});
  expect(read(db)).toMatchObject({expected_updated_at:'catalog-v1',client_count:1});
  db.user = {...db.user,client_ids:[]};
  expect(read(db)).toMatchObject({scope:'authorized_clients',client_count:0,selection_count:0,clients:[]});
});

test('Demo usage refuses unauthorized roles, inactive actors and all accessible pending sources',()=>{
  for (const actor of [{role:'client_contributor'},{role:'client_readonly'},{status:'disabled'}]) {
    const db = fixture();db.user = {...db.user,...actor};refused(db,403);
  }
  const db = fixture();
  db.clients[1]._r4_context_pending = 'foreign-intent';
  expect(read(db).client_count).toBe(1);
  db.clients[3]._r4_context_pending = 'accessible-unselected-intent';
  db.user.client_ids.push('empty');
  refused(db,409);
  delete db.clients[3]._r4_context_pending;
  db.r4_tool_catalog.push({tool_id:'intune',_r4_context_pending:'catalog-intent'});
  refused(db,409);
});

test('Demo usage rejects malformed present selections and never returns a capped partial population',()=>{
  for (const areas of [[],false,'',{'endpoint':[]},{endpoint:{tool_ids:'ninjaone'}}]) {
    const db = fixture();db.clients[0].profile.services.areas = areas;
    expect(refused(db,409).message).toMatch(/could not be verified/);
  }
  for (const profile of [[],false,'',{services:[]},{services:false},{services:''}]) {
    const db = fixture();db.clients[0].profile = profile;
    expect(refused(db,409).message).toMatch(/could not be verified/);
  }
  const db = fixture();db.user = {...db.user,role:'super_admin'};
  for(let index=db.clients.length;index<501;index++) db.clients.push({client_id:'extra-'+index});
  refused(db,413);
  db.clients[500]._r4_context_pending = 'off-cap-intent';
  refused(db,409);
});

test('accessible usage counts do not grant replacement access to affected foreign Clients',()=>{
  const db = fixture();
  expect(read(db).client_count).toBe(1);
  const before = snapshot(db);
  expect(()=>r4ServicesRequest(db,'/tool-catalog/ninjaone/replace','post',{
    replacement_id:'intune',expected_updated_at:null,retire:true},'synthetic-tool-usage-replace')).toThrow(/Forbidden/);
  expect(snapshot(db)).toBe(before);
});
