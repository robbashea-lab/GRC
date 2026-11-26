import {downloadEvidence} from '../lib/evidenceContext';

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
