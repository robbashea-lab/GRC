import { serviceCatalog, copy, defaultServices, serviceArea } from '../lib/r4ServicesTools';
import { CATALOGS, activePlans, reviewDriver } from '../lib/frameworks';
import { cisConfiguration } from '../lib/cisScope';
import { socConfiguration } from '../lib/socReadiness';
import { templateId } from '../lib/r4ReviewCompletion';
import templates from '@catalogs/r4ReviewTemplates.json';
import { reviewSchedule, reviewView, occurrenceId } from '../lib/reviewOccurrences';
import { record, write, audit, now } from './store';
import { evidenceAccess } from './evidence';
import { commandRequest } from './commandRequests';
const fail = (message, status = 422) => {
  throw Object.assign(new Error(message), {
    status
  });
};
function fields(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail('Unsupported or missing service command fields');
}
const coordinationFields = ['activity_id','review_id','expected_updated_at','expected_client_updated_at','area_id','tool_ids','custom_tools','recurring_ticket_number','recurring_ticket_url','recurring_ticket_summary','cadence','custom_days','first_next_due','notes','no_ticket','ticket_confirmed'];
function coordinationShape(data, setup = false) {
  fields(data, setup ? [...coordinationFields,'responsibility'] : coordinationFields, ['expected_client_updated_at']);
  for (const key of ['recurring_ticket_number','recurring_ticket_url','recurring_ticket_summary','notes']) if (Object.hasOwn(data,key) && typeof data[key] !== 'string') fail('Activity context must contain text fields');
  for (const key of ['no_ticket','ticket_confirmed']) if (Object.hasOwn(data,key) && data[key] !== null && typeof data[key] !== 'boolean') fail('Activity decisions must be boolean');
  if (data.tool_ids !== undefined && (!Array.isArray(data.tool_ids) || data.tool_ids.length > 100 || data.tool_ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id)))) fail('Invalid tool identities');
}
export const servicesOf = client => copy(client.profile?.services || defaultServices());
export function r4Catalog(db) {
  const rows = new Map(serviceCatalog.tools.map(t => [t.tool_id, {
    ...copy(t),
    updated_at: null
  }]));
  for (const tool of db.r4_tool_catalog || []) rows.set(tool.tool_id, copy(tool));
  return [...rows.values()];
}
function providerVendorPlan(db, client, services) {
  const areas = Object.keys(services.areas || {}).filter(id => ['iv', 'co'].includes(services.areas[id].responsibility));
  if (!areas.length || services.provider_vendor_id) return null;
  const existing = (db.vendors || []).filter(v => v.client_id === client.client_id && v.catalog_key === 'iventure-solutions');
  if (existing.length === 1) { services.provider_vendor_id = existing[0].vendor_id; return null; }
  const legacy = (db.vendors || []).filter(v => v.client_id === client.client_id && /^iVenture\b/i.test(v.name || ''));
  if (existing.length || legacy.length) { services.provider_linkage = {status:'needs_reconciliation',candidate_ids:[...existing,...legacy].map(v=>v.vendor_id)}; return null; }
  const administrative = areas.some(id => !['governance','pentest','training','darkweb'].includes(id)), id = 'vnd_services_' + client.client_id + '_iventure_solutions', at = now();
  services.provider_vendor_id = id;
  return {vendor_id:id,client_id:client.client_id,name:'iVenture Solutions',catalog_key:'iventure-solutions',service:administrative?'Managed IT and security services provider (MSP/MSSP); service areas are recorded in Services & Tools':'Security and compliance advisory provider (vCISO / GRC program); service areas are recorded in Services & Tools',category:'Service Provider',criticality:administrative?'critical':'high',criticality_provisional:true,status:'onboarding',data_types:[],data_relationship:[],business_owner_id:null,next_review:null,last_review:null,review_frequency:'annual',assurance_required:false,assurance_records:[],source_services:{by:db.user.user_id,at,area_ids:areas,qualification:'Provisional conservative criticality. Confirm actual business impact and access separately; service responsibility does not establish privileges, assurance or BAA status.'},created_at:at,created_by:db.user.user_id,updated_at:at};
}
function clientFor(db, cid, mutate = false) {
  if(db.user.status && db.user.status !== 'active')fail('This account is not active',403);
  const client = record(db, 'clients', cid);
  if (!evidenceAccess(db.user, cid)) fail('Forbidden for this client', 403);
  if (mutate && !['super_admin', 'platform_admin'].includes(db.user.role)) fail('Program configuration requires a service-provider administrator', 403);
  if (mutate && client.status === 'archived') fail('Restore the archived client before changing service setup', 409);
  return client;
}
const configFor = (key, client) => key === 'cis-ig1' ? cisConfiguration(client) : key === 'soc-2' ? socConfiguration(client) : client.framework_settings?.[key] || {};
export function setupActivities(db, client) {
  const programs = new Set(db.requirements.filter(r => r.client_id === client.client_id && r.baseline_response === 'applies').map(r => r.baseline_key)),
    out = [],
    used = new Map(),
    services = servicesOf(client);
  for (const key of Object.keys(CATALOGS).filter(k => programs.has(k))) for (const plan of activePlans(key, configFor(key, client))) {
    const matches = db.reviews.filter(r => r.client_id === client.client_id && !['completed', 'cancelled'].includes(r.status) && !['risk_id', 'policy_id', 'vendor_id', 'ai_system_id'].some(f => r[f]) && (r.framework_plan_key === plan.key || r.framework_drivers?.some(d => d.framework_key === key && d.framework_plan_key === plan.key) || plan.baseline_key && r.baseline_key === plan.baseline_key));
    if (matches.length > 1) fail('Multiple Reviews claim the same native activity; reconcile their identities first', 409);
    const review = matches[0],
      id = review ? 'review:' + review.review_id : plan.baseline_key ? 'shared:' + plan.baseline_key : 'plan:' + key + ':' + plan.key;
    if (used.has(id)) {
      const prior = used.get(id);
      prior.drivers.push(reviewDriver(key, plan));
      const savedExclusion = services.exclusions?.[id] || prior.drivers
        .map(driver => services.exclusions?.['plan:' + driver.framework_key + ':' + driver.framework_plan_key]).find(Boolean);
      if (savedExclusion) {
        prior.exclusion = savedExclusion;
        prior.state = 'removed';
      }
      continue;
    }
    const topicId = templateId(review || {
        framework_key: key,
        framework_plan_key: plan.key,
        review_template_id: plan.review_template_id
      }, CATALOGS),
      areas = templates.topics.find(t => t.id === topicId)?.areas || ['governance'],
      primary = areas[0],
      resp = serviceArea(services, primary).responsibility,
      secondary = areas.filter(a => a !== 'governance' && ['iv', 'co'].includes(serviceArea(services, a).responsibility)),
      area = !['iv', 'co', 'un'].includes(resp) && secondary.length ? secondary[0] : primary,
      setup = copy(review?.activity_setup || {}),
      exclusion = services.exclusions?.[id] || services.exclusions?.['plan:' + key + ':' + plan.key] || (setup.no_ticket ? {
        reason: 'No recurring ticket: the Security Program Manager performs this review',
        kind: 'spm'
      } : null),
      scheduled = review ? reviewView(review) : {},
      configured = review && setup.recurring_ticket_number && scheduled.status !== 'needs_scheduling' && scheduled.next_review_date
        && ['monthly','quarterly','semiannual','annual','custom'].includes(review.recurrence)
        && (review.recurrence !== 'custom' || Number.isInteger(review.custom_recurrence_days) && review.custom_recurrence_days >= 1 && review.custom_recurrence_days <= 3660),
      state = exclusion ? 'removed' : resp === 'un' ? 'decide' : configured ? 'done' : 'todo';
    const entry = {
      activity_id: id,
      review_id: review?.review_id || null,
      title: review?.title || plan.title,
      template_id: topicId,
      framework_key: key,
      plan_key: plan.key,
      drivers: [reviewDriver(key, plan)],
      area_ids: areas,
      area_id: area,
      responsibility: serviceArea(services, area).responsibility,
      state,
      exclusion,
      expected_updated_at: review?.updated_at ?? null,
      cadence: review?.recurrence || plan.default_cadence,
      custom_days: review?.custom_recurrence_days ?? null,
      first_next_due: review?.due_date?.slice(0, 10) || '',
      setup,
      internal: primary === 'governance',
      provider_relevant: ['iv', 'co', 'un'].includes(resp) || !!secondary.length
    };
    out.push(entry);
    used.set(id, entry);
  }
  return out;
}
export function readServiceContext(db, assessment) {
  const client = clientFor(db, assessment.client_id),
    services = servicesOf(client),
    candidates = setupActivities(db, client).filter(a => a.drivers.some(d => d.framework_key === assessment.framework_key && d.framework_safeguards.includes(assessment.definition_id))),
    binding = services.assessment_activities?.[assessment.framework_assessment_id];
  return {
    client_id: client.client_id,
    expected_client_updated_at: client.updated_at ?? null,
    services,
    candidates,
    selected_activity_id: candidates.some(a => a.activity_id === binding) ? binding : candidates.length === 1 ? candidates[0].activity_id : null,
    catalog: r4Catalog(db)
  };
}
function checkTicket(data) {
  if (data.recurring_ticket_number != null && !/^#?\s*\d{1,32}$/.test(data.recurring_ticket_number) && data.recurring_ticket_number !== '') fail('Enter the ticket number only, using up to 32 digits');
  if (data.recurring_ticket_url) {
    let url;
    try {
      url = new URL(data.recurring_ticket_url);
    } catch {
      fail('Enter a valid HTTPS ticket URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password || data.recurring_ticket_url.length > 2048) fail('Use an HTTPS ticket URL without sign-in details');
  }
  if (data.first_next_due) {
    const d = new Date(data.first_next_due + 'T12:00:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.first_next_due) || !Number.isFinite(+d) || d.getFullYear() !== Number(data.first_next_due.slice(0, 4)) || d.getMonth() + 1 !== Number(data.first_next_due.slice(5, 7)) || d.getDate() !== Number(data.first_next_due.slice(8, 10))) fail('Enter a valid first / next review date');
  }
  if (data.cadence && !['monthly', 'quarterly', 'semiannual', 'annual', 'custom'].includes(data.cadence)) fail('Choose a recurring cadence');
  if (data.cadence === 'custom' && (!Number.isInteger(data.custom_days) || data.custom_days < 1 || data.custom_days > 3660)) fail('Custom recurrence must be 1-3660 whole days');
  if ((data.notes || '').length > 2000 || (data.recurring_ticket_summary || '').length > 255) fail('Activity context is too long');
}
export function prepareServiceContext(db, assessment, data, options = {}) {
  coordinationShape(data, options.setup === true);
  const context = readServiceContext(db, assessment),
    client = clientFor(db, assessment.client_id),
    entry = context.candidates.find(a => a.activity_id === data.activity_id);
  if (data.expected_client_updated_at !== (client.updated_at ?? null)) fail('Services changed after Apply; reload and apply again', 409);
  if (entry && (data.review_id !== entry.review_id || data.expected_updated_at !== entry.expected_updated_at)) fail('The selected activity changed after Apply', 409);
  if (!entry && ['recurring_ticket_number', 'recurring_ticket_url', 'recurring_ticket_summary', 'cadence', 'first_next_due', 'no_ticket', 'notes'].some(k => data[k])) fail('Choose the exact recurring activity before saving its setup');
  checkTicket(data);
  const services = servicesOf(client),
    known = new Map([...r4Catalog(db), ...(services.custom_tools || [])].map(t => [t.tool_id, t]));
  for (const tool of data.custom_tools || []) {
    if (tool.category !== 'custom' || !tool.name?.trim() || !tool.area_ids?.length || tool.area_ids.some(id => !serviceCatalog.areas.some(a => a.id === id))) fail('Invalid client-specific interview tool');
    if (!known.has(tool.tool_id)) {
      services.custom_tools.push(copy(tool));
      known.set(tool.tool_id, tool);
    }
  }
  const area = data.area_id || entry?.area_id;
  if (area && !serviceCatalog.areas.some(a => a.id === area)) fail('Choose a known service area');
  if ((data.tool_ids || []).some(id => !known.has(id)) || new Set(data.tool_ids || []).size !== (data.tool_ids || []).length) fail('Unknown or duplicate selected tool');
  if (area) {
    services.areas ||= {};
    const current = serviceArea(services, area);
    if ((data.tool_ids || []).some(id => known.get(id).retired && !current.tool_ids.includes(id))) fail('A retired tool cannot be newly selected');
    services.areas[area] = {
      ...current,
      tool_ids: [...new Set([...current.tool_ids, ...(data.tool_ids || [])])]
    };
  }
  let review = entry?.review_id ? copy(record(db, 'reviews', entry.review_id)) : null,
    newReview = false;
  if (entry && !review) {
    const plan = CATALOGS[entry.framework_key].review_plans.find(p => p.key === entry.plan_key),
      canonical = Object.entries(CATALOGS).flatMap(([key, c]) => c.review_plans.map(p => [key, p])).find(([_key, p]) => plan.baseline_key && p.baseline_key === plan.baseline_key) || [entry.framework_key, plan],
      id = `fw_${client.client_id}_review_${canonical[0] === 'cis-ig1' ? '' : canonical[0] + '_'}${canonical[1].key}`;
    if (db.reviews.some(r => r.review_id === id && r.client_id === client.client_id)) fail('The activity was created elsewhere; reload its canonical Review', 409);
    review = {
      review_id: id,
      client_id: client.client_id,
      title: entry.title,
      review_type: plan.review_type,
      framework_key: entry.framework_key,
      framework_plan_key: entry.plan_key,
      framework_version: CATALOGS[entry.framework_key].version,
      framework_drivers: entry.drivers,
      baseline_key: plan.baseline_key,
      review_template_id: entry.template_id,
      owner_id: null,
      status: 'needs_scheduling',
      recurrence: entry.cadence,
      due_date: null,
      created_by: db.user.user_id,
      created_at: now()
    };
    review.current_occurrence_id = occurrenceId(review);
    newReview = true;
  }
  if (review) {
    const setup = copy(review.activity_setup || {});
    for (const key of ['recurring_ticket_number', 'recurring_ticket_url', 'recurring_ticket_summary', 'notes', 'no_ticket']) if (Object.hasOwn(data, key)) setup[key] = key === 'recurring_ticket_number' ? data[key].replace(/^#\s*/, '') : data[key];
    if (setup.recurring_ticket_url && !setup.recurring_ticket_number) fail('Record the recurring ticket number alongside its URL');
    if (data.ticket_confirmed && setup.recurring_ticket_number) {
      setup.no_ticket = false;
      delete services.exclusions?.[entry.activity_id];
    }
    review.activity_setup = setup;
    review.review_template_id = entry.template_id;
    const cadence = data.cadence || review.recurrence,
      custom = data.custom_days ?? review.custom_recurrence_days,
      changed = cadence !== review.recurrence || cadence === 'custom' && custom !== review.custom_recurrence_days;
    if (changed && !data.first_next_due) fail('Choose the first / next date when changing its schedule');
    if (data.first_next_due && (data.first_next_due !== review.due_date?.slice(0, 10) || changed)) {
      Object.assign(review, {
        due_date: data.first_next_due,
        recurrence: cadence,
        custom_recurrence_days: custom,
        recurrence_due_date: null
      });
      Object.assign(review, reviewSchedule(review, true));
      review.status = reviewView(review).status;
    }
    services.assessment_activities ||= {};
    services.assessment_activities[assessment.framework_assessment_id] = 'review:' + review.review_id;
  }
  const provider_vendor = providerVendorPlan(db, client, services);
  if (review || provider_vendor || JSON.stringify(services) !== JSON.stringify(servicesOf(client))) clientFor(db, client.client_id, true);
  return {
    client_id: client.client_id,
    assessment_id: assessment.framework_assessment_id,
    services,
    review,
    new_review: newReview,
    provider_vendor
  };
}
export function commitServiceContext(db, assessment, plan) {
  if (plan.client_id !== assessment.client_id || plan.assessment_id !== assessment.framework_assessment_id) fail('This proposal belongs to another client or assessment', 409);
  const client = record(db, 'clients', plan.client_id);
  if(plan.provider_vendor && !(db.vendors||[]).some(v=>v.vendor_id===plan.provider_vendor.vendor_id)){db.vendors ||= [];db.vendors.push(copy(plan.provider_vendor));}
  if (plan.review) {
    if (plan.new_review) db.reviews.push({
      ...plan.review,
      updated_at: now()
    });else write(db, 'reviews', plan.review, plan.review.review_id);
  }
  write(db, 'clients', {
    profile: {
      ...client.profile,
      services: plan.services
    }
  }, client.client_id);
  audit(db, 'Shared assessment context saved', 'framework_assessments', assessment);
}
function validateTool(tool) {
  fields(tool,['tool_id','name','vendor','category','area_ids','description','product_reference','source_references','capabilities','gaps','possible_records','verification_hints','to_confirm','retired'],['tool_id','name','area_ids']);
  if (!tool || typeof tool.tool_id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(tool.tool_id) || typeof tool.name !== 'string' || !tool.name.trim() || tool.name.length > 255 || !['iv', 'ivx', 'org', 'custom'].includes(tool.category||'org') || !Array.isArray(tool.area_ids) || !tool.area_ids.length || new Set(tool.area_ids).size !== tool.area_ids.length || tool.area_ids.some(id => !serviceCatalog.areas.some(a => a.id === id))) fail('Invalid tool definition');
  if (tool.retired !== undefined && typeof tool.retired !== 'boolean') fail('Tool retirement must be boolean');
  for (const key of ['source_references','capabilities','gaps','possible_records','verification_hints']) if (tool[key] !== undefined && (!Array.isArray(tool[key]) || tool[key].length > 100 || tool[key].some(value => typeof value !== 'string' || value.length > 2000))) fail('Tool descriptions must contain bounded text lines');
}
function saveTool(db, tool) {
  db.r4_tool_catalog ||= [];
  const index = db.r4_tool_catalog.findIndex(t => t.tool_id === tool.tool_id),
    next = {
      ...copy(tool),
      updated_at: now(),
      updated_by: db.user.user_id
    };
  if (index < 0) db.r4_tool_catalog.push(next);else db.r4_tool_catalog[index] = next;
}
function readToolUsage(db, toolId) {
  if (!['super_admin','platform_admin'].includes(db.user.role) || db.user.status && db.user.status !== 'active') fail('Tool Catalog usage requires a service-provider administrator',403);
  if ((db.r4_tool_catalog || []).some(tool => tool._r4_context_pending)) fail('An earlier shared activity save needs recovery; retry its original command first',409);
  const tool = r4Catalog(db).find(item => item.tool_id === toolId);
  if (!tool) fail('Tool not found',404);
  const clients = db.clients.filter(client => evidenceAccess(db.user,client.client_id)).sort((a,b) => a.client_id.localeCompare(b.client_id));
  if (clients.some(client => client._r4_context_pending)) fail('An earlier shared activity save needs recovery; retry its original command first',409);
  if (clients.length > 500) fail('Tool usage exceeds the supported complete Client population',413);
  const names = new Map(serviceCatalog.areas.map(area => [area.id,area.name])), usage = [];
  for (const client of clients) {
    const profile = client.profile;
    if (profile != null && (typeof profile !== 'object' || Array.isArray(profile))) fail('Saved service selections could not be verified; reconcile them before using Tool usage',409);
    const services = profile?.services ?? {}, areas = services?.areas ?? {};
    if (!services || typeof services !== 'object' || Array.isArray(services) || !areas || typeof areas !== 'object' || Array.isArray(areas)) fail('Saved service selections could not be verified; reconcile them before using Tool usage',409);
    const selected = [];
    for (const [areaId,area] of Object.entries(areas).sort(([a],[b]) => a.localeCompare(b))) {
      if (area == null) continue;
      if (typeof area !== 'object' || Array.isArray(area) || area.tool_ids != null && (!Array.isArray(area.tool_ids) || area.tool_ids.some(id => typeof id !== 'string'))) fail('Saved service selections could not be verified; reconcile them before using Tool usage',409);
      if ((area.tool_ids || []).includes(toolId)) selected.push({area_id:areaId,name:names.get(areaId) || areaId});
    }
    if (selected.length) usage.push({client_id:client.client_id,name:client.name ?? null,status:client.status ?? null,expected_updated_at:client.updated_at ?? null,areas:selected});
  }
  return {tool_id:toolId,expected_updated_at:tool.updated_at ?? null,scope:'authorized_clients',client_count:usage.length,
    selection_count:usage.reduce((total,client) => total + client.areas.length,0),clients:usage};
}
export function r4ServicesRequest(db, path, method, body = {}, requestKey) {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent),
    [kind, id, operation, action] = parts,
    mutate = method !== 'get';
  if (path === '/service-catalog' && method === 'get') return {
    ...copy(serviceCatalog),
    tools: r4Catalog(db)
  };
  if (kind === 'tool-catalog' && operation === 'usage' && method === 'get' && parts.length === 3) return readToolUsage(db,id);
  if (kind === 'framework_assessments' && operation === 'service-context' && method === 'get') return readServiceContext(db, record(db, kind, id));
  if (kind === 'clients' && ['services', 'iv-setup'].includes(operation)) {
    const client = clientFor(db, id, mutate),
      services = servicesOf(client);
    if (method === 'get' && operation === 'services') return {
      client_id: id,
      services,
      updated_at: client.updated_at ?? null,
      catalog: r4Catalog(db)
    };
    const entries = setupActivities(db, client);
    if (method === 'get') return {
      client_id: id,
      expected_client_updated_at: client.updated_at ?? null,
      activities: entries,
      outstanding_count: entries.filter(a => a.provider_relevant && !a.internal && ['todo', 'decide'].includes(a.state)).length
    };
    if (method !== 'post') fail('Unsupported service operation');
    return commandRequest(db, path, id, requestKey, body, () => {
      if (operation === 'services') {
        fields(body,['expected_updated_at','areas','custom_tools','preset'],['expected_updated_at','areas']);
        if (!body.areas || typeof body.areas !== 'object' || Array.isArray(body.areas)) fail('Service areas must be an object');
        if (body.expected_updated_at !== (client.updated_at ?? null)) fail('Services changed; reload before saving', 409);
        if (Object.keys(body.areas || {}).some(k => !serviceCatalog.areas.some(a => a.id === k))) fail('Unknown service area');
        const custom = new Map((services.custom_tools || []).map(t => [t.tool_id, t]));
        for (const t of body.custom_tools || []) {
          validateTool(t);
          if (t.category !== 'custom') fail('Client tools must remain client-specific');
          custom.set(t.tool_id, copy(t));
        }
        const known = new Map([...r4Catalog(db), ...custom.values()].map(t => [t.tool_id, t]));
        for (const [area, value] of Object.entries(body.areas || {})) {
          fields(value,['responsibility','tool_ids'],['responsibility','tool_ids']);
          if (!serviceCatalog.responsibilities.some(r => r.id === value.responsibility) || !Array.isArray(value.tool_ids) || new Set(value.tool_ids).size !== value.tool_ids.length || value.tool_ids.some(t => !known.has(t))) fail('Invalid service responsibility or selected tool');
          if (value.tool_ids.some(t => known.get(t).retired && !serviceArea(services, area).tool_ids.includes(t))) fail('A retired tool cannot be newly selected');
          services.areas[area] = copy(value);
        }
        services.custom_tools = [...custom.values()];
        services.preset = body.preset || null;
        const provider=providerVendorPlan(db,client,services);if(provider){db.vendors ||= [];db.vendors.push(provider);}
        write(db, 'clients', {
          profile: {
            ...client.profile,
            services
          }
        }, id);
      } else {
        if (action === 'exclusion') {
          fields(body, ['expected_updated_at', 'expected_client_updated_at', 'excluded', 'reason', 'kind', 'note'], ['expected_updated_at', 'expected_client_updated_at', 'excluded']);
          if (typeof body.excluded !== 'boolean') fail('The removal decision must be boolean');
          if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 2000)) fail('The exclusion reason must contain at most 2000 characters');
          if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000)) fail('The removal note must contain at most 2000 characters');
          if (body.kind != null && !['spm', 'client', 'na'].includes(body.kind)) fail('Choose a supported removal reason');
          if (body.kind == null && body.note?.trim()) fail('Choose a removal reason for the note');
        } else coordinationShape(body,true);
        const activityId = action === 'exclusion' ? parts.slice(4).join('/') : body.activity_id,
          entry = entries.find(a => a.activity_id === activityId);
        if (!entry || body.expected_client_updated_at !== (client.updated_at ?? null) || body.expected_updated_at !== entry.expected_updated_at) fail('Shared activity changed; reload before saving', 409);
        if (action === 'exclusion') {
          const removalKind = body.kind ?? null;
          const note = (body.note || '').trim();
          const reasons = {
            spm: 'The Security Program Manager performs it; no recurring ticket',
            client: 'The client or another provider does it',
            na: 'Doesn’t apply to ' + client.name
          };
          if (body.excluded && !removalKind && !body.reason?.trim()) fail('Record the exclusion reason');
          services.exclusions ||= {};
          if (body.excluded) services.exclusions[entry.activity_id] = {
            reason: removalKind ? reasons[removalKind] + (note ? ' — ' + note : '') : body.reason.trim(),
            ...(removalKind ? {kind: removalKind, note} : {}),
            by: db.user.user_id,
            at: now()
          };else {
            delete services.exclusions[entry.activity_id];
            for (const driver of entry.drivers) delete services.exclusions['plan:' + driver.framework_key + ':' + driver.framework_plan_key];
          }
          if (entry.review_id && (!body.excluded || removalKind === 'spm')) {
            const review = record(db, 'reviews', entry.review_id);
            write(db, 'reviews', {
              activity_setup: {
                ...review.activity_setup,
                no_ticket: body.excluded
              }
            }, entry.review_id);
          }
          write(db, 'clients', {
            profile: {
              ...client.profile,
              services
            }
          }, id);
        } else if (['cl', 'tp', 'no'].includes(body.responsibility)) {
          services.areas[entry.area_id] = {
            ...serviceArea(services, entry.area_id),
            responsibility: body.responsibility
          };
          write(db, 'clients', {
            profile: {
              ...client.profile,
              services
            }
          }, id);
        } else {
          if (!['iv', 'co'].includes(body.responsibility) || !body.recurring_ticket_number || !body.first_next_due || !body.cadence) fail('Record responsibility, recurring ticket, cadence and first / next date');
          const assessment = {
              client_id: id,
              framework_assessment_id: 'setup:' + entry.activity_id,
              framework_key: entry.framework_key,
              definition_id: entry.drivers[0].framework_safeguards[0]
            },
            plan = prepareServiceContext(db, assessment, body, {setup:true});
          plan.services.areas[entry.area_id] = {
            ...serviceArea(plan.services, entry.area_id),
            responsibility: body.responsibility
          };
          plan.provider_vendor ||= providerVendorPlan(db, client, plan.services);
          commitServiceContext(db, assessment, plan);
        }
      }
      audit(db, 'Services and tools updated', 'clients', client);
      return {
        ok: true
      };
    });
  }
  if (kind !== 'tool-catalog') return undefined;
  if (!['super_admin', 'platform_admin'].includes(db.user.role)) fail('Tool Catalog changes require a service-provider administrator', 403);
  if (method !== 'post') fail('Unsupported Tool Catalog operation');
  return commandRequest(db, path, null, requestKey, body, () => {
    const known = new Map(r4Catalog(db).map(t => [t.tool_id, t]));
    if (id === 'save') {
      fields(body,['expected_updated_at','tool'],['expected_updated_at','tool']);
      validateTool(body.tool);
      const prior = known.get(body.tool.tool_id);
      if ((prior?.updated_at ?? null) !== body.expected_updated_at) fail('The tool changed; reload before saving', 409);
      if (body.tool.category === 'custom' || body.tool.area_ids.includes('governance')) fail('The global catalog contains tools, not services');
      saveTool(db, {
        ...prior,
        ...body.tool
      });
    } else if (id === 'bulk') {
      fields(body,['tool_ids','expected_versions','category','add_area_id','retired'],['tool_ids','expected_versions']);
      if (!Array.isArray(body.tool_ids)||!body.tool_ids.length||body.tool_ids.length>500||!body.expected_versions||typeof body.expected_versions!=='object'||Array.isArray(body.expected_versions))fail('Invalid bulk selection');
      if(body.category!==undefined&&body.category!==null&&!['iv','ivx','org'].includes(body.category))fail('Choose a known tool category');
      if(body.retired!==undefined&&body.retired!==null&&typeof body.retired!=='boolean')fail('Tool retirement must be boolean');
      if (body.add_area_id && (!serviceCatalog.areas.some(a => a.id === body.add_area_id) || body.add_area_id === 'governance')) fail('Choose a tool service area');
      const changes = body.tool_ids.map(t => {
        const tool = known.get(t);
        if (!tool || !Object.hasOwn(body.expected_versions, t) || (tool.updated_at ?? null) !== body.expected_versions[t]) fail('A selected tool changed; reload the catalog', 409);
        return {
          ...tool,
          ...(body.category ? {
            category: body.category
          } : {}),
          ...(body.retired !== undefined ? {
            retired: body.retired
          } : {}),
          area_ids: body.add_area_id ? [...new Set([...tool.area_ids, body.add_area_id])] : tool.area_ids
        };
      });
      for (const tool of changes) saveTool(db, tool);
    } else if (operation === 'replace') {
      fields(body,['replacement_id','expected_updated_at','retire'],['replacement_id','expected_updated_at']);
      if(body.retire!==undefined&&typeof body.retire!=='boolean')fail('Tool retirement must be boolean');
      const old = known.get(id),
        target = known.get(body.replacement_id);
      if (!old || !target || old.tool_id === target.tool_id || target.retired) fail('Choose a different active replacement tool');
      if ((old.updated_at ?? null) !== body.expected_updated_at) fail('The tool changed; reload before replacement', 409);
      const changes = [];
      for (const client of db.clients) {
        const svc = servicesOf(client);
        let changed = false;
        for (const area of Object.values(svc.areas)) {
          if (area.tool_ids.includes(id)) {
            clientFor(db, client.client_id, true);
            area.tool_ids = [...new Set(area.tool_ids.map(t => t === id ? target.tool_id : t))];
            changed = true;
          }
        }
        if (changed) changes.push([client, svc]);
      }
      for (const [client, svc] of changes) write(db, 'clients', {
        profile: {
          ...client.profile,
          services: svc
        }
      }, client.client_id);
      if (body.retire??true) saveTool(db, {
        ...old,
        retired: true
      });
    } else fail('Unknown Tool Catalog command', 404);
    audit(db, 'Tool Catalog updated', 'service_catalog', {
      client_id: null,
      tool_id: id
    });
    return {
      ok: true
    };
  });
}
