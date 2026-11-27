import {policyStatus,policyStatusLabel} from './brawndoPolicies';
import serviceCatalog from '@catalogs/r4ServicesTools.json';
// This projection consumes already authorized native reads; it never infers record identity from names.
export function contextIdentityMatches(expected, actual) {
  return !!expected && !!actual && ['client_id', 'framework_assessment_id', 'framework_key', 'definition_id']
    .every(key => typeof expected[key] === 'string' && expected[key] === actual[key])
    && (expected.framework_version===undefined||expected.framework_version===actual.framework_version);
}
export function configuredAssessmentTools(context) {
  if (!context) return [];
  const areas = new Set((context.candidates || []).flatMap(candidate => candidate.area_ids || [candidate.area_id])
    .filter(area => area && area !== 'governance'));
  const tools = new Map([...(context.catalog || []), ...(context.services?.custom_tools || [])]
    .map(tool => [tool.tool_id, tool]));
  const selected = new Map();
  for (const area of areas) for (const id of context.services?.areas?.[area]?.tool_ids || []) {
    const tool = tools.get(id);
    if (tool && tool.area_ids?.includes(area)) {
      const existing = selected.get(id);
      selected.set(id, {...tool, selected_area_ids: [...(existing?.selected_area_ids || []), area]});
    }
  }
  return [...selected.values()];
}
export function assessmentClientRecords(record, source, services) {
  if (!contextIdentityMatches(record, source?.record)) return [];
  const related = source.related || {}, rows = [];
  if(services?.client_id!==record.client_id)services=null;
  const areaLabel=id=>serviceCatalog.areas.find(area=>area.id===id)?.name||id;
  const responsibility=id=>serviceCatalog.responsibilities.find(option=>option.id===id)?.label||'Not set';
  const append = (kind, id, title, metadata, status, raw) => {
    if (typeof id === 'string' && id && typeof title === 'string' && title)
      rows.push({key: kind + ':' + id, kind, id, title, metadata: metadata.filter(Boolean).join(' · '), status: status || '', raw});
  };
  for (const tool of configuredAssessmentTools(services)) append('Tool', tool.tool_id, tool.name,
    tool.selected_area_ids.map(areaLabel), tool.retired ? 'Configured · retired' : 'Configured', tool);
  for (const activity of services?.candidates || []) append('Recurring activity', activity.activity_id, activity.title,
    [activity.area_id&&areaLabel(activity.area_id),
      activity.area_id&&'Responsibility: '+responsibility(services.services?.areas?.[activity.area_id]?.responsibility),
      activity.cadence, activity.first_next_due && 'Next ' + activity.first_next_due,
      activity.setup?.recurring_ticket_number, activity.setup?.recurring_ticket_url,
      activity.setup?.no_ticket && 'No recurring ticket', activity.setup?.notes],
    activity.state === 'removed' ? 'Excluded' : activity.review_id && activity.first_next_due ? 'Scheduled' : 'Not scheduled', activity);
  for (const [collection, kind, field] of [['policies','Policy','policy_id'],['reviews','Review','review_id'],
    ['risks','Risk','risk_id'],['vendors','Vendor','vendor_id'],['ai_systems','AI system','ai_system_id'],
    ['tasks','Action item','task_id'],['evidence','Evidence','evidence_id']]) {
    for (const item of related[collection] || []) {
      if (item.client_id !== record.client_id) continue;
      append(kind, item[field], item.title || item.name || item.filename,
        [item.version && 'Version ' + item.version, item.due_date && 'Due ' + item.due_date.slice(0,10),
          item.review_frequency || item.recurrence], kind==='Policy'?policyStatusLabel(policyStatus(item)):item.status, item);
    }
  }
  return [...new Map(rows.map(row => [row.key, row])).values()];
}