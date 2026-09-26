import {seedStore, ids, resetStore, readStore, saveStore} from './store';
import {portfolio} from './summaries';
import {validateVendor} from './vendors';
import {assuranceStatus} from '../lib/vendorGovernance';
import {evidenceKind} from '../lib/evidenceReferences';
import {reviewSchedule} from '../lib/reviewOccurrences';

beforeEach(()=>sessionStorage.clear());
test('canonical clients reset independently of standard session material',()=>{
  const db=seedStore();
  expect(db.clients.map(c=>c.name)).toEqual(['Brawndo','Dunder Mifflin','Prestige Worldwide']);
  db.clients.push({client_id:'test-demo-only',name:'Session mutation'});saveStore(db);
  localStorage.setItem('grc_token','test-standard-token');resetStore();
  expect(readStore().clients).toHaveLength(3);
  expect(localStorage.getItem('grc_token')).toBe('test-standard-token');localStorage.clear();
});
test('every relationship, owner and occurrence belongs to its client',()=>{
  const db=seedStore();
  for(const [kind,key] of Object.entries(ids)) {
    expect(new Set(db[kind].map(r=>r[key])).size).toBe(db[kind].length);
    for(const row of db[kind]) {
      if(row.client_id)expect(db.clients.some(c=>c.client_id===row.client_id)).toBe(true);
      for(const [related,field] of Object.entries(ids)) {
        if(related===kind||['clients','users'].includes(related)||!row[field])continue;
        expect(db[related].some(r=>r[field]===row[field]&&r.client_id===row.client_id)).toBe(true);
      }
      for(const field of ['owner_id','assignee_id','business_owner_id'])if(row[field])expect(db.users.some(u=>u.user_id===row[field]&&(u.role==='super_admin'||u.client_ids.includes(row.client_id)))).toBe(true);
      if(row.occurrence_id&&row.review_id&&kind!=='reviews') {
        const review=db.reviews.find(r=>r.review_id===row.review_id);
        expect([review.current_occurrence_id,...(review.occurrences||[]).map(o=>o.occurrence_id)]).toContain(row.occurrence_id);
      }
    }
  }
  for(const vendor of db.vendors)expect(()=>validateVendor(db,vendor,vendor)).not.toThrow();
  for(const evidence of db.evidence) {
    const kind=evidenceKind(evidence.linked_type);
    expect(db[kind].some(r=>r[ids[kind]]===evidence.linked_id&&r.client_id===evidence.client_id)).toBe(true);
  }
});
test('Year-2 portfolios have limited derived work instead of abandoned programs',()=>{
  const db=seedStore(),result=portfolio(db,false);
  // Monthly Reviews always fall due within 30 days; Brawndo carries two, hence 10 (not 8).
  for(const row of result.clients){expect(row.past_due).toBeLessThanOrEqual(4);expect(row.due_30d).toBeLessThanOrEqual(10);expect(row.unassigned).toBeLessThanOrEqual(3);expect(row.last_activity).not.toBeNull();}
  for(const key of ['past_due','critical_high_open','unassigned'])expect(result.portfolio[key]).toBe(result.clients.reduce((sum,c)=>sum+c[key],0));
  const assurance=db.vendors.flatMap(v=>v.assurance_records.map(a=>assuranceStatus(v,a)));
  expect(assurance).toEqual(expect.arrayContaining(['current','due_soon']));
  expect(db.contacts.length).toBeGreaterThan(db.users.length);
});
test('seeded recurring Review history has no silently missing periods',()=>{
  const db=seedStore(new Date('2026-09-28T14:00:00Z'));
  const recurring=db.reviews.filter(r=>['monthly','quarterly','semiannual','annual'].includes(r.recurrence)&&!['completed','cancelled'].includes(r.status)&&r.occurrences?.length);
  expect(recurring.length).toBeGreaterThan(50);
  for(const r of recurring){
    const last=[...r.occurrences].sort((a,b)=>a.due_date.localeCompare(b.due_date)).at(-1);
    // The current occurrence is the period directly after the latest completed one.
    expect({review:r.review_id,next:reviewSchedule({...r,due_date:last.due_date.slice(0,10)}).next_review_date.slice(0,10)}).toEqual({review:r.review_id,next:r.due_date.slice(0,10)});
  }
});
