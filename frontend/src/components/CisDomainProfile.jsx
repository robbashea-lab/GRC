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

const pointAt=(index,total,radius)=>{const angle=index/total*Math.PI*2-Math.PI/2;return [180+Math.cos(angle)*radius,270+Math.sin(angle)*radius];};

function labelLines(name){
  const lines=[];
  for(const word of name.split(' ')){
    if(!lines.length||`${lines[lines.length-1]} ${word}`.length>16)lines.push(word);
    else lines[lines.length-1]+=` ${word}`;
  }
  return lines;
}

// Separate the side labels vertically so all native IG3 domains remain readable.
function radarLabels(domains){
  const labels=domains.map((domain,index)=>({domain,index,point:pointAt(index,domains.length,96)}));
  for(const side of [-1,1]){
    const members=labels.filter(label=>label.index!==0&&!(domains.length%2===0&&label.index===domains.length/2)&&Math.sign(label.point[0]-180)===side).sort((a,b)=>a.point[1]-b.point[1]);
    // Include the name lines, rate baseline and font ascent/descent in each block.
    const heights=members.map(label=>(labelLines(label.domain.name).length-1)*14+16+18);
    const gap=members.length>1?Math.max(8,(403-heights.reduce((sum,height)=>sum+height,0))/(members.length-1)):0;
    let top=72;
    members.forEach((label,index)=>{
      Object.assign(label,{x:side<0?0:250,y:top+14,anchor:'start',edge:side<0?110:250});
      top+=heights[index]+gap;
    });
  }
  labels[0]&&Object.assign(labels[0],{x:180,y:15,anchor:'middle'});
  if(domains.length%2===0)Object.assign(labels[domains.length/2],{x:180,y:490,anchor:'middle'});
  return labels;
}

function conceptFocus({applicable,counts}){
  const partial=counts.in_progress, gap=counts.needs_attention, unknown=counts.not_assessed;
  const phrase=(count,singular,plural)=>`${count} ${count===1?singular:plural}`;
  if(!applicable)return {tone:'neutral',title:'No applicable safeguards',detail:'There is no applicable scope to assess in this domain.'};
  if(gap){
    const work=[];
    if(partial)work.push(`${phrase(partial,'safeguard is','safeguards are')} partially implemented`);
    if(unknown)work.push(`${phrase(unknown,'safeguard needs','safeguards need')} assessment`);
    return {tone:'danger',title:`Address ${phrase(gap,'not-implemented safeguard','not-implemented safeguards')}`,
      detail:`These are known implementation gaps.${work.length?` ${work.join('; ')}.`:''}`};
  }
  if(unknown)return {tone:'warning',title:`Assess ${phrase(unknown,'untouched safeguard','untouched safeguards')}`,
    detail:`Implementation is not yet known for ${unknown===1?'this safeguard':'these safeguards'}; this is not an assessed failure.${partial?` ${phrase(partial,'other safeguard is','other safeguards are')} partially implemented.`:''}`};
  if(partial)return {tone:'warning',title:`Complete ${phrase(partial,'partial implementation','partial implementations')}`,
    detail:'The remaining safeguards are assessed, but implementation is not complete.'};
  return {tone:'success',title:'All applicable safeguards implemented',detail:'This describes implementation status, not a certification or assurance conclusion.'};
}

function ConceptDomainDetail({domain}){
  const focus=conceptFocus(domain);
  return <><h3>{domain.name}</h3><div className="cdp-tip-rate"><strong>{formatDomainRate(domain.rate)}</strong><span>{domain.implemented} implemented / {domain.applicable} applicable</span></div>
    <CisStatusBar counts={domain.counts}/><dl>{Object.entries(LABELS).map(([key,label])=><div key={key}><dt><i className={`cis-dot cis-tone-${implementationTone(key)}`} aria-hidden="true"/>{label}</dt><dd>{domain.counts[key]}</dd></div>)}</dl>
    <div className={`cdp-focus is-${focus.tone}`}><b>{focus.title}</b><p>{focus.detail}</p></div></>;
}

