import {registerSignals} from './registerSignals';
import {summarize} from '@/components/RecordSummary';
import {dateMatches} from './tableFilters';
const today=new Date('2026-09-25T12:00:00Z');
const pick=(kind,id)=>registerSignals(kind,today).find(s=>s.id===id).test;
test('register signals are derived predicates over existing records',()=>{
  expect(pick('reviews','due14')({status:'upcoming',due_date:'2026-10-01'})).toBe(true);
  expect(pick('reviews','due14')({status:'completed',due_date:'2026-10-01'})).toBe(false);
  expect(pick('findings','late')({status:'open',due_date:'2026-09-01'})).toBe(true);
  expect(pick('findings','late')({status:'remediated',due_date:'2026-09-01'})).toBe(false);
  expect(pick('policies','review_overdue')({status:'approved',next_review_date:'2026-09-01'})).toBe(true);
});
test('record summary shows lineage and flags a Finding with no Action or an overdue Action',()=>{
  const f={status:'open',severity:'high',owner_id:'u',due_date:'2026-10-30',source:'CIS 1.1 · Inventory'};
  expect(summarize('findings',f,{related:{tasks:[]},today:'2026-09-25'}).attention.map(a=>a.text)).toContain('No Action Item tracks remediation of this Finding');
  const late=summarize('findings',f,{related:{tasks:[{title:'Fix',status:'open',due_date:'2026-09-01'}]},today:'2026-09-25'});
  expect(late.attention.map(a=>a.text)).toContain('Remediation Action is overdue');
  expect(late.facts.find(x=>x.label==='Origin').value).toBe('CIS 1.1 · Inventory');
  expect(summarize('reviews',{status:'upcoming',due_date:'2026-09-01'},{today:'2026-09-25'}).attention.map(a=>a.text)).toEqual(['No accountable owner assigned','Review is overdue']);
});
test('evidence older than 12 months is a distinct date range',()=>{
  expect(dateMatches('2025-08-01','older12',today)).toBe(true);
  expect(dateMatches('2026-01-01','older12',today)).toBe(false);
});
test('a System retired from its drawer leaves the critical and no-owner signals, including legacy terminated records',()=>{
  const {SCHEMAS}=require('./schemas');
  const option=SCHEMAS.assets.fields.find(f=>f.name==='status').options.find(o=>o.label==='Retired');
  expect(option.value).toBe('retired');
  for(const status of [option.value,'terminated']){
    expect(pick('assets','critical')({criticality:'critical',status})).toBe(false);
    expect(pick('assets','unowned')({status})).toBe(false);
    expect(summarize('assets',{status,criticality:'critical'},{today:'2026-09-25'}).facts.find(f=>f.label==='Status').badge).toBe(status);
  }
  expect(pick('assets','critical')({criticality:'critical',status:'active'})).toBe(true);
});

test('an open Review past its due day reads Overdue in its summary, as in the register', () => {
  const status = r => summarize('reviews', r, {today: '2036-09-29'}).facts.find(f => f.label === 'Status').badge;
  expect(status({status: 'upcoming', due_date: '2036-07-30'})).toBe('overdue');
  expect(status({status: 'upcoming', due_date: '2036-10-10'})).toBe('upcoming');
  expect(status({status: 'completed', due_date: '2036-07-30'})).toBe('completed');
  expect(status({status: 'needs_scheduling', due_date: '2036-07-30'})).toBe('needs_scheduling');
});

test('summary dates read one way, including history and renewal dates', () => {
  const facts = summarize('reviews', {status: 'upcoming', due_date: '2036-10-10', occurrences: [{completed_at: '2036-06-30T14:00:00.000Z'}]}, {today: '2036-09-29'}).facts;
  const expected = new Date('2036-06-30T12:00:00Z').toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
  expect(facts.find(f => f.label === 'Last completed').value).toBe(expected);
  expect(facts.find(f => f.label === 'Due').value).toContain(new Date('2036-10-10T12:00:00Z').toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC'}));
});
