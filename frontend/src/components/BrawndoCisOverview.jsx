import {Link} from 'react-router-dom';
import {Moon,Sun} from 'lucide-react';
import {Button} from './ui/button';
import {useBrawndoTheme} from '@/lib/brawndoTheme';
import './BrawndoCisOverview.css';

// Brawndo CIS IG1 overview: where the program stands, what to do next, then the controls.
const SEGMENTS=[['addressed','Implemented','good'],['partial','Partial','attention'],['gap','Not implemented','critical'],['notAssessed','Not assessed','neutral']];
const FILTER={addressed:'addressed',partial:'in_progress',gap:'needs_attention',notAssessed:'not_assessed'};
const plural=(n,one,many)=>`${n} ${n===1?one:many}`;
export function nextSteps(s){
  return [
    s.gap&&{key:'needs_attention',tone:'critical',title:`${plural(s.gap,'safeguard is','safeguards are')} not implemented or ${s.gap===1?'needs':'need'} validation`,detail:'Start here · these carry the most risk',action:`Review ${s.gap}`},
    s.overdueActions&&{key:'overdue_actions',tone:'critical',title:`${plural(s.overdueActions,'safeguard has','safeguards have')} overdue remediation`,detail:'Linked action items are past their due date',action:`Open ${s.overdueActions}`},
    s.unremediated&&{key:'unremediated',tone:'attention',title:`${plural(s.unremediated,'gap has','gaps have')} no finding recorded`,detail:'Record a finding so each gap has an owner and a due date',action:`Review ${s.unremediated}`},
  ].filter(Boolean);
}
export function BrawndoCisHeader({resume,onContinue}){
  const [theme,setTheme]=useBrawndoTheme();
  return <header className="bcis-head">
    <div><p className="bcis-eyebrow">CIS Controls v8.1 IG1</p><h1>CIS IG1</h1></div>
    <div className="bcis-actions">
      <button type="button" className="bcis-theme" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-pressed={theme==='dark'} aria-label={theme==='dark'?'Switch to light mode':'Switch to dark mode'}>{theme==='dark'?<Sun size={16} aria-hidden="true"/>:<Moon size={16} aria-hidden="true"/>}<span>{theme==='dark'?'Light':'Dark'}</span></button>
      <Link className="bcis-btn" to="/client-profile?tab=program">Program configuration</Link>
      {resume&&<Button className="bcis-primary" onClick={onContinue} aria-label={`Continue assessment: ${resume.definition_id} ${resume.title}`}>Continue with {resume.definition_id}</Button>}
    </div>
  </header>;
}
export default function BrawndoCisOverview({summary:s,filter,onFilter,resume}){
  const pick=key=>onFilter(filter===key?'all':key),steps=nextSteps(s);
  const also=[['stale',s.stale,'validations older than 12 months'],['unevidenced',s.unevidenced,'implemented without evidence'],['in_progress',s.partial,'partially implemented']].filter(([,n])=>n);
  return <>
    <section className="bcis-card bcis-summary" aria-labelledby="bcis-summary-heading">
      <h2 id="bcis-summary-heading" className="sr-only">Program condition</h2>
      <div className="bcis-figures">
        <div><p className="bcis-figure">{s.implemented}%</p><p className="bcis-figure-label">Implemented</p><p className="bcis-figure-sub">{s.addressed} of {s.applicable} safeguards</p></div>
        <div><p className="bcis-figure">{s.coverage}%</p><p className="bcis-figure-label">Assessed</p><p className="bcis-figure-sub">{s.assessed} of {s.applicable} safeguards</p></div>
        <div><p className="bcis-figure">{s.notAssessed}</p><p className="bcis-figure-label">Still to assess</p><p className="bcis-figure-sub">{resume?`Continue with safeguard ${resume.definition_id}`:'Every safeguard has been assessed'}</p></div>
      </div>
      <div className="bcis-bar" aria-hidden="true">{SEGMENTS.map(([k,,tone])=>s[k]>0&&<span key={k} className={`is-${tone}`} style={{width:`${s[k]/Math.max(1,s.applicable)*100}%`}}/>)}</div>
      <div className="bcis-legend" role="group" aria-label="Filter by assessment status">
        {SEGMENTS.map(([k,label,tone])=><button key={k} type="button" aria-pressed={filter===FILTER[k]} onClick={()=>pick(FILTER[k])} className={`is-${tone}`}><span aria-hidden="true"/>{label}<strong>{s[k]}</strong></button>)}
        {s.na>0&&<span className="bcis-legend-na">Not applicable <strong>{s.na}</strong></span>}
      </div>
      <p className="bcis-note">These figures show assessment progress, not a compliance percentage, certification or audit opinion.</p>
    </section>
    <section className="bcis-card bcis-steps" aria-labelledby="bcis-steps-heading">
      <h2 id="bcis-steps-heading">What to do next</h2>
      {steps.length?steps.map(st=><div key={st.key} className={`bcis-step is-${st.tone}`}>
        <span className="bcis-step-dot" aria-hidden="true"/>
        <div className="min-w-0 flex-1"><p className="bcis-step-title">{st.title}</p><p className="bcis-step-detail">{st.detail}</p></div>
        <button type="button" className="bcis-btn" aria-pressed={filter===st.key} onClick={()=>pick(st.key)}>{st.action}</button>
      </div>):<p className="bcis-step-detail bcis-step-none">Nothing urgent. Keep assessments current and evidence attached.</p>}
      {also.length>0&&<p className="bcis-also">Also: {also.map(([key,n,label],i)=><span key={key}>{i>0&&' · '}<button type="button" aria-pressed={filter===key} onClick={()=>pick(key)}>{n} {label}</button></span>)}</p>}
    </section>
  </>;
}
