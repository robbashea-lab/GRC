import { SCHEMAS } from './schemas';
import { ranks, reviewMatches } from './tableFilters';

const text = (key,label) => ({ key,label,sortable:true });
const select = (key,label,extra={}) => ({ ...text(key,label),filter:true,emptyLabel:'Not specified',...extra });
const date = (key,label,dateKind='future',emptyLabel='No Date') => select(key,label,{dateKind,emptyLabel});
const numeric = (key,label,filter=false) => ({...text(key,label),numeric:true,filter,emptyLabel:'Not assessed'});
// Options come only from the module schema and the authorized rows passed by its page.
export function tableColumns(module, { rows=[], users=[], clients=[], programs={} } = {}) {
  const person = (key,label='Owner') => select(key,label,{emptyLabel:'Unassigned',optionsOnly:true,
    options:[...new Set(rows.map(r => r[key]).filter(Boolean))].map(id => ({value:String(id),label:users.find(u => u.user_id === id)?.name || users.find(u => u.user_id === id)?.email || 'Unknown owner'}))});
  const severity = (key,label) => select(key,label,{rank:ranks,emptyLabel:'Not assessed'});
  if (module === 'risk-register') return [text('title','Risk'),select('category','Category'),numeric('likelihood_score','Likelihood',true),numeric('impact_score','Impact',true),numeric('risk_score','Score'),severity('risk_level','Level'),person('owner_id'),select('status','Status',{value:r=>r.status||'open'}),date('last_reviewed','Last reviewed','history','Never Reviewed')];
  if (module === 'vendor-register') return [text('name','Vendor'),{...text('service','Service / Product'),value:r=>r.service||r.services},{...severity('criticality','Criticality'),labelValue:v=>v==='medium'?'Moderate':v.charAt(0).toUpperCase()+v.slice(1)},select('data_types','Data Types'),person('business_owner_id','Business Owner'),date('last_review','Last Review','history','Never Reviewed'),date('next_review','Next Review','future','No Review Scheduled'),{...date('contract_renewal','Contract Renewal','future','No Renewal Date'),renewal:true,value:r=>r.contract_renewal||r.contract_expiration||r.contract_end},select('status','Status',{value:r=>r.status||'active'})];
  if (module === 'action-items') return [text('title','Action Item'),select('type','Type'),{...severity('priority','Priority'),labelValue:v=>({critical:'Immediate',immediate:'Immediate',medium:'Moderate',moderate:'Moderate',high:'High',low:'Low'})[v]||v},person('owner_id'),date('due_date','Due','due','No Due Date'),select('status','Status',{labelValue:v=>v==='remediated'?'Pending validation':v.replaceAll('_',' ')}),text('source','Source')];
  if (module === 'evidence') return [text('filename','File'),select('mime_type','Type'),select('uploaded_by_email','Uploaded by',{emptyLabel:'Unknown uploader'}),date('created_at','When','history','No Upload Date'),select('linked_type','Linked to',{emptyLabel:'Not linked'})];
  if (module === 'client-management') return [text('name','Client'),select('industry','Industry'),person('assigned_owner_id','GRC Lead'),select('program_status','Program Status',{value:r=>programs[r.client_id]}),select('status','Client Status',{value:r=>r.status||'active'})];
  if (module === 'portfolio') return [text('name','Client'),person('grc_lead_id','GRC Lead'),select('program_status','Program Status'),...['past_due','critical_high_open','unassigned','due_30d','due_31_90d'].map(key=>({...numeric(key,({past_due:'Past Due',critical_high_open:'Critical / High',unassigned:'Unassigned',due_30d:'Due ≤30d',due_31_90d:'Due 31–90d'})[key]),filter:true,optionsOnly:true,emptyLabel:null,options:[{value:'some',label:'Has items'},{value:'none',label:'No items'}],matches:(r,v)=>v==='some'?r[key]>0:!r[key]}))];
  if (module === 'users') return [text('name','User'),select('role','Role'),select('client_ids','Client access',{optionsOnly:true,emptyLabel:'No client assignments',options:clients.map(c=>({value:c.client_id,label:c.name})),value:r=>r.role==='super_admin'?clients.map(c=>c.client_id):(r.client_ids||[]).filter(id=>clients.some(c=>c.client_id===id))}),select('status','Status',{value:r=>r.status||'active'}),date('last_login_at','Last login','history','Never Signed In')];
  const schema=SCHEMAS[module];
  return (schema?.columns||[]).map(c=>{
    const field=schema.fields.find(f=>f.name===c.key);
    if(c.user) return person(c.key,c.label);
    if(c.date) return date(c.key,c.label,/^(last|created|updated|completion)/.test(c.key)?'history':c.key==='due_date'?'due':'future',c.key==='due_date'?'No Due Date':c.key==='next_review_date'?(module==='reviews'?'No Next Due':'No Review Scheduled'):/^(last|completion)/.test(c.key)?'Never Reviewed':'No Date');
    if(c.key==='status'&&module==='reviews') return select(c.key,c.label,{options:[{value:'overdue',label:'Overdue'},...(field?.options||[])],matches:reviewMatches});
    if(['severity','priority','risk_level','criticality'].includes(c.key)) return {...severity(c.key,c.label),options:field?.options};
    if(field?.options) return select(c.key,c.label,{options:field.options,emptyLabel:c.key==='recurrence'?'No Recurrence':'Not specified'});
    if(field?.type==='number') return numeric(c.key,c.label,true);
    return text(c.key,c.label);
  });
}
