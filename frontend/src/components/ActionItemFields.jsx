import { useEffect, useState } from 'react';
import api, { formatError } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { SOURCE_TYPES, SOURCE_RECORDS, taskSource, actionStatus, actionPriority } from '@/lib/actionItems';
import ActionSourceChain from './ActionSourceChain';
import AssigneeSelect from './AssigneeSelect';
import RequirementBasis, {GovernanceContextFields} from './RequirementBasis';
import BrawndoActionContext from './BrawndoActionContext';
import {pilotPriority} from '@/lib/brawndoActions';

// Task-specific fields; the existing drawer owns Evidence, Comments and Related.
export default function ActionItemFields({form,setForm,record,clientId,canWrite,onTransition,saving,sourceLocked=false,related={},onOpen,pilot=false,canEditContext=canWrite}) {
  const [data,setData]=useState({users:[],records:{},error:'',loading:true});
  useEffect(()=>{
    let active=true; setData({users:[],records:{},error:'',loading:true});
    Promise.all([api.get('/clients/'+clientId+'/members'),...Object.values(SOURCE_RECORDS).map(([kind])=>kind==='assessments'?api.get('/onboarding/state',{params:{client_id:clientId}}).then(r=>({data:r.data.assessments||[]})):api.get('/'+kind,{params:{client_id:clientId}}))])
      .then(([u,...results])=>{if(active)setData({users:u.data,records:Object.fromEntries(Object.values(SOURCE_RECORDS).map(([k],i)=>[k,results[i].data.filter(r=>r.client_id===clientId)])),loading:false,error:''});})
      .catch(e=>{if(active)setData({users:[],records:{},loading:false,error:formatError(e)});});
    return()=>{active=false;};
  },[clientId]);
  const change=(key,value)=>setForm(p=>({...p,[key]:value}));
  const source=taskSource(record||form,data.records);
  const type=record?source.type:form.source_type||'manual';
  const [kind,idKey]=SOURCE_RECORDS[type]||[];
  const select=(name,label,value,options,disabled=false)=><div><Label htmlFor={'task-'+name}>{label}</Label><Select value={value||'__none__'} onValueChange={v=>change(name,v==='__none__'?null:v)} disabled={!canWrite||disabled}><SelectTrigger id={'task-'+name} aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>;
  const person=id=>data.users.find(u=>u.user_id===id)?.name||data.users.find(u=>u.user_id===id)?.email||(id?'Unavailable user':'Not recorded');
  const stamp=(label,at,by)=><div><dt className="text-ink-help">{label}</dt><dd>{at?new Date(at).toLocaleString():'Not recorded'}{by?' · '+person(by):''}</dd></div>;
  return <div className="space-y-4">
    {data.error&&<p role="alert" className="text-sm text-semantic-critical">{data.error}</p>}
    {pilot&&<BrawndoActionContext record={record} form={form} related={related} records={data.records} users={data.users} onOpen={onOpen} canWrite={canWrite&&canEditContext} onContextChange={v=>change('governance_context',v)}/>}
    {!pilot&&record && canWrite && !['done','cancelled'].includes(record.status) && <div className="flex gap-2">
      {record.status!=='in_progress'&&<Button size="sm" variant="outline" disabled={saving} onClick={()=>onTransition('in_progress')}>Start Work</Button>}
      <Button size="sm" disabled={saving} onClick={()=>onTransition('done')}>Complete Action Item</Button>
    </div>}
    <div><Label htmlFor="task-title">Title *</Label><Input id="task-title" data-testid="field-title" value={form.title||''} onChange={e=>change('title',e.target.value)} disabled={!canWrite} placeholder="What needs to be done?" /></div>
    <div><Label htmlFor="task-description">Description</Label><Textarea id="task-description" value={form.description||''} onChange={e=>change('description',e.target.value)} disabled={!canWrite}/></div>
    <div className={pilot?'grid grid-cols-1 sm:grid-cols-2 gap-4':'grid grid-cols-2 gap-4'}>
      {select('priority','Priority *',pilot?form.priority:form.priority||'medium',(pilot?[...new Set(['high','medium','low','informational',...(form.priority&&!['high','medium','low','informational'].includes(form.priority)?[form.priority]:[]),...(record&&!record.priority?['__none__']:[])])]:['critical','high','medium','low']).map(v=>[v,pilot?pilotPriority(v):actionPriority(v)]))}
      <div><Label>{pilot?'Assigned To':'Assignee'}</Label><AssigneeSelect showManagePeople={false} clientId={clientId} label={pilot?'Assigned To':'Assignee'} value={form.assignee_id} onChange={v=>change('assignee_id',v)} users={data.users} disabled={!canWrite}/></div>
      <div><Label htmlFor="task-due">Due Date</Label><Input id="task-due" type="date" value={form.due_date||''} disabled={!canWrite} onChange={e=>change('due_date',e.target.value||null)}/></div>
      {record&&select('status',pilot?'Progress':'Status',form.status,(pilot?['open','in_progress','blocked','cancelled',...(record.status==='done'?['done']:[])]:['open','in_progress','blocked','done','cancelled']).map(v=>[v,actionStatus(v)]),record.status==='done')}
    </div>
    {record ? (!pilot&&<ActionSourceChain record={record} related={related} onOpen={onOpen}/>) :
      <div className="space-y-3">
        <div><Label htmlFor="task-source">Source *</Label><Select value={type} onValueChange={v=>setForm(p=>({...p,source_type:v,source_id:null}))} disabled={!canWrite||sourceLocked}><SelectTrigger id="task-source" aria-label="Source"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(SOURCE_TYPES).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
        {kind&&select('source_id','Related '+SOURCE_TYPES[type],form.source_id,[['__none__',type==='audit'?'External / no linked assessment':'Select a record'],...(data.records[kind]||[]).map(r=>[r[idKey],r.title||r.name])],data.loading||!!data.error||sourceLocked)}
      </div>}
    {!pilot&&record&&<RequirementBasis kind="tasks" record={record} related={related} onOpen={onOpen} users={data.users}/>}
    {!pilot&&<GovernanceContextFields value={form.governance_context} disabled={!canWrite} onChange={value=>change('governance_context',value)}/>}
    {record&&<dl className="grid grid-cols-1 gap-3 pt-3 border-t border-line text-sm">
      {stamp('Created',record.created_at,record.created_by)}
      {stamp(pilot&&!record.started_at&&!['in_progress','blocked','done'].includes(record.status)?'Not Started':'Started',record.started_at,record.started_by)}
      {record.status==='done'&&stamp('Completed',record.completed_at,record.completed_by)}
    </dl>}
  </div>;
}
