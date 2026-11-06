import {namedDemoClient} from '../lib/demoClients';
import {scheduledDate} from '../lib/reviewOccurrences';
import {ids} from './store';
import {CIS_DEMO_SCENARIOS} from './cisDemoSelection';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishKrustyBaseline} from './cisCanonicalKrustyBaseline';
import {populateKrustyAssessments} from './cisCanonicalKrustyAssessments';
import {populateKrustyGovernance} from './cisCanonicalKrustyGovernance';
import {seedKrustyOperations} from './cisCanonicalKrustyOperations';
import {seedKrustyHistory} from './cisCanonicalKrustyHistory';

const CID = 'demo_krusty_krab';
const live = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);

// Explicit source construction only. The candidate owns atomic installation;
// normal reads must never call this to replace a retained visitor's work.
export function populateKrustyModel(db, dates) {
  const owner = (db.users || []).find(user => user.user_id === db.user?.user_id);
  if (!owner) throw new Error('Krusty source construction needs its existing application actor.');
  establishKrustyBaseline(db, {dates});
  populateKrustyAssessments(db, {dates, owner});
  const governance = populateKrustyGovernance(db, {dates, owner});
  const operations = seedKrustyOperations(db, {dates, owner});
  const history = seedKrustyHistory(db, {dates, owner, governance, operations});
  const governanceIds = new Set(governance.reviews.map(row => row.review_id));
  const operationIds = new Set(operations.reviews.map(row => row.review_id));
  const taskIds = new Set(operations.tasks.map(row => row.task_id));
  // History stages replacements. Return installed rows, including its actual
  // occurrences and linked work, rather than earlier zero-history references.
  return {
    program:{...governance, assessments:live(db, 'framework_assessments'), policies:live(db, 'policies'),
      reviews:live(db, 'reviews').filter(row => governanceIds.has(row.review_id))},
    operations:{...operations, risks:live(db, 'risks'), vendors:live(db, 'vendors'), ai_systems:live(db, 'ai_systems'),
      reviews:live(db, 'reviews').filter(row => operationIds.has(row.review_id)),
      tasks:live(db, 'tasks').filter(row => taskIds.has(row.task_id))},
    history
  };
}

// An immutable-file authoring input, not client/account creation. Krusty's
// isolated identity uses the same native definitions as its existing Demo seed.
export function krustyArtifactModel(anchor) {
  if (typeof anchor !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(anchor)
    || !scheduledDate(anchor)) throw new Error('Krusty artifacts require the exact frozen UTC anchor.');
  const dates = cisDemoFixtureDates(new Date(anchor));
  const scenario = CIS_DEMO_SCENARIOS.find(row => row.client_id === CID), identity = namedDemoClient(CID);
  if (scenario?.implementation_group !== 3 || identity?.group !== 3 || scenario.name !== identity.name)
    throw new Error('Krusty artifacts require their existing canonical IG3 identity.');
  const actor = {user_id:'demo_admin', name:'Demo Explorer', email:'explorer@example.test',
    workspace_mode:'demo', role:'super_admin', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind, []])), user:actor, users:[actor],
    logs:[], baselines:{}, drafts:{}, notifications:[],
    clients:[{client_id:CID, name:identity.name, logo_url:identity.logo, environment:'Demo', status:'active',
      assigned_owner_id:actor.user_id, primary_contact_id:CID+'_contact_0',
      framework_settings:{'cis-ig1':{implementation_group:scenario.implementation_group}}}],
    contacts:scenario.people.map((name, index) => ({contact_id:CID+'_contact_'+index, client_id:CID, name, status:'active'}))};
  return {db, dates, ...populateKrustyModel(db, dates)};
}
