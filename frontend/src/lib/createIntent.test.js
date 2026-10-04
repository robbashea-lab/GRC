import {createIntent} from './createIntent';
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

test.each([409,422,428])('only explicit no-primary rejection permits changing a failed intent (%s)', async status => {
  const post = jest.fn().mockRejectedValueOnce({response:{status,headers:{'x-create-rejected':'true'}}}).mockResolvedValue({});
  const create = createIntent(post);
  await expect(create('/reviews',{title:''})).rejects.toBeDefined();
  await create('/reviews',{title:'Corrected'});
  expect(post.mock.calls[1][2]).not.toEqual(post.mock.calls[0][2]);
});
