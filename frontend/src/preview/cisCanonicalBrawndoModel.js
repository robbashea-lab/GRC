import {ids} from './store';
import {demoOrganizations, providerStaff, clientPersonaRoles} from './demoPortfolio';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishBrawndoBaseline} from './cisCanonicalBrawndoBaseline';
import {seedBrawndoProgram} from './cisCanonicalBrawndoProgram';
import {seedBrawndoOperations} from './cisCanonicalBrawndoOperations';
import {seedBrawndoHistory} from './cisCanonicalBrawndoHistory';

export const CIS_CANONICAL_REVISION = 'cis81-canonical-rebuild-v3';
const CID = 'demo_brawndo';

export function brawndoProcessOwners(db) {
  const contacts = db.contacts.filter(row => row.client_id === CID && row.status === 'active');
  const contact = index => contacts.find(row => row.contact_id === CID+'_contact_'+index);
  return {'Executive sponsor':contact(1), 'IT lead':contact(2), 'GRC manager':contact(0),
    'Warehouse operations lead':contact(2), 'Managed service provider lead':contact(2),
    'Finance and operations lead':contact(3), 'Operations lead':contact(2),
    'HR coordinator':contact(3), 'Department manager':contact(2), 'Procurement lead':contact(3)};
}

export function populateBrawndoModel(db, dates) {
  establishBrawndoBaseline(db, {dates});
  const owner = db.users.find(row => row.user_id === 'demo_provider_lead');
  const program = seedBrawndoProgram(db, {dates, owner, processOwners:brawndoProcessOwners(db)});
  const operations = seedBrawndoOperations(db, {dates, owner, frameworkReviews:program.reviews,
    processOwners:[0,1,2].map(index => CID+'_user_'+index)});
  const history = seedBrawndoHistory(db, {dates, owner, program, operations});
  // These three Risk treatment plans are the same work already owned by a CIS
  // Finding. Reuse its Action; keep the Finding's source and completion/validation
  // workflow intact, and keep the separate Risk review/closure decisions.
  for (const [key,definitionId] of [['asset-owners','1.1'],['configuration','4.1'],['vulnerability-process','7.1']]) {
    const risk=operations.risks.find(row=>row.risk_id===CID+'_canonical_risk_'+key);
    const finding=history.findings.find(row=>row.definition_id===definitionId);
    const task=history.tasks.find(row=>row.task_id===finding?.primary_task_id);
    const duplicateId=CID+'_canonical_task_'+key;
    const duplicate=db.tasks.find(row=>row.task_id===duplicateId);
    if(!risk||!finding||!task||task.client_id!==CID||!duplicate||duplicate.client_id!==CID
      ||duplicate.completed_at||duplicate.status!=='open')throw new Error('Initial Brawndo shared remediation does not match its native Finding work.');
    db.tasks=db.tasks.filter(row=>row.task_id!==duplicateId);
    risk.related_task_ids=[...new Set([...risk.related_task_ids.filter(id=>id!==duplicateId),task.task_id])];
    risk.related_finding_ids=[...new Set([...(risk.related_finding_ids || []),finding.finding_id])];
    risk.related_links=[...(risk.related_links || []).filter(link=>link.id!==duplicateId),
      {kind:'tasks',id:task.task_id},{kind:'findings',id:finding.finding_id}];
  }
  operations.tasks=operations.tasks.filter(row=>db.tasks.some(task=>task.task_id===row.task_id));
  return {program, operations, history};
}

// A pure source representation for immutable fictional file contents. These are
// existing fixture identities, not new accounts or grants. This object is never
// installed into an authenticated store or used as the current browser session.
export function brawndoArtifactModel(anchor) {
  const dates = cisDemoFixtureDates(new Date(anchor));
  if (dates.anchor !== anchor) throw new Error('Canonical artifacts require their exact frozen UTC anchor.');
  const org = demoOrganizations.find(row => row.key === 'brawndo');
  const provider = providerStaff.find(row => row.user_id === 'demo_provider_lead');
  const actor = {user_id:'demo_admin', name:'Demo Explorer', email:'explorer@example.test',
    workspace_mode:'demo', role:'super_admin', status:'active', client_ids:[CID]};
  const owner = {...provider, email:'provider_lead@provider.example.test', role:'platform_admin',
    workspace_mode:'demo', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(key => [key,[]])), user:actor, logs:[],
    baselines:{}, drafts:{}, notifications:[],
    clients:[{client_id:CID, name:org.name, environment:'Demo', status:'active',
      primary_contact_id:CID+'_contact_0', assigned_owner_id:owner.user_id,
      framework_settings:{'cis-ig1':{implementation_group:1}}}],
    users:[actor, owner, ...org.people.map((name,index) => ({user_id:CID+'_user_'+index,
      name, email:'brawndo.person'+index+'@example.test', role:clientPersonaRoles[index],
      workspace_mode:'demo', status:'active', client_ids:[CID]}))],
    contacts:org.people.map((name,index) => ({contact_id:CID+'_contact_'+index, client_id:CID,
      name, email:'brawndo.person'+index+'@example.test', status:'active'}))};
  const result = populateBrawndoModel(db, dates);
  return {db, dates, ...result};
}
