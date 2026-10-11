import {createIntent, clearPendingCommands, syncPendingCommandIdentity} from './createIntent';
beforeEach(()=>sessionStorage.clear());
beforeAll(() => {Object.defineProperty(global, 'crypto', {configurable:true,value:require('crypto').webcrypto});});

test('duplicate submits and uncertain retries reuse one intent; successful new creates do not', async () => {
  const post = jest.fn().mockRejectedValueOnce(new Error('response lost')).mockResolvedValue({data:{id:'saved'}});
  const create = createIntent(post), body = {title:'Identical content'};
  const first = create('/findings',body);
  expect(create('/findings',body)).toBe(first);
  await expect(first).rejects.toThrow('response lost');
  await expect(create('/findings',{title:'Changed'})).rejects.toThrow('not been confirmed');
  await create('/findings',body);
  expect(post.mock.calls[1][2]).toEqual(post.mock.calls[0][2]);
  await create('/findings',body);
  expect(post.mock.calls[2][2]).not.toEqual(post.mock.calls[0][2]);
});

test('ticket recovery survives remount and reload with its original payload and identity',async()=>{
  const post=jest.fn().mockRejectedValueOnce(new Error('audit failed')).mockResolvedValue({});
  const first=createIntent(post,'actor:client:ticket');
  await expect(first('/tasks/t',{status:'done',expected_updated_at:'v1'})).rejects.toThrow();
  const reloaded=createIntent(post,'actor:client:ticket');
  expect(reloaded.unconfirmed()).toBe(true);
  await reloaded.retry();
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  expect(createIntent(post,'actor:client:ticket').unconfirmed()).toBe(false);
  expect(createIntent(post,'other-actor:client:ticket').unconfirmed()).toBe(false);
});

test.each(['assets','vendors','reviews','contacts'])('%s save retains original version, payload and identity after reload',async kind=>{
 const patch=jest.fn().mockRejectedValueOnce(new Error('save pending recovery')).mockResolvedValue({data:{updated_at:'saved'}});
 const scope='actor:client:'+kind+':record:update',body={name:'Original intent',expected_updated_at:'original-version'};
 await expect(createIntent(patch,scope)('/'+kind+'/record',body)).rejects.toThrow('pending recovery');
 const reloaded=createIntent(patch,scope);
 await expect(reloaded('/'+kind+'/record',{...body,expected_updated_at:'new-version'})).rejects.toThrow('not been confirmed');
 await reloaded.retry();expect(patch.mock.calls[1]).toEqual(patch.mock.calls[0]);
 expect(reloaded.unconfirmed()).toBe(false);
});

test.each([409,422,428])('only explicit no-primary rejection permits changing a failed intent (%s)', async status => {
  const post = jest.fn().mockRejectedValueOnce({response:{status,headers:{'x-create-rejected':'true'}}}).mockResolvedValue({});
  const create = createIntent(post);
  await expect(create('/reviews',{title:''})).rejects.toBeDefined();
  await create('/reviews',{title:'Corrected'});
  expect(post.mock.calls[1][2]).not.toEqual(post.mock.calls[0][2]);
});

test('identity cleanup removes only pending bodies and invalidates persisted and memory-only callbacks',async()=>{
  sessionStorage.setItem('unrelated-preference','keep');
  const post=jest.fn().mockRejectedValue(new Error('Synthetic unknown outcome'));
  const saved=createIntent(post,'actor-a:client-a:contact:update');
  const memory=createIntent(post);
  await expect(saved('/contacts/contact',{notes:'SYNTHETIC A'})).rejects.toThrow();
  await expect(memory('/findings',{title:'SYNTHETIC A'})).rejects.toThrow();
  clearPendingCommands();
  expect(sessionStorage.getItem('unrelated-preference')).toBe('keep');
  expect(sessionStorage.getItem('grc_pending_command_v1:actor-a:client-a:contact:update')).toBeNull();
  for(const old of [saved,memory]){
    expect(old.unconfirmed()).toBe(false);
    await expect(old.retry()).rejects.toThrow('ended workspace');
    await expect(old('/findings',{title:'SYNTHETIC A'})).rejects.toThrow('ended workspace');
  }
  expect(post).toHaveBeenCalledTimes(2);
});

test('same actor refresh and client switching retain recovery, different actor or mode retires it',async()=>{
  const post=jest.fn().mockRejectedValue(new Error('Synthetic unknown outcome'));
  syncPendingCommandIdentity('actor-a','standard');
  const old=createIntent(post,'actor-a:client-a:contacts:update');
  await expect(old('/contacts/contact-a',{notes:'SYNTHETIC A'})).rejects.toThrow();
  syncPendingCommandIdentity('actor-a','standard');
  expect(createIntent(post,'actor-a:client-b:contacts:update').unconfirmed()).toBe(false);
  expect(createIntent(post,'actor-a:client-a:contacts:update').unconfirmed()).toBe(true);
  syncPendingCommandIdentity('actor-b','standard');
  expect(old.unconfirmed()).toBe(false);
  expect(createIntent(post,'actor-a:client-a:contacts:update').unconfirmed()).toBe(false);
  const next=createIntent(post,'actor-b:client-b:contacts:update');
  await expect(next('/contacts/contact-b',{notes:'SYNTHETIC B'})).rejects.toThrow();
  syncPendingCommandIdentity('actor-b','demo');
  expect(next.unconfirmed()).toBe(false);
});

test('a boundary before queued dispatch prevents the old transport call',async()=>{
  const post=jest.fn().mockResolvedValue({});
  const old=createIntent(post,'actor-a:client:contact:update');
  const pending=old('/contacts/contact',{notes:'SYNTHETIC A'});
  clearPendingCommands();
  await expect(pending).rejects.toThrow('ended workspace');
  expect(post).not.toHaveBeenCalled();
});

test.each(['success','rejected'])('late old %s cannot clear a newer same-scope recovery body',async outcome=>{
  let resolve,reject;
  const post=jest.fn().mockImplementationOnce(()=>new Promise((yes,no)=>{resolve=yes;reject=no;}))
    .mockRejectedValueOnce(new Error('Synthetic new outcome unknown'));
  const old=createIntent(post,'shared-scope');
  const pending=old('/contacts/contact',{notes:'SYNTHETIC OLD'});
  await Promise.resolve();
  clearPendingCommands();
  const next=createIntent(post,'shared-scope');
  await expect(next('/contacts/contact',{notes:'SYNTHETIC NEW'})).rejects.toThrow();
  if(outcome==='success')resolve({});
  else reject({response:{headers:{'x-create-rejected':'true'}}});
  await expect(pending).rejects.toBeDefined();
  expect(sessionStorage.getItem('grc_pending_command_v1:shared-scope')).toContain('SYNTHETIC NEW');
  expect(next.unconfirmed()).toBe(true);
});

test('failed storage cleanup remains observable and still prevents stale dispatch',async()=>{
  const post=jest.fn().mockRejectedValue(new Error('Synthetic unknown outcome'));
  const old=createIntent(post,'actor-a:client:contact:update');
  await expect(old('/contacts/contact',{notes:'SYNTHETIC A'})).rejects.toThrow();
  const remove=jest.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('Storage unavailable');});
  expect(()=>clearPendingCommands()).toThrow('Storage unavailable');
  remove.mockRestore();
  await expect(old.retry()).rejects.toThrow('ended workspace');
  expect(post).toHaveBeenCalledTimes(1);
});
