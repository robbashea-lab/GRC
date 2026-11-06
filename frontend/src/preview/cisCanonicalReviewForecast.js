import {reviewWorkload} from '../lib/brawndoDemoReviews';
import {reviewSchedule,scheduledDate} from '../lib/reviewOccurrences';
import {CADENCES} from '../lib/frameworks';
import rules from '../lib/grcRules.json';
import {CIS_DEMO_SCENARIOS} from './cisDemoSelection';
import {cisDemoFixtureDates} from './cisDemoFixtureDates';

const fail=message=>{throw new Error('Canonical Review forecast: '+message);};
const dateOnly=value=>typeof value==='string'?value.slice(0,10):'';

function localNoon(year,month,day) {
  // The native helper reads local calendar components. Parsing UTC midnight
  // directly would select the prior day/month in negative-offset timezones.
  const value=new Date(0);
  value.setFullYear(year,month,day);
  value.setHours(12,0,0,0);
  return value;
}

function validateParent(review) {
  if(typeof review.review_id!=='string'||!review.review_id||typeof review.title!=='string'||!review.title)
    fail('every source parent needs its saved identity and title.');
  if(!rules.statuses.reviews.includes(review.status))fail('unsupported saved status on '+review.review_id+'.');
  if(rules.closed.reviews.includes(review.status))return;
  if(review.status==='needs_scheduling'||!scheduledDate(review.due_date))fail('source parent is not scheduled: '+review.review_id+'.');
  if(review.recurrence!=='none'&&!CADENCES.includes(review.recurrence))fail('unsupported cadence on '+review.review_id+'.');
  if(review.recurrence==='custom'&&(!Number.isInteger(review.custom_recurrence_days)
    ||review.custom_recurrence_days<1||review.custom_recurrence_days>3650))fail('invalid custom cadence on '+review.review_id+'.');
  if(review.recurrence!=='none'){
    const next=scheduledDate(reviewSchedule(review).next_review_date);
    if(!next||next.getTime()<=scheduledDate(review.due_date).getTime())
      fail('native next cycle does not advance for '+review.review_id+'.');
  }
}

// Companion report only. Calendar continues to show saved deadlines; these
// projections are neither persisted occurrences nor extra Review parents.
export function canonicalReviewForecast(reviews,{client_id,anchor}={}) {
  if(!CIS_DEMO_SCENARIOS.some(row=>row.client_id===client_id))fail('select one of the three canonical CIS Demo clients.');
  if(!Array.isArray(reviews)||reviews.some(row=>!row||typeof row!=='object'||Array.isArray(row)))fail('provide decoded Review records.');
  if(typeof anchor!=='string'||!/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(anchor)
    ||!scheduledDate(anchor)||new Date(anchor).toISOString()!==anchor)fail('provide the exact frozen UTC day anchor.');
  const start=dateOnly(anchor),through=cisDemoFixtureDates(new Date(anchor)).month(12);
  if(through.length!==10||!scheduledDate(through))fail('the twelve-month cutoff is outside the native calendar range.');
  const [year,month,day]=start.split('-').map(Number);
  const windows=[localNoon(year,month-1,day),localNoon(year,month,1)];
  const selected=reviews.filter(row=>row.client_id===client_id),identities=new Set();
  for(const review of selected){
    validateParent(review);
    if(identities.has(review.review_id))fail('duplicate parent identity: '+review.review_id+'.');
    identities.add(review.review_id);
  }
  const active=selected.filter(row=>!rules.closed.reviews.includes(row.status));
  const excluded=selected.filter(row=>rules.closed.reviews.includes(row.status));
  const dates=new Map();
  for(const review of active)for(const now of windows){
    const workload=reviewWorkload([review],now);
    if(workload.some(month=>month.projectionUnavailable))fail('native projection is incomplete for '+review.review_id+'.');
    for(const item of workload.flatMap(month=>month.items)){
      if(!['Due','Projected'].includes(item.type))continue;
      const date=dateOnly(item.at);
      if(date<start||date>through)continue;
      const key=JSON.stringify([review.review_id,date]),previous=dates.get(key);
      if(previous&&previous.type!==item.type)fail('native windows disagree for '+review.review_id+' on '+date+'.');
      dates.set(key,{client_id,review_id:review.review_id,title:review.title,recurrence:review.recurrence,
        date,scheduled_at:item.at,type:item.type});
    }
  }
  const items=[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.review_id.localeCompare(b.review_id));
  return {client_id,anchor,timezone:'UTC calendar dates',from_date:start,through_date:through,inclusive:true,
    source:'Existing native reviewWorkload and reviewSchedule; report only',
    limitation:'Calendar shows saved current deadlines and retained history. Projected dates below are not saved executions or completions.',
    summary:{active_parents:active.length,scheduled_parents:active.length,excluded_terminal_parents:excluded.length,
      projection_unavailable:0,saved_due_dates:items.filter(row=>row.type==='Due').length,
      projected_dates:items.filter(row=>row.type==='Projected').length,total_dates:items.length},
    parents:active.map(row=>({client_id,review_id:row.review_id,title:row.title,status:row.status,
      recurrence:row.recurrence,current_due_date:row.due_date})),
    excluded_terminal_parents:excluded.map(row=>({client_id,review_id:row.review_id,title:row.title,status:row.status})),
    items};
}

export function canonicalReviewForecastCsv(report) {
  const columns=['client_id','review_id','title','recurrence','date','scheduled_at','type'];
  const cell=value=>{
    const text=String(value??'');
    // Neutralize formula-like prefixes as well as quoting CSV delimiters.
    return '"'+(/^(?:[\t\r\n]|\s*[=+@-])/.test(text)?"'"+text:text).replaceAll('"','""')+'"';
  };
  return [columns,...report.items.map(row=>columns.map(key=>row[key]))].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
