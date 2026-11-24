import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {calendarDay} from '@/lib/managementDates';
import {currentQuarter, quarterToday, shiftQuarter} from '@/lib/quarterlyProgramTimeline';
import quarterLedgerSVG from './quarterLedgerSVG';
import './V3QuarterLedger.css';

const titles = {
  reviews:['Review dates','Every scheduled review by cadence'],
  actions:['Action deadlines','Every open action by priority'],
  risks:['Risk events','Saved risk reviews, treatment deadlines and acceptance expiries'],
  vendors:['Vendor dates','Saved vendor reviews, assurance follow-ups and contract dates'],
};
const lanes = {
  reviews:[['monthly','Monthly','blue'],['quarterly','Quarterly','indigo'],['semiannual','Semi-annual','plum'],['annual','Annual','teal'],['one_time','One-time','slate']],
  actions:[['critical','Critical','red'],['high','High','amber'],['medium','Medium','blue'],['low','Low','teal']],
  risks:[['review','Risk review','blue'],['action','Treatment action','amber'],['expiry','Acceptance expiry','plum']],
  vendors:[['rev','Vendor review','blue'],['asr','Assurance follow-up','teal'],['ren','Contract renewal','plum'],['action','Vendor action','amber']],
};
const dayFormat = new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'});
const completed = new Set(['completed','done','closed']);
const dueLabel = (days,done) => done ? 'Completed' : days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `In ${days} day${days === 1 ? '' : 's'}`;

