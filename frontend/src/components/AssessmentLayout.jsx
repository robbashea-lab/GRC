import {useCallback,useEffect,useRef,useState} from 'react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import './AssessmentLayout.css';

// Tabs only control presentation. Drafts and saved conclusions belong to the caller.
export default function AssessmentLayout({summary,summaryLabel='Requirement summary',requirement,children,findings,checklist,review,outcome,criteriaTitle,reference,criteriaSummary,inlineCriteria=false,inlineWorkflow=false,interview,itemsToAddress,findingDraft=false,sectionCounts,safeguard11=false}) {
  const [section,setSection]=useState('implementation'),[summaryOpen,setSummaryOpen]=useState(false);
  const summaryControl=useRef(null),findingsControl=useRef(null);
  const interviewChoiceMade=useRef(false);
  const revealInterview=useCallback(()=>{if(!interviewChoiceMade.current)setSummaryOpen(true);},[]);
  const closeInterview=()=>{interviewChoiceMade.current=true;setSummaryOpen(false);summaryControl.current?.focus();};
  useEffect(()=>{if(findingDraft){setSection('findings');if(inlineWorkflow)findingsControl.current?.focus();}},[findingDraft,inlineWorkflow]);
  const criteria=<>
    {criteriaTitle&&<div className="assessment-criteria-intro"><h3>{criteriaTitle}</h3>{criteriaSummary&&<p>{criteriaSummary}</p>}{reference&&<p>{reference}</p>}</div>}
    <div className="assessment-criteria-columns">
      {checklist}
      <section><h3>Review guidance</h3>{review?.map(text=><p key={text}>{text}</p>)}</section>
      <section><h3>Expected outcome</h3>{outcome?.map(text=><p key={text}>{text}</p>)}</section>
    </div>
  </>;
  return <Tabs value={section} onValueChange={setSection} className="assessment-layout">
    <TabsList aria-label="Assessment sections">
      <TabsTrigger value="implementation">{safeguard11?'Assessment':'Requirement & implementation'}</TabsTrigger>
      {inlineWorkflow?<TabsTrigger value="items">Items to address{sectionCounts&&<span className={`assessment-tab-count${sectionCounts.items>0?' has-items':''}`} aria-label={sectionCounts.items==null?'Item count unavailable':undefined}>{sectionCounts.items??'—'}</span>}</TabsTrigger>:!inlineCriteria&&<TabsTrigger value="criteria">Assessment criteria</TabsTrigger>}
      <TabsTrigger value="findings" ref={findingsControl}>Findings{sectionCounts&&<span className="assessment-tab-count" aria-label={sectionCounts.findings==null?'Finding count unavailable':undefined}>{sectionCounts.findings??'—'}</span>}</TabsTrigger>
    </TabsList>
    <TabsContent value="implementation" forceMount>
      <details className="assessment-summary" open={summaryOpen} onToggle={event=>setSummaryOpen(event.currentTarget.open)}><summary aria-label={safeguard11?summaryLabel:undefined} ref={summaryControl} onClick={()=>{interviewChoiceMade.current=true;}}>{summaryLabel}{safeguard11&&<small className="sg11-guide-hint">Answer from current practice. Review status and current implementation before saving.</small>}</summary><p>{summary}</p>{interview?.({open:summaryOpen,close:closeInterview,reveal:revealInterview})}</details>
      {requirement}{children}
      {!inlineWorkflow&&inlineCriteria&&<details className="assessment-inline-criteria"><summary>Assessment guidance &amp; working checklist</summary>{criteria}</details>}
    </TabsContent>
    {inlineWorkflow?<TabsContent value="items" forceMount>{itemsToAddress}</TabsContent>:!inlineCriteria&&<TabsContent value="criteria" forceMount>{criteria}</TabsContent>}
    <TabsContent value="findings" forceMount>{findings}</TabsContent>
  </Tabs>;
}

export function AssessmentChecklist({title,items=[],historicalItems=[],value=[],onChange,disabled}) {
  const known=new Set(items.map(item=>item.id));
  const historical=new Map(historicalItems.map(item=>[item.id,item.text]));
  return <section><h3>{title}</h3><p className="assessment-check-caption">Working checklist · does not change implementation status.</p><fieldset disabled={disabled}>
    <legend className="sr-only">{title}</legend>
    {items.map(item=><label className="assessment-check" key={item.id}>
      <input type="checkbox" checked={value.includes(item.id)} onChange={event=>onChange(event.target.checked?[...new Set([...value,item.id])]:value.filter(id=>id!==item.id))}/>
      <span>{item.text}</span>
    </label>)}
    {value.some(id=>!known.has(id))&&<details><summary>Previous checklist responses</summary><ul>{value.filter(id=>!known.has(id)).map(id=><li key={id}>{id}{historical.has(id)&&` · ${historical.get(id)}`}</li>)}</ul></details>}
  </fieldset></section>;
}

export function AssessmentRequirement({heading,text,official=false,trigger,source,label,reference}) {
  return <section className="assessment-requirement"><h3>{heading}</h3>
    {text&&<>{official&&reference&&<p className="text-xs text-ink-secondary">Official requirement · {reference}</p>}{!official&&<p className="text-xs text-ink-secondary">Requirement summary · Omnisciente</p>}<p className="whitespace-pre-wrap" data-source-kind={official?'official':'authored'}>{text}</p></>}
    {trigger&&<p><strong>Required operation / trigger:</strong> {trigger}</p>}
    {source&&<a href={source} target="_blank" rel="noopener noreferrer">{label}</a>}
  </section>;
}
