import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle} from './ui/dialog';
import {calendarDay, displayDay} from '@/lib/managementDates';
import {currentQuarter, quarterTimelineBounds, quarterToday, shiftQuarter} from '@/lib/quarterlyProgramTimeline';
import {useQuarterWindow} from './QuarterlyProgramTimeline';
import {vendorWorkUnits} from '@/lib/vendorOutstandingWork';

const TYPES = [{kind: 'rev', label: 'Review', color: '#2f66c6'}, {kind: 'asr', label: 'Assurance follow-up', color: '#b38131'}, {kind: 'ren', label: 'Contract renewal', color: '#199681'}];
export const vendorEventColor = event => TYPES.find(type => type.kind === event.kind)?.color || '#647491';
const shortDate = value => new Date(calendarDay(value) * 86400000).toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'});
export function vendorEventUrgency(event, now = new Date()) {
  if (!event.outstanding) return {tone: 'informational', label: 'Recorded date'};
  const days = calendarDay(event.date) - quarterToday(now);
  return {tone: days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'week' : days <= 15 ? 'fortnight' : days <= 30 ? 'month' : 'later',
    label: days < 0 ? `${-days} ${days === -1 ? 'day' : 'days'} overdue` : days === 0 ? 'Due today' : `In ${days} ${days === 1 ? 'day' : 'days'}`};
}
const ownerName = (event, users) => users.find(user => user.user_id === event.owner_id)?.name || users.find(user => user.user_id === event.owner_id)?.email || (event.owner_id ? 'Owner unavailable' : 'Unassigned');

// Same-date events retain one date anchor and individual circles, as in the original reference.
export function vendorDateGroups(events, bounds, width) {
  const dates = new Map();
  events.forEach(event => { const date = event.date.slice(0, 10); if (!dates.has(date)) dates.set(date, []); dates.get(date).push(event); });
  const laneEnds = [];
  return [...dates].map(([date, items]) => {
    const size = Math.max(48, items.length * 23), anchor = 22 + bounds.position(date) / 100 * (width - 44);
    const left = Math.min(width - size - 2, Math.max(2, anchor - size / 2));
    let lane = 0; while (laneEnds[lane] !== undefined && left < laneEnds[lane] + 15) lane++;
    laneEnds[lane] = left + size;
    return {date, items, left, width: size, lane};
  });
}

