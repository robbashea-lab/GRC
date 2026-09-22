import {now,uid,clone} from './store';
export function approvalSnapshot(db,p) {
  const s=p.approval_source;
  if(!s||typeof s.version!=='string'||!s.version.trim()||s.version.length>100||s.version!==p.version)throw new Error('Record an approval document or external reference matching the current Policy version first');
  if(Object.keys(s).some(k=>!['version','evidence_id','external_reference','external_version'].includes(k))||!!s.evidence_id===!!s.external_reference)throw new Error('Choose one uploaded document or external reference');
  let basis;
  if(s.evidence_id) {
    const e=db.evidence.find(e=>e.evidence_id===s.evidence_id&&e.client_id===p.client_id&&['policy','policies'].includes(e.linked_type)&&e.linked_id===p.policy_id&&!e.archived_at);
    if(!e?.sha256||s.external_version)throw new Error('Choose available hashed Evidence linked to this Policy');
    basis={type:'evidence',evidence_id:e.evidence_id,filename:e.filename,version:e.version,sha256:e.sha256};
  } else {
    if(typeof s.external_reference!=='string'||!s.external_reference.trim()||s.external_reference.length>2000||typeof s.external_version!=='string'||!s.external_version.trim()||s.external_version.length>200)throw new Error('An external reference and document/version identifier are required');
    basis={type:'external',reference:s.external_reference,document_version:s.external_version,verification:'Reference recorded; external bytes not verified'};
  }
  const c=db.contacts.find(c=>c.contact_id===p.approver_contact_id&&c.client_id===p.client_id);
  return clone({subject_id:uid('subject'),captured_at:now(),client_id:p.client_id,policy_id:p.policy_id,title:p.title,version:p.version,summary:p.summary||null,owner_id:p.owner_id||null,named_approver:c?{contact_id:c.contact_id,name:c.name}:null,basis});
}
