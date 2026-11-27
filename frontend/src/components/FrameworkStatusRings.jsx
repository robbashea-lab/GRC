import {useId,useState} from 'react';
import {Check,ChevronDown,CircleDashed,Minus,X} from 'lucide-react';
import './FrameworkStatusRings.css';

const states=[
  {key:'addressed',count:'addressed',tone:'I',Icon:Check},
  {key:'in_progress',count:'partial',tone:'P',Icon:CircleDashed},
  {key:'needs_attention',count:'gap',tone:'N',Icon:X},
  {key:'not_assessed',count:'notAssessed',tone:'A',Icon:Minus},
];
const share=(count,total)=>total?`${Number((100*count/total).toFixed(1))}%`:'—';
const itemId=row=>row.display_definition_id||row.definition_id;

export default function FrameworkStatusRings({id:headingId,summary,rows=[],onOpen,filter,onFilter,statusLabels,noun,mapName,subtitle,asOf,footer}) {
  const uniqueId=useId(),id=headingId||uniqueId;
  const [expanded,setExpanded]=useState(true),[showMap,setShowMap]=useState(false);
  const available=summary.available!==false&&Number.isInteger(summary.applicable);
  const total=summary.applicable;
  const items=rows.filter(row=>row.framework_assessment_id&&
    (row.specification==='annex_control'?row.soa_applicability==='included':row.status!=='not_applicable'));
  const longest=items.reduce((length,row)=>Math.max(length,itemId(row)?.length||0),0);
  const scroll=items.length>56||(longest>6&&items.length>24);
  const cis=mapName==='safeguard';
  return <section className={'panel pcard sgmap-panel gn-cis-snapshot'+(cis?'':' gn-framework-snapshot')} aria-labelledby={id}>
    <h2 className="gn-cis-heading-wrap">
      <button type="button" className="gn-cis-heading" aria-expanded={expanded} aria-controls={id+'-body'} onClick={()=>setExpanded(!expanded)}>
        <span className="gn-cis-head-text"><span id={id} className="panel-title">Program snapshot</span><span className="panel-desc">{subtitle}</span></span>
        <span className="gn-cis-head-meta"><span className="sgmap-scope">{available?`${total} applicable ${noun}`:'Scope unavailable'}</span>{asOf&&<span className="sgmap-asof">{asOf}</span>}</span>
        <span className="gn-cis-head-chevron"><ChevronDown size={16} aria-hidden="true"/></span>
      </button>
    </h2>
    <div id={id+'-body'} hidden={!expanded}>
      <div className="sgmap gn-cis-top">
        <div className="gn-ring-cards" role="group" aria-label={available?'Filter by status':'Status mix unavailable'}>
          {states.map(({key,count,tone})=>{
            const amount=summary[count],label=statusLabels[key],ratio=available&&total?100*amount/total:0;
            return <button key={key} type="button" className="gn-ring-card" data-status={tone} disabled={!available}
              aria-label={available?`${label}: ${amount} of ${total} ${noun}, ${share(amount,total)}`:label+': unavailable'}
              title={available?`${label}: ${amount} of ${total} ${noun}`:label+': unavailable'}
              aria-pressed={filter===key} onClick={()=>onFilter(filter===key?'all':key)}>
              <span className="gn-ring-label">{label}</span>
              <span className="gn-ring-content"><span className="gn-ring-figure">
                <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle className="gn-ring-track" cx="50" cy="50" r="43"/>
                  {ratio>0&&<circle className="gn-ring-arc" cx="50" cy="50" r="43" pathLength="100" strokeDasharray={ratio+' '+(100-ratio)} transform="rotate(-90 50 50)"/>}
                </svg><span className="gn-ring-value">{available?share(amount,total):'—'}</span>
              </span><span className="gn-ring-copy"><strong>{available?`${amount} of ${total}`:'Unavailable'}</strong>{' '}<small>{noun}</small></span></span>
            </button>;
          })}
        </div>
        <button className="gn-map-toggle" type="button" aria-expanded={showMap} aria-controls={id+'-map'} disabled={!available||!onOpen} onClick={()=>setShowMap(!showMap)}>
          <span className="gn-map-metrics"><small>Assessment coverage</small><strong>{available?`${summary.assessed} of ${total} assessed`:'Unavailable'}</strong><b>{available?share(summary.assessed,total):'—'}</b></span>
          <span className="gn-map-action"><span>{showMap?'Hide':'Show'} {mapName} map</span><ChevronDown aria-hidden="true"/></span>
        </button>
        <div id={id+'-map'} hidden={!showMap}>{showMap&&available&&(items.length?
          <div className={'sgmap-grid'+(longest>4?' sgmap-flexible':'')+(scroll?' sgmap-scroll':'')} role="group" aria-label={'Applicable '+noun} tabIndex={scroll?0:undefined}
            style={longest>4?{'--sgmap-ref-width':Math.min(30,longest+5)+'ch'}:undefined}>
            {items.map(row=>{
              const state=states.find(s=>s.key===row.status),Icon=state?.Icon||Minus;
              const label=[itemId(row),row.title,statusLabels[row.status]||row.status].filter(Boolean).join(' · ');
              return <button type="button" className="sgmap-cell" key={row.framework_assessment_id} data-state={state?.tone} aria-label={label} title={label} onClick={()=>onOpen(row)}>
                <Icon aria-hidden="true" size={16}/><span className="sgmap-id">{itemId(row)}</span>
              </button>;
            })}
          </div>:<p>No applicable {noun}.</p>)}</div>
      </div>
      <div className="note">{footer}{!available&&<p role="status">{summary.reason||'Implementation counts are unavailable.'}</p>}</div>
    </div>
  </section>;
}
