import {FRAMEWORKS, cis, frameworkPlans, reviewConfig, genericReviews} from './frameworks';
import {reviewView} from './reviewOccurrences';

export const APPLICABILITY = [['applies','Applies'],['does_not_apply','Does Not Apply'],['unsure','Unsure']];
export const SETUP_FILTERS = {
  reviews: {
    scheduling: {label:'Reviews need scheduling', matches:r => !['completed','cancelled'].includes(r.status) && reviewView(r).status === 'needs_scheduling'},
    ownership: {label:'Reviews need an owner', matches:r => !['completed','cancelled'].includes(r.status) && !r.owner_id},
  },
  policies: {
    missing: {label:'Policies reported missing', matches:r => r.status !== 'retired' && r.presence === 'reported_missing'},
    verification: {label:'Policies need verification', matches:r => r.status !== 'retired' && ['reported_existing','needs_confirmation'].includes(r.presence)},
  },
};
export const unansweredPolicies = (catalog, state) => catalog.policies.filter(p => !['yes','no','unsure'].includes(state.policies[p.key]));
export function reviewConfigurationIssues(state) {
  return frameworkPlans(state).filter(p => {
    const config=reviewConfig(state,p);
    return config.recurrence==='custom' && (!Number.isInteger(config.custom_recurrence_days) || config.custom_recurrence_days<1 || config.custom_recurrence_days>3650);
  });
}
export function existingBaseline(rows, item) {
  return rows.find(r => r.baseline_key === item.key) || rows.find(r => !r.baseline_key && [item.name,...(item.aliases || [])].some(n => n.toLowerCase() === (r.title || '').trim().toLowerCase()));
}
export function onboardingPreview(catalog, state, records) {
  const policies = catalog.policies.map(p => ({existing:!!existingBaseline(records.policies,p), response:state.policies[p.key]}));
  const reviews = frameworkPlans(state).filter(p => reviewConfig(state,p).enabled).map(p => {
    const old = records.reviews.find(r => r.framework_plan_key === p.key) || (p.baseline_key && records.reviews.find(r => r.baseline_key === p.baseline_key));
    return {existing:!!old, row:old || {status:'needs_scheduling', ...reviewConfig(state,p)}};
  });
  for (const item of genericReviews(catalog,state)) {
    const old = existingBaseline(records.reviews,item);
    reviews.push({existing:!!old, row:old || {status:'needs_scheduling',recurrence:null}});
  }
  const count = (items, fn) => items.filter(fn).length;
  const newAssessments = state.requirements['cis-ig1'] === 'applies'
    ? cis.requirements.filter(d => !records.framework_assessments.some(a => a.framework_key === 'cis-ig1' && a.definition_id === d.id)).length : 0;
  return {policies:{total:policies.length, create:count(policies,p=>!p.existing), retain:count(policies,p=>p.existing),
    yes:count(policies,p=>p.response==='yes'), no:count(policies,p=>p.response==='no'), unsure:count(policies,p=>p.response==='unsure')},
    reviews:{total:reviews.length, create:count(reviews,r=>!r.existing), retain:count(reviews,r=>r.existing),
      scheduling:count(reviews,r=>SETUP_FILTERS.reviews.scheduling.matches(r.row)), owners:count(reviews,r=>!!r.row.owner_id)}, newAssessments};
}
export function currentHandoff(snapshot, cid) {
  if (snapshot.client?.client_id !== cid) throw new Error('Setup summary does not match the selected client.');
  const records = Object.fromEntries(Object.entries(snapshot.records).map(([kind, rows]) => [kind, rows.filter(r => r.client_id === cid)]));
  const counts = Object.fromEntries(Object.entries(SETUP_FILTERS).map(([kind, filters]) => [kind, Object.fromEntries(Object.entries(filters).map(([key,f]) => [key, records[kind].filter(f.matches).length]))]));
  const programs = FRAMEWORKS.filter(f => records.requirements.some(r => r.baseline_key === f.key && r.baseline_response === 'applies')).map(f => {
    const rows = records.framework_assessments.filter(a => a.framework_key === f.key);
    return {...f, assessments:rows.length, not_assessed:rows.filter(a=>a.status==='not_assessed').length};
  });
  return {...snapshot, records, counts, programs,
    unsurePrograms:FRAMEWORKS.filter(f=>records.requirements.some(r=>r.baseline_key===f.key && ['potentially_applicable','needs_review'].includes(r.applicability))),
    activeReviews:records.reviews.filter(r=>!['completed','cancelled'].includes(r.status)).length};
}