function ConceptDomainTrigger({domain,kind='table',children,active,setActive,theme}){
  const id=`${kind}:${domain.id}`,open=active?.target===id, timer=useRef(null),dismissed=useRef(false);
  const svg=kind!=='table';
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const close=()=>setActive(previous=>previous?.target===id?null:previous);
  const enter=()=>{
    clearTimeout(timer.current);
    if(!dismissed.current)setActive(previous=>previous?.pinned&&previous.target!==id?previous:
      {target:id,domainId:domain.id,pinned:previous?.target===id&&previous.pinned});
  };
  const leave=()=>{
    clearTimeout(timer.current);
    timer.current=setTimeout(()=>{
      setActive(previous=>previous?.target===id&&!previous.pinned?null:previous);
      dismissed.current=false;
    },160);
  };
  const toggle=event=>{
    event.preventDefault();clearTimeout(timer.current);dismissed.current=false;
    setActive(previous=>previous?.target===id&&previous.pinned?null:{target:id,domainId:domain.id,pinned:true});
  };
  const props={
    className:kind==='axis'?'cdp-axis-label cdp-concept-axis-label':kind==='point'?'cdp-concept-point':'cdp-domain-name',
    'aria-label':`${domain.name}: ${formatDomainRate(domain.rate)}, ${domain.implemented} of ${domain.applicable} implemented. Show domain details.`,
    onPointerEnter:enter,onPointerLeave:leave,onFocus:enter,onBlur:leave,onClick:toggle,
  };
  if(active?.domainId===domain.id)props.className+=' is-selected';
  const trigger=svg?<g {...props} role="button" tabIndex={0} onKeyDown={event=>{
    if(event.key==='Enter'||event.key===' ')toggle(event);
  }}>{children}</g>:<button {...props} type="button">{children}</button>;
  return <Popover open={open} onOpenChange={value=>{if(!value){dismissed.current=true;close();}}}>
    <PopoverTrigger asChild>{trigger}</PopoverTrigger>
    <PopoverContent className="cdp-domain-tip cdp-concept-tip cis-dashboard-concept-portal" data-theme={theme}
      aria-label={`${domain.name} implementation details`} side="right" align="start" sideOffset={12} collisionPadding={10}
      onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()}
      onPointerEnter={enter} onPointerLeave={leave} onEscapeKeyDown={()=>{dismissed.current=true;close();}}>
      <ConceptDomainDetail domain={domain}/>
    </PopoverContent>
  </Popover>;
}

const conceptPoint=(index,total,radius)=>{
  const angle=index/total*Math.PI*2-Math.PI/2;
  return [215+Math.cos(angle)*radius,157+Math.sin(angle)*radius];
};

// Keep the reference's compact ring; only names move when the native axes collide.
function conceptLabels(domains){
  const labels=domains.map((domain,index)=>{
    const point=conceptPoint(index,domains.length,133),cosine=(point[0]-215)/133;
    const side=Math.abs(cosine)<.12?0:Math.sign(cosine),anchor=side<0?'end':side>0?'start':'middle';
    const x=point[0]+side*4,available=side<0?x-8:side>0?422-x:180;
    const limit=Math.max(11,Math.floor(available/5.6)),lines=[];
    for(const word of domain.name.split(' ')){
      if(!lines.length||`${lines[lines.length-1]} ${word}`.length>limit)lines.push(word);
      else lines[lines.length-1]+=` ${word}`;
    }
    const height=lines.length*12+19,width=Math.max(...lines.map(line=>line.length*5.6),formatDomainRate(domain.rate).length*7);
    const top=Math.max(8,Math.min(324-height,point[1]-height/2));
    return {domain,index,x,top,width,height,anchor,side,lines};
  });
  const left=label=>label.x-(label.anchor==='end'?label.width:label.anchor==='middle'?label.width/2:0);
  const intersects=(a,b)=>left(a)<left(b)+b.width+3&&left(b)<left(a)+a.width+3;
  for(const label of labels.filter(value=>value.side)){
    for(const fixed of labels.filter(value=>!value.side)){
      if(intersects(label,fixed)&&label.top<fixed.top+fixed.height+3&&fixed.top<label.top+label.height+3){
        label.x=label.side<0?left(fixed)-3:left(fixed)+fixed.width+3;
      }
    }
  }
  for(const side of [-1,1]){
    const members=labels.filter(label=>label.side===side).sort((a,b)=>a.top-b.top);
    const top=labels.find(label=>label.side===0&&label.index===0);
    const bottom=labels.find(label=>label.side===0&&label.index!==0);
    const previous=top?[top]:[];
    for(const label of members){
      for(const other of previous)if(intersects(label,other))label.top=Math.max(label.top,other.top+other.height+3);
      previous.push(label);
    }
    const following=bottom?[bottom]:[];
    for(const label of members.slice().reverse()){
      label.top=Math.min(label.top,324-label.height);
      for(const other of following)if(intersects(label,other))label.top=Math.min(label.top,other.top-label.height-3);
      following.push(label);
    }
  }
  return labels;
}