function ledgerItems(events, kind) {
  const items = [], seen = new Set();
  for (const event of events) {
    const day = calendarDay(event.date);
    if (!event.id || day == null || seen.has(event.id) || event.status === 'cancelled') continue;
    seen.add(event.id);
    const date = new Date(day * 86400000);
    const due = new Date(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
    let lane = event.kind;
    if (kind === 'reviews' && lane === 'other' && ['one_time','one-time','once','none'].includes(event.record?.recurrence)) lane = 'one_time';
    if (kind === 'vendors' && event.task) lane = 'action';
    if (!lanes[kind].some(([key])=>key===lane)) lane='other';
    items.push({event,day,due,lane,done:completed.has(event.task?.status || event.status),overdueEligible:event.outstanding !== false && event.overdueEligible !== false});
  }
  return items.sort((a,b) => a.day-b.day || String(a.event.title).localeCompare(String(b.event.title)));
}

export default function V3QuarterLedger({kind,events,available=true,onOpen,recordOpen=false,describeEvent,now=new Date()}) {
  const [manual,setManual] = useState(null), [hover,setHover] = useState(null), [pinned,setPinned] = useState(false);
  const [expanded,setExpanded] = useState({}), [error,setError] = useState('');
  const frame = useRef(null), tooltip = useRef(null), heading = useRef(null), opener = useRef(null);
  const pendingOpen = useRef(false), priorOpen = useRef(recordOpen), restoring = useRef(false);
  const [width,setWidth] = useState(960);
  const [title,description] = titles[kind], today = quarterToday(now);
  const selected = manual || currentQuarter(now), label = `Q${selected.quarter} ${selected.year}`;
  const items = useMemo(() => available ? ledgerItems(events,kind) : [],[events,available,kind]);
  const quarter = useMemo(() => [new Date(selected.year,(selected.quarter-1)*3,1),new Date(selected.year,selected.quarter*3,0)], [selected.year,selected.quarter]);
  const rows = useMemo(() => {
    const configured = lanes[kind].map(([id,name,color])=>[id,name,'var(--plot-'+color+')']);
    for(const {lane} of items) if(!configured.some(([id])=>id===lane)) configured.push([lane,'Other','var(--plot-slate)']);
    return configured;
  }, [kind,items]);
  const rowLabel = item => rows.find(row=>row[0]===item.lane)?.[1];
  const inQuarter = items.filter(i=>i.due>=quarter[0] && i.due<=quarter[1]);
  const behind = items.filter(i=>!i.done && i.overdueEligible && i.day<today);
  const next = inQuarter.filter(i=>!i.done && i.day>=today);
  const listed = new Set([...inQuarter,...behind]);
  const done = inQuarter.filter(i=>i.done).length, behindQ = behind.filter(i=>i.due>=quarter[0] && i.due<=quarter[1]).length;
  const earlier = behind.filter(i=>i.due < quarter[0]).length;
  const selectedItems = hover ? items.filter(i=>i.lane===hover.lane && (hover.stamp==='earlier' ? !i.done && i.overdueEligible && i.day<today && i.due<quarter[0] : i.due.getTime()===Number(hover.stamp))) : [];
  const svg = useMemo(()=>{
    const date = new Date(today * 86400000);
    const localDay = new Date(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
    return {__html:quarterLedgerSVG({title,lanes:rows},quarter,localDay,items,width)};
  },[title,rows,quarter,today,items,width]);

  useLayoutEffect(()=>{
    function measure(){if(frame.current) setWidth(Math.max(960,Math.floor(frame.current.clientWidth)));}
    measure();const observer=typeof ResizeObserver!=='undefined' ? new ResizeObserver(measure) : null;
    if(frame.current) observer?.observe(frame.current);
    window.addEventListener('resize',measure);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[available]);
  useEffect(()=>{
    if(recordOpen || !available){setHover(null);setPinned(false);}
    const closed=priorOpen.current && !recordOpen;
    priorOpen.current=recordOpen;
    if(closed && pendingOpen.current) {
      const id=requestAnimationFrame(()=>{if(pendingOpen.current)restore();});
      return ()=>cancelAnimationFrame(id);
    }
  },[recordOpen,available]);
  const dismiss = () => {setPinned(false);setHover(null);};
  function restore() {
    const target=opener.current?.isConnected ? opener.current : heading.current;
    if(!target?.isConnected) return false;
    pendingOpen.current=false;
    restoring.current=true;
    try {target.focus({preventScroll:true});} finally {restoring.current=false;}
    return document.activeElement===target;
  }
  function point(node,pin) {
    if (!node || restoring.current || recordOpen || !available || (!pin && pinned)) return;
    const [lane,stamp]=node.dataset.k.split('|');
    const bounds=node.getBoundingClientRect(), wrap=frame.current.parentElement.getBoundingClientRect();
    opener.current=node;
    setHover({lane,stamp,x:Math.max(4,Math.min(bounds.x-wrap.x-110,wrap.width-298)),y:Math.max(2,bounds.bottom-wrap.y+5)});
    setPinned(pin);
    if(pin) requestAnimationFrame(()=>tooltip.current?.querySelector('button')?.focus());
  }
  async function open(item,trigger) {
    if (!available || recordOpen || !items.some(i=>i.event.id===item.event.id)) return;
    if (!trigger?.closest('.v3-ledger-tip')) opener.current=trigger;
    pendingOpen.current=true;dismiss();setError('');
    try {const result=await onOpen(item.event,restore);if(result===false){pendingOpen.current=false;setError('This item could not be opened.');}}
    catch {pendingOpen.current=false;setError('This item could not be opened.');}
  }
  function move(selection){dismiss();setExpanded({});setManual(selection);}
  function agenda(list,group,sectionTitle,empty) {
    return <div><div className="tl2-h" data-mode={group==='behind'?'overdue':'upcoming'}>{sectionTitle} · {list.length}</div>{!list.length && <div className="sub">{empty}</div>}
      {(expanded[group]?list:list.slice(0,4)).map(item=><button type="button" key={item.event.id} className="tl-item" onClick={e=>open(item,e.currentTarget)}>
        <i className={'tl-dot '+(group==='behind'?'late':'')}/><span className="v3-item-copy"><b>{item.event.title || item.event.label}</b><small>{rowLabel(item)} · {dayFormat.format(item.due)} · {dueLabel(item.day-today,item.done)}</small></span>
      </button>)}{list.length>4&&<button type="button" className="link-btn" onClick={()=>setExpanded({...expanded,[group]:!expanded[group]})}>{expanded[group]?'Show fewer items':`View all ${list.length} items →`}</button>}</div>;
  }
  return <section className="panel quarter-ledger v3-quarter-ledger" aria-label={title} onKeyDown={e=>{if(e.key==='Escape'&&hover){e.stopPropagation();dismiss();restore();}}}>
    <header className="panel-head"><div><h2 className="panel-title" ref={heading} tabIndex={-1}>{title}</h2>
      <div className="panel-desc">{description} · {label}{available && <>: {inQuarter.length-done} open{behindQ>0 && ` (${behindQ} behind)`} · {done} completed{earlier>0 && ` · ${earlier} overdue from earlier quarters`}</>}</div>
    </div><div className="v3-quarter-switch"><button type="button" aria-label="Previous quarter" onClick={()=>move(shiftQuarter(selected,-1))}><ChevronLeft size={16}/></button>
      <b>{label}</b><button type="button" aria-label="Next quarter" onClick={()=>move(shiftQuarter(selected,1))}><ChevronRight size={16}/></button>
      {label!==`Q${currentQuarter(now).quarter} ${now.getFullYear()}`&&<button type="button" onClick={()=>move(null)}>This quarter</button>}</div></header>
    {!available ? <p role="status">Dates unavailable.</p> : <>
      <div className="tl2" onMouseLeave={()=>{if(!pinned)setHover(null);}} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))dismiss();}}>
        <div className="scroll-x" role="region" aria-label="Quarter Ledger chart" tabIndex={0} ref={frame}
          onMouseOver={e=>point(e.target.closest('[data-k]'),false)} onFocus={e=>point(e.target.closest('[data-k]'),false)}
          onClick={e=>point(e.target.closest('[data-k]'),true)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)&&e.target.closest('[data-k]')){e.preventDefault();point(e.target.closest('[data-k]'),true);}}}
          dangerouslySetInnerHTML={svg}/>
        {hover && selectedItems.length>0 && <div className="v3-ledger-tip" ref={tooltip} style={{left:hover.x,top:hover.y}} role={pinned?'group':'tooltip'}>
          <b>{hover.stamp==='earlier'?'Before this quarter':dayFormat.format(selectedItems[0].due)} · {rowLabel(selectedItems[0])}</b>
          {selectedItems.map(i=>{const owner=describeEvent?.(i.event);const name=i.event.title || i.event.label;const content=<>{name}{owner&&<small className="v3-ledger-owner"> · {owner}</small>}</>;return pinned?<button key={i.event.id} type="button" onClick={e=>open(i,e.currentTarget)}>{content}</button>:<div key={i.event.id}>{content}</div>;})}
        </div>}
      </div>
      <div className="tl2-legend ql-legend"><ul className="ql-keys" aria-label="Timeline legend">{['Scheduled','Overdue','Completed','Same-day count'].map((s,i)=><li key={s}><i aria-hidden="true" className={'v3-key key-'+i}>{['','','✓','2'][i]}</i>{s}</li>)}</ul><span>Hover or focus for details · select a point to open its items</span></div>
      <div className="tl2-lists">{agenda(behind,'behind','Behind schedule','Nothing is overdue.')}{agenda(next,'next','Next up · '+label,'Nothing else scheduled this quarter.')}</div>
      <details className="vd"><summary>View data</summary><div className="scroll-x"><table><thead><tr>{['Date','Lane','Item','State'].map(s=><th key={s} scope="col">{s}</th>)}</tr></thead>
        <tbody>{items.filter(i=>listed.has(i)).map(i=><tr key={i.event.id}><td>{dayFormat.format(i.due)}</td><td>{rowLabel(i)}</td><td><button type="button" onClick={e=>open(i,e.currentTarget)}>{i.event.title || i.event.label}</button></td><td>{i.done?'Completed':i.overdueEligible&&i.day<today?'Overdue':'Scheduled'}</td></tr>)}</tbody></table></div></details>
      {error&&<p role="alert">{error}</p>}
    </>}
  </section>;
}
