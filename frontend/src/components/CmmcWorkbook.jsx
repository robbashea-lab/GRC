import {useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import api,{formatError} from '../lib/api';
import {recordUuid} from '../lib/recordUuid';
import {canExportReports,OPERATOR_ROLES} from '../lib/permissions';
import {clientDestination} from '../lib/clientSelection';
import {buildCmmcWorkspace,effectiveCmmcPlan,cmmcSections,cmmcAssetCategories,cmmcPartialChoices} from '../lib/cmmcWorkspace';
import {downloadCmmcExport} from '../lib/cmmcExports';
import {recordReferences} from '../lib/cmmcFiles/snapshot';
import {Button} from './ui/button';
import WorkspaceTabs from './WorkspaceTabs';
import './CmmcWorkbook.css';

const endpoint='/frameworks/cmmc/workbook';
const tabs=[['requirements','Requirements'],['ssp','System Security Plan'],['poam','POA&M'],['sprs','SPRS Score']];
const statusNames={implemented:'Implemented',gap:'Implementation gap',excluded:'Not applicable',applicability:'Review scope',unassessed:'Not assessed'};
const conditionNames={'not-implemented':'Not implemented','encrypted-not-fips':'Encryption in use without FIPS validation','remote-privileged-only':'MFA for remote and privileged users only'};
const states=['Open','In progress','Ready for review','Closed'];
const eligibility={candidate:'Draft candidate',blocked:'Excluded from conditional POA&M',review:'Review scoring inputs','not-needed':'No current gap',internal:'Internal remediation'};
const field=(id,label,type='text',options)=>({id,label,type,options});
const choices=obj=>Object.entries(obj);
const planFields=[field('status','Status','select',states.map(state=>[state,state])),field('milestone','Milestone','textarea'),
  field('owner','Plan owner'),field('due_date','Target date','date'),field('notes','Working notes','textarea'),
  field('closeout','Closeout and validation notes','textarea'),field('evidence','Validation evidence reference','textarea')];
const postingFields=[field('score','Submitted score','number'),field('date','Assessment date','date'),field('scope','Assessment scope'),
  field('cage','Associated CAGE codes'),field('reference','SPRS reference')];
const decisionFields=[field('outcome','Recorded decision','select',[['pending','Pending review'],['approved','Approval recorded'],['adjudicated','Favorable DoD CIO adjudication recorded']]),
  field('authority','Decision authority'),field('date','Decision date','date'),field('reference','Decision reference'),field('notes','Scope and evidence','textarea')];
const card='panel cmmc-paper rounded-lg border border-line bg-surface-card p-4 space-y-3';
const table='w-full text-left text-sm';
const control='ui-control block w-full';

function Editor({draft,setDraft,onSave,onCancel,busy}) {
  return <form className={card} aria-label={draft.title} onSubmit={event=>{event.preventDefault();onSave();}}>
    <h3 className="font-semibold">{draft.title}</h3>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      {draft.fields.map(({id,label,type,options})=>{
        const props={value:draft.values[id] || '',className:control,onChange:e=>{
          const value=e.target.value;
          const values={...draft.values,[id]:value};
          if(draft.section==='plans' && id==='status' && (value==='Closed' || draft.values.status==='Closed')) values.closeout='';
          setDraft({...draft,request_id:recordUuid(),values});
        }};
        const reopening=draft.section==='plans' && draft.initialStatus==='Closed' && draft.values.status!=='Closed';
        return <label key={id} className="text-sm">{id==='closeout' && reopening?'Reason for reopening':label}
          {type==='select'?<select {...props}>{options.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
            :type==='textarea'?<textarea {...props} rows={3} maxLength={4000}/>:<input {...props} type={type || 'text'} maxLength={4000}/>}
        </label>;
      })}
    </fieldset>
    <Button type="submit" disabled={busy}>Save</Button>{' '}
    <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
  </form>;
}

function Metrics({items}){
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{items.map(([label,value])=><div className="rounded border border-line p-3" key={label}>
    <dt className="text-xs text-ink-secondary">{label}</dt><dd className="text-2xl font-semibold">{value}</dd></div>)}</dl>;
}

function RowButton({row,onOpen}){
  return <button type="button" className="text-link underline" onClick={()=>onOpen(row.id)}>{row.practice}</button>;
}

export default function CmmcWorkbook({clientId,level,user,revision,onOpen,children}) {
  const [params,setParams]=useSearchParams();
  const selected=params.get('cmmc_tab');
  const tab=(level===1?tabs.slice(0,2):tabs).some(([id])=>id===selected)?selected:'requirements';
  const [model,setModel]=useState(null),[error,setError]=useState('');
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[version,setVersion]=useState(0);
  const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[tier,setTier]=useState('all');
  const epoch=useRef(0),mounted=useRef(false),active=useRef(null);
  const actorScope=JSON.stringify([user?.user_id,user?.role,user?.workspace_mode]);
  active.current=JSON.stringify([clientId,level,actorScope,tab,revision,version]);
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  useEffect(()=>{setDraft(null);},[clientId,level,actorScope]);
  useEffect(()=>{
    if(tab==='requirements') return;
    const abort=new AbortController(),scope=active.current;
    setModel(null);setError('');
    api.get(endpoint,{params:{client_id:clientId},signal:abort.signal}).then(({data})=>{
      if(abort.signal.aborted || scope!==active.current)return;
      const next=buildCmmcWorkspace(data.data,data.records,data.client);
      if(next.clientId!==clientId || next.level!==level) throw new Error('Client or CMMC scope changed. Reopen the workbook.');
      setModel(next);
    }).catch(failure=>{if(!abort.signal.aborted && scope===active.current)setError(formatError(failure));});
    return ()=>abort.abort();
  },[clientId,level,actorScope,tab,revision,version]);
  const writable=OPERATOR_ROLES.includes(user?.role)&&model?.client?.status!=='archived';
  const allowed=row=>writable&&(user.role!=='client_contributor'||row&&row.owner===user.user_id);
  const switchTab=next=>{
    if(busy || next===tab)return;
    if(draft && !window.confirm('Discard unsaved workbook changes?'))return;
    setDraft(null);setModel(null);setError('');setFilter('all');setSearch('');setTier('all');epoch.current++;
    const query=new URLSearchParams(params);
    if(next==='requirements')query.delete('cmmc_tab');else query.set('cmmc_tab',next);
    setParams(query);
  };
  const edit=(section,title,fields,initial={},target='',assessedVersion='')=>{
    if(busy || draft && !window.confirm('Discard unsaved workbook changes?'))return;
    setError('');
    const values=Object.fromEntries(fields.map(f=>[f.id,String(initial[f.id] ?? (f.options?.[0]?.[0] || ''))]));
    setDraft({section,title,fields,target,initialStatus:initial.status,original:values,revision:model.revision,assessed_version:assessedVersion,request_id:recordUuid(),values});
  };
  const save=async()=>{
    if(busy || !draft)return;
    const scope=active.current;setBusy(true);setError('');
    const {section,target,values,assessed_version,request_id,revision:savedRevision}=draft;
    try{
      if (section==='linkedAction') {
        const row=model.rows.find(item=>item.id===target);
        if(!row || row.state!=='gap')throw new Error('Reopen the current gap before creating remediation.');
        await api.post('/framework_assessments/'+encodeURIComponent(row.assessmentId)+'/findings',{
          request_id,cmmc_gap_version:assessed_version,title:values.title,description:values.description,remediation_title:values.remediation_title,
          ...(values.due_date?{due_date:values.due_date}:{})});
      } else {
        // Keep inferred Action details live until the operator explicitly overrides a plan field.
        const changed=section==='plans'?Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==draft.original[key])):values;
        if(Object.keys(changed).length)await api.put(endpoint,{client_id:clientId,level,revision:savedRevision,request_id,section,target,assessed_version,values:changed});
      }
      if(mounted.current&&scope===active.current){setDraft(null);setVersion(value=>value+1);}
    }catch(failure){if(mounted.current&&scope===active.current)setError(formatError(failure));}
    finally{if(mounted.current)setBusy(false);}
  };
  const download=async()=>{
    if(busy || draft || !model || !canExportReports(user))return;
    const scope=active.current,sequence=++epoch.current;
    const isCurrent=()=>mounted.current && sequence===epoch.current && scope===active.current;
    setBusy(true);setError('');
    try{
      const {data}=await api.post(endpoint+'/export',{client_id:clientId,level,kind:tab,request_id:recordUuid()});
      if(!isCurrent())return;
      const latest=buildCmmcWorkspace(data.data,data.records,data.client);
      if(latest.clientId!==clientId || latest.level!==level)throw new Error('Client or CMMC scope changed. Reopen the workbook.');
      setModel(latest);
      await downloadCmmcExport(tab,latest,isCurrent);
    }catch(failure){if(isCurrent())setError(formatError(failure));}
    finally{if(mounted.current)setBusy(false);}
  };
  const editPlan=row=>edit('plans','Plan · '+row.practice,planFields,effectiveCmmcPlan(row,model.client),row.id,row.assessedVersion);
  const createAction=row=>edit('linkedAction','Create finding & Action · '+row.practice,
    [field('title','Finding title'),field('description','Finding description','textarea'),field('remediation_title','Action title'),field('due_date','Target date','date')],
    {title:row.practice+' · Implementation gap',description:row.narrative,remediation_title:row.plan?.milestone || '',due_date:row.plan?.due_date || ''},row.id,row.assessedVersion);
  const scoreRows=model?.rows || [], plans=model?.plans || [], title=tabs.find(([id])=>id===tab)?.[1];
  const rows=(tab==='poam'?plans:scoreRows).filter(row=>{
    const statusMatches=filter==='all' || (tab==='poam'?filter===(row.plan?.status || 'Open'):
      filter==='deductions'?row.deduction>0:!!row.reason);
    const pointTier=row.weight===null?'ssp':row.deductionMin!==row.deductionMax?'review':String(row.deduction);
    return statusMatches && (tier==='all' || tier===pointTier)
      && (row.practice+' '+row.title+' '+row.family).toLowerCase().includes(search.toLowerCase().trim());
  });
  const documentHeading=<div className="panel-head">
    <div><h2 className="panel-title">{title}</h2><p className="panel-desc">{tab==='sprs'?'NIST SP 800-171 Rev. 2 · CMMC Level 2':[model?.clientName,`CMMC Level ${level}`].filter(Boolean).join(' · ')}</p></div>
    <Button className="ghost sm" variant="outline" disabled={busy||!!draft||!model||!canExportReports(user)} onClick={download}>{({ssp:'Download professional draft',sprs:'Download score workbook',poam:'Download POA&M workbook'})[tab]}</Button>
  </div>;
  return <div className="native-cmmc-workbook space-y-4">
    <WorkspaceTabs label="CMMC workspace sections" tabs={level===1?tabs.slice(0,2):tabs} selected={tab} onSelect={switchTab} idPrefix="cmmc-tab" panelId="cmmc-panel"/>
    <div id="cmmc-panel" role="tabpanel" aria-labelledby={'cmmc-tab-'+tab} className="space-y-4">
    {tab==='requirements'?children:<>
      {!model&&<section className="panel cmmc-summary-panel">{documentHeading}</section>}
      {error&&<div role="alert">{error} <Button variant="outline" disabled={busy} onClick={()=>{if(draft&&!window.confirm('Discard your draft and reload the saved workbook?'))return;setDraft(null);setVersion(v=>v+1);}}>Reload saved workbook</Button></div>}
      {!model&&!error&&<p role="status">Loading saved workbook…</p>}
      {draft&&<Editor {...{draft,setDraft,busy}} onSave={save} onCancel={()=>{setDraft(null);setError('');}}/>}
      {model&&tab==='ssp'&&<>
        <section className="panel cmmc-summary-panel">{documentHeading}<div className="cmmc-summary-body"><h3 className="cmmc-breakdown-title">Draft status <span className="st warn">Working draft</span></h3>
          <Metrics items={[['Plan fields recorded',model.sspFields.filter(f=>model.ssp[f.id]).length+' / '+model.sspFields.length],
            ['Assets classified',model.assets.filter(a=>a.category).length+' / '+model.assets.length],
            ['Implementation notes',scoreRows.filter(row=>row.narrative).length+' / '+scoreRows.length]]}/>
        </div></section>
        {cmmcSections.map(section=>{const fields=model.sspFields.filter(f=>f.section===section.id);return <details key={section.id} className={card}>
          <summary>{section.title}</summary><p className="text-sm text-ink-secondary">{section.description}</p>
          <dl>{fields.map(f=><div key={f.id}><dt className="font-semibold">{f.label}</dt><dd className="whitespace-pre-wrap">{model.ssp[f.id] || 'Needs input'}</dd></div>)}</dl>
          {allowed()&&<Button variant="outline" onClick={()=>edit('ssp',section.title,fields.map(f=>field(f.id,f.label,['nextReview','lastReview'].includes(f.id)?'date':'textarea')),model.ssp)}>Edit section</Button>}
        </details>;})}
        <details className={card}><summary>Asset inventory &amp; treatment · {model.assets.length}</summary>
          {model.assets.length===0&&<p>No systems recorded in the client inventory.</p>}
          {model.assets.map(asset=><div className="border-b border-line py-2" key={asset.asset_id}><strong>{asset.name}</strong> · {cmmcAssetCategories[asset.category || '']} · {asset.treatment || 'Treatment not recorded'}{' '}
            {allowed()&&<Button variant="outline" onClick={()=>edit('assets',asset.name,[field('category','Scope classification','select',choices(cmmcAssetCategories)),field('treatment','Treatment / scope rationale','textarea')],asset,asset.asset_id)}>Document asset scope</Button>}</div>)}
        </details>
        <details className={card}><summary>Applicability decisions</summary>
          {scoreRows.filter(row=>row.status==='not_applicable'||row.decision).map(row=><div key={row.id}><RowButton row={row} onOpen={onOpen}/> · {row.rationale || 'Rationale not recorded'} · {row.decision?.outcome || 'Pending review'}
            {row.decision && (row.status!=='not_applicable'||row.rationale!==row.decision.rationale)&&' · Historical decision; scope changed'}
            {allowed(row)&&row.status==='not_applicable'&&<Button variant="outline" onClick={()=>edit('decisions','Applicability decision · '+row.practice,decisionFields,row.decision||{},row.id,row.assessedVersion)}>Record decision</Button>}</div>)}
        </details>
        <details className={card}><summary>Implementation statements · {scoreRows.length} requirements</summary>
          {scoreRows.map(row=><div className="border-b border-line py-2" key={row.id}><RowButton row={row} onOpen={onOpen}/> · {row.title}
            <div className="whitespace-pre-wrap">{row.narrative || 'No narrative recorded'}</div>
            <ul className="text-sm text-ink-secondary">{recordReferences(row).map(reference=>{
              const route={Policy:'/policies?id=',Review:'/reviews?id=','Action item':'/action-items?task_id='}[reference.kind];
              return <li key={reference.kind+':'+reference.id}>{reference.kind} · {route
                ? <Link className="text-link underline" to={clientDestination(clientId,route+encodeURIComponent(reference.id))}>{reference.title}</Link>
                : reference.title}</li>;
            })}</ul></div>)}
        </details>
      </>}
      {model&&tab==='sprs'&&<>
        <section className="panel cmmc-summary-panel">{documentHeading}<div className="cmmc-score-grid">
          <div>
            <h3 className="font-semibold">Working score estimate</h3>
            <p className={model.score.available ? 'cmmc-score-number' : 'cmmc-score-pending'}>{model.score.available ? <>{model.score.value}<small> / 110</small></> : 'Awaiting assessment'}</p>
            <p className="cmmc-score-caption">Internal readiness estimate. {model.score.sspReady?'SSP requirement verified.':'The SSP prerequisite needs verification.'}</p>
            <p>{model.score.assessed} of 110 assessed</p>
          </div>
          <dl className="cmmc-score-equation">
            <div><dt>Starting score</dt><dd>110</dd></div>
            <div><dt>Saved gaps</dt><dd>{model.score.knownDeduction}</dd></div>
            <div><dt>Withheld pending review</dt><dd>{model.score.withheld}</dd></div>
          </dl>
        </div></section>
        <section className={card}><h3 className="font-semibold">Recorded SPRS submission</h3>
          <p>{Object.hasOwn(model.posting,'score')?[model.posting.score,model.posting.date,model.posting.scope,model.posting.cage,model.posting.reference].filter(value=>value!==null && value!==undefined && value!=='').join(' · '):'No submitted score recorded.'}</p>
          {allowed()&&<Button variant="outline" onClick={()=>edit('posting','Record SPRS submission',postingFields,model.posting)}>Record SPRS submission</Button>}
        </section>
      </>}
      {model&&tab==='poam'&&<section className="panel cmmc-summary-panel">{documentHeading}<div className="cmmc-summary-body"><h3 className="font-semibold">Remediation register</h3>
        <Metrics items={[['Current gaps',plans.filter(row=>row.state==='gap').length],['Closed plans',plans.filter(row=>row.plan?.status==='Closed').length],
          ['Draft candidates',plans.filter(row=>row.eligibility==='candidate').length],['Conditional threshold',model.conditional.threshold+' / 110']]}/>
        <p>Conditional readiness · {model.conditional.state.replace(/-/g,' ')}. {model.conditional.closeoutDate?'Closeout date · '+model.conditional.closeoutDate:'Conditional status date not recorded.'}</p>
        {allowed()&&<Button variant="outline" onClick={()=>edit('conditional','Record conditional status date',[field('date','Conditional status date','date')],{date:model.conditional.statusDate})}>Record conditional status date</Button>}
      </div></section>}
      {model&&(tab==='poam'||tab==='sprs')&&<section className={card}>
        <div className="flex flex-wrap gap-3"><label>Search requirements<input className={control} value={search} onChange={e=>setSearch(e.target.value)}/></label>
          <label>Show<select className={control} value={filter} onChange={e=>setFilter(e.target.value)}>
            {(tab==='poam'?[['all','All plans'],...states.map(s=>[s,s])]:[['all','All requirements'],['deductions','Deductions'],['review','Inputs to review']]).map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>Point impact<select className={control} value={tier} onChange={e=>setTier(e.target.value)}>
            {[['all','All point impacts'],['5','5 points'],['3','3 points'],['1','1 point'],['0','0 points'],
              ['review','Scoring input required'],['ssp','SSP prerequisite']].map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select></label></div>
        <div className="overflow-x-auto"><table className={table}><thead><tr><th>Requirement</th><th>Status</th><th>Deduction</th><th>{tab==='poam'?'Plan and linked work':'Scoring input'}</th></tr></thead>
          <tbody>{rows.map(row=><tr className="border-t border-line" key={row.id}><td className="p-2"><RowButton row={row} onOpen={onOpen}/><br/>{row.title}</td>
            <td>{statusNames[row.state]}</td><td>{row.weight===null?'SSP prerequisite':row.deductionMin!==row.deductionMax?row.deductionMin+'–'+row.deductionMax:row.deduction}</td>
            <td>{tab==='poam'?<><div>{row.plan?.status || 'Open'} · {eligibility[row.eligibility]}</div><div>{effectiveCmmcPlan(row,model.client).milestone}</div>
              {row.actions.map(action=><div key={action.task_id}><Link className="text-link underline" to={clientDestination(clientId,'/action-items?task_id='+encodeURIComponent(action.task_id))}>{action.title || action.task_id}</Link> · {action.status} {action.due_date?.slice(0,10)}</div>)}
              {allowed(row)&&<Button variant="outline" size="sm" onClick={()=>editPlan(row)}>Edit plan</Button>}
              {allowed(row)&&row.state==='gap'&&!row.actions.length&&<Button variant="outline" size="sm" onClick={()=>createAction(row)}>Create finding &amp; Action</Button>}</>:<>
              {row.exception?conditionNames[row.exception]:row.reason}
              {row.state==='gap'&&cmmcPartialChoices[row.id]&&allowed(row)&&<Button variant="outline" size="sm" onClick={()=>edit('exceptions','Review scoring input · '+row.practice,
                [field('value','Verified implementation condition','select',[['','Unconfirmed'],[cmmcPartialChoices[row.id],conditionNames[cmmcPartialChoices[row.id]]],['not-implemented','Not implemented']])],{value:row.exception},row.id,row.assessedVersion)}>Review input</Button>}</>}</td>
          </tr>)}</tbody></table></div>{!rows.length&&<p>No matching requirements.</p>}
      </section>}
      {model&&model.history.length>0&&<details className={card}><summary>Workbook history</summary><ul>
        {model.history.map(event=><li key={event.revision}>{event.at} · {event.actor_name || event.actor} · {event.section} {event.target}</li>)}</ul></details>}
    </>}
    </div>
  </div>;
}
