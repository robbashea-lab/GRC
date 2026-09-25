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
