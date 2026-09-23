import {useEffect,useState} from 'react';
import AssigneeSelect from './AssigneeSelect';
import api,{formatError} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {ASSURANCE_TYPES,assuranceStatus,vendorProjection,VENDOR_DATA_TYPES} from '@/lib/vendorGovernance';
import {toast} from 'sonner';

const dateText=value=>value?String(value).slice(0,10):'—';
const label=value=>String(value||'').replaceAll('_',' ');
export default function VendorGovernancePanel({tab,record,form,setForm,canWrite,isAdmin,users,reviews,tasks,risks,evidence,openRecord,uploadFiles,downloadEv,onSaved}) {
  const [riskOptions,setRiskOptions]=useState([]);
  useEffect(()=>{let alive=true;if(tab==='risks_tab')api.get('/risks',{params:{client_id:record.client_id}}).then(r=>{if(alive)setRiskOptions(r.data);}).catch(e=>toast.error(formatError(e)));return()=>{alive=false;};},[tab,record.client_id]);
  const write=canWrite&&record.status!=='inactive';
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  const field=(key,title,type='text')=><label className="block text-sm" key={key}>{title}<Input aria-label={title} data-testid={'field-'+key} type={type} value={form[key]??''} disabled={!write} onChange={e=>set(key,type==='number'?Number(e.target.value):e.target.value)} /></label>;
  const choice=(key,title,options)=><label className="block text-sm" key={key}>{title}<Select value={String(form[key]||'__none__')} disabled={!write} onValueChange={v=>set(key,v==='__none__'?null:v)}><SelectTrigger data-testid={"field-"+key} aria-label={title}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__">Unassigned / not specified</SelectItem>{options.map(o=><SelectItem key={o.value||o} value={o.value||o}>{o.label||label(o)}</SelectItem>)}</SelectContent></Select></label>;
  const flag=(key,title)=><label className="flex items-center gap-2 text-sm" key={key}><input type="checkbox" checked={!!form[key]} disabled={!write} onChange={e=>set(key,e.target.checked)}/>{title}</label>;
  const notes=(key,title)=><label className="block text-sm" key={key}>{title}<Textarea aria-label={title} value={form[key]||''} disabled={!write} onChange={e=>set(key,e.target.value)}/></label>;
  const evidenceChoices=(ids,onChange)=><div className="space-y-1">{evidence.length?evidence.map(e=><div key={e.evidence_id} className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={'Link '+e.filename} disabled={!write} checked={ids.includes(e.evidence_id)} onChange={event=>onChange(event.target.checked?[...ids,e.evidence_id]:ids.filter(id=>id!==e.evidence_id))}/><button className="text-link underline" onClick={()=>downloadEv(e)}>{e.filename}</button></div>):<p className="text-sm text-ink-secondary">No linked evidence yet. Upload a document below.</p>}</div>;
  const upload=<label className="block text-sm">Add evidence<input aria-label="Add vendor evidence" type="file" disabled={!write} className="block text-sm mt-1" onChange={e=>{uploadFiles(Array.from(e.target.files||[]));e.target.value='';}}/></label>;
  const current=vendorProjection(record,reviews);
  if(tab==='overview') return <div className="space-y-4">
    {field('name','Vendor name')}{field('service','Service / Product')}
    {record.services&&record.services!==record.service&&<p className="text-sm text-ink-secondary">Legacy service detail (retained): {record.services}</p>}
    <div className="grid grid-cols-2 gap-3">{field('category','Category')}{choice('criticality','Criticality',[{value:'critical',label:'Critical'},{value:'high',label:'High'},{value:'medium',label:'Moderate'},{value:'low',label:'Low'}])}
      {choice('status','Status',['onboarding','under_review','active','offboarding','inactive',...(record.status==='terminated'?['terminated']:[])])}
      <div className="text-sm">Business Owner<AssigneeSelect clientId={record.client_id} label="Business Owner" value={form.business_owner_id} onChange={v=>set('business_owner_id',v)} users={users} disabled={!write} testId="field-business_owner_id"/></div>
      {field('contact_name','Primary contact')}{field('contact_email','Contact email','email')}
      <div className="text-sm">Last Review<p>{dateText(current.last_review)}</p></div><div className="text-sm">Next Review<p>{dateText(current.next_review)}</p></div>
      <div className="text-sm">Created<p>{dateText(record.created_at)}</p></div><div className="text-sm">Contract Renewal<p>{dateText(record.contract_renewal||record.contract_expiration||record.contract_end)}</p></div>
    </div>{notes('notes','Notes')}
    <p className="text-sm text-ink-secondary">Onboarding → Under Review → Active → Offboarding → Inactive. Inactive relationships retain their history.</p>
    {['offboarding','inactive'].includes(form.status)&&<div className="space-y-2">{field('offboarding_review_date','Optional Offboarding Review date','date')}<p className="text-sm text-ink-secondary">Track access removal, data return/deletion and termination work through the linked Review and Action Items.</p></div>}
  </div>;
  if(tab==='data_access') return <div className="space-y-4"><div className="flex flex-wrap gap-3">{VENDOR_DATA_TYPES.map(value=><label className="flex gap-1 text-sm" key={value}><input type="checkbox" disabled={!write} checked={(form.data_types||[]).includes(value)} onChange={e=>set('data_types',e.target.checked?[...(form.data_types||[]),value]:form.data_types.filter(v=>v!==value))}/>{value}</label>)}</div>
    <div className="flex flex-wrap gap-3">{['stores','processes','transmits','accesses','hosts','none'].map(value=><label key={value} className="flex gap-1 text-sm"><input type="checkbox" disabled={!write} checked={(form.data_relationship||[]).includes(value)} onChange={e=>set('data_relationship',e.target.checked?[...(form.data_relationship||[]),value]:form.data_relationship.filter(v=>v!==value))}/>{label(value)}</label>)}</div>{notes('dependency_notes','Business dependency notes')}</div>;
  if(tab==='assurance') {
    const artifacts=form.assurance_records||[];
    const change=(i,key,value)=>set('assurance_records',artifacts.map((a,n)=>n===i?{...a,[key]:value}:a));
    return <div className="space-y-4">{flag('assurance_required','Security Assurance Required')}
      {(record.assurance_status||record.assurance_expires_at)&&<p className="text-sm text-ink-secondary">Retained legacy assurance metadata: {label(record.assurance_status)} · {dateText(record.assurance_expires_at)}. Confirm applicable expectations below.</p>}
      <p className="text-sm text-ink-secondary">Only declared expectations trigger attention. Evidence supports due diligence; its presence is not a security or compliance certification.</p>
      <div className="space-y-3">{artifacts.map((a,i)=><div key={a.type} className="border border-line rounded-md p-3 space-y-3">
        <div className="flex justify-between text-sm"><strong>{a.type}</strong><span>{label(assuranceStatus(form,a))}</span></div>{a.last_reviewed&&<p className="text-sm text-ink-secondary">Assurance Review completed {dateText(a.last_reviewed)}</p>}
        <label className="flex gap-2 text-sm"><input type="checkbox" disabled={!write} checked={a.required!==false} onChange={e=>change(i,'required',e.target.checked)}/>Expected artifact</label>
        <div className="grid grid-cols-2 gap-3">{[['received_at','Reviewed / Received'],['refresh_due','Expires / Refresh Due']].map(([key,title])=><label key={key} className="text-sm">{title}<Input aria-label={a.type+' '+title} type="date" disabled={!write} value={(a[key]||'').slice(0,10)} onChange={e=>change(i,key,e.target.value)}/></label>)}</div>
        {evidenceChoices(a.evidence_ids||[],ids=>change(i,'evidence_ids',ids))}
      </div>)}</div>
      {write&&<Select value="" onValueChange={type=>set('assurance_records',[...artifacts,{type,required:true,evidence_ids:[]}])}><SelectTrigger aria-label="Add assurance expectation"><SelectValue placeholder="Add assurance expectation"/></SelectTrigger><SelectContent>{ASSURANCE_TYPES.filter(type=>!artifacts.some(a=>a.type===type)).map(type=><SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>}
      {field('assurance_window_days','Assurance warning window (days)','number')}{upload}
      {isAdmin&&<div className="space-y-3">{flag('separate_assurance_review','Separate assurance Review schedule')}{form.separate_assurance_review&&<>{field('assurance_review_date','Assurance Review date','date')}{choice('assurance_cadence','Assurance Review cadence',['monthly','quarterly','semiannual','annual'])}<p className="text-sm text-ink-secondary">Use only for distinct work. Assurance due on the same date is covered by the primary Vendor Review.</p></>}</div>}
    </div>;
  }
  if(tab==='reviews_tab') return <div className="space-y-4">
    {isAdmin&&write&&<div className="space-y-3">{choice('review_frequency','Review frequency',['monthly','quarterly','semiannual','annual','biennial','as_needed','custom'])}{form.review_frequency==='custom'&&field('custom_recurrence_days','Custom recurrence (days)','number')}{field('next_review','Next Review date','date')}<p className="text-sm text-ink-secondary">Save to schedule or update the same linked Review obligation.</p></div>}
    {!reviews.length&&<p className="text-sm text-ink-secondary">No linked Reviews. Schedule the first Review above.</p>}
    {reviews.map(r=><div key={r.review_id} className="border border-line rounded-md p-3 space-y-2"><button className="text-sm text-left text-link" onClick={()=>openRecord({kind:'reviews',record:r})}>{r.title} · {label(r.status)} · Due {dateText(r.due_date)}</button>
      {(r.occurrences||[]).map(o=><button key={o.occurrence_id} className="block text-sm text-left text-link" onClick={()=>openRecord({kind:'reviews',record:r,initialValues:{occurrence:o}})}>Scheduled {dateText(o.due_date)} · Completed {dateText(o.completed_at)} · {label(o.outcome)}</button>)}</div>)}
  </div>;
  if(tab==='actions_tab') return <div className="space-y-3">{write&&<Button size="sm" onClick={()=>openRecord({kind:'tasks',record:null,initialValues:{source_type:'vendor',source_id:record.vendor_id,vendor_id:record.vendor_id}})}>Create Action Item</Button>}
    {!tasks.length&&<p className="text-sm text-ink-secondary">No linked Action Items.</p>}{tasks.map(t=><button key={t.task_id} onClick={()=>openRecord({kind:'tasks',record:t})} className="block border border-line rounded-md p-3 w-full text-left text-sm">{t.title} · {label(t.status)}</button>)}
  </div>;
  if(tab==='risks_tab') return <div className="space-y-3">{write&&<><Button size="sm" onClick={()=>openRecord({kind:'risks',record:null,initialValues:{source_type:'vendor',source_id:record.vendor_id,vendor_id:record.vendor_id}})}>Create Risk</Button>
    <Select value="" onValueChange={async id=>{try{await api.patch('/vendors/'+record.vendor_id,{related_risk_ids:[...new Set([...(record.related_risk_ids||[]),id])],expected_updated_at:record.updated_at??null});onSaved();toast.success('Risk linked');}catch(e){toast.error(formatError(e));}}}><SelectTrigger aria-label="Link existing Risk"><SelectValue placeholder="Link existing Risk"/></SelectTrigger><SelectContent>{riskOptions.filter(r=>!risks.some(x=>x.risk_id===r.risk_id)).map(r=><SelectItem key={r.risk_id} value={r.risk_id}>{r.display_id} · {r.title}</SelectItem>)}</SelectContent></Select></>}
    {!risks.length&&<p className="text-sm text-ink-secondary">No linked Risks.</p>}{risks.map(r=><button key={r.risk_id} className="block text-left w-full border border-line rounded-md p-3 text-sm" onClick={()=>openRecord({kind:'risks',record:r})}>{r.display_id} · {r.title} · {label(r.risk_level)}</button>)}
  </div>;
  if(tab==='contract') return <div className="space-y-4"><div className="grid grid-cols-2 gap-3">{field('contract_start','Effective date','date')}{field('contract_renewal','Renewal date','date')}{field('contract_expiration','Expiration date','date')}{choice('auto_renewal','Auto-renewal',['yes','no','unknown'])}
    {choice('dpa_present','DPA',['yes','no','not_applicable'])}{choice('baa_present','BAA',['yes','no','not_applicable'])}{choice('security_addendum_present','Security / privacy addendum',['yes','no','not_applicable'])}</div>
    {notes('contract_notes','Security / privacy requirements')}{notes('termination_requirements','Termination / offboarding requirements')}
    {evidenceChoices(form.contract_evidence_ids||[],ids=>set('contract_evidence_ids',ids))}{upload}
    {isAdmin&&<div className="space-y-3">{flag('contract_review_enabled','Enable Contract Renewal Review')}{form.contract_review_enabled&&field('contract_lead_days','Review lead time (days)','number')}<p className="text-sm text-ink-secondary">Review completion never changes the legal renewal date.</p></div>}
  </div>;
  return null;
}
