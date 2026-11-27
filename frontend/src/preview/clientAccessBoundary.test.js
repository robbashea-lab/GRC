import axios from 'axios';
import {previewAdapter} from './adapter';
import {ids, readStore, saveStore, STORE_KEY} from './store';

const api = axios.create({adapter: previewAdapter});
const CID = 'synthetic_access_client';
const FOREIGN = CID + '_foreign';
const RISK = 'synthetic_access_risk';
const FILE = 'synthetic_access_file';

function fixture() {
  const db = Object.fromEntries(Object.keys(ids).map(kind => [kind, []]));
  db.user = {user_id:'synthetic_access_provider',name:'Synthetic scoped provider',
    email:'synthetic-access@example.com',role:'platform_admin',status:'active',
    workspace_mode:'demo',client_ids:[CID],all_clients:false};
  db.users = [{...db.user}];
  db.clients = [CID, FOREIGN].map(client_id => ({client_id,name:'Synthetic access QA '+client_id,status:'active'}));
  db.risks = [{risk_id:RISK,client_id:CID,title:'Synthetic retained risk',notes:'Original notes',
    status:'assessed',likelihood_score:2,impact_score:3,owner_id:db.user.user_id,
    updated_at:'2026-11-01T12:00:00.000Z'}];
  db.evidence = [{evidence_id:FILE,client_id:CID,filename:'SYNTHETIC-access-proof.txt',
    content_base64:'VEVTVA==',size:4,version:1,uploaded_by:db.user.user_id}];
  db.logs = [];
  db.baselines = {};
  return db;
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  saveStore(fixture(), {resetFiles:true});
  await api.post('/demo/enter');
});

function setGrants(client_ids, all_clients = false) {
  const db = readStore();
  Object.assign(db.user, {client_ids,all_clients});
  saveStore(db);
  readStore();
}

test.each([
  ['exact string', CID, []], ['foreign string containing the client ID', FOREIGN, []],
  ['foreign array', [FOREIGN], [FOREIGN]], ['missing', undefined, []], ['null', null, []],
  ['boolean', true, []], ['array-like object', {0:CID,length:1}, []],
])('%s grants expose no requested-client records and commit no record or evidence writes', async (_label, grants, expectedClientIds) => {
  setGrants(grants);
  const before = sessionStorage.getItem(STORE_KEY);
  const visibleClientIds = (await api.get('/clients')).data.map(row => row.client_id);
  expect(visibleClientIds).toEqual(expectedClientIds);
  expect(visibleClientIds).not.toContain(CID);
  if (expectedClientIds.length) expect((await api.get('/clients/'+FOREIGN)).data.client_id).toBe(FOREIGN);
  for (const path of ['/clients/'+CID, '/risks/'+RISK, '/evidence/'+FILE+'/download']) {
    await expect(api.get(path)).rejects.toMatchObject({response:{status:403}});
  }
  await expect(api.get('/evidence/catalog', {params:{client_id:CID}}))
    .rejects.toMatchObject({response:{status:403}});
  await expect(api.patch('/risks/'+RISK, {notes:'Unauthorized edit',expected_updated_at:'2026-11-01T12:00:00.000Z'}))
    .rejects.toMatchObject({response:{status:403}});
  await expect(api.post('/evidence', {client_id:CID,filename:'SYNTHETIC-denied-upload.txt',content_base64:'Tk8='}))
    .rejects.toMatchObject({response:{status:403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('valid array membership preserves native reads and writes without granting a substring client', async () => {
  const before = sessionStorage.getItem(STORE_KEY);
  expect((await api.get('/clients')).data.map(row => row.client_id)).toEqual([CID]);
  const risk = (await api.get('/risks/'+RISK)).data;
  expect((await api.get('/evidence/'+FILE+'/download')).data.content_base64).toBe('VEVTVA==');
  await expect(api.get('/clients/'+FOREIGN)).rejects.toMatchObject({response:{status:403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  await api.patch('/risks/'+RISK, {notes:'Authorized synthetic edit',expected_updated_at:risk.updated_at ?? null});
  expect(readStore().risks.find(row => row.risk_id === RISK).notes).toBe('Authorized synthetic edit');
});

test('only boolean true preserves explicit provider-wide access', async () => {
  for (const all_clients of ['true', 'false', 1]) {
    setGrants([], all_clients);
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(api.get('/clients/'+FOREIGN)).rejects.toMatchObject({response:{status:403}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
  setGrants(null, true);
  const before = sessionStorage.getItem(STORE_KEY);
  expect((await api.get('/clients')).data.map(row => row.client_id).sort()).toEqual([CID,FOREIGN].sort());
  expect((await api.get('/clients/'+FOREIGN)).data.client_id).toBe(FOREIGN);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
