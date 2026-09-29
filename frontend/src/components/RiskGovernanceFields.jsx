import {useEffect,useState} from 'react';
import api,{formatError} from '@/lib/api';
import {toast} from 'sonner';
import {nextRiskReview} from '@/lib/brawndoRisks';
import {relatedReviewInitialValues} from '@/lib/reviewOccurrences';
import {Input} from './ui/input';
import {Label} from './ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';

export const RISK_SOURCES={manual:'Manual / Internal',annual_assessment:'Annual Risk Assessment',management:'Management',review:'Review',finding:'Finding',vendor:'Vendor',audit:'Audit / Assessment'};
const relations={review:['reviews','review_id'],finding:['findings','finding_id'],vendor:['vendors','vendor_id'],audit:['assessments','assessment_id']};
export function RiskSourceFields({form,setForm,clientId,disabled=false,pilot=false,onOpen}) {
  const [records,setRecords]=useState([]);
  const source=form.source_type||'manual', relation=relations[source];
  useEffect(()=>{
    let current=true; setRecords([]);
    if(relation) (source==='audit'?api.get('/onboarding/state',{params:{client_id:clientId}}).then(r=>({data:r.data.assessments||[]})):api.get('/'+relation[0],{params:{client_id:clientId}})).then(({data})=>{if(current)setRecords(data.filter(r=>r.client_id===clientId));}).catch(e=>{if(current)toast.error(formatError(e));});
    return ()=>{current=false;};
  },[source,clientId,relation]); // source selects the stable relation definition
  return <div className="space-y-2"><Label>Source *</Label><Select disabled={disabled} value={source} onValueChange={value=>setForm({...form,source_type:value,source_id:'',review_id:null,finding_id:null,vendor_id:null,assessment_id:null})}>
    <SelectTrigger aria-label="Risk source"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(pilot?{...RISK_SOURCES,manual:'Manual Entry',annual_assessment:'Risk Assessment',review:'Recurring Review',vendor:'Vendor Review',other:'Other'}:RISK_SOURCES).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
    {relation&&<Select disabled={disabled} value={form.source_id||'__none__'} onValueChange={value=>setForm({...form,source_id:value,[relation[1]]:value})}><SelectTrigger aria-label="Source record"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__none__" disabled>Select a record</SelectItem>{records.map(r=><SelectItem key={r[relation[1]]} value={r[relation[1]]}>{r.title||r.name}</SelectItem>)}</SelectContent></Select>}
    {form.source&&!form.source_type&&<p className="text-xs text-ink-secondary">Legacy source: {form.source}</p>}
    {pilot&&source==='other'&&<><Label htmlFor="risk-source-other">Other source description</Label><Input id="risk-source-other" maxLength={200} disabled={disabled} value={form.source_other||''} onChange={e=>setForm({...form,source_other:e.target.value})}/></>}
    {pilot&&relation&&form.source_id&&(()=>{const target=records.find(r=>r[relation[1]]===form.source_id);return target&&onOpen?<button type="button" className="text-link underline text-sm text-left" onClick={()=>onOpen({kind:relation[0],record:target,initialValues:source==='review'?relatedReviewInitialValues(target,{...form,review_id:form.source_id}):undefined})}>Open source · {target.title||target.name}</button>:<p className="text-sm text-ink-secondary">{target?'Source record selected':'Source unavailable or inaccessible'}</p>;})()}
  </div>;
}
export function RiskScheduleFields({form,setForm,disabled=false,pilot=false,creation=false}) {
  const [overridden,setOverridden]=useState(false);
  return <div className="grid grid-cols-2 gap-3"><div className="space-y-1"><Label>Review cadence</Label><Select disabled={disabled} value={form.review_cadence||'annual'} onValueChange={value=>setForm({...form,review_cadence:value,...(pilot&&creation&&!overridden?{next_review:nextRiskReview(new Date().toISOString().slice(0,10),value,form.custom_recurrence_days)}:{})})}>
    <SelectTrigger aria-label="Risk review cadence"><SelectValue/></SelectTrigger><SelectContent>{Object.entries({none:'One-Time',monthly:'Monthly',quarterly:'Quarterly',semiannual:'Semiannual',annual:'Annual',custom:'Custom'}).map(([value,label])=><SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-1"><Label htmlFor="risk-next-review">Next Review</Label><Input id="risk-next-review" disabled={disabled} type="date" value={form.next_review?.slice(0,10)||''} onChange={e=>{setOverridden(true);setForm({...form,next_review:e.target.value});}}/>{pilot&&!form.next_review&&<p className="text-xs text-ink-secondary">Not scheduled — choose a date when known.</p>}</div>
    {form.review_cadence==='custom'&&<div><Label>Recurrence days</Label><Input aria-label="Risk recurrence days" type="number" min="1" max="3650" disabled={disabled} value={form.custom_recurrence_days||''} onChange={e=>{const days=Number(e.target.value);setForm({...form,custom_recurrence_days:days,...(pilot&&creation&&!overridden?{next_review:nextRiskReview(new Date().toISOString().slice(0,10),'custom',days)}:{})});}}/></div>}
  </div>;
}
