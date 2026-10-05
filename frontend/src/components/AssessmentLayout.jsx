import {Tabs,TabsList,TabsTrigger,TabsContent} from './ui/tabs';
import './AssessmentLayout.css';

// Tabs only control presentation. Drafts and saved conclusions belong to the caller.
export default function AssessmentLayout({summary,requirement,children,checklist,review,outcome,criteriaTitle,reference,criteriaSummary}) {
  return <Tabs defaultValue="implementation" className="assessment-layout">
    <TabsList aria-label="Assessment sections">
      <TabsTrigger value="implementation">Requirement &amp; implementation</TabsTrigger>
      <TabsTrigger value="criteria">Assessment criteria</TabsTrigger>
    </TabsList>
    <TabsContent value="implementation" forceMount>
      <details className="assessment-summary"><summary>Requirement summary</summary><p>{summary}</p></details>
      {requirement}{children}
    </TabsContent>
    <TabsContent value="criteria" forceMount>
      {criteriaTitle&&<div className="assessment-criteria-intro"><h3>{criteriaTitle}</h3>{criteriaSummary&&<p>{criteriaSummary}</p>}{reference&&<p>{reference}</p>}</div>}
      <div className="assessment-criteria-columns">
        {checklist}
        <section><h3>Review guidance</h3>{review?.map(text=><p key={text}>{text}</p>)}</section>
        <section><h3>Expected outcome</h3>{outcome?.map(text=><p key={text}>{text}</p>)}</section>
      </div>
    </TabsContent>
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
