import axios from "axios";
import { previewAdapter } from "./adapter";
import { loadClientDashboard } from "../lib/loadClientDashboard";
const api = axios.create({
  adapter: previewAdapter
});
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
test("explicit click enters without credentials, refresh persists, logout closes entry", async () => {
  await expect(api.get("/auth/me")).rejects.toMatchObject({
    response: {
      status: 401
    }
  });
  localStorage.setItem("grc_token", "stale-real-session");
  const {
    data
  } = await api.post("/auth/login", {});
  expect(data.user.role).toBe("super_admin");
  expect(data.access_token).toBeUndefined();
  expect(localStorage.getItem("grc_token")).toBeNull();
  const reloaded = axios.create({
    adapter: previewAdapter
  });
  expect((await reloaded.get("/auth/me")).data.user_id).toBe(data.user.user_id);
  await api.post("/auth/logout");
  await expect(api.get("/clients")).rejects.toMatchObject({
    response: {
      status: 401
    }
  });
  await api.post("/auth/login");
  expect((await api.get("/clients")).data.length).toBeGreaterThan(0);
});
test("portfolio and every sample client load through the real dashboard loader", async () => {
  const {
    data: {
      user
    }
  } = await api.post("/auth/login");
  const {
    data: directory
  } = await api.get("/clients/directory", {
    params: {
      include_archived: "false"
    }
  });
  expect(directory.clients.length).toBe(2);
  expect(directory.portfolio).toBeTruthy();
  expect(Array.isArray(directory.attention_queue)).toBe(true);
  for (const client of (await api.get("/clients")).data) {
    const result = await loadClientDashboard(api, {
      clientId: client.client_id,
      user,
      scope: {
        kind: "org"
      }
    });
    expect(Array.isArray(result.attention)).toBe(true);
    expect(result.members.length).toBeGreaterThan(0);
    const rows = (await api.get("/tasks", {
      params: {
        client_id: client.client_id
      }
    })).data;
    expect(rows.every(row => row.client_id === client.client_id)).toBe(true);
  }
});
test("unknown client is rejected and invalid writes do not save", async () => {
  await api.post("/auth/login");
  await expect(api.get("/dashboard", {
    params: {
      client_id: "missing",
      scope: "org"
    }
  })).rejects.toMatchObject({
    response: {
      status: 404
    }
  });
  await expect(api.post("/clients", {
    name: ""
  })).rejects.toMatchObject({
    response: {
      status: 400
    }
  });
});
const get = async (kind, cid) => (await api.get(`/${kind}`, {
  params: {
    client_id: cid
  }
})).data;
async function newClient(name = 'Interactive QA') {
  return (await api.post('/clients', {
    name
  })).data;
}
test('new clients initialize empty, persist, edit/archive/restore, and reset', async () => {
  await api.post('/auth/login');
  const c = await newClient();
  for (const kind of ['reviews', 'findings', 'tasks', 'risks', 'policies', 'vendors', 'contacts', 'requirements', 'evidence', 'exceptions']) expect(await get(kind, c.client_id)).toEqual([]);
  expect((await api.get('/clients')).data).toContainEqual(c);
  expect((await api.get('/clients/directory')).data.clients.find(r => r.client_id === c.client_id)).toMatchObject({
    past_due: 0,
    unassigned: 0,
    program_status: 'onboarding'
  });
  await api.patch(`/clients/${c.client_id}`, {
    name: 'Renamed',
    status: 'archived'
  });
  expect((await api.get('/clients')).data.some(r => r.client_id === c.client_id)).toBe(false);
  expect((await api.get('/clients', {
    params: {
      include_archived: true
    }
  })).data.some(r => r.name === 'Renamed')).toBe(true);
  await api.patch(`/clients/${c.client_id}`, {
    status: 'active'
  });
  const reloaded = axios.create({
    adapter: previewAdapter
  });
  expect((await reloaded.get('/clients')).data.some(r => r.name === 'Renamed')).toBe(true);
  await api.post('/demo/reset');
  expect((await api.get('/clients')).data).toHaveLength(2);
});
test('onboarding draft and finalization survive client switching without duplicating or crossing tenants', async () => {
  await api.post('/auth/login');
  const a = await newClient('A'),
    b = await newClient('B');
  const draft = {
    step: 2,
    contacts: {
      'IT Lead': {
        name: 'Demo Person',
        role: 'IT Lead'
      }
    }
  };
  await api.post('/demo/onboarding-draft', {
    client_id: a.client_id,
    draft
  });
  expect((await api.get('/demo/onboarding-draft', {
    params: {
      client_id: b.client_id
    }
  })).data).toBeNull();
  expect((await api.get('/demo/onboarding-draft', {
    params: {
      client_id: a.client_id
    }
  })).data).toEqual(draft);
  const body = {
    client_id: a.client_id,
    policy_responses: [{
      name: 'Information Security Policy',
      response: 'no'
    }],
    requirement_responses: [{
      name: 'SOC 2',
      applicability: 'applicable'
    }],
    contacts: [{
      role: 'IT Lead',
      name: 'Demo Person'
    }],
    assessments: [{
      name: 'Test assessment'
    }],
    known_issues: [{
      title: 'Known test issue'
    }],
    recurring_reviews: [{
      title: 'Test review',
      review_type: 'access',
      recurrence: 'annual',
      due_days: 30
    }]
  };
  await api.post('/onboarding/finalize', body);
  await api.post('/onboarding/finalize', body);
  expect(await get('policies', a.client_id)).toHaveLength(1);
  expect(await get('tasks', a.client_id)).toHaveLength(2);
  expect(await get('reviews', a.client_id)).toHaveLength(1);
  expect(await get('contacts', a.client_id)).toHaveLength(1);
  expect(await get('policies', b.client_id)).toEqual([]);
  const lib = (await api.get('/onboarding/policy-library', {
    params: {
      client_id: a.client_id
    }
  })).data;
  expect(lib.categories.flatMap(c => c.items).find(i => i.name === 'Information Security Policy').current_presence).toBe('reported_missing');
  const before = await get('policies', a.client_id);
  await expect(api.post('/onboarding/finalize', {
    client_id: a.client_id,
    policy_responses: [{
      name: 'Invalid N/A',
      response: 'na'
    }]
  })).rejects.toBeTruthy();
  expect(await get('policies', a.client_id)).toEqual(before);
});
test('review → finding → task → risk actions persist, update counts, preserve relationships and recurrence', async () => {
  await api.post('/auth/login');
  const c = await newClient();
  const {
    data: r
  } = await api.post('/reviews', {
    client_id: c.client_id,
    title: 'QA annual review',
    review_type: 'access',
    due_date: '2026-01-31T00:00:00.000Z',
    recurrence: 'monthly'
  });
  const {
    data: f
  } = await api.post(`/reviews/${r.review_id}/create-finding`, {
    severity: 'high',
    due_date: '2020-01-01',
    title: 'QA finding'
  });
  const {
    data: t
  } = await api.post(`/findings/${f.finding_id}/create-task`, {});
  expect(t.finding_id).toBe(f.finding_id);
  let row = (await api.get('/clients/directory')).data.clients.find(x => x.client_id === c.client_id);
  expect(row.past_due).toBe(2);
  expect(row.critical_high_open).toBe(1);
  const {
    data: {
      risk
    }
  } = await api.post(`/findings/${f.finding_id}/raise-risk`);
  expect(risk.risk_score).toBe(16);
  await api.patch(`/risks/${risk.risk_id}`, {
    likelihood_score: 1,
    impact_score: 2
  });
  expect((await get('risks', c.client_id))[0]).toMatchObject({
    risk_score: 2,
    risk_level: 'low'
  });
  const result = (await api.post(`/reviews/${r.review_id}/complete`, {
    spawn_next: true
  })).data;
  expect(result.review.status).toBe('completed');
  expect(result.spawned.due_date).toBe('2026-02-28T00:00:00.000Z');
  await expect(api.post(`/reviews/${r.review_id}/complete`, {
    spawn_next: true
  })).rejects.toBeTruthy();
  await api.post('/bulk', {
    kind: 'tasks',
    ids: [t.task_id],
    action: 'close'
  });
  expect((await get('tasks', c.client_id))[0].status).toBe('done');
  const other = await newClient('Other');
  await expect(api.patch(`/risks/${risk.risk_id}`, {
    client_id: other.client_id
  })).rejects.toBeTruthy();
  expect(await get('risks', other.client_id)).toEqual([]);
});
test('policy approval, vendor review, evidence, comments and invitations update real demo records only', async () => {
  await api.post('/auth/login');
  const c = await newClient();
  const {
    data: p
  } = await api.post('/policies', {
    client_id: c.client_id,
    title: 'Test policy'
  });
  await api.post(`/policies/${p.policy_id}/submit-review`);
  await api.post(`/policies/${p.policy_id}/approve`, {
    comment: 'Test approval'
  });
  expect((await get('policies', c.client_id))[0]).toMatchObject({
    status: 'approved'
  });
  const {
    data: v
  } = await api.post('/vendors', {
    client_id: c.client_id,
    name: 'Test vendor'
  });
  await api.post(`/vendors/${v.vendor_id}/schedule-review`, {
    due_date: '2027-01-15'
  });
  expect((await get('reviews', c.client_id))[0].vendor_id).toBe(v.vendor_id);
  const {
    data: e
  } = await api.post('/evidence', {
    client_id: c.client_id,
    filename: 'test.txt',
    content_base64: 'data:text/plain;base64,VEVTVA==',
    linked_type: 'policy',
    linked_id: p.policy_id
  });
  expect((await api.get(`/evidence/${e.evidence_id}/download`)).data.content_base64).toContain('VEVTVA==');
  await api.post('/comments', {
    entity_type: 'policies',
    entity_id: p.policy_id,
    body: 'Test comment'
  });
  expect((await api.get('/comments', {
    params: {
      entity_type: 'policies',
      entity_id: p.policy_id
    }
  })).data).toHaveLength(1);
  const {
    data: c1
  } = await api.post('/contacts', {
    client_id: c.client_id,
    name: 'Fixture Person',
    email: 'fixture@example.test'
  });
  const invite = (await api.post(`/contacts/${c1.contact_id}/invite`)).data;
  expect(invite.simulated).toBe(true);
  expect(invite.invite_link).toBeUndefined();
  expect((await get('contacts', c.client_id))[0].linked_user_id).toBe(invite.user.user_id);
  await api.delete(`/evidence/${e.evidence_id}`);
  expect(await get('evidence', c.client_id)).toEqual([]);
});
test('storage failure rejects mutations without pretending to save', async () => {
  await api.post('/auth/login');
  const before = (await api.get('/clients')).data;
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('QuotaExceededError');
  });
  await expect(newClient('Storage failure')).rejects.toThrow('not saved');
  spy.mockRestore();
  expect((await api.get('/clients')).data).toEqual(before);
});
test('sample portfolio totals and client KPIs match the backend-generated reference snapshots', async () => {
  const fixtures = require('./fixtures.json');
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(fixtures.generated_at));
  try {
    await api.post('/auth/login');
    const actual = (await api.get('/clients/directory')).data;
    const expected = fixtures.responses['/clients/directory'];
    for (const key of ['past_due', 'due_30d', 'due_31_90d', 'critical_high_open', 'unassigned', 'clients_requiring_attention']) expect(actual.portfolio[key]).toBe(expected.portfolio[key]);
    for (const c of (await api.get('/clients')).data) {
      const result = (await api.get('/dashboard', {
        params: {
          client_id: c.client_id,
          scope: 'org'
        }
      })).data;
      const reference = fixtures.responses[`/dashboard?client_id=${c.client_id}&scope=org`];
      expect(result.kpis).toEqual(reference.kpis);
      for (const [key, snapshot] of Object.entries(fixtures.responses)) {
        if (!key.startsWith(`/dashboard?client_id=${c.client_id}&`)) continue;
        const params = Object.fromEntries(new URL(key, 'https://demo.invalid').searchParams);
        expect((await api.get('/dashboard', { params })).data.kpis).toEqual(snapshot.kpis);
      }
    }
  } finally {
    jest.useRealTimers();
  }
});
