// Seeded history must follow the Review's anchor whatever today's date is.
const DATES=['2026-09-30','2026-10-02','2026-11-28','2027-03-01','2027-02-28'];
test.each(DATES)('seeded Brawndo occurrences chain on the Review anchor when today is %s',day=>{
  jest.useFakeTimers({doNotFake:['performance','nextTick','queueMicrotask']});jest.setSystemTime(new Date(day+'T14:00:00Z'));
  jest.isolateModules(()=>{
    sessionStorage.clear();localStorage.clear();
    const {seedStore}=require('./store');
    for(const r of seedStore().reviews.filter(r=>r.client_id==='demo_brawndo'&&r.occurrences?.length&&['monthly','quarterly','semiannual','annual'].includes(r.recurrence))){
      const chain=[...r.occurrences.map(o=>o.due_date.slice(0,10)),r.due_date.slice(0,10)];
      r.occurrences.forEach((o,i)=>{if(o.next_review_date)expect([r.review_id,o.next_review_date.slice(0,10)]).toEqual([r.review_id,chain[i+1]]);});
    }
  });
  jest.useRealTimers();
});
