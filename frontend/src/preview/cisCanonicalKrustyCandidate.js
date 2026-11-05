import {cisDemoFixtureDates,CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {CIS_DEMO_REVISION} from './cisDemoSelection';
import {CIS_CANONICAL_SCENARIO_REVISION,canonicalArtifactLimit} from './cisCanonicalArtifactBooks';
import {populateKrustyModel} from './cisCanonicalKrustyModel';
import {krustyArtifactSpecs} from './cisCanonicalKrustyBooks';
import {registerCisDemoArtifacts} from './cisDemoArtifactRecipes';
import {snapshotCanonicalCisClient} from './cisCanonicalScope';
import {KRUSTY_SCENARIO_PROFILE,krustySafeguardContent} from './cisCanonicalKrustyContent';
import {DEMO_INLINE_LIMIT} from '../lib/demoStorageErrors';
import {eligible} from './assignmentEligibility';
import {stable} from './commandRequests';
import {captureDemoReporting} from './portfolioReporting';

const CID = 'demo_krusty_krab';
const copy = value => JSON.parse(JSON.stringify(value));
const utf8 = text => encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,hex) => String.fromCharCode(parseInt(hex,16)));
const reject = message => {throw new Error('Krusty candidate: '+message);};
const IDS = {framework_assessments:'framework_assessment_id',reviews:'review_id',policies:'policy_id',
  risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',findings:'finding_id',tasks:'task_id',evidence:'evidence_id'};
const PENDING_VERIFICATION = {
  '15.5':'The excerpts sample specific annual, new-term and renewal assessments; full source-level reconciliation of original assessments for all active providers remains outstanding. This does not assert that required provider assessments were unperformed.',
  '18.5':'The INT01 excerpt is not the complete original internal-penetration-test report and full scoped results; inspection of that complete source remains outstanding. This does not assert that the required internal test was unperformed.'
};

function sourceContext(db,dates) {
  // Immutable book sources use this existing canonical importer identity.
  if (db?.user?.workspace_mode !== 'demo' || db.user.user_id !== 'demo_admin'
    || !['super_admin','platform_admin','client_grc_manager'].includes(db.user.role))
    reject('an existing writable Demo source actor is required.');
  const accounts = (db.users || []).filter(row => row.user_id === db.user.user_id);
  if (accounts.length !== 1 || accounts[0].role !== db.user.role || !eligible(accounts[0],CID)
    || typeof accounts[0].name !== 'string' || !accounts[0].name.trim() || accounts[0].email !== db.user.email)
    reject('the existing source owner must be active and authorized for Krusty.');
  const clients = (db.clients || []).filter(row => row.client_id === CID);
  if (clients.length !== 1 || clients[0].environment !== 'Demo' || clients[0].status !== 'active' || clients[0].archived)
    reject('one active canonical Demo client is required.');
  if (clients[0].name !== KRUSTY_SCENARIO_PROFILE.name
    || clients[0].framework_settings?.['cis-ig1']?.implementation_group !== KRUSTY_SCENARIO_PROFILE.implementation_group)
    reject('the existing canonical name and IG3 scope must be retained.');
  const refresh = db.cis_demo_refresh, member = refresh?.clients?.[CID], rollout = db.cis_demo_rollout;
  if (refresh?.version !== CIS_SHOWCASE_VERSION || refresh.anchor !== dates.anchor || refresh.timezone !== 'UTC'
    || member?.version !== CIS_SHOWCASE_VERSION || member.state !== 'fresh_fixture'
    || rollout?.revision !== CIS_DEMO_REVISION || rollout.clients?.[CID]?.ownership !== 'fresh_fixture'
    || (refresh.reconciliation_required || []).some(row => row.client_id === CID)
    || (rollout.reconciliation_required || []).some(row => row.client_id === CID))
    reject('requires an explicitly fresh source cohort at the same UTC anchor; retained work needs explicit reconciliation.');
  if (member.canonical_revision && member.canonical_revision !== CIS_CANONICAL_SCENARIO_REVISION)
    reject('a different canonical source revision needs explicit reconciliation.');
  const repeat = member.canonical_revision === CIS_CANONICAL_SCENARIO_REVISION;
  if (!repeat && Object.entries(IDS).some(([kind,field]) => (db[kind] || []).some(row => row.client_id === CID
    && (row[field]?.startsWith(CID+'_canonical_') || row.fixture_history_version))))
    reject('a partial canonical source needs explicit reconciliation.');
  return repeat;
}

function record(db,kind,id) {
  const field = IDS[kind], rows = field ? (db[kind] || []).filter(row => row[field] === id) : [];
  if (rows.length !== 1 || rows[0].client_id !== CID) reject('an Evidence relationship does not resolve to one same-client record.');
  return rows[0];
}

function attachBook(db,book,row) {
  for (const link of book.relationships) {
    const target = record(db,link.kind,link.id);
    if (link.occurrence_id) {
      if (link.kind !== 'reviews') reject('only a native Review may supply an occurrence relationship.');
      const occurrences = (target.occurrences || []).filter(item => item.occurrence_id === link.occurrence_id);
      if (occurrences.length !== 1) reject('an Evidence occurrence does not resolve to its actual native Review.');
      const occurrence = occurrences[0];
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

function installedResult(db,model,evidence,anchor) {
  const live = (kind,rows) => rows.map(row => record(db,kind,row[IDS[kind]]));
  const assessments = live('framework_assessments',model.program.assessments);
  const verificationBasis = model.history.verification_basis.map(basis => {
    const row = assessments.find(item => item.framework_assessment_id === basis.assessment_id), current = row.assessment_history.at(-1);
    return {...basis,at:current.at,by:current.by,verification:row.verification,provenance:current.source};
  });
  return {
    ...model,
    program:{...model.program,assessments,
      policies:live('policies',model.program.policies),reviews:live('reviews',model.program.reviews)},
    operations:{...model.operations,risks:live('risks',model.operations.risks),vendors:live('vendors',model.operations.vendors),
      ai_systems:live('ai_systems',model.operations.ai_systems),tasks:live('tasks',model.operations.tasks),
      reviews:live('reviews',model.operations.reviews)},
    history:{...model.history,precollection_verification_basis:model.history.verification_basis,
      precollection_verification_basis_scope:'Original source-assessment basis before later compiled-book collection and fictional current verification.',
      verification_basis:verificationBasis,verification_basis_scope:'Current authored synthetic collection-day inspection; not external assurance.',
      reviews:live('reviews',model.history.reviews),
      assessments:live('framework_assessments',model.history.assessments),findings:live('findings',model.history.findings),
      tasks:live('tasks',model.history.tasks)},
    evidence:live('evidence',evidence),anchor,revision:CIS_CANONICAL_SCENARIO_REVISION
  };
}

function recordSyntheticVerification(db,model,evidence,dates) {
  const verifier = db.users.find(row => row.user_id === db.user.user_id), assessments = model.program.assessments;
  if (Object.keys(PENDING_VERIFICATION).some(id => !assessments.some(row => row.definition_id === id)))
    reject('the explicitly pending verification scope no longer matches the native program.');
  for (const row of assessments) {
    const current = row.assessment_history.filter(event => event.at === row.last_saved).at(-1);
    const sources = evidence.filter(file => file.relationships.some(link => link.kind === 'framework_assessments'
      && link.id === row.framework_assessment_id));
    if (row.status !== 'addressed' || !current || !row.guided_assessment_source || row.last_saved >= dates.anchor
      || !sources.length || sources.some(file => file.client_id !== CID || record(db,'evidence',file.evidence_id) !== file
        || typeof file.content_base64 !== 'string' || !file.content_base64 || atob(file.content_base64).length !== file.size
        || !row.related_links.some(link => link.kind === 'evidence' && link.id === file.evidence_id)))
      reject('current fictional verification requires actual same-client registered book bytes, relationships and a prior source assessment.');
    const check = krustySafeguardContent(row.definition_id,'addressed').evidence_check;
    const pending = PENDING_VERIFICATION[row.definition_id], verification = pending ? 'needs_validation' : 'verified';
    // These are explicitly authored scenario observations. Presence of a file
    // is only an input guard; it cannot establish a real verification result.
    const observation = '\nFictional collection-day verification: '+verifier.name+' ('+verifier.user_id+') at '+dates.anchor
      +'. Exact evidence-check basis: '+check+' Authored SYNTHETIC inspection result: '
      +(pending ? pending : 'The fictional verifier inspected the synthetic operating sample and retained native history against this safeguard-specific check; the stated synthetic sample satisfies the check within its recorded scope.')
      +' Sources: '+sources.map(file => file.filename+' ['+file.evidence_id+']').join('; ')
      +'. This is a later, separate collection-day fixture observation. Retrospectively compiled books are not files existing at earlier assessment dates, retroactive approvals, original-file authentication or real independent assurance.';
    Object.assign(row,{verification,verification_checklist:null,last_saved:dates.anchor,notes:row.notes+observation});
    row.assessment_history.push({...copy(current),at:dates.anchor,by:verifier.user_id,verification,verification_checklist:null,
      guided_assessment_source:copy(row.guided_assessment_source),notes:row.notes,
      source:'Explicit authored SYNTHETIC current verification observation, separate from historical implementation judgments and original-file authentication.'});
  }
}

// Explicit fresh-source construction for ordinary initialization and private QA;
// ordinary reads must never use this factory to replace retained visitor work.
export function buildCanonicalKrustyCandidate(db,{clock = new Date()} = {}) {
  const dates = cisDemoFixtureDates(clock), repeat = sourceContext(db,dates);
  const before = snapshotCanonicalCisClient(db,CID), staged = copy(db);
  const model = populateKrustyModel(staged,dates), client = staged.clients.find(row => row.client_id === CID);
  client.notes = KRUSTY_SCENARIO_PROFILE.business_context
    +' Current implementation, historical observations and remaining supplemental work derive from native records; not certification or zero risk.';
  staged.cis_demo_refresh.clients[CID] = {version:CIS_SHOWCASE_VERSION,state:'fresh_fixture',
    canonical_revision:CIS_CANONICAL_SCENARIO_REVISION,assessment_origin:model.program.origin,
    history_months:KRUSTY_SCENARIO_PROFILE.history_months,organizational_history_start:model.history.organization_origin};
  staged.cis_demo_rollout.clients[CID] = {revision:CIS_DEMO_REVISION,ownership:'fresh_fixture',
    superseded_by:CIS_SHOWCASE_VERSION,canonical_revision:CIS_CANONICAL_SCENARIO_REVISION,applied_at:dates.anchor};
  const books = krustyArtifactSpecs(dates.anchor), evidence = [], recipes = [];
  if (!Array.isArray(books) || !books.length || books.length > canonicalArtifactLimit(CID,CIS_CANONICAL_SCENARIO_REVISION)
    || new Set(books.map(book => book.key)).size !== books.length) reject('book count or source identities exceed the native contract.');
  for (const book of books) {
    if (typeof book.text !== 'string' || !book.text.trim() || !Array.isArray(book.relationships)
      || !book.relationships.length || book.relationships.length > 100) reject('book contents or relationships exceed the native contract.');
    const content = utf8(book.text);
    if (content.length > DEMO_INLINE_LIMIT || !book.evidence_id?.startsWith(CID+'_canonical_evidence_'))
      reject('book bytes or identity exceed the native contract.');
    if (staged.evidence.some(old => old.evidence_id === book.evidence_id)) reject('Evidence identity collision.');
    const row = {evidence_id:book.evidence_id,client_id:CID,filename:book.filename,display_name:'Krusty — '+book.key,
      mime_type:book.mime_type,evidence_type:'Report',linked_type:book.linked_type,linked_id:book.linked_id,
      occurrence_id:book.occurrence_id,relationships:copy(book.relationships),content_base64:btoa(content),size:content.length,
      version:1,created_at:dates.anchor,uploaded_at:dates.anchor,uploaded_by:staged.user.user_id,
      uploaded_by_email:staged.user.email,evidence_date:dates.day(0),fixture_version:CIS_SHOWCASE_VERSION,
      notes:'DEMO — SYNTHETIC DATA. Retrospective excerpts compiled at the frozen collection date. Earlier operating dates are not original file creation, client signatures, independently verified originals or external assurance.'};
    staged.evidence.push(row); evidence.push(row);
    recipes.push({kind:'scenario_book',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,
      scenario_revision:CIS_CANONICAL_SCENARIO_REVISION,client_id:CID,anchor:dates.anchor,key:book.key});
    attachBook(staged,book,row);
  }
  if (!registerCisDemoArtifacts(staged,evidence,recipes)) reject('immutable Evidence source registration failed.');
  const beforeVerification = {...staged,clients:[client],framework_assessments:staged.framework_assessments
    .map(row => row.client_id === CID ? copy(row) : row)};
  recordSyntheticVerification(staged,model,evidence,dates);
  // Only the current source identity changes. Native capture retains prior
  // implementation points when scope/status counts did not change.
  const reporting = {...staged,clients:[client]};
  captureDemoReporting(reporting,beforeVerification,dates.anchor);
  staged.portfolio_reporting = reporting.portfolio_reporting;
  if (repeat) {
    if (stable(before) !== stable(snapshotCanonicalCisClient(staged,CID)))
      reject('a changed or partial canonical candidate needs explicit reconciliation.');
    return installedResult(db,model,evidence,dates.anchor);
  }
  const result = installedResult(staged,model,evidence,dates.anchor);
  Object.assign(db,staged);
  return result;
}
