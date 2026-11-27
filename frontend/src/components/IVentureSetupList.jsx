import {Check, ChevronRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import {serviceCatalog} from '@/lib/r4ServicesTools';
import {BrawndoTiles, shortDate} from './BrawndoPage';
import './IVentureSetup.css';

const cadences = {monthly:'Monthly', quarterly:'Quarterly', semiannual:'Every six months', annual:'Annually', custom:'Custom interval'};
const statusLabels = {todo:'Recurring ticket needed', decide:'Who runs it?', done:'Set up', removed:'Removed'};
function ActivityRow({activity, clientId, editable, locked, onEdit, onRemoval}) {
  const a = activity;
  const area = serviceCatalog.areas.find(item => item.id === a.area_id)?.name;
  const responsibility = serviceCatalog.responsibilities.find(item => item.id === a.responsibility)?.label;
  const drivers = (a.drivers || []).map(driver => [driver.framework_key, ...(driver.framework_safeguards || [])].filter(Boolean).join(' · '));
  return <div className={'ivs-row '+a.state}>
    <span className={'ivs-ic '+a.state} aria-label={statusLabels[a.state]}>{a.state === 'done' ? <Check size={13}/> : a.state === 'decide' ? '!' : a.state === 'removed' ? '–' : ''}</span>
    <div className="ivs-main"><b>{a.title}</b>{!a.review_id && <small>New review</small>}<div className="ivs-meta">{drivers.join(' / ')}</div><div className="ivs-muted">{[area,responsibility].filter(Boolean).join(' · ')}</div></div>
    <div className="ivs-ticket">{a.state === 'done' ? <><b>Ticket #{a.setup?.recurring_ticket_number}</b><small>{[cadences[a.cadence],a.first_next_due && 'next due '+shortDate(a.first_next_due)].filter(Boolean).join(' · ')}</small></> :
      a.state === 'removed' ? <small>{a.exclusion?.reason || a.exclusion?.note || 'Removed from setup'}</small> :
      <><b>{statusLabels[a.state]}</b><small>{a.state === 'decide' ? 'Responsibility isn’t set in Services & Tools' : cadences[a.cadence]}</small></>}
      {a.review_id && <Link to={'/reviews?client_id='+encodeURIComponent(clientId)+'&review_id='+encodeURIComponent(a.review_id)}>Open review</Link>}
    </div>
    {editable && a.state !== 'removed' && <button className="ivs-edit" type="button" disabled={locked} aria-label={'Set up / edit '+a.title} onClick={()=>onEdit(a)}><ChevronRight size={17}/></button>}
    {editable && <button className={a.state === 'removed' ? 'ghost' : 'ivs-remove'} type="button" disabled={locked} onClick={()=>onRemoval(a)}>{a.state === 'removed' ? 'Restore' : 'Remove from setup'}</button>}
  </div>;
}

export default function IVentureSetupList({activities, clientName, ...rowProps}) {
  const technical = activities.filter(a => !a.internal && a.provider_relevant);
  const todo = technical.filter(a => a.state === 'todo' || a.state === 'decide');
  const done = technical.filter(a => a.state === 'done');
  const removed = technical.filter(a => a.state === 'removed');
  const decisions = todo.filter(a => a.state === 'decide').length;
  const internal = activities.filter(a => a.internal);
  const outside = activities.filter(a => !a.internal && !a.provider_relevant);
  const rows = items => <div className="ivs-list">{items.map(activity=><ActivityRow key={activity.activity_id} activity={activity} {...rowProps}/>)}</div>;
  function group(title, description, items) {
    return items.length > 0 && <section className="ivs-section"><div className="ivs-heading"><h3>{title} <small>{items.length}</small></h3>{description && <small>{description}</small>}</div>{rows(items)}</section>;
  }
  return <section className="panel ivs-panel">
    <header className="panel-head"><div><h2 className="panel-title">Initial setup</h2><p className="panel-desc">Each item is a selected program-support Review performed by iVenture per Services &amp; Tools. Record its recurring ConnectWise ticket, recurrence and next due date in the shared Review. A setup record schedules work; it does not prove completion, implementation or compliance. Remove tracking that does not apply and retain an alternative method where needed.</p></div></header>
    {!!technical.length && <BrawndoTiles label="Setup status" tiles={[
      {id:'done',label:'Set up',count:done.length+' of '+(technical.length-removed.length),context:'Recurring ticket recorded on the review',tone:'neutral'},
      {id:'todo',label:'To set up',count:todo.length,context:decisions ? decisions+(decisions === 1 ? ' needs' : ' need')+' a decision on who runs it' : 'Ticket number to record',tone:'attention'},
      {id:'removed',label:'Removed',count:removed.length,context:'Doesn’t apply or no ticket needed',tone:'neutral'}
    ]}/>}
    <div className="ivs-body">{!technical.length && <p className="ivs-empty">{activities.length ? 'Nothing for iVenture to set up for '+clientName+' under the current Services & Tools responsibilities.' : 'No applicable program-support reviews are available for '+clientName+'.'}</p>}
      {group('To set up','Select an item to record its recurring ConnectWise ticket.',todo)}
      {group('Set up','',done)}
      {!!removed.length && <details className="ivs-removed"><summary>Removed from setup · {removed.length}<small> · these stay in Reviews unless you delete them there</small></summary>{rows(removed)}</details>}
      {!!(outside.length || internal.length) && <p className="ivs-note">Not on this list: {[
        outside.length>0 && outside.length+' program-support review'+(outside.length===1?'':'s')+' run by the client or another provider ('+outside.map(a=>a.title).join(', ')+')',
        internal.length>0 && internal.length+' Security Program Manager review'+(internal.length===1?'':'s')+' run in GoverNara without a ticket ('+internal.map(a=>a.title).join(', ')+')'
      ].filter(Boolean).join('; ')}.</p>}
    </div>
  </section>;
}
