import {useEffect, useId, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, X} from 'lucide-react';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';
import {personLabel} from '@/lib/people';
import {reviewDisplayValue} from '@/lib/reviewPresentation';
import {CIS_REVIEW_CADENCES, cisReviewCadence, cisReviewEvents, cisReviewQuarter, cisReviewAgenda,
  cisReviewUrgency, formatCisReviewDate, currentQuarter, shiftQuarter, quarterToday} from '@/lib/cisReviewsConcept';

const dayString = day => new Date(day * 86400000).toISOString().slice(0, 10);
const countLabel = count => `${count} ${count === 1 ? 'review' : 'reviews'}`;

function DueBadge({date, now}) {
  const urgency = cisReviewUrgency(date, now);
  return <span className={`due-badge ${urgency.tone}`}>{urgency.text}</span>;
}

export default function CisReviewsConcept({rows = [], users = [], scopeKey, available = true,
  recordOpen = false, theme, onOpenReview}) {
  const [selection, setSelection] = useState(() => currentQuarter());
  const [mode, setMode] = useState('upcoming');
  const [cadence, setCadence] = useState(null);
  const [popup, setPopup] = useState(null);
  const [hover, setHover] = useState(null);
  const [tipPosition, setTipPosition] = useState(null);
  const [width, setWidth] = useState(700);
  const plotRef = useRef(null), tipRef = useRef(null), openerRef = useRef(null);
  const scopeRef = useRef(scopeKey), returningFromRecord = useRef(false);
  const titleId = useId(), tooltipId = useId();
  const now = new Date(), today = quarterToday(now);
  const events = useMemo(() => cisReviewEvents(rows), [rows]);
  const quarter = useMemo(() => cisReviewQuarter(events, selection), [events, selection]);
  const filtered = quarter.events.filter(event => !cadence || event.kind === cadence);
  const groups = quarter.groups.map(group => ({...group, events: group.events.filter(event => !cadence || event.kind === cadence)}))
    .filter(group => group.events.length);
  const agenda = cisReviewAgenda(quarter.events, now), agendaRows = agenda[mode];
  const activePopup = available && !recordOpen && popup && popup.scope === scopeKey ? popup : null;
  const activeHover = available && !recordOpen && hover && hover.scope === scopeKey
    ? filtered.find(event => event.id === hover.eventId) : null;
  const popupRows = activePopup ? activePopup.type === 'date'
    ? groups.find(group => group.date === activePopup.date)?.events || []
    : activePopup.type === 'agenda' ? agendaRows : filtered : [];

  useEffect(() => {
    if (scopeRef.current !== scopeKey) {
      scopeRef.current = scopeKey;
      openerRef.current = null;
      returningFromRecord.current = false;
      setSelection(currentQuarter()); setMode('upcoming'); setCadence(null);
    }
    setPopup(null); setHover(null);
    if (!available) openerRef.current = null;
  }, [scopeKey, available]);
  useEffect(() => {
    if (recordOpen) {setPopup(null); setHover(null);}
    else if (returningFromRecord.current) {
      returningFromRecord.current = false;
      if (available && scopeRef.current === scopeKey && openerRef.current?.isConnected) {
        openerRef.current.focus({preventScroll: true});
      }
    }
  }, [recordOpen, available, scopeKey]);
  useLayoutEffect(() => {
    const node = plotRef.current;
    if (!node) return undefined;
    const measure = () => setWidth(Math.max(530, node.clientWidth || 700));
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!activeHover || !tipRef.current || !hover?.anchor?.isConnected) return undefined;
    const position = () => {
      const anchor = hover.anchor.getBoundingClientRect(), tip = tipRef.current.getBoundingClientRect();
      const left = anchor.right + 10 + tip.width > window.innerWidth - 10 ? anchor.left - tip.width - 10 : anchor.right + 10;
      setTipPosition({left: Math.max(10, Math.min(window.innerWidth - tip.width - 10, left)),
        top: Math.max(10, Math.min(window.innerHeight - tip.height - 10, anchor.top - tip.height / 2 + 12))});
    };
    position();
    const dismiss = () => setHover(null);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', dismiss, true);};
  }, [activeHover, hover]);

  // Axis ends on the quarter's last literal day, matching the approved reference.
  const lastDay = quarter.end - 1, span = lastDay - quarter.start;
  const x = day => 40 + (day - quarter.start) / span * Math.max(120, width - 80);
  const lanes = [];
  const positionedGroups = groups.map(group => {
    const anchor = x(Date.parse(`${group.date}T00:00:00Z`) / 86400000);
    const groupWidth = Math.max(48, group.events.length * 23);
    let lane = 0;
    while (lanes[lane] !== undefined && anchor - groupWidth / 2 < lanes[lane] + 15) lane++;
    lanes[lane] = anchor + groupWidth / 2;
    return {...group, anchor, width: groupWidth, lane};
  });
  const plotHeight = Math.max(190, lanes.length * 54 + 30);
  // Dense same-day clusters retain every usable hit target through horizontal scrolling.
  const denseWidth = Math.max(530, ...groups.map(group => group.events.length * 23 + 80));
  const ticks = [];
  for (let day = quarter.start; day <= lastDay; day += 7) ticks.push(day);
  if (ticks[ticks.length - 1] !== lastDay) ticks.push(lastDay);
  const changeSelection = value => {setHover(null); setPopup(null); setSelection(value);};
  const openList = (type, anchor, extra = {}) => {
    if (!available || recordOpen) return;
    openerRef.current = anchor; setHover(null); setPopup({type, scope: scopeKey, ...extra});
  };
  const openRecord = event => {
    const current = events.find(item => item.id === event.id);
    if (!available || recordOpen || !current) return;
    returningFromRecord.current = true;
    setPopup(null); setHover(null);
    onOpenReview?.(current.record);
  };
  const owner = event => personLabel(users, event.record.owner_id);
  const status = event => reviewDisplayValue('status', event.record.status);
  const cadenceLabel = event => reviewDisplayValue('recurrence', event.record.recurrence);
  const listTitle = activePopup?.type === 'date' ? formatCisReviewDate(activePopup.date, {long: true})
    : activePopup?.type === 'agenda' ? `${mode === 'overdue' ? 'Overdue' : 'Upcoming'} reviews` : 'Quarter review dates';

  return <section className="crr-overview panel quarter-card" aria-labelledby={titleId} onKeyDown={event => {
    if (event.key === 'Escape') setHover(null);
  }}>
    <div className="quarter-heading"><div><h2 id={titleId}>Calendar quarter</h2><p>Review dates, with a clearer view of what’s next.</p></div>
      <div className="quarter-controls"><button type="button" className="icon-button" aria-label="Previous quarter" onClick={() => changeSelection(shiftQuarter(selection, -1))}><ChevronLeft className="icon"/></button>
        <strong>Q{selection.quarter} {selection.year}</strong><button type="button" className="icon-button" aria-label="Next quarter" onClick={() => changeSelection(shiftQuarter(selection, 1))}><ChevronRight className="icon"/></button>
        <select aria-label="Year" value={selection.year} onChange={event => changeSelection({...selection, year: Number(event.target.value)})}>{Array.from({length: 8}, (_, index) => selection.year - 3 + index).map(year => <option key={year}>{year}</option>)}</select>
        <div className="segmented quarters" aria-label="Choose quarter">{[1, 2, 3, 4].map(value => <button type="button" key={value} aria-pressed={selection.quarter === value} onClick={() => changeSelection({...selection, quarter: value})}>Q{value}</button>)}</div>
        <button type="button" className="this-quarter" onClick={() => {changeSelection(currentQuarter()); setCadence(null);}}>This quarter</button></div></div>
    <div className="legend-row"><span className="quarter-range">{formatCisReviewDate(dayString(quarter.start))} – {formatCisReviewDate(dayString(lastDay), {year: true})}</span>
      <div className="legend" aria-label="Filter timeline by cadence">{CIS_REVIEW_CADENCES.map(item => <button type="button" key={item.kind} disabled={!available} aria-pressed={!cadence || cadence === item.kind} style={{'--cadence': item.color}} onClick={() => {setCadence(cadence === item.kind ? null : item.kind); setPopup(null); setHover(null);}}><span className="legend-dot" aria-hidden="true"/>{item.label}</button>)}</div></div>
    <div className="quarter-content"><div className="agenda"><div className="segmented agenda-switch">{['upcoming', 'overdue'].map(value => <button type="button" key={value} data-mode={value} disabled={!available} aria-pressed={mode === value} onClick={() => {setMode(value); setPopup(null);}}>{value === 'upcoming' ? 'Upcoming' : 'Overdue'} <span>{available ? agenda[value].length : '—'}</span></button>)}</div>
      <div className="agenda-caption">Unresolved reviews · Q{selection.quarter} {selection.year}</div>
      <div className="agenda-list">{!available ? <div className="agenda-empty" role="status">Review dates unavailable.</div> : agendaRows.length ? agendaRows.slice(0, 3).map(event => <button type="button" className={`agenda-entry ${cisReviewUrgency(event.date, now).tone}`} key={event.id} onClick={e => {openerRef.current = e.currentTarget; openRecord(event);}}><span className="agenda-title">{event.title}</span><span className="agenda-bottom"><span className="agenda-date">{formatCisReviewDate(event.date, {year: true})}</span><DueBadge date={event.date} now={now}/></span></button>) : <div className="agenda-empty"><b>No {mode} reviews</b>{mode === 'overdue' ? 'Nothing unresolved before today in this quarter.' : 'No unresolved reviews due today or later in this quarter.'}</div>}</div>
      {available && !!agendaRows.length && <button type="button" className="text-link agenda-all" onClick={event => openList('agenda', event.currentTarget)}>View all {agendaRows.length} {mode} reviews →</button>}</div>
      <div className="timeline-column"><div className="timeline-scroll"><div className="timeline-inner" style={{'--dense-width': `${denseWidth}px`}}>
        <div className="month-row">{quarter.months.map(month => <span className="month-name" key={month.toISOString()} style={{left: `${(month.getTime() / 86400000 - quarter.start) / span * 100}%`}}>{month.toLocaleDateString('en-US', {month: 'short', ...(month.getUTCMonth() === 0 ? {year: 'numeric'} : {}), timeZone: 'UTC'})}</span>)}</div>
        <div className="plot" ref={plotRef} style={{height: plotHeight}} aria-label="Quarter review timeline">
          {today > quarter.start && <div className="past-area" style={{width: Math.min(width, Math.max(0, x(Math.min(lastDay, today))))}}/>}
          {ticks.map(day => <div key={day} className="grid-line" style={{left: x(day)}}/>)}
          {quarter.months.slice(1).map(month => <div key={month.toISOString()} className="grid-line month-line" style={{left: x(month.getTime() / 86400000)}}/>)}
          {[1, 2].map(index => <div key={index} className="h-line" style={{top: plotHeight * index / 3}}/>)}
          {today >= quarter.start && today < quarter.end && <div className="today-line" style={{left: x(today)}}><span className="today-label">Today<br/>{formatCisReviewDate(dayString(today))}</span></div>}
          {!available ? <div className="chart-empty" role="status">Review dates unavailable.</div> : !positionedGroups.length ? <div className="chart-empty"><div><b>No reviews {cadence ? 'for this cadence' : 'scheduled'} in Q{selection.quarter}</b>Choose another quarter{cadence ? ' or select the cadence again to clear the filter' : ''}.</div></div> : positionedGroups.map(group => <div className="date-group" key={group.id} data-date={group.date} style={{left: Math.min(width - group.width - 2, Math.max(2, group.anchor - group.width / 2)), top: 20 + group.lane * 54, width: group.width}}>
            <div className="circle-row">{group.events.map(event => <button type="button" key={event.id} className={`review-dot${cisReviewUrgency(event.date, now).days < 0 ? ' late' : ''}`} style={{'--cadence': cisReviewCadence(event.record).color}} aria-label={`${event.title}, ${cadenceLabel(event)}, ${formatCisReviewDate(event.date, {year: true})}, ${cisReviewUrgency(event.date, now).text}. Open date’s reviews.`} aria-describedby={activeHover?.id === event.id ? tooltipId : undefined}
              onMouseEnter={e => {setTipPosition(null); setHover({eventId: event.id, anchor: e.currentTarget, scope: scopeKey});}} onMouseLeave={e => {if (document.activeElement !== e.currentTarget) setHover(null);}} onFocus={e => {setTipPosition(null); setHover({eventId: event.id, anchor: e.currentTarget, scope: scopeKey});}} onBlur={() => setHover(null)} onClick={e => openList('date', e.currentTarget, {date: group.date, highlight: event.id})}><span className="dot" aria-hidden="true"/></button>)}</div>
            <span className="date-stem" aria-hidden="true"/><button type="button" className={`date-label ${cisReviewUrgency(group.date, now).tone}`} aria-label={`${formatCisReviewDate(group.date, {long: true})}: ${countLabel(group.events.length)}`} onClick={event => openList('date', event.currentTarget, {date: group.date})}>{formatCisReviewDate(group.date)}</button></div>)}
        </div><div className="date-axis" aria-hidden="true">{ticks.filter((_, index) => index % 2 === 0 || index === ticks.length - 1).map(day => <span key={day} className="axis-label" style={{left: x(day)}}>{formatCisReviewDate(dayString(day))}</span>)}</div>
      </div></div><div className="timeline-foot"><span>{cadence ? `${CIS_REVIEW_CADENCES.find(item => item.kind === cadence)?.label} reviews · select the legend again to show all.` : 'One circle per review. Hover for details; click to see the date’s reviews.'}</span><button type="button" className="text-link" disabled={!available} onClick={event => openList('data', event.currentTarget)}>View data</button></div></div></div>
    {activeHover && <div ref={tipRef} role="tooltip" id={tooltipId} className="tooltip crr-tooltip" style={{...tipPosition, visibility: tipPosition ? 'visible' : 'hidden', maxWidth: 'calc(100vw - 20px)', minWidth: 'min(245px, calc(100vw - 20px))'}}><div className="tip-type" style={{'--cadence': cisReviewCadence(activeHover.record).color}}>{cadenceLabel(activeHover)} review</div><h3>{activeHover.title}</h3><div className="tip-due"><span>{formatCisReviewDate(activeHover.date, {year: true})}</span><DueBadge date={activeHover.date} now={now}/></div><div className="tip-meta">{owner(activeHover)} · {status(activeHover)}</div><div className="tip-hint">Click to see the reviews due on this date.</div></div>}
    <Dialog open={!!activePopup} onOpenChange={open => {if (!open) setPopup(null);}}><DialogContent className="crr-root crr-list" data-theme={theme} showCloseButton={false} onCloseAutoFocus={event => {event.preventDefault(); if (!returningFromRecord.current && available && scopeRef.current === scopeKey && openerRef.current?.isConnected) openerRef.current.focus({preventScroll: true});}}>
      <div className="dialog-shell"><div className="dialog-heading"><div><div className="eyebrow">{activePopup?.type === 'date' ? 'REVIEWS ON THIS DATE' : `Q${selection.quarter} ${selection.year}`}</div><DialogTitle>{listTitle}</DialogTitle><DialogDescription>{countLabel(popupRows.length)} · {activePopup?.type === 'date' ? cisReviewUrgency(activePopup.date, now).text.toLowerCase() : 'unresolved reviews in the selected quarter'}</DialogDescription></div><button type="button" className="dialog-close" aria-label="Close review list" onClick={() => setPopup(null)}><X className="icon"/></button></div>
        <div className="dialog-content"><div className="date-list">{popupRows.length ? popupRows.map(event => <button type="button" key={event.id} className={`date-review${activePopup?.highlight === event.id ? ' highlight' : ''}`} onClick={() => openRecord(event)}><span className="list-title">{event.title}</span><span className="list-details"><span>{cadenceLabel(event)}</span><span>{owner(event)}</span><span>{status(event)}</span></span><span className="list-bottom"><span>{formatCisReviewDate(event.date, {year: true})} <DueBadge date={event.date} now={now}/></span><span className="open-text">Open review →</span></span></button>) : <div className="agenda-empty">No reviews in this selection.</div>}</div></div>
        <div className="dialog-footer"><span>Choose a review to see its details.</span><button type="button" className="button" onClick={() => setPopup(null)}>Close</button></div></div>
    </DialogContent></Dialog>
  </section>;
}
