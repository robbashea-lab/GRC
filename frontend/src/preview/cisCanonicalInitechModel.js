import {ids} from './store';
import {addInitech} from './programs/initech';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';
import {establishInitechBaseline} from './cisCanonicalInitechBaseline';
import {populateInitechAssessments} from './cisCanonicalInitechAssessments';
import {populateInitechGovernance} from './cisCanonicalInitechGovernance';
import {seedInitechOperations} from './cisCanonicalInitechOperations';
import {seedInitechHistory} from './cisCanonicalInitechHistory';

const CID = 'demo_initech';
const live = (db, kind) => (db[kind] || []).filter(row => row.client_id === CID);

// Explicit source construction only. A fresh-session candidate owns the atomic
// installation boundary; normal reads must never call this to replace work.
export function populateInitechModel(db, dates) {
  const owner = (db.users || []).find(user => user.user_id === db.user?.user_id);
  if (!owner) throw new Error('Initech source construction needs its existing application actor.');
  establishInitechBaseline(db, {dates});
  populateInitechAssessments(db, {dates, owner});
  const governance = populateInitechGovernance(db, {dates, owner});
  const operations = seedInitechOperations(db, {dates, owner});
  const history = seedInitechHistory(db, {dates, owner, governance, operations});
  const governanceIds = new Set(governance.reviews.map(row => row.review_id));
  const operationIds = new Set(operations.reviews.map(row => row.review_id));
  const taskIds = new Set(operations.tasks.map(row => row.task_id));
  // Staged importers can replace rows. Return the installed objects, rather than
  // references captured before History added their dated relationships.
  return {
    program:{...governance, assessments:live(db, 'framework_assessments'), policies:live(db, 'policies'),
      reviews:live(db, 'reviews').filter(row => governanceIds.has(row.review_id))},
    operations:{...operations, risks:live(db, 'risks'), vendors:live(db, 'vendors'), ai_systems:live(db, 'ai_systems'),
      reviews:live(db, 'reviews').filter(row => operationIds.has(row.review_id)),
      tasks:live(db, 'tasks').filter(row => taskIds.has(row.task_id))},
    history
  };
}

// Pure immutable-file authoring input, never an account or access grant. The
// existing native Initech constructor supplies its exact seven Contact IDs.
export function initechArtifactModel(anchor) {
  const dates = cisDemoFixtureDates(new Date(anchor));
  if (dates.anchor !== anchor) throw new Error('Initech artifacts require the exact frozen UTC anchor.');
  const actor = {user_id:'demo_admin', name:'Demo Explorer', email:'explorer@example.test',
    workspace_mode:'demo', role:'super_admin', status:'active', client_ids:[CID]};
  const db = {...Object.fromEntries(Object.keys(ids).map(kind => [kind, []])), user:actor, users:[actor],
    logs:[], baselines:{}, drafts:{}, notifications:[]};
  addInitech(db, new Date(anchor));
  return {db, dates, ...populateInitechModel(db, dates)};
}
