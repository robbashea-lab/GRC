import {loadCompleteDemoWork,selectDemoWork,demoWorkSummary} from './brawndoDemoWork';
const row=(i,extra={})=>({key:`tasks:${i}`,id:String(i),kind:'tasks',title:`Work ${i}`,owner:'Alex',status:'open',due_date:'2026-10-15',...extra});
test('loads every bounded page and finds distant search and sort extremes',async()=>{
 const rows=Array.from({length:205},(_,i)=>row(i));rows[204]=row(204,{title:'Unique safeguard 1.1',due_date:'2020-01-01'});
 const load=jest.fn(async(key,offset,signal,{limit})=>({items:rows.slice(offset,offset+limit),offset,limit,total:rows.length,has_more:offset+limit<rows.length}));
 const all=await loadCompleteDemoWork(load,new AbortController().signal);expect(load).toHaveBeenCalledTimes(3);expect(selectDemoWork(all,{search:'Unique'})).toEqual([rows[204]]);expect(selectDemoWork(all)[0]).toBe(rows[204]);
});
test('rejects incomplete, duplicate and aborted cohorts',async()=>{
 const page={items:[row(1)],offset:0,limit:100,total:2,has_more:false};
 await expect(loadCompleteDemoWork(async()=>page,new AbortController().signal)).rejects.toThrow('incomplete');
 await expect(loadCompleteDemoWork(async()=>({...page,items:[row(1),row(1)]}),new AbortController().signal)).rejects.toThrow('duplicate');
 const controller=new AbortController();controller.abort();await expect(loadCompleteDemoWork(async()=>page,controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
test('UTC boundaries, authoritative framework keys and search intersect',()=>{
 const rows=[row(1,{due_date:'2026-10-14'}),row(2),row(3,{due_date:'2026-11-14',source_label:'CIS 1.1'}),row(4,{due_date:'2026-11-15'}),row(5,{due_date:'invalid'})];
 expect(selectDemoWork(rows,{filter:'due30',asOf:'2026-10-15'}).map(r=>r.id)).toEqual(['2','3']);
 expect(selectDemoWork(rows,{search:'CIS 1.1',frameworkKeys:new Set(['tasks:3']),filter:'due30',asOf:'2026-10-15'})).toEqual([rows[2]]);
 expect(selectDemoWork(rows,{filter:'pastDue',asOf:'2026-10-15'})).toEqual([rows[0]]);
});
test('five sorts keep missing values last',()=>{
 const rows=[row(2,{title:'Zebra',owner:'Zoe',status:'upcoming',due_date:'2026-10-16'}),row(1,{title:'Alpha',owner:'Amy',status:'in_progress'}),row(3,{title:'',owner:'Unassigned',unassigned:true,status:'unknown',due_date:null})];
 for(const sort of ['due','title','owner','status'])expect(selectDemoWork(rows,{sort}).map(r=>r.id)).toEqual(['1','2','3']);
 expect(selectDemoWork(rows,{sort:'due-desc'}).map(r=>r.id)).toEqual(['2','1','3']);
});
test('summary distinguishes native workflow and lateness and missing deadlines',()=>{
 expect(demoWorkSummary([row(1,{status:'in_progress',due_date:'2026-10-10'}),row(2,{status:'remediated',unassigned:true,due_date:null})],'2026-10-15')).toEqual({all:'1 in progress · 1 awaiting validation',pastDue:'Oldest 5 days past due',due30:'Nothing due in 30 days',unassigned:'No known due dates'});
});

test('Dashboard can format summary deadline labels without changing native date or default callers',()=>{
 const items=[row(1,{unassigned:true,due_date:'2026-10-16'})],format=jest.fn(value=>`Readable ${value}`);
 const summary=demoWorkSummary(items,'2026-10-15',format);
 expect(summary.due30).toBe('Next due Readable 2026-10-16');expect(summary.unassigned).toBe('Earliest due Readable 2026-10-16');
 expect(items[0].due_date).toBe('2026-10-16');expect(format).toHaveBeenCalledWith('2026-10-16');
 expect(demoWorkSummary(items,'2026-10-15').due30).not.toContain('Readable');
});
