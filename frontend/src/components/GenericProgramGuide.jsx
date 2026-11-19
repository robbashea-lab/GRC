import {useRef,useState} from 'react';
import {operatorVocabulary,operatorStatuses} from '@/lib/frameworkOperator';
import OmniDock from './OmniDock';
import OmniWindow from './OmniWindow';
import OmniGuideCharacter from './OmniGuideCharacter';

export default function GenericProgramGuide({clientId,framework,rows,onOpen}){
  const [open,setOpen]=useState(false),[intro,setIntro]=useState(true),launcher=useRef(null),vocabulary=operatorVocabulary(framework);
  const recommendations=[...rows.filter(row=>row.status==='not_assessed'),...rows.filter(row=>['in_progress','needs_attention'].includes(row.status))].slice(0,5);
  return <div className="shared-program-omni r4-program-guide">
    <OmniDock preferenceKey={'r4-guide:'+clientId+':'+framework} freePosition visualReference focused name="Omnibot"><button ref={launcher} type="button" className="omni-launch-button" aria-label="Open Omnibot Guide" aria-expanded={open} onClick={()=>{setOpen(true);setIntro(false);}}><OmniGuideCharacter/></button>
      {!open&&intro&&<div className="guided-context-prompt"><button type="button" className="r4-guide-dismiss" aria-label="Dismiss Omnibot introduction" onClick={()=>setIntro(false)}>×</button><b>Hi, I’m Omnibot.</b><p>I can help you choose your next {vocabulary.item} and work through its assessment. Ready to get started?</p><button type="button" onClick={()=>{setOpen(true);setIntro(false);}}>Show next steps</button><button type="button" onClick={()=>setIntro(false)}>Not now</button></div>}
    </OmniDock>
    {open&&<OmniWindow id={'r4-program-guide-'+framework} name="Omnibot" refined program visualReference anchor={()=>launcher.current?.getBoundingClientRect()} onMinimize={()=>setOpen(false)} onClose={()=>setOpen(false)} onCloseAutoFocus={()=>launcher.current?.focus()}>
      <header className="omni-panel-header" tabIndex={0}><OmniGuideCharacter/><div><h2 id={'r4-program-guide-'+framework+'-title'}>Omnibot</h2><p id={'r4-program-guide-'+framework+'-description'}>Review reported practices and prepare an implementation draft.</p></div></header>
      <div className="guided-panel-body"><p>Based on the saved {vocabulary.items} in this program:</p>{recommendations.length?recommendations.map(row=><section className="r4-guide-recommendation" key={row.framework_assessment_id}><small>{row.display_definition_id||row.definition_id}</small><b>{row.title}</b><span>{operatorStatuses(framework)[row.status]}</span><p>{row.status==='not_assessed'?'This item has not been assessed yet.':'Review the saved gaps and items requiring confirmation.'}</p><button type="button" onClick={()=>{setOpen(false);onOpen(row);}}>Open {vocabulary.item} {row.display_definition_id||row.definition_id}</button></section>):<p>Everything in the current scope is assessed and no implementation gap is recorded. Review items as their next assessment comes due.</p>}</div>
    </OmniWindow>}
  </div>;
}
