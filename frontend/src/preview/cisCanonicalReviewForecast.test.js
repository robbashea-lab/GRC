import {canonicalReviewForecast,canonicalReviewForecastCsv} from './cisCanonicalReviewForecast';
import {brawndoArtifactModel} from './cisCanonicalBrawndoModel';
import {initechArtifactModel} from './cisCanonicalInitechModel';
import {reviewSchedule} from '../lib/reviewOccurrences';

const CID='demo_brawndo',ANCHOR='2026-11-02T00:00:00.000Z';
const row=(id,due,recurrence='monthly',extra={})=>({client_id:CID,review_id:id,title:'Same fictional Review title',
  status:'upcoming',due_date:due,recurrence,...extra});
const report=(rows,anchor=ANCHOR)=>canonicalReviewForecast(rows,{client_id:CID,anchor});

test('saved deadlines and subsequent native projections stay distinct through the inclusive twelve-month cutoff',()=>{
  const rows=[row('monthly','2026-11-11'),row('annual','2026-11-02','annual'),
    row('past-monthly','2026-10-26'),row('one-off','2026-11-07','none'),
    row('cancelled','2026-11-01','monthly',{status:'cancelled'}),
    row('completed','2026-10-01','monthly',{status:'completed',completed_at:'2026-10-02'}),
    row('foreign','2026-11-04','monthly',{client_id:'another-client'})];
  const before=JSON.stringify(rows),result=report(rows);
  expect(JSON.stringify(rows)).toBe(before);
  expect(result).toMatchObject({client_id:CID,anchor:ANCHOR,from_date:'2026-11-02',through_date:'2027-11-02',inclusive:true,
    summary:{active_parents:4,scheduled_parents:4,excluded_terminal_parents:2,projection_unavailable:0}});
  expect(result.items.filter(item=>item.review_id==='monthly')).toHaveLength(12);
  expect(result.items.find(item=>item.review_id==='monthly'&&item.date==='2026-11-11').type).toBe('Due');
  expect(result.items.find(item=>item.review_id==='monthly'&&item.date==='2027-10-11').type).toBe('Projected');
  expect(result.items.filter(item=>item.review_id==='annual').map(item=>[item.date,item.type]))
    .toEqual([['2026-11-02','Due'],['2027-11-02','Projected']]);
  expect(result.items.filter(item=>item.review_id==='past-monthly')).toHaveLength(12);
  expect(result.items.filter(item=>item.review_id==='past-monthly').every(item=>item.type==='Projected')).toBe(true);
  expect(result.items.filter(item=>item.review_id==='one-off')).toHaveLength(1);
  expect(result.items.every(item=>!['cancelled','completed','foreign'].includes(item.review_id))).toBe(true);
  expect(new Set(result.items.map(item=>item.review_id+':'+item.date)).size).toBe(result.items.length);
  expect(result.items.every(item=>item.date>=result.from_date&&item.date<=result.through_date)).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/occurrence_id|completion_date|completed_at/);
});

test('UTC anchor components are deliberately passed to the local-date native helper at local noon',()=>{
  const native=require('../lib/brawndoDemoReviews'),spy=jest.spyOn(native,'reviewWorkload');
  try{
    const result=report([row('boundary','2028-03-01')],'2028-03-01T00:00:00.000Z');
    expect(spy.mock.calls.map(([,now])=>[now.getFullYear(),now.getMonth(),now.getDate(),now.getHours()]))
      .toEqual([[2028,2,1,12],[2028,3,1,12]]);
    expect(result.items[0]).toMatchObject({date:'2028-03-01',type:'Due'});
  }finally{spy.mockRestore();}
});

test.each([
  ['2028-02-29T00:00:00.000Z','2028-02-29','2029-02-28'],
  ['2027-01-31T00:00:00.000Z','2027-01-31','2028-01-31'],
  ['2028-01-31T00:00:00.000Z','2028-01-31','2029-01-31']
])('leap/month-end native recurrence remains anchored for %s',(anchor,due,through)=>{
  const review=row('month-end',due),before=JSON.stringify(review),result=report([review],anchor);
  const expected=[];let cursor={...review};
  for(let step=0;step<14&&cursor.due_date.slice(0,10)<=through;step++){
    expected.push(cursor.due_date.slice(0,10));
    const schedule=reviewSchedule(cursor);cursor={...cursor,...schedule,due_date:schedule.next_review_date,recurrence_due_date:null};
  }
  expect(result.through_date).toBe(through);
  expect(result.items.map(item=>item.date)).toEqual(expected);
  expect(result.items).toHaveLength(13);
  expect(JSON.stringify(review)).toBe(before);
});

test.each([
  ['unscheduled',row('bad',null)],
  ['needs scheduling',row('bad','2026-11-02','monthly',{status:'needs_scheduling'})],
  ['unknown cadence',row('bad','2026-11-02','weekly')],
  ['invalid custom interval',row('bad','2026-11-02','custom',{custom_recurrence_days:0})],
  ['non-advancing native anchor',row('bad','2026-11-30','monthly',{recurrence_due_date:'2026-09-30'})],
  ['native projection exhaustion',row('bad','1900-01-01')]
])('%s fails instead of issuing a partially qualified report',(_label,review)=>{
  const before=JSON.stringify(review);expect(()=>report([review])).toThrow('Canonical Review forecast:');
  expect(JSON.stringify(review)).toBe(before);
});

