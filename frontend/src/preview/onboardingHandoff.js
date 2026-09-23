import fields from '../lib/onboardingHandoffFields.json';
import {recordedBaseline} from '../lib/clientProfile';
import catalog from '../lib/onboardingCatalog.json';
import {record, list, write, audit} from './store';
import {frameworkScope, reconcileFramework} from './frameworks';
import {CATALOGS} from '../lib/frameworks';
import {assignmentCandidates} from './assignmentEligibility';
import {clientProjection} from './clientRelationships';

export function handoffSnapshot(db, cid) {
  frameworkScope(db, cid);
  const client = record(db, 'clients', cid);
  const records = Object.fromEntries(Object.entries(fields).map(([kind, names]) => {
    const rows = list(db, kind, cid);
    if (rows.length > 2000) throw new Error('Setup summary is too large. Use the operational registers for this client.');
    return [kind, rows.map(row => Object.fromEntries(names.filter(k => k in row).map(k => [k, row[k]])))];
  }));
  return {
    client: clientProjection(db, Object.fromEntries(['client_id','name','primary_contact_id','primary_contact','assigned_owner_id'].map(k => [k, client[k]]))),
    completed: !!recordedBaseline(client,db.baselines?.[cid],db.logs), records,
    people: {contacts: list(db, 'contacts', cid).length,
      active_client_users: db.users.filter(u => u.status === 'active' && u.client_ids?.includes(cid) && !['super_admin','platform_admin'].includes(u.role)).length,
      eligible_assignees_available: !!assignmentCandidates(db, cid, {limit: 1}).items.length},
  };
}

export function adjustProgram(db, cid, key, body) {
  frameworkScope(db, cid);
  if (!['super_admin','platform_admin','client_contributor'].includes(db.user.role)) throw new Error('Read-only role');
  if (!recordedBaseline(record(db,'clients',cid),db.baselines?.[cid],db.logs)) throw new Error('Complete onboarding before adjusting program configuration');
  const item = catalog.requirements.find(r => r.key === key);
  if (!item || Object.keys(body).some(k => !['client_id','applicability','expected_updated_at','reason','effective_date'].includes(k)) || !['applies','does_not_apply','unsure','retired'].includes(body.applicability)) throw new Error('Invalid program applicability');
  if(body.applicability==='retired'&&(!body.reason?.trim()||body.reason.length>2000||!/^\d{4}-\d{2}-\d{2}$/.test(body.effective_date||'')||!Number.isFinite(Date.parse(body.effective_date))||new Date(body.effective_date).toISOString().slice(0,10)!==body.effective_date||body.effective_date>new Date().toISOString().slice(0,10)))throw new Error('Retirement requires a reason and valid effective date on or before today');
  const old = list(db, 'requirements', cid).find(r => r.baseline_key === key);
  const previousStatus=old?.baseline_response;
  if(Object.prototype.hasOwnProperty.call(body,'expected_updated_at')&&body.expected_updated_at!==(old?.updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
  write(db, 'requirements', {client_id: cid, title: old?.title || item.name, category: old?.category || item.category,
    baseline_key: key, baseline_response: body.applicability,...(body.applicability==='retired'?{rationale:body.reason}:{}),
    applicability: {applies:'applicable',does_not_apply:'not_applicable',retired:'not_applicable',unsure:'needs_review'}[body.applicability], status: old?.status || 'under_review',
    program_change:{previous_status:old?.baseline_response,new_status:body.applicability,reason:body.reason,effective_date:body.effective_date,changed_by:db.user.user_id,changed_at:new Date().toISOString()}}, old?.requirement_id);
  if (CATALOGS[key]) reconcileFramework(db, cid, {...db.baselines?.[cid], requirements: {[key]: body.applicability}});
  audit(db, 'program-applicability-updated', 'clients', record(db, 'clients', cid), {program:key, previous_status:previousStatus, applicability:body.applicability,reason:body.reason,effective_date:body.effective_date});
  return {ok:true};
}
