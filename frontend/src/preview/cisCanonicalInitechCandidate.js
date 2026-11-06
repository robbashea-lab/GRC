import {cisDemoFixtureDates,CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {CIS_DEMO_REVISION} from './cisDemoSelection';
import {CIS_CANONICAL_SCENARIO_REVISION} from './cisCanonicalArtifactBooks';
import {populateInitechModel} from './cisCanonicalInitechModel';
import {initechArtifactSpecsFromModel} from './cisCanonicalInitechBooks';
import {registerCisDemoArtifacts} from './cisDemoArtifactRecipes';
import {INITECH_SCENARIO_PROFILE} from './cisCanonicalInitechContent';

const CID = 'demo_initech';
const copy = value => JSON.parse(JSON.stringify(value));
const utf8 = text => encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,hex) => String.fromCharCode(parseInt(hex,16)));
const IDS = {framework_assessments:'framework_assessment_id',reviews:'review_id',policies:'policy_id',
  risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',findings:'finding_id',tasks:'task_id'};

// Explicit fresh-source installation, never a retained-session/read migration.
// Fresh initialization and private QA share this same native construction.
export function buildCanonicalInitechCandidate(db,{clock = new Date()} = {}) {
  const dates = cisDemoFixtureDates(clock), staged = copy(db), model = populateInitechModel(staged,dates);
  const client = staged.clients.find(row => row.client_id === CID);
  client.notes = INITECH_SCENARIO_PROFILE.business_context
    +' A fictional 24-month CIS v8.1 IG2 program; implementation and history derive from native records.';
  staged.cis_demo_refresh ||= {version:CIS_SHOWCASE_VERSION,anchor:dates.anchor,timezone:'UTC',clients:{},reconciliation_required:[]};
  if (staged.cis_demo_refresh.version !== CIS_SHOWCASE_VERSION || staged.cis_demo_refresh.anchor !== dates.anchor)
    throw new Error('Initech source anchor/version disagrees with the initial Demo cohort.');
  staged.cis_demo_refresh.clients[CID] = {version:CIS_SHOWCASE_VERSION,state:'fresh_fixture',
    canonical_revision:CIS_CANONICAL_SCENARIO_REVISION,assessment_origin:model.history.origin,
    history_months:24,organizational_history_start:model.history.origin};
  staged.cis_demo_rollout.clients[CID] = {revision:CIS_DEMO_REVISION,ownership:'fresh_fixture',
    superseded_by:CIS_SHOWCASE_VERSION,canonical_revision:CIS_CANONICAL_SCENARIO_REVISION,applied_at:dates.anchor};
  const evidence = [], recipes = [];
  for (const book of initechArtifactSpecsFromModel(dates.anchor,{db:staged,dates,...model})) {
    const content = utf8(book.text), row = {evidence_id:book.evidence_id,client_id:CID,filename:book.filename,
      display_name:'Initech — '+book.key,mime_type:book.mime_type,evidence_type:'Report',linked_type:book.linked_type,
      linked_id:book.linked_id,occurrence_id:book.occurrence_id,relationships:copy(book.relationships),
      content_base64:btoa(content),size:content.length,version:1,created_at:dates.anchor,uploaded_at:dates.anchor,
      uploaded_by:staged.user.user_id,uploaded_by_email:staged.user.email,evidence_date:dates.day(0),fixture_version:CIS_SHOWCASE_VERSION,
      notes:'Fictional operating excerpts and dated ledgers. Plans are not successful execution; external references are not verified originals.'};
    if (staged.evidence.some(old => old.evidence_id === row.evidence_id)) throw new Error('Initech Evidence identity collision.');
    staged.evidence.push(row); evidence.push(row);
    recipes.push({kind:'scenario_book',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,
      scenario_revision:CIS_CANONICAL_SCENARIO_REVISION,client_id:CID,anchor:dates.anchor,key:book.key});
    for (const link of book.relationships) {
      const field = IDS[link.kind], target = field && staged[link.kind].find(record => record[field] === link.id && record.client_id === CID);
      if (!target) throw new Error('Initech Evidence relationship does not resolve.');
      if (link.kind === 'reviews' && link.occurrence_id) {
        const occurrence = target.occurrences.find(item => item.occurrence_id === link.occurrence_id);
        if (!occurrence) throw new Error('Initech Evidence occurrence does not exist.');
        occurrence.evidence ||= [];
        if (!occurrence.evidence.some(item => item.evidence_id === row.evidence_id))
          occurrence.evidence.push({evidence_id:row.evidence_id,filename:row.filename,version:row.version,sha256:null});
        delete occurrence.no_evidence_reason;
      } else {
        target.related_links ||= [];
        if (!target.related_links.some(item => item.kind === 'evidence' && item.id === row.evidence_id))
          target.related_links.push({kind:'evidence',id:row.evidence_id});
      }
    }
  }
  if (!registerCisDemoArtifacts(staged,evidence,recipes)) throw new Error('Initech immutable Evidence source registration failed.');
  Object.assign(db,staged);
  return {...model,evidence,anchor:dates.anchor,revision:CIS_CANONICAL_SCENARIO_REVISION};
}
