// Isolated Demo parity only. Real authorization is enforced by policy_approval.py.
import {record, audit, uid, now} from './store';
import {eligible, clientAccess} from './assignmentEligibility';
import {approvalSnapshot} from './policyProvenance';
import {clone} from './store';
const internal = user => ['super_admin','platform_admin'].includes(user.role);
const decide = (db, p) => eligible(db.user,p.client_id) && (internal(db.user) || p.approval_account_id === db.user.user_id);
export function policyApprovalRequest(db,path,method,params,body) {
  const [,kind,id,action] = path.split('/');
  if (kind !== 'policies' || !['approval-context','approval-authority','approval-subject','submit-review','return-draft','approve','reject'].includes(action) && id !== 'pending-decisions') return undefined;
  const cid = id === 'pending-decisions' ? params.client_id : record(db,kind,id).client_id;
  if (!eligible(db.user,cid)) throw new Error('Forbidden for this client or inactive account');
  if (id === 'pending-decisions' && method === 'get') return db.policies.filter(p=>p.client_id===cid && p.status==='in_review' && decide(db,p)).map(({policy_id,title})=>({policy_id,title}));
  const p = record(db,kind,id);
  function context() {
    const contact = db.contacts.find(c=>c.contact_id===p.approver_contact_id && c.client_id===cid);
    const account = ident => {
      if (!ident) return null;
      const u=db.users.find(u=>u.user_id===ident);
      if (!u) return {state:'unavailable',eligible:false};
      const access=clientAccess(u,cid);
      return {user_id:ident,name:access?u.name:'Account without client access',state:u.status,has_client_access:access,eligible:eligible(u,cid)};
    };
    return {policy_id:id,status:p.status,approval_request_id:p.approval_request_id,updated_at:p.updated_at,
      named_approver:contact?{contact_id:contact.contact_id,name:contact.name}:null,
      linked_account:account(contact?.linked_user_id),authorized_account:account(p.approval_account_id),
      can_configure:internal(db.user),can_submit:['super_admin','platform_admin','client_contributor'].includes(db.user.role),
      can_decide:decide(db,p),internal_approval:internal(db.user),history:p.approval_history||[],external_history:p.decision_history||[],source:p.approval_source,subject:p.approval_subject};
  }
  if (action==='approval-context' && method==='get') return context();
  if (method!=='post') throw new Error('Unsupported approval action');
  if(['approval-authority','approval-subject','submit-review'].includes(action)&&Object.prototype.hasOwnProperty.call(body,'expected_updated_at')&&body.expected_updated_at!==(p.updated_at??null))throw new Error('Record changed since it was opened; reload before saving');
  body={...body};delete body.expected_updated_at;
  const at=new Date(Math.max(Date.now(),(Date.parse(p.updated_at)||0)+1)).toISOString(),entry={at,by:db.user.user_id,by_name:db.user.name,by_email:db.user.email};
  if (action==='approval-authority') {
    if (!internal(db.user)) throw new Error('Only scoped internal administrators can delegate approval');
    if (p.status==='in_review') throw new Error('Return the pending submission to Draft before changing authority');
    if (Object.keys(body).some(k=>!['approver_contact_id','approval_account_id'].includes(k))) throw new Error('Unknown authority field');
    if (body.approver_contact_id && !db.contacts.some(c=>c.contact_id===body.approver_contact_id && c.client_id===cid)) throw new Error('Choose a Contact from this client');
    if (body.approval_account_id && !eligible(db.users.find(u=>u.user_id===body.approval_account_id),cid)) throw new Error('Choose an active account with access to this client');
    p.approver_contact_id=body.approver_contact_id||null;p.approval_account_id=body.approval_account_id||null;
    Object.assign(entry,{action:'authority_updated',approver_contact_id:p.approver_contact_id,approval_account_id:p.approval_account_id});
  } else if(action==='approval-subject') {
    if(!context().can_submit)throw new Error('Read-only role');
    if(p.status==='in_review')throw new Error('Return the pending submission to Draft before changing the approval basis');
    approvalSnapshot(db,{...p,version:body.version,approval_source:body});
    if(JSON.stringify(p.approval_source)===JSON.stringify(body)&&p.version===body.version)return p;
    Object.assign(p,{approval_source:clone(body),version:body.version,status:'draft',approved_at:null,approval_subject:null});
    entry.action='approval_basis_updated';
  } else if(action==='return-draft') {
    if(!context().can_submit)throw new Error('Read-only role');
    if(p.status!=='in_review'||body.approval_request_id!==(p.approval_request_id||'legacy'))throw new Error('This submission is no longer pending');
    p.status='draft';entry.action='submission_withdrawn';entry.subject=p.approval_subject?clone(p.approval_subject):null;
  } else if (action==='submit-review') {
    if (!context().can_submit) throw new Error('Read-only role');
    if (!['draft','approved'].includes(p.status) && !(p.status==='in_review'&&!p.approval_request_id)) throw new Error('Only Draft or Approved policies can be submitted');
    p.approval_subject=approvalSnapshot(db,p);p.approval_request_id=uid('approval');p.status='in_review';
    Object.assign(entry,{action:'submitted',approval_request_id:p.approval_request_id,subject:clone(p.approval_subject)});
  } else {
    if (!decide(db,p)) throw new Error('This account is not authorized to approve this Policy');
    if (p.status!=='in_review' || !body.approval_request_id || body.approval_request_id!==p.approval_request_id) throw new Error('This submission is no longer pending; reload the Policy');
    if(action==='approve'&&!p.approval_subject)throw new Error('Legacy submission has no approval basis; return it for a new documented submission');
    if (Object.keys(body).some(k=>!['approval_request_id','comment'].includes(k)) || typeof(body.comment??'')!=='string' || (body.comment||'').length>4000) throw new Error('Invalid decision');
    if(action==='reject' && !body.comment?.trim()) throw new Error('A return reason is required');
    p.status=action==='approve'?'approved':'draft';
    if(action==='approve')p.approved_at=at;
    Object.assign(entry,{action:action==='approve'?'approved':'rejected',comment:body.comment?.trim()||'',
      authority:internal(db.user)?'internal_administrative':'delegated_policy',approval_request_id:p.approval_request_id,subject:p.approval_subject?clone(p.approval_subject):null});
  }
  p.updated_at=at;p.approval_history=[...(p.approval_history||[]),entry];
  audit(db,entry.action,'policies',p,entry);
  return action==='approval-authority'?context():p;
}
