import {createIntent} from './createIntent';
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

test('only explicit no-primary rejection permits changing a failed intent', async () => {
  const post = jest.fn().mockRejectedValueOnce({response:{status:422,headers:{'x-create-rejected':'true'}}}).mockResolvedValue({});
  const create = createIntent(post);
  await expect(create('/reviews',{title:''})).rejects.toBeDefined();
  await create('/reviews',{title:'Corrected'});
  expect(post.mock.calls[1][2]).not.toEqual(post.mock.calls[0][2]);
});
