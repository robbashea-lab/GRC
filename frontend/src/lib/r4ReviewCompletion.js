import templates from '@catalogs/r4ReviewTemplates.json';
import servicesCatalog from '@catalogs/r4ServicesTools.json';
import { occurrenceId } from './reviewOccurrences';
export const resultOptions = [['Pass', 'Pass'], ['Exception', 'Exception'], ['N/A', 'Not applicable'], ['NMI', 'Not managed by iVenture']];
function validAcceptedRetry(value, occurrence) {
  const object = item => item !== null && typeof item === 'object' && !Array.isArray(item);
  const text = item => typeof item === 'string' && item.trim().length > 0;
  const allowed = ['occurrence_id','completion_notes','risk_assessment','risk_outcome','completion_date','spawn_next',
    'conclusion','tested_period','tested_scope','no_evidence_reason','checklist_confirmed','risk_next_review',
    'expected_updated_at','checklist','supporting_reference','outcome'];
  if (!object(value) || Object.keys(value).some(key => !['request','completed_at','completed_by'].includes(key))
      || !text(value.completed_at) || !Number.isFinite(Date.parse(value.completed_at)) || !text(value.completed_by)
      || !object(value.request) || value.request.occurrence_id !== occurrence
      || Object.keys(value.request).some(key => !allowed.includes(key))) return false;
  const request = value.request;
  for (const key of ['completion_notes','risk_outcome','completion_date','conclusion','tested_period','tested_scope',
    'no_evidence_reason','risk_next_review','expected_updated_at']) {
    if (Object.hasOwn(request, key) && request[key] !== null && typeof request[key] !== 'string') return false;
  }
  if (Object.hasOwn(request, 'spawn_next') && request.spawn_next !== null && typeof request.spawn_next !== 'boolean') return false;
  if (Object.hasOwn(request, 'checklist_confirmed') && typeof request.checklist_confirmed !== 'boolean') return false;
  if (Object.hasOwn(request, 'risk_assessment') && request.risk_assessment !== null && !object(request.risk_assessment)) return false;
  if (Object.hasOwn(request, 'supporting_reference') && typeof request.supporting_reference !== 'string') return false;
  if (Object.hasOwn(request, 'outcome') && !['No exceptions noted','Exceptions noted'].includes(request.outcome)) return false;
  const checklist = request.checklist;
  if (checklist !== undefined && checklist !== null && (!object(checklist)
      || Object.keys(checklist).some(key => !['contract_token','results'].includes(key))
      || typeof checklist.contract_token !== 'string' || !/^[a-f0-9]{64}$/.test(checklist.contract_token)
      || !Array.isArray(checklist.results) || checklist.results.some(result => !object(result)
        || Object.keys(result).some(key => !['step_id','result','reason'].includes(key)) || !text(result.step_id)
        || !resultOptions.some(([id]) => id === result.result)
        || Object.hasOwn(result,'reason') && typeof result.reason !== 'string')
      || new Set(checklist.results.map(result => result.step_id)).size !== checklist.results.length)) return false;
  return true;
}
export function parseReviewCompletionGuide(value) {
  const object = item => item !== null && typeof item === 'object' && !Array.isArray(item);
  const text = item => typeof item === 'string' && item.trim().length > 0;
  const unique = items => new Set(items).size === items.length;
  const invalid = () => {
    throw new Error('The current Review guide could not be read. Reopen this Review before saving or completing it.');
  };
  if (!object(value) || !text(value.occurrence_id) || !text(value.template_id) || !text(value.template_version)
      || typeof value.contract_token !== 'string' || !/^[a-f0-9]{64}$/.test(value.contract_token)
      || !Object.hasOwn(value, 'expected_updated_at') || value.expected_updated_at !== null && !text(value.expected_updated_at)
      || typeof value.read_only !== 'boolean' || typeof value.custom !== 'boolean' || typeof value.native_gate !== 'boolean'
      || !Array.isArray(value.steps) || !Array.isArray(value.results) || !Array.isArray(value.service_context)
      || !Array.isArray(value.required_support) || value.required_support.some(label => !text(label))
      || typeof value.supporting_reference !== 'string' || value.supporting_reference.length > 4000) invalid();
  if (value.custom !== (value.template_id === 'custom') || value.native_gate !== (value.template_id === 'native_only')) invalid();
  if (Object.hasOwn(value, 'accepted_completion_retry') && !validAcceptedRetry(value.accepted_completion_retry, value.occurrence_id)) invalid();
  if (!value.steps.length && !value.custom && !value.native_gate) invalid();
  if (value.steps.some(step => !object(step) || !text(step.step_id) || !text(step.text))
      || !unique(value.steps.map(step => step.step_id))) invalid();
  const ids = new Set(value.steps.map(step => step.step_id));
  if (value.results.some(result => !object(result) || !ids.has(result.step_id)
      || !resultOptions.some(([id]) => id === result.result) || typeof result.reason !== 'string' || result.reason.length > 4000)
      || !unique(value.results.map(result => result.step_id))) invalid();
  if (value.service_context.some(area => !object(area) || !text(area.area_id) || !text(area.name)
      || !text(area.responsibility_label) || !Array.isArray(area.tools)
      || area.tools.some(tool => !object(tool) || !text(tool.tool_id) || !text(tool.name)))
      || !unique(value.service_context.map(area => area.area_id))) invalid();
  return value;
}
export function completionPayload(guide) {
  parseReviewCompletionGuide(guide);
  return {
    occurrence_id: guide.occurrence_id,
    expected_updated_at: guide.expected_updated_at ?? null,
    checklist: {
      contract_token: guide.contract_token,
      results: guide.results || []
    },
    supporting_reference: guide.supporting_reference || '',
    outcome: guide.results?.some(r => r.result === 'Exception') ? 'Exceptions noted' : 'No exceptions noted'
  };
}
export function validateCompletionGuide(guide) {
  if (!guide) throw new Error('Open the current Review guide before completing it');
  parseReviewCompletionGuide(guide);
  if (guide.read_only) throw new Error('This retained Review is read-only');
  const results = guide.results || [],
    byId = new Map(results.map(r => [r.step_id, r]));
  if (byId.size !== results.length || results.some(r => !guide.steps.some(s => s.step_id === r.step_id))) throw new Error('Unknown or duplicate checklist step');
  for (const step of guide.steps) {
    const value = byId.get(step.step_id);
    if (!value || !resultOptions.some(([id]) => id === value.result)) throw new Error('Record a result for every checklist step');
    if (value.result !== 'Pass' && !value.reason?.trim()) throw new Error('Record a reason for every non-Pass result');
  }
  return true;
}
export function templateId(review, planCatalogs = {}) {
  if (review.review_template_id) return review.review_template_id;
  if (review.risk_id) return 'risk_rec';
  if (review.policy_id) return 'policy_rec';
  if (review.ai_system_id) return 'ai_rec';
  if (review.vendor_id && review.vendor_purpose === 'offboarding') return 'native_only';
  if (review.vendor_id) return {
    assurance: 'assure_rec',
    security_assurance: 'assure_rec',
    renewal: 'contract_rec',
    contract: 'contract_rec',
    contract_renewal: 'contract_rec'
  }[review.vendor_purpose] || 'vendor_rec';
  for (const driver of review.framework_drivers || [review]) {
    if (driver.framework_driver_active === false) continue;
    const key = driver.framework_plan_key;
    if (key) {
      const id = templates.plan_templates[key] || planCatalogs[driver.framework_key]?.review_plans?.find(p => p.key === key)?.review_template_id;
      if (id) return id;
      throw new Error('This native Review plan needs a completion-template mapping');
    }
  }
  if (review.baseline_key) {
    const id = templates.baseline_templates[review.baseline_key];
    if (id) return id;
    throw new Error('This native Review baseline needs a completion-template mapping');
  }
  if (review.iso_audit) return 'native_only';
  if (review.framework_key) throw new Error('This framework Review needs its native plan association reconciled');
  return 'custom';
}
export function buildReviewContract(review, services = {}, planCatalogs = {}) {
  const saved = review.r4_current_checklist;
  if (saved?.occurrence_id === occurrenceId(review) && saved.contract) return JSON.parse(JSON.stringify(saved.contract));
  const id = templateId(review, planCatalogs),
    topic = templates.topics.find(t => t.id === id),
    record = templates.record_guides.find(t => t.id === id),
    steps = [];
  const tools = new Map([...(services.catalog || servicesCatalog.tools), ...(services.custom_tools || [])].map(t => [t.tool_id, t]));
  const context = (topic?.areas || []).map(key => {
    const area = services.areas?.[key] || {},
      responsibility = area.responsibility || 'un';
    return {
      area_id: key,
      name: servicesCatalog.areas.find(a => a.id === key).name,
      responsibility,
      responsibility_label: servicesCatalog.responsibilities.find(r => r.id === responsibility).label,
      tools: (area.tool_ids || []).map(t => ({
        tool_id: t,
        name: tools.get(t)?.name || t
      }))
    };
  });
  const add = (step_id, text, who, support = '', operating = false) => steps.push({
    step_id,
    text,
    who,
    support,
    operating
  });
  if (record) record.steps.forEach(([text, support, who], i) => add(`${id}:record:${i + 1}`, text, who, support));else if (topic) {
    const primary = context[0],
      resp = primary.responsibility,
      setup = review.activity_setup || {},
      once = review.recurrence === 'none';
    if (primary.area_id !== 'governance' && ['cl', 'tp'].includes(resp)) {
      const operator = resp === 'cl' ? 'the client' : 'another provider',
        names = primary.tools.map(t => t.name).join(', ');
      add(`${id}:operation:confirmation`, `${primary.name} is run by ${operator}${names ? ' (' + names + ')' : ''}: their confirmation and results for this period are on file`, 'cl', 'Results for this review period', true);
      add(`${id}:operation:exceptions`, 'Exceptions they reported are resolved or raised as findings', 'cl', '', true);
    } else if (primary.area_id !== 'governance' && !setup.no_ticket && ['iv', 'co', 'un'].includes(resp)) {
      const cadence = {
        monthly: 'every month',
        quarterly: 'every quarter',
        semiannual: 'every six months',
        annual: 'every year'
      }[review.recurrence] || `every ${review.custom_recurrence_days ?? 'None'} days`;
      add(`${id}:operation:ticket`, 'Recurring ConnectWise ticket is active and set to ' + (once ? 'run once' : 'recur ' + cadence), 'spm', '', true);
      add(`${id}:operation:due`, 'Latest ticket was completed by its due date', 'spm', '', true);
      add(`${id}:operation:results`, 'Results from the ticket are uploaded to this review', 'spm', 'Results for this review period', true);
      add(`${id}:operation:exceptions`, 'Exceptions noted in the ticket are resolved or raised as findings', 'spm', '', true);
      if (!once) add(`${id}:operation:next`, 'Next occurrence is scheduled in ConnectWise', 'spm', '', true);
    } else if (primary.area_id !== 'governance' && resp !== 'no') {
      add(`${id}:operation:results`, 'Review performed for this period and results uploaded to this review', 'spm', 'Results for this review period', true);
      add(`${id}:operation:exceptions`, 'Exceptions found are resolved or raised as findings', 'spm', '', true);
    }
    const cis = review.framework_key === 'cis-ig1' || review.framework_drivers?.some(d => d.framework_key === 'cis-ig1'),
      tuples = [...topic.generic, ...topic.always, ...topic.client],
      rows = [];
    if (topic.governance) {
      topic.governance.gov.forEach((value, i) => {
        let text = value;
        if (typeof text === 'string' && text.startsWith('@always')) text = topic.always[Number(text.slice(7))][0];
        if (Array.isArray(text)) text = text[cis ? 0 : 1];
        rows.push([`governance:${i + 1}`, text, 'spm']);
      });
      topic.governance.client.forEach((text, i) => rows.push([`client:${i + 1}`, text, 'client']));
    } else {
      topic.always.forEach(([text, _support, who], i) => rows.push([`always:${i + 1}`, text, who]));
      topic.client.forEach(([text, _support, who], i) => rows.push([`client:${i + 1}`, text, who]));
    }
    rows.forEach(([key, raw, who]) => {
      const support = tuples.find(t => t[0] === raw)?.[1] || '';
      let text = raw;
      if (!cis) {
        if (/^For (?:applicable )?CIS /.test(text)) text = {
          vuln: 'Review vulnerability-management and risk-based remediation processes under the applicable framework and organizational plan; confirm actual operational timeliness separately.',
          backup: 'Review the data recovery process under the applicable framework and organizational plan, including relevant changes and separate operational testing.',
          awareness: /train new hires/i.test(text) ? 'Confirm workforce and new-hire training under the applicable program and organizational timing policy.' : 'Review awareness-program content under the applicable requirements and organizational plan, including relevant changes.'
        }[id] || text;
        text = 'GoverNara recommended check: ' + text.replaceAll('where the framework requires', 'where the applicable source or organizational policy calls for');
      }
      add(`${id}:${key}`, text, who, support);
    });
    let source = null;
    const kind = review.framework_key;
    if (id === 'awareness' && kind === 'hipaa') source = 'HIPAA source context: the security awareness and training program covers all workforce members, including management. Evaluate the addressable specifications for security reminders, protection from malicious software, log-in monitoring and password management; document the applicable 164.306(d) decisions and measures.';
    if (id === 'awareness' && kind === 'nist-csf-2') source = "NIST CSF source context: assess awareness and training for general roles (PR.AT-01) and the knowledge and skills needed for specialized roles (PR.AT-02), against the organization's selected outcomes and responsibilities. CSF does not prescribe the shared topic list or annual interval.";
    if (kind === 'nist-csf-2' && ['incident', 'backup'].includes(id)) source = 'NIST CSF source context: distinguish planning and exercises from actual incident response and recovery. An exercise or governance Review alone does not establish incident-dependent execution outcomes.';
    if (source) {
      const first = steps.find(step => !step.operating);
      if (first) first.text += ' ' + source;
    }
  } else if (!['custom', 'native_only'].includes(id)) throw new Error('Unknown completion template; reconcile the native Review mapping');
  return {
    template_id: id,
    template_version: templates.version,
    steps,
    required_support: [...new Set(steps.map(s => s.support).filter(Boolean))],
    service_context: context,
    custom: id === 'custom',
    native_gate: id === 'native_only'
  };
}
export async function withContractToken(contract) {
  if (contract.contract_token) return contract;
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(contract))),
    digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return {
    ...contract,
    contract_token: [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('')
  };
}
