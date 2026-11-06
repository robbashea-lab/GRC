import {cisDemoFixtureDates,CIS_SHOWCASE_VERSION} from './cisDemoFixtureDates';
import {CIS_DEMO_REVISION} from './cisDemoSelection';
import {populateBrawndoModel,CIS_CANONICAL_REVISION} from './cisCanonicalBrawndoModel';
import {brawndoArtifactSpecsFromModel} from './cisCanonicalBrawndoBooks';
import {registerCisDemoArtifacts} from './cisDemoArtifactRecipes';

const CID='demo_brawndo';
const copy=value=>JSON.parse(JSON.stringify(value));
const utf8=text=>encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
const ID_FIELDS={framework_assessments:'framework_assessment_id',reviews:'review_id',policies:'policy_id',
  risks:'risk_id',vendors:'vendor_id',ai_systems:'ai_system_id',findings:'finding_id',tasks:'task_id'};

// Explicit, atomic fixture construction for fresh initialization and private QA.
// Retained reads never invoke this factory to replace visitor work.
export function buildCanonicalBrawndoCandidate(db,{clock=new Date()}={}) {
  const dates=cisDemoFixtureDates(clock),staged=copy(db);
  const model=populateBrawndoModel(staged,dates);
  const client=staged.clients.find(row=>row.client_id===CID);
  client.profile ||= {};
  client.profile.organization={...client.profile.organization,employees:65,technology_users:65,locations:2,
    notes:'DEMO — SYNTHETIC DATA. A beverage manufacturer with two production lines at one bottling site and one warehouse; an 18-month CIS IG1 program.'};
  client.profile.technical={...client.profile.technical,endpoints:['Windows']};
  client.profile.security={...client.profile.security,vulnerability_management:'Partial',classification:'Partial',third_party:'Partial'};
  client.notes='Fictional 18-month CIS v8.1 scenario. Current implementation and history derive from native safeguard records. Not certification or zero risk.';
  staged.cis_demo_refresh ||= {version:CIS_SHOWCASE_VERSION,anchor:dates.anchor,timezone:'UTC',clients:{},reconciliation_required:[]};
  if(staged.cis_demo_refresh.version!==CIS_SHOWCASE_VERSION||staged.cis_demo_refresh.anchor!==dates.anchor)
    throw new Error('Canonical fixture anchor/version disagrees with the initial Demo cohort.');
  staged.cis_demo_refresh.clients[CID]={version:CIS_SHOWCASE_VERSION,state:'fresh_fixture',canonical_revision:CIS_CANONICAL_REVISION,
    assessment_origin:model.history.origin,history_months:18,organizational_history_start:model.history.origin};
  staged.cis_demo_rollout.clients[CID]={revision:CIS_DEMO_REVISION,ownership:'fresh_fixture',superseded_by:CIS_SHOWCASE_VERSION,
    canonical_revision:CIS_CANONICAL_REVISION,applied_at:dates.anchor};
  const books=brawndoArtifactSpecsFromModel(dates.anchor,{db:staged,dates,...model}),evidence=[],recipes=[];
  for(const book of books){
    const bytes=utf8(book.text),row={evidence_id:book.evidence_id,client_id:CID,filename:book.filename,
      display_name:'Brawndo — '+book.key.replaceAll('-',' '),mime_type:book.mime_type,evidence_type:'Report',
      linked_type:book.linked_type,linked_id:book.linked_id,occurrence_id:book.occurrence_id,
      relationships:copy(book.relationships),content_base64:btoa(bytes),size:bytes.length,version:1,
      created_at:dates.anchor,uploaded_at:dates.anchor,uploaded_by:staged.user.user_id,uploaded_by_email:staged.user.email,
      evidence_date:dates.day(0),fixture_version:CIS_SHOWCASE_VERSION,
      notes:'Fictional scoped CSV excerpts and dated ledgers collected at the frozen scenario anchor. Historical records are not browser actions or external assurance; a gap/assessment plan is not an implemented process.'};
    if(staged.evidence.some(item=>item.evidence_id===row.evidence_id))throw new Error('Canonical Evidence identity collision.');
    staged.evidence.push(row);
    const recipe={kind:'scenario_book',schema_version:1,fixture_version:CIS_SHOWCASE_VERSION,
      scenario_revision:CIS_CANONICAL_REVISION,client_id:CID,anchor:dates.anchor,key:book.key};
    recipes.push(recipe);
    for(const link of book.relationships){
      const field=ID_FIELDS[link.kind],target=field&&staged[link.kind].find(item=>item[field]===link.id&&item.client_id===CID);
      if(!target)throw new Error('Canonical Evidence relationship does not resolve in Brawndo.');
      if(link.kind==='reviews'&&link.occurrence_id){
        const occurrence=target.occurrences.find(item=>item.occurrence_id===link.occurrence_id);
        if(!occurrence)throw new Error('Canonical Evidence occurrence does not exist.');
        occurrence.evidence ||= [];
        if(!occurrence.evidence.some(item=>item.evidence_id===row.evidence_id))
          occurrence.evidence.push({evidence_id:row.evidence_id,filename:row.filename,version:row.version,sha256:row.sha256 ?? null});
        delete occurrence.no_evidence_reason;
      }else{
        target.related_links ||= [];
        if(!target.related_links.some(item=>item.kind==='evidence'&&item.id===row.evidence_id))
          target.related_links.push({kind:'evidence',id:row.evidence_id});
      }
    }
    evidence.push(row);
  }
  if(!registerCisDemoArtifacts(staged,evidence,recipes))throw new Error('Brawndo immutable Evidence source registration failed.');
  Object.assign(db,staged);
  return {...model,evidence,anchor:dates.anchor,revision:CIS_CANONICAL_REVISION};
}
