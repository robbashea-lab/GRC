import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore, saveStore, STORE_KEY} from './store';

const api = axios.create({adapter: previewAdapter});
const cid = 'demo_brawndo';
const fid = 'qa-native-finding-risk';
const route = `/findings/${fid}/raise-risk`;
let original;

beforeEach(async () => {
  sessionStorage.clear();
  localStorage.clear();
  await api.post('/demo/enter');
  const db = readStore();
  db.users.push({
    user_id: 'qa-owner',
    name: 'Synthetic owner',
    role: 'client_contributor',
    status: 'active',
    client_ids: [cid]
  });
  const finding = {
    finding_id: fid,
    client_id: cid,
    title: 'Synthetic native exposure',
    description: 'Retained source detail',
    owner_id: 'qa-owner',
    severity: 'critical',
    status: 'closed',
    created_at: '2026-01-01T00:00:00Z',
    decision_history: [{action: 'validated', at: '2026-01-02T00:00:00Z'}]
  };
  db.findings.push(finding);
  db.tasks.push({
    task_id: 'qa-linked-work',
    client_id: cid,
    finding_id: fid,
    title: 'Retained linked work',
    status: 'done'
  });
  db.evidence.push({
    evidence_id: 'qa-linked-evidence',
    client_id: cid,
    linked_type: 'finding',
    linked_id: fid,
    filename: 'retained.txt',
    size: 1,
    content_base64: 'eA=='
  });
  saveStore(db);
  original = readStore();
});

function persona(role, clients = [cid]) {
  const db = readStore();
  db.user = {...db.user, role, client_ids: clients, all_clients: false};
  saveStore(db);
}

function ownRisks(db) {
  return db.risks.filter(r => r.finding_id === fid);
}

test.each(['super_admin', 'platform_admin'])(
  'native command creates one unassessed linked Risk for %s without changing completed work',
  async role => {
    persona(role);
    const before = readStore();
    const {data} = await api.post(route);
    const risk = data.risk;
    expect(risk).toMatchObject({
      client_id: cid,
      owner_id: 'qa-owner',
      category: 'compliance',
      status: 'identified',
      treatment: 'mitigate',
      description: 'Retained source detail',
      source_type: 'finding',
      source_id: fid,
      finding_id: fid,
      related_finding_ids: [fid],
      likelihood_score: null,
      impact_score: null,
      risk_score: null,
      risk_level: null
    });
    expect(risk.risk_id).toMatch(/^risks_demo_/);
    expect(risk.display_id).toBeTruthy();
    const saved = readStore();
    const finding = saved.findings.find(f => f.finding_id === fid);
    expect(ownRisks(saved)).toHaveLength(1);
    expect(finding).toMatchObject({
      ...before.findings.find(f => f.finding_id === fid),
      risk_id: risk.risk_id,
      updated_at: expect.any(String)
    });
    expect(saved.tasks).toEqual(before.tasks);
    expect(saved.evidence).toEqual(before.evidence);
    expect(saved.logs).toEqual(expect.arrayContaining(before.logs));
    expect(saved.logs.filter(e =>
      e.action === 'raise-risk' && e.entity_id === fid && e.client_id === cid
    )).toHaveLength(1);
    expect((await axios.create({adapter: previewAdapter}).get(`/risks/${risk.risk_id}`)).data)
      .toMatchObject({risk_id: risk.risk_id, finding_id: fid, risk_score: null});
  }
);

test.each(['client_readonly', 'client_grc_manager', 'client_contributor'])(
  '%s cannot raise a Risk from an existing Finding',
  async role => {
    persona(role);
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(api.post(route)).rejects.toMatchObject({response: {status: 403}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
);

test('provider from another tenant cannot create or reveal linked Risk', async () => {
  persona('platform_admin', ['demo_initech']);
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.post(route)).rejects.toMatchObject({response: {status: 403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('concurrent commands and later retry retain exactly one Risk and one link', async () => {
  const results = await Promise.allSettled([api.post(route), api.post(route)]);
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
  const db = readStore();
  const risk = ownRisks(db);
  expect(risk).toHaveLength(1);
  expect(db.findings.find(f => f.finding_id === fid).risk_id).toBe(risk[0].risk_id);
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.post(route)).rejects.toThrow('Risk already linked');
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('missing Finding fails without persisting a Risk or disturbing retained rows', async () => {
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.post('/findings/qa-missing/raise-risk')).rejects.toThrow();
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  expect(readStore().tasks).toEqual(original.tasks);
});

test('assigned contributor still cannot invoke administrator-only raise-risk command', async () => {
  persona('client_contributor');
  const db = readStore();
  db.findings.find(f => f.finding_id === fid).owner_id = db.user.user_id;
  saveStore(db);
  expect(readStore().findings.find(f => f.finding_id === fid).owner_id).toBe(readStore().user.user_id);
  const before = sessionStorage.getItem(STORE_KEY);
  await expect(api.post(route)).rejects.toMatchObject({response: {status: 403}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});