export default function VendorsConceptTimeline({events, users = [], available = true, theme, onSelect, scopeKey = ''}) {
  const {now, setNow, selected: selection, setWindowState} = useQuarterWindow(scopeKey, 'vendors');
  const setSelection = update => setWindowState({scopeKey, chartKey: 'vendors', manual: true, ...(typeof update === 'function' ? update(selection) : update)});
  const [mode, setMode] = useState('upcoming'), [kind, setKind] = useState(null);
  const frame = useRef(null), [width, setWidth] = useState(650);
  useLayoutEffect(() => {
    const node = frame.current;
    const measure = () => setWidth(node?.clientWidth || 650);
    measure();
    if (!globalThis.ResizeObserver) return undefined;
    const observer = new ResizeObserver(measure); if (node) observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const bounds = quarterTimelineBounds(selection), today = quarterToday(now);
  const quarterEvents = available ? events.filter(event => calendarDay(event.date) >= bounds.start && calendarDay(event.date) < bounds.end) : [];
  const upcoming = quarterEvents.filter(event => calendarDay(event.date) >= today);
  const overdue = quarterEvents.filter(event => event.outstanding && calendarDay(event.date) < today);
  const agenda = mode === 'upcoming' ? upcoming : overdue;
  const visible = quarterEvents.filter(event => !kind || event.kind === kind);
  const largestGroup = Math.max(0, ...Object.values(visible.reduce((groups, event) => ({...groups, [event.date.slice(0, 10)]: (groups[event.date.slice(0, 10)] || 0) + 1}), {})));
  // An oversized date stays horizontally scrollable; no event is wrapped, cropped or discarded.
  const plotWidth = Math.max(530, width, largestGroup * 23 + 48);
  const groups = vendorDateGroups(visible, bounds, plotWidth), height = Math.max(176, (Math.max(0, ...groups.map(group => group.lane)) + 1) * 54 + 30);
  const label = `Q${selection.quarter} ${selection.year}`;
  const ticks = []; for (let day = bounds.start; day < bounds.end; day += 14) ticks.push(day); ticks.push(bounds.end - 1);
  const x = day => 22 + (day - bounds.start) / (bounds.end - bounds.start) * (plotWidth - 44);
  const iso = day => new Date(day * 86400000).toISOString().slice(0, 10);
  const select = (items, title, event) => onSelect(items, title, event.currentTarget);
  return <section className="cv-quarter" aria-label="Calendar quarter">
    <header className="cv-quarter-heading"><div><h2>Calendar quarter</h2><p>Saved vendor reviews, assurance follow-ups and contract dates.</p></div>
      <div className="cv-quarter-controls"><button type="button" aria-label="Previous quarter" onClick={() => setSelection(value => shiftQuarter(value, -1))}><ChevronLeft size={12}/></button><strong>{label}</strong><button type="button" aria-label="Next quarter" onClick={() => setSelection(value => shiftQuarter(value, 1))}><ChevronRight size={12}/></button>
        <label className="sr-only" htmlFor="vendor-quarter-year">Year</label><select id="vendor-quarter-year" aria-label="Year" value={selection.year} onChange={event => setSelection(value => ({...value, year: Number(event.target.value)}))}>{Array.from({length: 9}, (_, index) => selection.year - 4 + index).filter(year => year >= 1 && year <= 9999).map(year => <option key={year} value={year}>{year}</option>)}</select>
        <div className="cv-quarter-buttons" role="group" aria-label="Choose quarter">{[1, 2, 3, 4].map(quarter => <button type="button" key={quarter} aria-pressed={selection.quarter === quarter} onClick={() => setSelection(value => ({...value, quarter}))}>Q{quarter}</button>)}</div><button type="button" className="cv-this-quarter" onClick={() => {const current = new Date(); setNow(current); setWindowState({scopeKey, chartKey: 'vendors', manual: false, ...currentQuarter(current)});}}>This quarter</button></div>
    </header>
    <div className="cv-quarter-content"><aside className="cv-agenda"><div className="cv-agenda-switch" role="group" aria-label="Agenda mode">{[['upcoming', 'Upcoming', upcoming], ['overdue', 'Overdue', overdue]].map(([value, title, items]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{title} <span>{available ? items.length : '—'}</span></button>)}</div><p className="cv-agenda-caption">Saved vendor dates · {label}</p>
      {agenda.slice(0, 3).map(event => <button type="button" key={event.id} className="cv-agenda-entry" onClick={click => select([event], event.title, click)}><b>{event.title}</b><span className="cv-agenda-bottom"><span>{event.label} · {shortDate(event.date)}</span><EventBadge event={event} now={now}/></span></button>)}
      {!agenda.length && <p className="cv-empty">{available ? `No saved ${mode} items in this quarter.` : 'Dates unavailable.'}</p>}{agenda.length > 3 && <button type="button" className="cv-text-link" onClick={event => select(agenda, `${mode === 'upcoming' ? 'Upcoming' : 'Overdue'} · ${label}`, event)}>View all ({agenda.length})</button>}
    </aside><div className="cv-timeline-column"><div className="cv-legend" role="group" aria-label="Filter vendor event type">{TYPES.map(type => <button type="button" key={type.kind} aria-label={`Show ${type.label.toLowerCase()} events`} aria-pressed={!kind || kind === type.kind} onClick={() => setKind(value => value === type.kind ? null : type.kind)}><i style={{background: type.color}}/>{type.label}</button>)}</div>
      <div className="cv-timeline-scroll" ref={frame}><div style={{width: plotWidth}} className="cv-timeline-inner"><div className="cv-months">{bounds.months.map(month => <span key={month.toISOString()} style={{left: x(month.getTime() / 86400000)}}>{month.toLocaleDateString(undefined, {month: 'short', ...(month.getUTCMonth() === 0 ? {year: 'numeric'} : {}), timeZone: 'UTC'})}</span>)}</div>
        <div className="cv-plot" aria-label="Quarter vendor work timeline" style={{height}}>
          {today > bounds.start && <div className="cv-past" style={{width: Math.min(plotWidth, x(Math.min(today, bounds.end)))}}/>}{ticks.map(day => <i key={day} className="cv-grid" style={{left: x(day)}}/>)}
          {today >= bounds.start && today < bounds.end && <div className="cv-today" style={{left: x(today)}}><span>Today<br/>{shortDate(iso(today))}</span></div>}
          <Tooltip.Provider delayDuration={150}>{groups.map(group => <div className="cv-date-group" key={group.date} style={{left: group.left, top: 20 + group.lane * 54, width: group.width}}><div className="cv-circle-row">{group.items.map(event => <Tooltip.Root key={event.id}><Tooltip.Trigger asChild><button type="button" className="cv-event-dot" data-event-id={event.id} aria-label={`${event.label}, ${event.title}, ${displayDay(event.date)}. Open this date’s items.`} onClick={click => select(group.items, displayDay(group.date), click)}><i style={{background: vendorEventColor(event)}}/></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="cv-tooltip" data-theme={theme} side="right" sideOffset={10} collisionPadding={10} avoidCollisions><span style={{color: vendorEventColor(event)}}>{event.label}</span><h3>{event.title}</h3><p>{displayDay(event.date)} <EventBadge event={event} now={now}/></p><p>{ownerName(event, users)}<br/>{event.detail || event.vendor.service || event.vendor.services}</p><small>Click to see saved items for this date.</small></Tooltip.Content></Tooltip.Portal></Tooltip.Root>)}</div><button type="button" className="cv-date-label" aria-label={`${displayDay(group.date)}: ${group.items.length} ${group.items.length === 1 ? 'item' : 'items'}`} onClick={event => select(group.items, displayDay(group.date), event)}>{shortDate(group.date)}</button></div>)}</Tooltip.Provider>
          {!visible.length && <p className="cv-empty">{available ? `No saved events in ${label}.` : 'Dates unavailable.'}</p>}
        </div><div className="cv-axis">{ticks.map(day => <span key={day} style={{left: x(day)}}>{shortDate(iso(day))}</span>)}</div></div></div>
      <footer className="cv-timeline-footer"><span>One circle per saved event. Hover for details; click to open.</span><button type="button" disabled={!available} onClick={event => select(visible, `Saved vendor dates · ${label}`, event)}>View data</button></footer>
    </div></div>
  </section>;
}

export function EventBadge({event, now}) {const urgency = vendorEventUrgency(event, now); return <span className={`cv-due cv-${urgency.tone}`}>{urgency.label}</span>;}

export function VendorsEventList({selection, events, available, recordOpen, users, theme, onClose, onOpen, now}) {
  const opening = useRef(false);
  const opener = useRef(null);
  useEffect(() => {if (selection?.opener) opener.current = selection.opener;}, [selection]);
  useEffect(() => {if (!recordOpen) opening.current = false;}, [recordOpen]);
  const selected = useMemo(() => selection ? selection.ids.map(id => events.find(event => event.id === id)).filter(Boolean) : [], [selection, events]);
  return <Dialog open={!!selection && !recordOpen} onOpenChange={open => {if (!open && !opening.current) onClose();}}><DialogContent className="cv-event-list" data-theme={theme} showCloseButton={false} onCloseAutoFocus={event => {event.preventDefault(); if (!opening.current && opener.current?.isConnected) opener.current.focus();}}>
    <header><span>SAVED VENDOR WORK</span><DialogTitle>{selection?.title}</DialogTitle><DialogDescription>{available ? vendorWorkUnits(selected) : 'Dates unavailable. Reload the native register before opening an item.'}</DialogDescription></header>
    <div className="cv-list-items">{available && selected.map(item => <button type="button" key={item.id} data-event-id={item.id} onClick={() => {opening.current = true; onOpen(item);}}><b>{item.title}</b><span style={{color: vendorEventColor(item)}}>{item.label} · {ownerName(item, users)}</span>{item.detail && <small>{item.detail}</small>}<span>{displayDay(item.date)} <EventBadge event={item} now={now}/></span><small>Open {item.task ? 'Action Item' : item.review ? 'Review' : 'vendor'} →</small></button>)}{available && !selected.length && <p>No matching saved items remain. Refresh the register.</p>}</div><footer><DialogClose asChild><button type="button">Close</button></DialogClose></footer>
  </DialogContent></Dialog>;
}
