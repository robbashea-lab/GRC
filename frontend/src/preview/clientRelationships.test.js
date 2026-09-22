import {clientProjection, leadCandidates, validateClientRelationships} from './clientRelationships';
import {grcLead, primaryContact} from '../lib/clientRelationships';
import {seedStore, write} from './store';
import {previewAdapter} from './adapter';

const user = (user_id, role, client_ids, status='active') => ({user_id,name:'Same Name',email:user_id+'@example.test',role,client_ids,status,private_metadata:'never return'});
const fixture = () => ({user:user('actor','super_admin',[]),users:[user('internal','platform_admin',['a']),user('global','platform_admin',[]),user('foreign','platform_admin',['b']),user('client','client_admin',['a']),user('disabled','platform_admin',['a'],'disabled')],contacts:[{contact_id:'maya',client_id:'a',name:'Maya',status:'active'}, {contact_id:'jordan',client_id:'b',name:'Maya',status:'active'}]});

test('internal candidate scope is narrower than operational assignment and exposes minimal identity',()=>{
  const db=fixture();
  expect(leadCandidates(db,'a').map(u=>u.user_id).sort()).toEqual(['global','internal']);
  expect(leadCandidates(db).map(u=>u.user_id)).toEqual(['global']);
  leadCandidates(db,'a').forEach(u=>expect(Object.keys(u).sort()).toEqual(['email','name','user_id']));
  db.user=user('scoped','platform_admin',['b']);
  expect(()=>leadCandidates(db,'a')).toThrow('Forbidden');
});
test('new relationship writes reject foreign contacts and ineligible leads; existing values survive',()=>{
  const db=fixture(), row={client_id:'a'};
  expect(()=>validateClientRelationships(db,{...row,primary_contact_id:'maya',assigned_owner_id:'internal'})).not.toThrow();
  expect(()=>validateClientRelationships(db,{...row,primary_contact_id:'jordan'})).toThrow();
  for(const id of ['foreign','client','disabled','missing']) expect(()=>validateClientRelationships(db,{...row,assigned_owner_id:id})).toThrow();
  const previous={...row,assigned_owner_id:'disabled'};
  expect(()=>validateClientRelationships(db,previous,previous)).not.toThrow();
  expect(()=>validateClientRelationships(db,{...row,assigned_owner_id:''},previous)).not.toThrow();
});
test('projections are minimal, tenant-scoped, immutable and honest about legacy data',()=>{
  const db=fixture(), row={client_id:'a',assigned_owner_id:'client',primary_contact:'Legacy details',primary_contact_id:'maya'};
  const original=JSON.stringify(db), view=clientProjection(db,row);
  expect(primaryContact(view).name).toBe('Maya');
  expect(grcLead(view).notice).toMatch('not an internal user');
  expect(view.grc_lead.private_metadata).toBeUndefined();
  expect(clientProjection(db,{...row,primary_contact_id:'jordan'}).primary_contact_record).toBeNull();
  expect(primaryContact({...row,primary_contact_id:''}).notice).toMatch('Not linked');
  expect(grcLead({}).name).toBe('Unassigned');
  expect(grcLead({assigned_owner_id:'missing'}).name).toBe('Recorded GRC Lead');
  expect(grcLead(clientProjection(db,{...row,assigned_owner_id:'disabled'})).notice).toMatch('disabled');
  expect(JSON.stringify(db)).toBe(original);
});
test('new client creates one Contact, not a User; select/reload/change never duplicates or deletes',()=>{
  const db=seedStore(), users=JSON.stringify(db.users), oldClients=db.clients.length;
  const created=write(db,'clients',{name:'Northstar Manufacturing',assigned_owner_id:'demo_admin',primary_contact_details:{name:'Maya Chen',email:'maya@northstar.example',title:'IT Director'}});
  expect(db.clients).toHaveLength(oldClients+1);
  expect(db.contacts.filter(c=>c.client_id===created.client_id)).toHaveLength(1);
  expect(JSON.stringify(db.users)).toBe(users);
  const contact=db.contacts.find(c=>c.contact_id===created.primary_contact_id);
  expect(contact.linked_user_id).toBeUndefined();
  const jordan=write(db,'contacts',{client_id:created.client_id,name:'Jordan Lee',title:'CFO'});
  write(db,'clients',{primary_contact_id:jordan.contact_id},created.client_id);
  write(db,'clients',{primary_contact_id:jordan.contact_id},created.client_id);
  expect(db.contacts.filter(c=>c.client_id===created.client_id)).toHaveLength(2);
  expect(clientProjection(db,created).primary_contact_record.name).toBe('Jordan Lee');
  write(db,'contacts',{status:'inactive',name:'Jordan Updated'},jordan.contact_id);
  expect(primaryContact(clientProjection(db,created)).notice).toBe('Contact inactive');
  expect(primaryContact(clientProjection(db,created)).name).toBe('Jordan Updated');
  write(db,'clients',{primary_contact_id:''},created.client_id);
  expect(db.contacts).toContain(contact);
});
test('invalid client creation does not leave operational records or contacts',()=>{
  const db=seedStore(), before=JSON.stringify(db);
  expect(()=>write(db,'clients',{name:'Invalid',primary_contact_details:{name:'Maya',email:'invalid'}})).toThrow();
  expect(JSON.stringify(db)).toBe(before);
});
test('Demo routes preserve Primary Contact against hard deletion and return matching projections',async()=>{
  sessionStorage.clear();sessionStorage.setItem('grc_demo_entered','true');
  const call=async(method,url,data)=> (await previewAdapter({method,url,data})).data;
  const c=await call('post','/clients',{name:'Northstar',primary_contact_details:{name:'Maya'}});
  await expect(call('delete','/contacts/'+c.primary_contact_id)).rejects.toThrow('Primary Contact');
  await expect(call('post','/bulk',{kind:'contacts',action:'delete',ids:[c.primary_contact_id]})).rejects.toThrow('Primary Contact');
  const list=await call('get','/clients');
  const portfolio=await call('get','/clients/directory');
  expect(list.find(r=>r.client_id===c.client_id).primary_contact_record).toEqual(portfolio.clients.find(r=>r.client_id===c.client_id).primary_contact_record);
  sessionStorage.clear();
});
