import catalog from '@/lib/onboardingCatalog.json';
import { baselineState, saveBaseline } from './baseline';
import axios from 'axios';
import fixtures from './fixtures.json';
import { clone, readStore, saveStore, resetStore, ids, list, record, write, library, audit, uid, now } from './store';
import { portfolio, dashboard } from './summaries';
import { onboard, action } from './workflows';
import { guardEdit } from './decisions';
const SESSION = 'grc_demo_entered';
// Loaded only by the explicit demo build. No request is forwarded to any server.
export async function previewAdapter(config) {
  const url = new URL(config.url, 'https://demo.invalid'),
    path = url.pathname;
  const params = {
    ...Object.fromEntries(url.searchParams),
    ...config.params
  };
  const method = (config.method || 'get').toLowerCase();
  const respond = data => ({
    data: clone(data),
    status: 200,
    statusText: 'OK',
    headers: {},
    config
  });
  const fail = (status, detail) => {
    throw new axios.AxiosError(detail, 'ERR_BAD_REQUEST', config, null, {
      data: {
        detail
      },
      status,
      config
    });
  };
  try {
    const db = readStore();
    if (path === '/auth/login' && method === 'post') {
      localStorage.removeItem('grc_token');
      localStorage.setItem(SESSION, 'true');
      return respond({
        user: db.user
      });
    }
    if (path === '/auth/logout') {
      localStorage.removeItem(SESSION);
      return respond({
        ok: true
      });
    }
    if (localStorage.getItem(SESSION) !== 'true') return fail(401, 'Click Sign in to open the demo preview.');
    if (params.client_id && !db.clients.some(c => c.client_id === params.client_id)) return fail(404, 'Demo client not found.');
    const parts = path.split('/').filter(Boolean),
      [kind, id, name] = parts;
    const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
    const save = data => {
      saveStore(db);
      return respond(data);
    };
    if (path === '/demo/reset' && method === 'post') {
      resetStore();
      return respond({
        ok: true
      });
    }
    if (path === '/demo/onboarding-draft') {
      record(db, 'clients', params.client_id || body.client_id);
      if (method === 'get') return respond(db.drafts[params.client_id] || null);
      db.drafts[body.client_id] = body.draft;
      return save({
        ok: true
      });
    }
    if (path === '/onboarding/baseline') {
      const cid = params.client_id || body.client_id;
      if (method === 'get') return respond({catalog, state:baselineState(db,cid)});
      return save(saveBaseline(db,cid,body.state,body.finalize));
    }
    if (path === '/auth/me') return respond(db.user);
    if (method === 'get') {
      if (path === '/clients/directory') return respond(portfolio(db, params.include_archived === true || params.include_archived === 'true'));
      if (path === '/clients') return respond(db.clients.filter(c => params.include_archived === true || params.include_archived === 'true' || c.status !== 'archived'));
      if (kind === 'clients' && name === 'members') {
        record(db, 'clients', id);
        return respond(db.users.filter(u => ['super_admin', 'platform_admin'].includes(u.role) || (u.client_ids || []).includes(id)));
      }
      if (path === '/dashboard') return respond(dashboard(db, params));
      if (path === '/onboarding/policy-library') return respond(library(db, 'policy', params.client_id));
      if (path === '/onboarding/requirements-library') return respond(library(db, 'requirements', params.client_id));
      if (path === '/onboarding/state') return respond({
        contacts: list(db, 'contacts', params.client_id),
        assessments: list(db, 'assessments', params.client_id),
        onboarding_history: db.logs.filter(l => l.client_id === params.client_id && l.action.includes('onboarding'))
      });
      if (path === '/baseline/templates') return respond(fixtures.responses[path]);
      if (path === '/calendar') {
        const data = {
          reviews: {},
          findings: {},
          tasks: {}
        };
        for (const k of Object.keys(data)) for (const r of list(db, k, params.client_id)) if (r.due_date && (!params.start || r.due_date >= params.start) && (!params.end || r.due_date <= params.end)) {
          const day = r.due_date.slice(0, 10);
          (data[k][day] ||= []).push({
            ...r,
            id: r[ids[k]],
            kind: k.slice(0, -1)
          });
        }
        return respond(data);
      }
      if (path === '/related') {
        const source = record(db, params.entity_type, params.entity_id),
          data = {
            reviews: [],
            findings: [],
            tasks: [],
            risks: [],
            policies: [],
            vendors: [],
            exceptions: [],
            evidence: []
          };
        for (const k of Object.keys(data)) data[k] = list(db, k, source.client_id).filter(r => k === params.entity_type
          ? k === 'reviews' && (r.parent_review_id === params.entity_id || r.review_id === source.parent_review_id || r.review_id === source.next_occurrence_id)
          : r[ids[params.entity_type]] === params.entity_id || (source[ids[k]] && source[ids[k]] === r[ids[k]]) || (k === 'evidence' && r.linked_id === params.entity_id));
        return respond(data);
      }
      if (kind === 'comments') return respond(db.comments.filter(r => r.entity_type === params.entity_type && r.entity_id === params.entity_id));
      if (kind === 'notifications') return respond({
        items: db.notifications,
        unread: db.notifications.filter(n => !n.read_at).length
      });
      if (kind === 'audit-logs') {
        if (id === 'facets') return respond({
          ...fixtures.responses[path],
          clients: db.clients.map(c => ({
            client_id: c.client_id,
            name: c.name
          })),
          users: db.users,
          entity_types: [...new Set(db.logs.map(l => l.entity_type))]
        });
        const logs = db.logs.filter(r => Object.entries(params).every(([k, v]) => !v || !['client_id', 'entity_type', 'entity_id', 'action', 'user_id'].includes(k) || r[k] === v) && (!params.start_date || r.at >= params.start_date) && (!params.end_date || r.at <= params.end_date) && (!params.q || JSON.stringify(r).toLowerCase().includes(params.q.toLowerCase()))).map(r => ({
          ...r,
          client_name: db.clients.find(c => c.client_id === r.client_id)?.name
        }));
        if (id === 'export.csv') {
          const fields = ['at', 'user_name', 'action', 'entity_type', 'entity_id', 'client_id'];
          const cell = v => '\"' + String(v || '').replace(/\"/g, '\"\"') + '\"';
          return respond([fields.join(','), ...logs.map(r => fields.map(k => cell(r[k])).join(','))].join('\r\n'));
        }
        if (!params.page && !params.page_size) return respond(logs);
        const size = Number(params.page_size) || 50;
        return respond({
          items: logs.slice(((Number(params.page) || 1) - 1) * size, (Number(params.page) || 1) * size),
          total: logs.length,
          page: Number(params.page) || 1,
          page_size: size
        });
      }
      if (kind === 'users' && name === 'open_assignments') return respond({
        findings: db.findings.filter(r => r.owner_id === id && ['open', 'in_remediation'].includes(r.status)).length,
        reviews: db.reviews.filter(r => r.owner_id === id && !['completed', 'cancelled'].includes(r.status)).length,
        tasks: db.tasks.filter(r => r.assignee_id === id && !['done', 'cancelled'].includes(r.status)).length,
        significant_risks: db.risks.filter(r => r.owner_id === id && r.status !== 'closed' && ['high', 'critical'].includes(r.risk_level)).length
      });
      if (kind === 'evidence' && name === 'download') {
        const r = record(db, kind, id);
        if (!r.content_base64) throw new Error('This sample has no downloadable file. Upload a temporary demo file to test downloading.');
        return respond(r);
      }
      if (ids[kind]) {
        if (id) {
          const r = record(db, kind, id);
          if (params.client_id && r.client_id !== params.client_id) return fail(404, 'Record not found for this client.');
          return respond(r);
        }
        return respond(list(db, kind, params.client_id).filter(r => Object.entries(params).every(([k, v]) => !v || !['linked_id', 'linked_type'].includes(k) || r[k] === v)));
      }
      return fail(404, 'This view is not implemented in the demo.');
    }
    if (path === '/onboarding/finalize') {
      const result = onboard(db, body);
      delete db.drafts[body.client_id];
      return save(result);
    }
    if (path === '/onboarding/policy-responses') return save(onboard(db, {
      client_id: body.client_id,
      policy_responses: body.responses
    }));
    if (path === '/bulk') {
      if (!ids[body.kind] || !body.ids?.length) throw new Error('Select records first.');
      const rows = body.ids.map(i => record(db, body.kind, i));
      const payload = body.payload || {};
      const close = {
        reviews: 'completed',
        tasks: 'done',
        policies: 'retired',
        vendors: 'inactive',
        assets: 'retired',
        exceptions: 'revoked'
      };
      for (const r of rows) {
        if (body.action === 'delete') {
          db[body.kind] = db[body.kind].filter(x => x[ids[body.kind]] !== r[ids[body.kind]]);
          audit(db, 'delete', body.kind, r);
          continue;
        }
        let patch;
        if (body.action === 'close') patch = {
          status: close[body.kind] || 'closed'
        };else if (body.action === 'set-status') {
          if (!payload.status) throw new Error('Missing status');
          patch = {
            status: payload.status
          };
        } else if (['set-owner', 'assign'].includes(body.action)) patch = {
          [body.action === 'assign' || body.kind === 'tasks' ? 'assignee_id' : 'owner_id']: payload.owner_id || payload.assignee_id || null
        };else if (body.action === 'set-due-date') {
          if (!payload.due_date) throw new Error('Missing due date');
          patch = {
            due_date: payload.due_date
          };
        } else if (body.action === 'update') patch = payload;else throw new Error('Unknown bulk action');
        guardEdit(body.kind, patch, r);
        if (body.kind === 'reviews' && patch.status === 'completed' && r.status !== 'completed') {
          const { status, ...fields } = patch;
          write(db, body.kind, fields, r.review_id);
          action(db, 'reviews', r.review_id, 'complete', { spawn_next: true });
        } else write(db, body.kind, patch, r[ids[body.kind]]);
      }
      return save({
        ok: true,
        count: rows.length
      });
    }
    if (kind === 'notifications') {
      for (const n of db.notifications) if (id === 'read-all' || n.notification_id === id) {
        n.read_at = now();
        n.read = true;
      }
      return save({
        ok: true
      });
    }
    if (kind === 'me') {
      if (id === 'password') throw new Error('Demo sign-in has no password. Password changes require a configured authentication environment.');
      Object.assign(db.user, body);
      const userRecord = db.users.find(u => u.user_id === db.user.user_id);
      if (userRecord) Object.assign(userRecord, body);
      return save(db.user);
    }
    if (kind === 'users' && name === 'resend-invite') {
      const user = record(db, 'users', id);
      user.invite_sent_at = now();
      audit(db, 'simulated-invite', kind, user);
      return save({
        ok: true,
        simulated: true,
        message: 'Simulated invitation — no email was sent.'
      });
    }
    if (ids[kind] && name) {
      const result = action(db, kind, id, name, body);
      const r = record(db, kind, id);
      audit(db, name, kind, r);
      if (['invite', 'submit-review', 'approve', 'reject', 'schedule-review', 'create-finding', 'create-task', 'complete'].includes(name)) db.notifications.unshift({
        notification_id: uid('notification'),
        title: `Simulated: ${name.replaceAll('-', ' ')} · ${r.title || r.name}`,
        client_id: r.client_id,
        entity_type: kind,
        entity_id: id,
        created_at: now(),
        read: false,
        read_at: null,
        simulated: true
      });
      return save(result);
    }
    if (kind === 'comments') {
      const source = record(db, body.entity_type, body.entity_id);
      if (!body.body?.trim()) throw new Error('Comment cannot be empty.');
      const comment = {
        ...body,
        comment_id: uid('comment'),
        client_id: source.client_id,
        created_at: now(),
        user_id: db.user.user_id,
        user_name: db.user.name,
        user_email: db.user.email
      };
      db.comments.push(comment);
      return save(comment);
    }
    if (ids[kind]) {
      if (method === 'delete') {
        const r = record(db, kind, id);
        if (kind === 'reviews' && r.status === 'completed' || kind === 'evidence' && db.reviews.some(v => v.completion_snapshot?.evidence?.some(e => e.evidence_id === id))) throw new Error('Completed reviews and their evidence must be retained.');
        db[kind] = db[kind].filter(x => x[ids[kind]] !== id);
        audit(db, 'delete', kind, r);
        return save({
          ok: true
        });
      }
      if (kind === 'evidence') {
        if (id) throw new Error('Evidence versions are immutable. Upload a new artifact.');
        if (!body.filename || !body.content_base64) throw new Error('Select a file to upload.');
        if (Math.floor(body.content_base64.split(',').pop().length * 3 / 4) > 1048576) throw new Error('Demo evidence is limited to 1 MB per file because it is stored in this browser session.');
        if (body.linked_id) {
          const target = record(db, body.linked_type === 'policy' ? 'policies' : `${body.linked_type}s`, body.linked_id);
          if (target.client_id !== body.client_id) throw new Error('Evidence must belong to the same client.');
          if (['review','reviews'].includes(body.linked_type) && target.status === 'completed') throw new Error('Completed review evidence is frozen.');
        }
        body.size = Math.floor(body.content_base64.split(',').pop().length * 3 / 4);
        body.version = 1;
        body.uploaded_at = now();
        body.uploaded_by = db.user.user_id;
      }
      if (kind === 'users' && !id) {
        if (db.users.some(u => u.email?.toLowerCase() === body.email?.toLowerCase())) throw new Error('Email already exists.');
        body.simulated = true;
        body.status = 'invited';
      }
      if (!['evidence','users','clients','comments'].includes(kind)) guardEdit(kind, body, id ? record(db, kind, id) : {});
      if (kind === 'reviews' && id && body.status === 'completed' && record(db, kind, id).status !== 'completed') {
        const { status, ...fields } = body;
        write(db, kind, fields, id);
        return save(action(db, kind, id, 'complete', { spawn_next: true }).review);
      }
      const result = write(db, kind, body, id);
      return save(kind === 'users' && !id ? {
        user: result,
        simulated: true,
        message: 'Simulated invitation — no email was sent.'
      } : result);
    }
    return fail(501, 'This action is not implemented in the demo. No changes were saved.');
  } catch (error) {
    if (error.isAxiosError) throw error;
    return fail(400, error.message || 'Demo action failed. No changes were saved.');
  }
}
