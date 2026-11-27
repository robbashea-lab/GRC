import {additionalDirectoryRows,additionalContactRelationships} from './additionalContactsPresentation';

const clientId='demo_brawndo',client={client_id:clientId,primary_contact_id:'primary',assigned_owner_id:'active'};
const rows=[{client_id:clientId,contact_id:'primary',name:'Same name'},{client_id:clientId,contact_id:'another',name:'Same name',linked_user_id:'active'},{client_id:clientId,contact_id:'pending',linked_user_id:'pending'},{client_id:clientId,contact_id:'disabled',linked_user_id:'disabled'},{client_id:clientId,contact_id:'unknown',linked_user_id:'unknown'},{client_id:clientId,contact_id:'archived',status:'inactive'},{client_id:'other',contact_id:'primary'}];
const context={clientId,status:'ready',members:[{user_id:'active',status:'active',has_client_access:true},{user_id:'pending',status:'invited',has_client_access:true},{user_id:'disabled',status:'disabled',has_client_access:true}]};
test('access facets exclude disabled and unknown access while keeping archival independent',()=>{
  expect(additionalDirectoryRows(rows,{clientId,context,access:'platform'}).map(row=>row.contact_id)).toEqual(['another','pending']);
  expect(additionalDirectoryRows(rows,{clientId,context,access:'none'}).map(row=>row.contact_id)).toEqual(['primary']);
  expect(additionalDirectoryRows(rows,{clientId,context,access:'disabled'}).map(row=>row.contact_id)).toEqual(['disabled']);
  expect(additionalDirectoryRows(rows,{clientId,context,archived:true}).map(row=>row.contact_id)).toContain('archived');
});
test('relationships use exact authorized client and identity IDs, never display names or account roles',()=>{
  expect(additionalContactRelationships(rows[0],clientId,client)).toEqual(['Primary contact']);
  expect(additionalContactRelationships(rows[1],clientId,client)).toEqual(['GRC lead']);
  expect(additionalContactRelationships({...rows[1],linked_user_id:'unknown'},clientId,client)).toEqual([]);
  expect(additionalContactRelationships(rows[6],clientId,client)).toEqual([]);
  expect(additionalContactRelationships(rows[0],clientId,{...client,client_id:'other'})).toEqual([]);
});
