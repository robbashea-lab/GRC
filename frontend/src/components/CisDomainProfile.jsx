import {useEffect,useId,useRef,useState} from 'react';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import {CisStatusBar,implementationTone} from './CisStatus';
import {buildCisDomainProfile,formatCisDomainRate as formatDomainRate} from '@/lib/cisDomainProfile';
import './CisDomainProfile.css';

const LABELS={addressed:'Implemented',in_progress:'Partially implemented',needs_attention:'Not implemented',not_assessed:'Not assessed'};

function DomainDetail({domain}){
  return <><h3>{domain.name}</h3><div className="cdp-tip-rate"><strong>{formatDomainRate(domain.rate)}</strong><span>{domain.implemented} of {domain.applicable} implemented</span></div>
    <CisStatusBar counts={domain.counts}/><dl>{Object.entries(LABELS).map(([key,label])=><div key={key}><dt><i className={`cis-dot cis-tone-${implementationTone(key)}`} aria-hidden="true"/>{label}</dt><dd>{domain.counts[key]}</dd></div>)}</dl>
    <div className="cdp-focus"><b>Focus</b><p>{domain.focus}</p></div></>;
}

// The same native popover handles pointer, keyboard and tap; the table remains usable at coincident zero points.
function DomainTrigger({domain,point=false,style,children,activeTrigger,onActiveTrigger}){
  const triggerId=`${point?'point':'table'}:${domain.id}`,open=activeTrigger===triggerId;
  const timer=useRef(null),dismissed=useRef(false),pinned=useRef(false);
  const setOpen=value=>onActiveTrigger(previous=>value?triggerId:previous===triggerId?null:previous);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{if(!open)pinned.current=false;},[open]);
  const enter=()=>{clearTimeout(timer.current);if(!dismissed.current)setOpen(true);};
  const leave=()=>{if(!pinned.current)timer.current=setTimeout(()=>{setOpen(false);dismissed.current=false;},160);};
  return <Popover open={open} onOpenChange={value=>{setOpen(value);if(!value){dismissed.current=true;pinned.current=false;}}}>
    <PopoverTrigger asChild><button type="button" style={style} className={point?'cdp-radar-point':'cdp-domain-name'}
      aria-label={`${domain.name}: ${formatDomainRate(domain.rate)}, ${domain.implemented} of ${domain.applicable} implemented. Show domain details.`}
      onPointerEnter={enter} onPointerLeave={leave} onFocus={enter} onBlur={leave} onClick={event=>{event.preventDefault();dismissed.current=false;pinned.current=true;clearTimeout(timer.current);setOpen(true);}}>{children}</button></PopoverTrigger>
    <PopoverContent className="cdp-domain-tip" aria-label={`${domain.name} implementation details`} sideOffset={8} collisionPadding={12} onOpenAutoFocus={event=>event.preventDefault()}
      onCloseAutoFocus={event=>event.preventDefault()}
      onPointerEnter={enter} onPointerLeave={leave} onEscapeKeyDown={()=>{dismissed.current=true;setOpen(false);}}><DomainDetail domain={domain}/></PopoverContent>
  </Popover>;
}

const pointAt=(index,total,radius)=>{const angle=index/total*Math.PI*2-Math.PI/2;return [230+Math.cos(angle)*radius,208+Math.sin(angle)*radius];};

export default function CisDomainProfile({source,clientId,implementationGroup}){
  const heading=useId(),[activeTrigger,onActiveTrigger]=useState(null),model=buildCisDomainProfile(source,{clientId,implementationGroup});
  return <section className="cdp-card" aria-labelledby={heading}><header><h2 id={heading}>Domain implementation profile</h2><p>Implemented safeguards as a share of each native domain’s applicable scope.</p></header>
    {!model.available?<p role="status" className="cdp-empty">{model.reason}</p>:!model.domains.length?<p className="cdp-empty">No mapped applicable domains are available.</p>:<>
      <div className="cdp-profile"><div className="cdp-radar-wrap"><div className="cdp-radar-canvas"><svg className="cdp-radar" viewBox="0 0 460 416" role="img" aria-label="Domain implementation radar. Exact domain names, counts and rates are available in the adjacent table.">
        {[.25,.5,.75,1].map(scale=><polygon className="cdp-grid" key={scale} points={model.domains.map((_,i)=>pointAt(i,model.domains.length,140*scale).join(',')).join(' ')}/>)}
        {model.domains.map((domain,i)=>{const outer=pointAt(i,model.domains.length,140),label=pointAt(i,model.domains.length,168);return <g key={domain.id}><line className="cdp-grid" x1="230" y1="208" x2={outer[0]} y2={outer[1]}/><text x={label[0]} y={label[1]} textAnchor="middle" dominantBaseline="middle">{i+1}<title>{domain.name}</title></text></g>;})}
        {model.domains.every(domain=>domain.rate!==null)&&<polygon className="cdp-value" points={model.domains.map((domain,i)=>pointAt(i,model.domains.length,140*domain.rate/100).join(',')).join(' ')}/>}
        <text className="cdp-scale" x="235" y="62">100%</text><text className="cdp-scale" x="235" y="137">50%</text>
      </svg>{model.domains.filter(domain=>domain.rate!==null).map(domain=>{const i=model.domains.indexOf(domain),point=pointAt(i,model.domains.length,140*domain.rate/100);return <DomainTrigger key={domain.id} domain={domain} point activeTrigger={activeTrigger} onActiveTrigger={onActiveTrigger} style={{left:`${point[0]/460*100}%`,top:`${point[1]/416*100}%`}}><span className="sr-only">{domain.name}</span></DomainTrigger>;})}
        </div><p className="cdp-radar-note">Point numbers match the native domains in the table. Focus or tap a point or domain name for details.</p></div>
        <div className="cdp-table-wrap"><table><caption className="sr-only">Native CIS domain implementation counts and rates</caption><thead><tr><th scope="col">Domain</th><th scope="col">Implemented</th><th scope="col">Applicable</th><th scope="col">Rate</th></tr></thead>
          <tbody>{model.domains.map((domain,i)=><tr key={domain.id}><th scope="row"><span className="cdp-domain-number">{i+1}</span><DomainTrigger domain={domain} activeTrigger={activeTrigger} onActiveTrigger={onActiveTrigger}>{domain.name}</DomainTrigger></th><td>{domain.implemented}</td><td>{domain.applicable}</td><td>{formatDomainRate(domain.rate)}</td></tr>)}</tbody></table></div>
      </div><p className="cdp-note">Implemented ÷ applicable. Partial implementation receives no added credit; not assessed means unknown. Domain mappings may overlap.</p>
    </>}
  </section>;
}