test('invalid scope, invalid anchors and duplicate source identities are rejected',()=>{
  expect(()=>canonicalReviewForecast([],{client_id:'new-customer',anchor:ANCHOR})).toThrow('canonical CIS Demo');
  for(const anchor of ['2026-11-02','2026-02-30T00:00:00.000Z','2026-11-02T12:00:00.000Z'])
    expect(()=>report([],anchor)).toThrow('frozen UTC');
  expect(()=>report([row('same','2026-11-02'),row('same','2026-11-03')])).toThrow('duplicate parent identity');
  expect(report([]).summary).toMatchObject({active_parents:0,total_dates:0});
});

test('CSV preserves quoted text and makes formula-like authored titles inert without changing the report',()=>{
  const result=report([row('csv','2026-11-03','none',{title:'=Test, "fictional"'}),
    row('space','2026-11-04','none',{title:' \t=Fictional'}),row('newline','2026-11-05','none',{title:'\n=Fictional'})]),before=JSON.stringify(result);
  const csv=canonicalReviewForecastCsv(result);
  expect(csv).toContain('"client_id","review_id","title"');
  expect(csv).toContain('"\'=Test, ""fictional"""');
  expect(csv).toContain('"\' \t=Fictional"');expect(csv).toContain('"\'\n=Fictional"');
  expect(csv).toContain('"Due"');expect(JSON.stringify(result)).toBe(before);
});

test('real Brawndo parents produce a full truthful companion forecast without modifying native history or schedules',()=>{
  const {db}=brawndoArtifactModel(ANCHOR),before=JSON.stringify(db.reviews),result=report(db.reviews);
  expect(JSON.stringify(db.reviews)).toBe(before);
  expect(result.summary).toMatchObject({active_parents:51,scheduled_parents:51,excluded_terminal_parents:11,projection_unavailable:0});
  expect(result.items.some(item=>item.type==='Projected')).toBe(true);
  for(const key of ['software-support','vulnerability-remediation']){
    const parent=db.reviews.find(review=>review.framework_plan_key===key);
    expect(result.items.filter(item=>item.review_id===parent.review_id)).toHaveLength(12);
  }
  const terminal=new Set(result.excluded_terminal_parents.map(parent=>parent.review_id));
  expect(result.items.every(item=>item.client_id===CID&&!terminal.has(item.review_id))).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(/occurrence_id|completed_at|completion_date/);
  if(process.env.CIS_REBUILD_AUDIT_OUTPUT){
    const fs=require('fs'),path=require('path'),out=process.env.CIS_REBUILD_AUDIT_OUTPUT;
    fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'BRAWNDO-COMPANION-REVIEW-FORECAST.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(out,'BRAWNDO-COMPANION-REVIEW-FORECAST.csv'),canonicalReviewForecastCsv(result));
  }
});


test('real Initech current deadlines and weekly, quarterly and monthly work project twelve months without manufacturing completions',()=>{
  const {db}=initechArtifactModel(ANCHOR),before=JSON.stringify(db),result=canonicalReviewForecast(db.reviews,{client_id:'demo_initech',anchor:ANCHOR});
  expect(JSON.stringify(db)).toBe(before);
  expect(result.summary).toMatchObject({active_parents:55,scheduled_parents:55,excluded_terminal_parents:11,projection_unavailable:0});
  expect(result.through_date).toBe('2027-11-02');
  expect(new Set(result.items.map(item=>item.review_id))).toEqual(new Set(result.parents.map(parent=>parent.review_id)));
  expect(new Set(result.items.map(item=>item.review_id+':'+item.date)).size).toBe(result.items.length);
  expect(result.items.every(item=>item.client_id==='demo_initech'&&item.date>=result.from_date&&item.date<=result.through_date)).toBe(true);
  const weekly=result.items.filter(item=>item.review_id==='fw_demo_initech_review_requirement:8.11');
  expect(weekly).toHaveLength(52);
  expect(weekly[0]).toMatchObject({date:'2026-11-05',type:'Due'});
  expect(weekly[51]).toMatchObject({date:'2027-10-28',type:'Projected'});
  for(let index=1;index<weekly.length;index++)expect(Date.parse(weekly[index].date)-Date.parse(weekly[index-1].date)).toBe(7*86400000);
  expect(result.items.filter(item=>item.review_id==='fw_demo_initech_review_requirement:11.5').map(item=>item.date))
    .toEqual(['2026-11-14','2027-02-14','2027-05-14','2027-08-14']);
  expect(result.items.filter(item=>item.review_id==='demo_initech_canonical_review_asset-inventory').map(item=>item.date))
    .toEqual(['2027-04-02','2027-10-02']);
  for(const key of ['software-support','vulnerability-remediation','secure-development']){
    const parent=db.reviews.find(review=>review.framework_plan_key===key);
    expect(result.items.filter(item=>item.review_id===parent.review_id)).toHaveLength(12);
  }
  const terminal=new Set(result.excluded_terminal_parents.map(parent=>parent.review_id));
  expect(result.items.some(item=>terminal.has(item.review_id))).toBe(false);
  expect(JSON.stringify(result)).not.toMatch(/occurrence_id|completion_date|completed_at/);
  if(process.env.CIS_REBUILD_AUDIT_OUTPUT){
    const fs=require('fs'),path=require('path');fs.mkdirSync(process.env.CIS_REBUILD_AUDIT_OUTPUT,{recursive:true});
    fs.writeFileSync(path.join(process.env.CIS_REBUILD_AUDIT_OUTPUT,'INITECH-FORECAST.json'),JSON.stringify(result,null,2)+'\n');
    fs.writeFileSync(path.join(process.env.CIS_REBUILD_AUDIT_OUTPUT,'INITECH-FORECAST.csv'),canonicalReviewForecastCsv(result));
  }
});
