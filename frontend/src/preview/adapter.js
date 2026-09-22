import catalog from '@/lib/onboardingCatalog.json';
import { assignmentCandidates } from './assignmentEligibility';
import { clientProjection, leadCandidates } from './clientRelationships';
import {aiRequest,aiRelated} from './aiGovernance';
import {frameworkRequest,frameworkReverse,frameworkScope} from './frameworks';
import { baselineState, saveBaseline } from './baseline';
import axios from 'axios';
import fixtures from './demoConfiguration.json';
import { clone, readStore, saveStore, resetStore, ids, list, record, write, library, audit, uid, now } from './store';
import { portfolio, dashboard } from './summaries';
import { onboard, action } from './workflows';
import { guardEdit } from './decisions';
import { history, reviewEvent } from './reviews';
import { reviewView, belongsToOccurrence, assertCurrentOccurrence } from '../lib/reviewOccurrences';
import {evidencePage,evidenceAccess} from './evidence';
import {evidenceKind} from '../lib/evidenceReferences';
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
    if (path === '/auth/login') return fail(401, 'Use standard sign-in for email and password authentication.');
    if (path === '/demo/enter' && method === 'post') {
      localStorage.removeItem('grc_token');
      sessionStorage.setItem(SESSION, 'true');
      return respond({
        user: db.user
      });
    }
    if (path === '/auth/logout') {
      sessionStorage.removeItem(SESSION);
      return respond({
        ok: true
      });
    }
    if (sessionStorage.getItem(SESSION) !== 'true') return fail(401, 'Choose Explore Demo to enter the sample workspace.');
    if (params.client_id && !db.clients.some(c => c.client_id === params.client_id)) return fail(404, 'Demo client not found.');
    const parts = path.split('/').filter(Boolean),
      [kind, id, name] = parts;
    const body = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
    if(kind==='evidence'){
      const cid=method==='get'&&!id?params.client_id:id&&id!=='catalog'?record(db,'evidence',id).client_id:body.client_id||params.client_id;
      if(cid&&!evidenceAccess(db.user,cid))return fail(403,'Forbidden for this client');
      if(method!=='get'&&!['super_admin','platform_admin','client_contributor'].includes(db.user.role))return fail(403,'Read-only role');
      if(method==='delete'&&!['super_admin','platform_admin'].includes(db.user.role))return fail(403,'Destructive action restricted');
      if(path==='/evidence/catalog'&&method==='get')return respond(evidencePage(db,params));
    }
    // Existing Evidence/comments/related endpoints keep the assessment's tenant boundary.
    const parentType=params.entity_type||body.entity_type||params.linked_type||body.linked_type;
    if(['framework_assessment','framework_assessments'].includes(parentType)){
      const parent=record(db,'framework_assessments',params.entity_id||body.entity_id||params.linked_id||body.linked_id);
      frameworkScope(db,parent.client_id);
      if(method!=='get'&&!['super_admin','platform_admin','client_contributor'].includes(db.user.role))throw new Error('Read-only role');
    }
    const save = data => {
      saveStore(db);
      return respond(data);
    };
    if(path==='/ai-intake'||kind==='ai_systems')return save(aiRequest(db,path,method,params,body));
    if(kind==='frameworks'||kind==='framework_assessments')return save(frameworkRequest(db,path,method,params,body));
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
      if (kind === 'reviews' && ['history','activity'].includes(name)) {
        const review = record(db,kind,id);
        if (name === 'history') return respond(history(db,review));
        return respond(db.logs.filter(l => l.action !== 'update' && l.client_id === review.client_id && l.entity_id === id && ['review','reviews'].includes(l.entity_type)
          && (!params.occurrence_id || belongsToOccurrence({occurrence_id:l.meta?.occurrence_id}, review, params.occurrence_id)))
          .map(l => ({...l,log_id:l.log_id || l.audit_id})));
      }
      if (path === '/clients/directory') return respond(portfolio(db, params.include_archived === true || params.include_archived === 'true'));
      if (path === '/clients') return respond(db.clients.filter(c => params.include_archived === true || params.include_archived === 'true' || c.status !== 'archived').map(c => clientProjection(db, c)));
      if (path === '/clients/grc-leads') return respond(leadCandidates(db, params.client_id));
      if (kind === 'risks' && name === 'review-history') return respond(db.reviews.filter(r=>r.risk_id===id&&r.client_id===record(db,'risks',id).client_id).flatMap(r=>(r.occurrences||[]).map(o=>({...o,review_id:r.review_id}))));
      if (['risks','tasks','vendors'].includes(kind) && name === 'activity') {
        const task=record(db,kind,id);
        return respond(db.logs.filter(l=>l.entity_id===id&&l.client_id===task.client_id&&[kind,kind==='risks'?'risk':kind==='vendors'?'vendor':'task'].includes(l.entity_type)).map(l=>({...l,log_id:l.log_id||l.audit_id})));
      }
      if (kind === 'clients' && name === 'assignees') {
        record(db, 'clients', id);
        return respond(assignmentCandidates(db, id, params));
      }
      if (kind === 'clients' && name === 'members') {
        record(db, 'clients', id);
        return respond(db.users.filter(u => u.role === 'super_admin' || (u.client_ids || []).includes(id)));
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
            assessments: [],
            vendors: [],
            exceptions: [],
            evidence: []
          };
        for (const k of Object.keys(data)) data[k] = list(db, k, source.client_id).filter(r => k === params.entity_type
          ? k === 'reviews' && (r.parent_review_id === params.entity_id || r.review_id === source.parent_review_id || r.review_id === source.next_occurrence_id)
          : (params.entity_type==='vendors'&&k==='risks'&&source.related_risk_ids?.includes(r.risk_id)) || (params.entity_type==='risks'&&k==='vendors'&&r.related_risk_ids?.includes(params.entity_id)) || (params.entity_type==='risks'&&k==='tasks'&&source.related_task_ids?.includes(r.task_id)) || (params.entity_type==='tasks'&&k==='risks'&&r.related_task_ids?.includes(params.entity_id)) || r[ids[params.entity_type]] === params.entity_id || (source[ids[k]] && source[ids[k]] === r[ids[k]]) || (k === 'evidence' && r.linked_id === params.entity_id));
        if (params.entity_type === 'reviews' && params.occurrence_id)
          for (const k of ['findings','tasks','evidence']) data[k] = data[k].filter(r => belongsToOccurrence(r,source,params.occurrence_id));
        if(['tasks','findings'].includes(params.entity_type)&&source.occurrence_id) for(const review of data.reviews) {
          const o=review.occurrences?.find(o=>o.occurrence_id===source.occurrence_id);
          if(o) review.linked_occurrence={period:o.period,status:o.status};
          else if((review.current_occurrence_id||'occ_'+review.review_id)===source.occurrence_id) review.linked_occurrence={period:reviewView(review).period,status:review.status};
        }
        return respond(frameworkReverse(db,params.entity_type,source,aiRelated(db,params.entity_type,source,data)));
      }
      if (kind === 'comments') return respond(db.comments.filter(r => r.entity_type === params.entity_type && r.entity_id === params.entity_id
        && (!['review','reviews'].includes(params.entity_type) || belongsToOccurrence(r,record(db,'reviews',params.entity_id),params.occurrence_id))));
      if (kind === 'notifications') return respond({
        items: db.notifications,
        unread: db.notifications.filter(n => !n.read_at).length
      });
      if (kind === 'audit-logs') {
        if (id === 'facets') return respond({
          actions: [...new Set(db.logs.map(l => l.action))],
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
        let rows = list(db, kind, params.client_id).filter(r => Object.entries(params).every(([k, v]) => !v || !['linked_id', 'linked_type'].includes(k) || r[k] === v));
        if(kind==='evidence')rows=rows.filter(r=>!r.archived_at&&evidenceAccess(db.user,r.client_id)).map(({content_base64,...metadata})=>metadata);
        if (kind === 'reviews') rows = rows.map(reviewView);
        if (kind === 'evidence' && params.linked_id && ['review','reviews'].includes(params.linked_type))
          rows = rows.filter(r => belongsToOccurrence(r,record(db,'reviews',params.linked_id),params.occurrence_id));
        return respond(rows);
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
      if(body.kind==='framework_assessments')throw new Error('Use the framework workspace; assessment history is retained');
      if (!ids[body.kind] || !body.ids?.length) throw new Error('Select records first.');
      const rows = body.ids.map(i => record(db, body.kind, i));
      if (body.kind === 'contacts' && body.action === 'delete' && db.clients.some(c => rows.some(r => r.client_id === c.client_id && r.contact_id === c.primary_contact_id))) throw new Error('A selected Contact is a Primary Contact. Archive it or change the client relationship before deleting it.');
      if (body.kind === 'reviews' && body.action === 'delete' && rows.some(r => r.status === 'completed' || r.occurrences?.length))
        throw new Error('Review history must be retained.');
      if (body.kind === 'tasks' && body.action === 'delete' && rows.some(r=>r.status==='done'||r.completed_at)) throw new Error('Completed Action Items must be retained.');
      if(body.kind==='ai_systems'||body.action==='delete'&&(['risks','vendors'].includes(body.kind)||body.kind==='reviews'&&rows.some(r=>r.risk_id||r.vendor_id||r.ai_system_id))) throw new Error('Governance records and their Review obligations must be retained.');
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
        guardEdit(body.kind, patch, r, db.user);
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
      if (kind !== 'reviews') audit(db, name, kind, r);
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
      if (['review','reviews'].includes(body.entity_type)) assertCurrentOccurrence(source,body.occurrence_id);
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
        if (kind === 'contacts' && db.clients.some(c => c.client_id === r.client_id && c.primary_contact_id === id)) throw new Error('This is the Primary Contact. Archive the Contact or change the client relationship before deleting it.');
        if(kind==='evidence'&&db.vendors.some(v=>v.client_id===r.client_id&&(v.contract_evidence_ids?.includes(id)||v.assurance_records?.some(a=>a.evidence_ids?.includes(id))||v.vendor_id===r.linked_id&&['inactive','terminated'].includes(v.status)))) throw new Error('Vendor assurance, contract and historical evidence must be retained.');
        if(kind==='evidence'&&['risk','risks'].includes(r.linked_type)&&db.risks.some(x=>x.risk_id===r.linked_id&&['closed','retired'].includes(x.status))) throw new Error('Closed Risk evidence must be retained.');
        if(kind==='evidence'&&['ai_system','ai_systems'].includes(r.linked_type)&&(db.ai_systems||[]).some(x=>x.ai_system_id===r.linked_id&&x.status==='retired'))throw new Error('Retired AI evidence must be retained');
        if(['risks','vendors'].includes(kind)||kind==='reviews'&&(r.risk_id||r.vendor_id||r.ai_system_id)) throw new Error('Governance records and their Review obligations must be retained.');
        if (kind==='tasks'&&(r.status==='done'||r.completed_at) || kind==='evidence'&&db.tasks.some(t=>t.task_id===r.linked_id&&t.client_id===r.client_id&&t.status==='done')) throw new Error('Completed Action Items and their evidence must be retained.');
        if (kind === 'reviews' && (r.status === 'completed' || r.occurrences?.length) || kind === 'evidence' && db.reviews.some(v => v.completion_snapshot?.evidence?.some(e => e.evidence_id === id) || v.occurrences?.some(o => o.evidence?.some(e => e.evidence_id === id)))) throw new Error('Completed reviews and their evidence must be retained.');
        if(kind==='evidence')r.archived_at=now();
        else db[kind] = db[kind].filter(x => x[ids[kind]] !== id);
        audit(db, 'delete', kind, r);
        return save({
          ok: true
        });
      }
      if (kind === 'evidence') {
        if (id) throw new Error('Evidence versions are immutable. Upload a new artifact.');
        if (!body.filename || !body.content_base64) throw new Error('Select a file to upload.');
        if (Math.floor(body.content_base64.split(',').pop().length * 3 / 4) > 1048576) throw new Error('Demo evidence is limited to 1 MB per file because it is stored in this browser session.');
        if(!!body.linked_type!==!!body.linked_id)throw new Error('Evidence requires both parent type and ID');
        if (body.linked_id) {
          if(!evidenceKind(body.linked_type))throw new Error('Unsupported parent record type');
          const target = record(db, evidenceKind(body.linked_type), body.linked_id);
          if (target.client_id !== body.client_id) throw new Error('Evidence must belong to the same client.');
          if (['review','reviews'].includes(body.linked_type) && target.status === 'completed') throw new Error('Completed review evidence is frozen.');
          if (['review','reviews'].includes(body.linked_type)) assertCurrentOccurrence(target,body.occurrence_id);
        }
        body.size = Math.floor(body.content_base64.split(',').pop().length * 3 / 4);
        body.version = 1;
        body.uploaded_at = now();
        body.uploaded_by = db.user.user_id;
        body.uploaded_by_email = db.user.email;
      }
      if (kind === 'users' && !id) {
        if (db.users.some(u => u.email?.toLowerCase() === body.email?.toLowerCase())) throw new Error('Email already exists.');
        body.simulated = true;
        body.status = 'invited';
      }
      if (kind === 'reviews' && id) {
        assertCurrentOccurrence(record(db,kind,id),body.expected_occurrence_id);
        delete body.expected_occurrence_id;
      }
      if (!['evidence','users','clients','comments'].includes(kind)) guardEdit(kind, body, id ? record(db, kind, id) : {}, db.user);
      if (kind === 'reviews' && id && body.status === 'completed' && record(db, kind, id).status !== 'completed') {
        const { status, ...fields } = body;
        write(db, kind, fields, id);
        return save(action(db, kind, id, 'complete', { spawn_next: true }).review);
      }
      const result = write(db, kind, body, id);
      if (kind === 'clients') return save(clientProjection(db, result));
      if (kind === 'evidence' && ['review','reviews'].includes(body.linked_type))
        reviewEvent(db, record(db,'reviews',body.linked_id), 'Evidence uploaded', body.occurrence_id, {filename:body.filename,evidence_id:result.evidence_id});
      if (kind === 'evidence' && body.linked_type === 'task') audit(db,'Evidence uploaded','tasks',record(db,'tasks',body.linked_id),{filename:body.filename,evidence_id:result.evidence_id});
      if (kind === 'evidence' && ['framework_assessment','framework_assessments'].includes(body.linked_type)) audit(db,'Evidence linked','framework_assessments',record(db,'framework_assessments',body.linked_id),{filename:body.filename,evidence_id:result.evidence_id});
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
