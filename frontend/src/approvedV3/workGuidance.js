import {downloadEvidence} from '../lib/evidenceContext';
import {collectEvidencePages} from '../lib/brawndoAdditionalEvidence';
import {downloadEvidenceArchive} from '../lib/evidenceArchive';
import {EVIDENCE_AREAS} from '../lib/evidenceRepository';

export async function loadApprovedEvidenceCatalog({api,clientId,params={},isCurrent=()=>true}) {
  function check(){if(!clientId||!isCurrent())throw Error('The evidence selection changed. Reopen the selected client.');}
  check();
  const rows=await collectEvidencePages(async page=>{
    check();
    const {data}=await api.get('/evidence/catalog',{params:{...params,client_id:clientId,page,page_size:100}});
    check();return data;
  },{});
  if(rows.some(row=>row.client_id!==clientId||!row.evidence_id))throw Error('The evidence catalog does not match the selected client.');
  if(new Set(rows.map(row=>row.evidence_id)).size!==rows.length)throw Error('The evidence catalog contains duplicate identities. Reload this client.');
  return rows;
}

/** Keep reference records visible without presenting their metadata as stored bytes. */
export async function downloadApprovedEvidenceArchive({api,records,clientId,sourceId,folder='__all',isCurrent=()=>true}) {
  const clients=(records?.clients || []).filter(client=>client.client_id===clientId&&client.source_client_id===sourceId);
  if(clients.length!==1||!isCurrent())throw Error('Reopen the Evidence Library for the selected saved client.');
  const folderArea=folder==='__all'?null:folder==='Needs classification'?'Unassigned':folder;
  if(folderArea!==null&&![...Object.values(EVIDENCE_AREAS),'Unassigned'].includes(folderArea))throw Error('Reopen the selected evidence folder.');
  const params=folderArea?{state:JSON.stringify({filters:{program_areas:[folderArea]}})}:{};
  const rows=await loadApprovedEvidenceCatalog({api,clientId,params,isCurrent});
  const referenceCount=rows.filter(row=>row.file_available===false).length;
  const referenceNote=referenceCount?` ${referenceCount} reference-only record${referenceCount===1?'':'s'} remain in the Library; no file contents were supplied for them.`:'';
  if(!rows.length)throw Error('No evidence records match this selection.');
  if(referenceCount===rows.length)return {downloaded:false,fileCount:0,referenceCount,
    message:'This selection has no stored files to download.'+referenceNote};
  const result=await downloadEvidenceArchive({clientId,params,folderArea,storedOnly:true,isCurrent,
    filename:'evidence-'+(folderArea||'all')+'.zip'});
  if(!isCurrent())throw Error('The evidence selection changed. Reopen the selected client.');
  return {...result,downloaded:true,referenceCount,message:`ZIP download started: ${result.fileCount} verified file${result.fileCount===1?'':'s'}.`+referenceNote};
}

export async function downloadApprovedEvidence({api,records,clientId,evidenceId,isCurrent}) {
  const rows=(records?.evidence || []).filter(f=>f.client_id===clientId && f.evidence_id===evidenceId && !f.archived_at);
  if(rows.length!==1 || rows[0].file_available===false || !/^[a-f\d]{64}$/i.test(rows[0].sha256 || '') || !Number.isInteger(rows[0].size)) {
    throw Error('This evidence record has no downloadable file.');
  }
  return downloadEvidence(rows[0],{transport:api,isCurrent});
}

/** Adapt the signed-in user's native occurrence contract to the approved guide's field names. */
export function sourceReviewGuide(guide, review) {
  const occurrenceId=review.current_occurrence_id || 'occ_'+review.review_id;
  if(guide.occurrence_id!==occurrenceId || !guide.contract_token || !Array.isArray(guide.steps)) {
    throw Error('This review occurrence changed. Reopen the review to load its current checklist.');
  }
  if((guide.expected_updated_at ?? null)!==(review.updated_at ?? null)) {
    throw Error('The saved review changed. Reload this client before editing its checklist.');
  }
  const known=new Set();
  const steps=guide.steps.map(step=>{
    if(!step.step_id || !step.text || known.has(step.step_id) || !['spm','cl','client'].includes(step.who)) {
      throw Error('The native review checklist contains an unsupported or duplicate step.');
    }
    known.add(step.step_id);
    return {step_id:step.step_id,t:step.text,who:step.who,support:step.support || '',op:!!step.operating};
  });
  const answers=new Map();
  for(const answer of guide.results || []) {
    if(!known.has(answer.step_id) || answers.has(answer.step_id)) throw Error('The saved review results differ from its checklist.');
    answers.set(answer.step_id,answer);
  }
  const st={},note={};
  steps.forEach((step,i)=>{
    const answer=answers.get(step.step_id);
    if(answer) { st[i]=answer.result; if(answer.reason) note[i]=answer.reason; }
  });
  return {occurrenceId,token:guide.contract_token,revision:guide.expected_updated_at ?? null,steps,st,note,
    supportingReference:guide.supporting_reference || '',readOnly:!!guide.read_only,
    specialist:!!(guide.native_gate || review.iso_audit),serviceContext:(guide.service_context || []).map(area=>({
      name:area.name,resp:area.responsibility,responsibility:area.responsibility_label,tools:(area.tools || []).map(tool=>tool.name),
    }))};
}

export async function prepareReviewGuide({api,page,records,clientId,sourceId,reviewId}) {
  const row=(records?.reviews || []).find(review=>review.client_id===clientId &&
    (review.source_record_id===reviewId || review.review_id===reviewId) && !['completed','cancelled'].includes(review.status));
  if(!row) return false; // Historical drawers read the immutable occurrence snapshot.
  const {data}=await api.get('/reviews/'+encodeURIComponent(row.review_id)+'/completion-guide');
  page.setReviewGuide(sourceId,reviewId,sourceReviewGuide(data,row));
  return true;
}