function ConceptDomainProfile({model,heading,theme}){
  const [active,setActive]=useState(null);
  useEffect(()=>{if(!model.available)setActive(null);},[model.available]);
  const domains=model.domains, trigger={active,setActive,theme};
  return <section className="cdp-card cdp-concept" data-theme={theme} aria-labelledby={heading}>
    <header><h2 id={heading}>Domain implementation profile</h2><p>Implemented share of applicable safeguards by domain</p></header>
    {!model.available?<p role="status" className="cdp-empty">{model.reason}</p>:!domains.length?<p className="cdp-empty">No mapped applicable domains are available.</p>:<>
      <div className="cdp-profile"><div className="cdp-radar-wrap"><svg className="cdp-radar" viewBox="0 0 430 332" role="group" aria-label="Domain implementation radar. Exact domain names, counts and rates are available in the adjacent table.">
        {[.25,.5,.75,1].map(scale=><polygon className="cdp-grid" key={scale} points={domains.map((_,index)=>conceptPoint(index,domains.length,95*scale).join(',')).join(' ')}/>)}
        {domains.map((domain,index)=>{const point=conceptPoint(index,domains.length,95);return <line key={domain.id} className="cdp-grid" x1="215" y1="157" x2={point[0]} y2={point[1]}/>;})}
        {[25,50,75,100].map(rate=><text key={rate} className="cdp-scale" x="211" y={154-95*rate/100} textAnchor="end">{rate}%</text>)}
        {domains.every(domain=>domain.rate!==null)&&<polygon className="cdp-value" points={domains.map((domain,index)=>conceptPoint(index,domains.length,95*domain.rate/100).join(',')).join(' ')}/>}
        {conceptLabels(domains).map(({domain,x,top,anchor,lines})=><ConceptDomainTrigger key={`axis:${domain.id}`} domain={domain} kind="axis" {...trigger}>
          <text x={x} y={top+11} textAnchor={anchor}>{lines.map((line,index)=><tspan key={index} x={x} dy={index?12:0}>{line}</tspan>)}<tspan className="cdp-axis-rate" x={x} dy="16">{formatDomainRate(domain.rate)}</tspan></text>
        </ConceptDomainTrigger>)}
        {domains.map((domain,index)=>{if(domain.rate===null)return null;const point=conceptPoint(index,domains.length,95*domain.rate/100);return <ConceptDomainTrigger key={`point:${domain.id}`} domain={domain} kind="point" {...trigger}>
          <circle className="cdp-concept-hit" cx={point[0]} cy={point[1]} r="12"/><circle className="cdp-concept-dot" cx={point[0]} cy={point[1]} r="4.5"/>
        </ConceptDomainTrigger>;})}
      </svg></div><div className="cdp-table-wrap"><table><caption className="sr-only">Native CIS domain implementation counts and rates</caption><thead><tr><th scope="col">Domain</th><th scope="col">Implemented</th><th scope="col">Applicable</th><th scope="col">Rate</th></tr></thead>
        <tbody>{domains.map(domain=><tr key={domain.id} className={active?.domainId===domain.id?'is-selected':undefined}><th scope="row"><ConceptDomainTrigger domain={domain} {...trigger}>{domain.name}</ConceptDomainTrigger></th><td>{domain.implemented}</td><td>{domain.applicable}</td><td>{formatDomainRate(domain.rate)}</td></tr>)}</tbody>
      </table><p className="cdp-concept-legend"><i aria-hidden="true"/>Implemented share of applicable safeguards</p><p className="cdp-concept-hint">Hover, focus or tap a point or domain name for details.</p></div></div>
      <p className="sr-only">Implemented ÷ applicable. Partial implementation receives no added credit; not assessed means unknown. Domain mappings may overlap.</p>
    </>}
  </section>;
}

