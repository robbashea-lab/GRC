import {useId,useState} from 'react';
import {CIS_ORDER} from './CisStatus';
const keyNoun=name=>name.startsWith('CIS')?'safeguards':name==='SOC 2'?'criteria':'requirements and controls';

export default function Donut({counts,summary,name,labels,caption=false,itemNoun=keyNoun(name)}) {
  const [active,setActive]=useState(null),tipId=useId();
  const segments=CIS_ORDER.filter(s=>s!=='not_applicable');
  const total=summary.applicable||1;
  let offset=25;
  return <span className="bd-donut-wrap" onMouseLeave={()=>setActive(null)}><svg className="bd-donut" viewBox="0 0 42 42" role="group" aria-label={`${name}: ${segments.map(s=>`${counts[s]} ${labels[s]} (${(counts[s]/total*100).toFixed(1)}%, ${counts[s]} of ${summary.applicable})`).join(', ')}`}>
    <circle cx="21" cy="21" r="15.9" className="bd-donut-track"/>
    {segments.map(s=>{const len=counts[s]/total*100,gap=caption?Math.min(.9,len/2):0,description=`${labels[s]} · ${len.toFixed(1)}% · ${counts[s]} of ${summary.applicable} ${itemNoun}`,el=len?<circle key={s} cx="21" cy="21" r="15.9" tabIndex={0} role="img" aria-label={description} aria-describedby={active===s?tipId:undefined} onMouseEnter={()=>setActive(s)} onFocus={()=>setActive(s)} onBlur={()=>setActive(null)} onKeyDown={e=>{if(e.key==='Escape')setActive(null);}} className={`bd-seg-${s}`} pathLength={caption?100:undefined} strokeDasharray={`${len-gap} ${100-len+gap}`} strokeDashoffset={offset}/>:null;offset-=len;return el;})}
    <text x="21" y={caption?'21.5':'23.7'} className="bd-donut-value">{summary.applicable?`${caption?(counts.addressed/summary.applicable*100).toFixed(1):summary.implemented}%`:'—'}</text>
    {caption&&<text x="21" y="27" className="bwp-donut-caption">{typeof caption==='string'?caption.toUpperCase():'IMPLEMENTED'}</text>}
  </svg>{active&&<span id={tipId} role="tooltip" className="bd-donut-tooltip"><strong>{labels[active]}</strong><span>{(counts[active]/total*100).toFixed(1)}% · {counts[active]} of {summary.applicable} {itemNoun}</span></span>}</span>;
}
