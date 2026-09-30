import {directoryAccess,directoryRows,isArchivedContact,contactForm} from './contactDirectory';
const c={contact_id:'c',client_id:'a',name:'Person',title:'Engineer',email:'person@example.test',phone:'555-0101',linked_user_id:'u'};
const context=status=>({clientId:'a',status:'ready',members:[{user_id:'u',status,has_client_access:true}]});
test.each([['active','active','Active account'],['invited','pending','Invitation pending'],['disabled','disabled','Disabled']])('authoritative %s becomes %s', (status,key,label)=>expect(directoryAccess(c,'a',context(status))).toMatchObject({key,label}));
test('unlinked and revoked access, unknown/error, and foreign client remain distinct',()=>{
  expect(directoryAccess({...c,linked_user_id:null},'a',context('active')).key).toBe('none');
  expect(directoryAccess(c,'a',{clientId:'a',status:'ready',members:[{user_id:'u',status:'active',has_client_access:false}]}).key).toBe('none');
  expect(directoryAccess(c,'a',{clientId:'a',status:'error'}).key).toBe('unknown');
  expect(directoryAccess(c,'b',context('active')).key).toBe('unknown');
});
test('directory search, account filter and archive inclusion are independently derived',()=>{
  const rows=[c,{...c,contact_id:'old',status:'inactive'},{...c,contact_id:'foreign',client_id:'b'}];
  const options={clientId:'a',context:context('active')};
  for(const query of ['Person','engineer','example.test','0101'])expect(directoryRows(rows,{...options,query})).toEqual([c]);
  expect(directoryRows(rows,{...options,access:'disabled'})).toEqual([]);
  expect(directoryRows(rows,{...options,archived:true})).toHaveLength(2);
  expect(isArchivedContact({status:'archived'})).toBe(true);
});
test('edit contract excludes stored responsibility, account identity and lifecycle fields',()=>{
  expect(contactForm({...c,role:'Security Lead',grc_roles:['HR'],status:'active',notes:'Retain'})).toEqual({name:'Person',title:'Engineer',email:'person@example.test',phone:'555-0101',notes:'Retain'});
});