export default function CisDomainProfile({source,clientId,implementationGroup,concept=false,theme='light'}){
  const heading=useId(),[activeTrigger,onActiveTrigger]=useState(null),model=buildCisDomainProfile(source,{clientId,implementationGroup});
  if(concept)return <ConceptDomainProfile key={`${clientId}:${implementationGroup}`} model={model} heading={heading} theme={theme}/>;
  return <section className="cdp-card" aria-labelledby={heading}><header><h2 id={heading}>Domain implementation profile</h2><p>Implemented safeguards as a share of each native domain’s applicable scope.</p></header>
    {!model.available?<p role="status" className="cdp-empty">{model.reason}</p>:!model.domains.length?<p className="cdp-empty">No mapped applicable domains are available.</p>:<>
      <div className="cdp-profile"><div className="cdp-radar-wrap"><div className="cdp-radar-canvas"><svg className="cdp-radar" viewBox="0 0 360 550" role="img" aria-label="Domain implementation radar. Exact domain names, counts and rates are available in the adjacent table.">
        {[.25,.5,.75,1].map(scale=><polygon className="cdp-grid" key={scale} points={model.domains.map((_,i)=>pointAt(i,model.domains.length,96*scale).join(',')).join(' ')}/>)}
        {radarLabels(model.domains).map(({domain,point,x,y,anchor,edge})=>{const lines=labelLines(domain.name);return <g key={domain.id}>
          <line className="cdp-grid" x1="180" y1="270" x2={point[0]} y2={point[1]}/>
          {edge!==undefined&&<path className="cdp-label-leader" d={`M${point.join(',')} L${edge},${y+14}`}/>}
          <text className="cdp-axis-label" x={x} y={y} textAnchor={anchor} aria-label={`${domain.name}: ${formatDomainRate(domain.rate)}`}>
            {lines.map((line,index)=><tspan key={index} x={x} dy={index?14:0}>{line}</tspan>)}
            <tspan className="cdp-axis-rate" x={x} dy="16">{formatDomainRate(domain.rate)}</tspan>
          </text></g>;})}
        {model.domains.every(domain=>domain.rate!==null)&&<polygon className="cdp-value" points={model.domains.map((domain,i)=>pointAt(i,model.domains.length,96*domain.rate/100).join(',')).join(' ')}/>}
        <text className="cdp-scale" x="185" y="170">100%</text><text className="cdp-scale" x="185" y="220">50%</text>
      </svg>{model.domains.filter(domain=>domain.rate!==null).map(domain=>{const i=model.domains.indexOf(domain),point=pointAt(i,model.domains.length,96*domain.rate/100);return <DomainTrigger key={domain.id} domain={domain} point activeTrigger={activeTrigger} onActiveTrigger={onActiveTrigger} style={{left:`${point[0]/360*100}%`,top:`${point[1]/550*100}%`}}><span className="sr-only">{domain.name}</span></DomainTrigger>;})}
        </div><p className="cdp-radar-note">Focus or tap a point or domain name for details.</p></div>
        <div className="cdp-table-wrap"><table><caption className="sr-only">Native CIS domain implementation counts and rates</caption><thead><tr><th scope="col">Domain</th><th scope="col">Implemented</th><th scope="col">Applicable</th><th scope="col">Rate</th></tr></thead>
          <tbody>{model.domains.map(domain=><tr key={domain.id}><th scope="row"><DomainTrigger domain={domain} activeTrigger={activeTrigger} onActiveTrigger={onActiveTrigger}>{domain.name}</DomainTrigger></th><td>{domain.implemented}</td><td>{domain.applicable}</td><td>{formatDomainRate(domain.rate)}</td></tr>)}</tbody></table></div>
      </div><p className="cdp-note">Implemented ÷ applicable. Partial implementation receives no added credit; not assessed means unknown. Domain mappings may overlap.</p>
    </>}
  </section>;
}
