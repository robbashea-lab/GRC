import {applyGlobalChanges,overlayGlobalRecords,loadGlobalRecords} from './adminCommands';

const clone=v=>JSON.parse(JSON.stringify(v));
const actor={user_id:'employee',name:'Operator',email:'operator@example.test',status:'active',role:'super_admin',updated_at:'v1'};
const user={user_id:'writer',name:'Saved user',email:'writer@example.test',status:'active',role:'client_contributor',
  client_ids:['a','outside'],updated_at:'v4'};
const tool={tool_id:'inventory',name:'Inventory',vendor:'Vendor',area_ids:['endpoint'],category:'iv',description:'Current description',updated_at:'v2'};
test('scoped assignees remain usable without becoming manageable directory accounts',async()=>{
  const hidden={user_id:'global-owner',name:'Global owner',email:'global@example.test',role:'super_admin',status:'active',assignment_eligible:true};
  const globals={account:actor,users:[actor],tools:[]},identityMaps={clientIds:{alpha:'a'}};
  const before=overlayGlobalRecords({users:[],account:{},toolCatalog:[]},globals,identityMaps,{a:{users:[hidden]}});
  expect(before.users.find(p=>p.id===hidden.user_id)).toMatchObject({status:'Active',directoryReadOnly:true,clients:'all'});
  const after=clone(before);after.users.find(p=>p.id===hidden.user_id).name='Altered';
  const api={patch:jest.fn()};await expect(applyGlobalChanges({before,after,globals,actor,api,identityMaps})).rejects.toThrow('outside your account-management');
  expect(api.patch).not.toHaveBeenCalled();
});
function context(){
  const globals={account:actor,users:[actor,user],tools:[tool]},identityMaps={clientIds:{alpha:'a',beta:'b'}};
  const before=overlayGlobalRecords({users:[{name:'Reference',email:'reference@example.test',role:'owner',clients:'all',status:'Active'}],
    account:{},toolCatalog:[]},globals,identityMaps);
  return {before,after:clone(before),globals,identityMaps,actor,commands:[],api:{post:jest.fn(),patch:jest.fn()}};
}
test('the directory loads the signed-in account and the actual catalog; a viewer receives no administrator directory',async()=>{
  const viewer={...actor,role:'client_readonly'};
  const api={get:jest.fn(async path=>({data:path==='/auth/me'?viewer:{tools:[tool]}}))};
  expect(await loadGlobalRecords(api,viewer)).toEqual({account:viewer,users:[],tools:[tool]});
  expect(api.get).not.toHaveBeenCalledWith('/users');
});
test('an actual membership grant preserves unrelated native tenants and uses the displayed account version',async()=>{
  const ctx=context(),row=ctx.after.users.find(p=>p.nativeUserId==='writer');
  row.clients=['beta'];ctx.commands=[{name:'adminAction',args:['save-access','writer']}];
  ctx.api.patch.mockResolvedValue({data:{user_id:'writer'}});
  await applyGlobalChanges(ctx);
  expect(ctx.api.patch).toHaveBeenCalledWith('/users/writer/client-memberships',{
    client_ids:['outside','b'],expected_updated_at:'v4'});
});
test('a reference-person edit or an unconfirmed invitation has no write side effects',async()=>{
  const ctx=context();
  expect(ctx.before.users[0]).toMatchObject({referenceOnly:true,status:'Reference only'});
  ctx.after.account.title='Temporal change';ctx.after.users[0].role='cread';
  await expect(applyGlobalChanges(ctx)).rejects.toThrow('reference record');
  expect(ctx.api.patch).not.toHaveBeenCalled();
  ctx.after=clone(ctx.before);ctx.after.users.push({email:'new@example.test',name:'New invited user',status:'Invited',role:'cread',clients:[]});
  await expect(applyGlobalChanges(ctx)).rejects.toThrow('Send invitation');expect(ctx.api.post).not.toHaveBeenCalled();
  ctx.commands=[{name:'adminAction',args:['save-user','new@example.test']}];
  ctx.api.post.mockResolvedValue({data:{user:{user_id:'new-user',email:'new@example.test'},delivery:'unavailable'}});
  expect((await applyGlobalChanges(ctx)).message).toContain('not been confirmed');
  expect(ctx.api.post).toHaveBeenCalledWith('/users',{name:'New invited user',email:'new@example.test',role:'client_readonly',client_ids:[]});
});
test('the actual self profile, digest, and independent tool edit use their native field contracts',async()=>{
  const ctx=context();
  ctx.after.account.title='Security analyst';ctx.after.account.digestPaused=true;ctx.after.toolCatalog[0].what='Revised description';
  ctx.api.patch.mockImplementation(async path=>({data:path==='/me'?actor:{ok:true}}));ctx.api.post.mockResolvedValue({data:{ok:true}});
  await applyGlobalChanges(ctx);
  expect(ctx.api.patch).toHaveBeenCalledWith('/me',{job_title:'Security analyst',expected_updated_at:'v1'});
  expect(ctx.api.patch).toHaveBeenCalledWith('/me/preferences',{weekly_digest_optout:true});
  expect(ctx.api.post).toHaveBeenCalledWith('/tool-catalog/save',{expected_updated_at:'v2',
    tool:expect.objectContaining({tool_id:'inventory',name:'Inventory',description:'Revised description',area_ids:['endpoint']})});
});
