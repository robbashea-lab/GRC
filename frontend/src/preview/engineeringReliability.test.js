import axios from 'axios';
import { previewAdapter } from './adapter';
import { STORE_KEY } from './store';

const api = axios.create({ adapter: previewAdapter });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

test('a stale Demo editor cannot overwrite a saved finding or persist transport metadata', async () => {
  await api.post('/demo/enter');
  const client = (await api.get('/clients')).data[0];
  const original = (await api.post('/findings', {client_id:client.client_id,title:'Synthetic concurrency check'})).data;
  const path = '/findings/' + original.finding_id;
  await api.patch(path, {title:'Newer edit',expected_updated_at:original.updated_at});
  await expect(api.patch(path, {title:'Stale edit',expected_updated_at:original.updated_at})).rejects.toThrow('Record changed since it was opened');
  const saved = (await api.get(path)).data;
  expect(saved.title).toBe('Newer edit');
  expect(saved).not.toHaveProperty('expected_updated_at');
});

test('storage failure is an error and leaves the persisted record unchanged',async()=>{
  await api.post('/demo/enter');
  const before=sessionStorage.getItem(STORE_KEY),client=(await api.get('/clients')).data[0];
  const write=jest.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  try {
    await expect(api.post('/findings',{client_id:client.client_id,title:'Must not report saved'})).rejects.toThrow('Changes were not saved');
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  } finally {write.mockRestore();}
});
