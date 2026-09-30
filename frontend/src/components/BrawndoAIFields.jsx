import {aiApproval,aiApproved} from '@/lib/brawndoAI';
import {catalog} from '@/lib/aiGovernance';
import {DueDate} from './RegisterCells';

export default function BrawndoAIFields({tab,form,current,input,person,boolean,put,Choices,vendors,admin,isNew,dirty}){
  if(tab==='Data & Access')return <>
    <Choices label="Known data processed (not permission to use)" values={catalog.data_types} selected={form.data_types} onChange={v=>put('data_types',v)}/>
    <Choices label="System access" values={catalog.access} selected={form.access} onChange={v=>put('access',v)}/>
    {input('data_settings','Data, integrations & account settings',true)}
    <p className="text-xs text-ink-muted">Document connected systems, accounts, retention and training-use settings only when known. Blank means not documented.</p>
  </>;
  return <>
    <dl className="grid sm:grid-cols-3 gap-4 text-sm"><div><dt className="text-ink-muted">Approval Status</dt><dd className="font-semibold">{aiApproval(current||{approval_status:'pending_assessment'})}</dd></div><div><dt className="text-ink-muted">Next Review</dt><dd>{current?.next_review?<DueDate iso={current.next_review}/>: 'Not Scheduled'}</dd></div><div><dt className="text-ink-muted">Internal Risk Rating</dt><dd className="capitalize">{current?.risk_tier||'Not screened'}</dd></div></dl>
    {isNew&&<div className="grid sm:grid-cols-2 gap-4">{input('name','Product / System Name')}{input('provider','Provider')}{person('owner_id','Business Owner')}</div>}
    <section className="brawndo-ai-boundaries space-y-4">
      <h3>{aiApproved(current||{})?(dirty?'Proposed Changes to Approved Boundaries':'Approved Uses & Restrictions'):current?.approval_status==='not_approved'?'Intended Uses & Restrictions':'Proposed Uses & Approval Conditions'}</h3>
      <p className="text-xs text-ink-muted">Approval applies only to the saved product, environment, uses and conditions. Editing these boundaries requires reassessment; a draft is not an approval.</p>
      {input('description','Purpose / Use',true)}
      {input('environment','Environment / Account Type')}
      <p className="text-sm"><strong>Permitted Data: </strong>{!dirty&&aiApproved(current||{})&&form.permitted_data_types?.length?form.permitted_data_types.join(', '):'Data permissions not established for this proposal'}</p>
      <details><summary className="text-sm cursor-pointer">Data permissions & restrictions {form.permitted_data_types?.length?`(${form.permitted_data_types.length} proposed classifications)`:'— not established'}</summary><div className="space-y-3 mt-3"><Choices label="Proposed permitted data classifications" values={catalog.data_types} selected={form.permitted_data_types} onChange={v=>put('permitted_data_types',v)}/>
      {!aiApproved(current||{})&&<p className="text-sm text-ink-muted">Data permissions not established</p>}
      {input('restrictions','Prohibited uses / approval conditions',true)}</div></details>
      {form.human_review_required!==null&&<p className="text-sm">Human review: {form.human_review_required?'Required':'Not required in the recorded assessment'}</p>}
    </section>
    <div className="grid sm:grid-cols-2 gap-4">{!isNew&&<>{input('name','Product / System Name')}{input('provider','Provider')}{person('owner_id','Business Owner')}</>}{input('product_model','Product / Model')}{!isNew&&person('technical_owner_id','Technical Owner')}
      {boolean('Third-party product or service?',form.screening?.third_party,v=>put('screening',{...form.screening,third_party:v}))}
      {boolean('Customer-facing use?',form.screening?.customer_facing,v=>put('screening',{...form.screening,customer_facing:v}))}
      <label className="text-sm space-y-1"><span>Lifecycle Status (not approval)</span><select aria-label="Lifecycle Status" className="h-9 rounded-md border border-line px-2" value={form.status} onChange={e=>put('status',e.target.value)}>{catalog.statuses.filter(v=>admin||!['active','suspended','retired'].includes(v)||v===form.status).map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select></label>
      <label className="text-sm space-y-1"><span>Vendor record</span><select aria-label="Vendor record" className="h-9 rounded-md border border-line px-2" value={form.vendor_id||''} onChange={e=>put('vendor_id',e.target.value||null)}><option value="">No vendor linked</option>{vendors.map(v=><option key={v.vendor_id} value={v.vendor_id}>{v.name}</option>)}</select></label>
    </div>
    <p className="text-xs text-ink-muted">Contracts and assurance remain in Vendors. Record a system first, then schedule its governance review under Oversight & Review.</p>
    <Choices label="Purpose categories" values={catalog.purposes} selected={form.purposes} onChange={v=>put('purposes',v)}/>
  </>;
}
