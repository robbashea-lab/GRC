import axios from 'axios';
import {previewAdapter} from './adapter';
import {readStore,saveStore} from './store';
import {completionExport,completionColumns} from './r4ReviewExports';

test('exports immutable occurrence facts and appended support without fabricating a legacy checklist',()=>{
  const rows=[{review_id:'retained',title:'Changed current title',occurrences:[{occurrence_id:'old',title:'=Synthetic original',
    completed_at:'2026-01-05',completed_by:null,supporting_reference:'Actual completed result',
    checklist:{required_support:['Period results']},checklist_results:[{result:'Pass',text:'Retained check'}]}]},
  {review_id:'legacy',title:'Legacy',status:'completed',completion_date:'2026-01-04',completion_snapshot:{by:null}}];
  const before=JSON.stringify(rows),csv=completionExport(rows,'2026-01-01','2026-01-05');
  expect(csv.split('\r\n')).toHaveLength(3);
  expect(csv).toContain('"\'=Synthetic original"');
  expect(csv).toContain('"Not recorded"');
  expect(csv).toContain('"Actual completed result","Period results"');
  expect(completionColumns.slice(17,19)).toEqual(['Supporting result reference','Support to record']);
  expect(JSON.stringify(rows)).toBe(before);
});

test('rejects impossible or reversed export dates and filters by actual completion day',()=>{
  for(const dates of [['2026-02-30','2026-03-01'],['2026-03-01','2026-02-01'],['2026-99-01','2026-99-02']]) {
    expect(()=>completionExport([],dates[0],dates[1])).toThrow('valid start date');
  }
  expect(completionExport([{review_id:'x',occurrences:[{occurrence_id:'outside',completed_at:'2025-12-31'}]}],
    '2026-01-01','2026-01-31').split('\r\n')).toHaveLength(1);
});

test('Demo export retains named file IDs and both tickets after current metadata changes',async()=>{
  const api=axios.create({adapter:previewAdapter});
  const text=blob=>new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);reader.readAsText(blob);
  });
  sessionStorage.clear();localStorage.clear();
  await api.post('/demo/enter');
  const occurrence={occurrence_id:'export-retained-occurrence',title:'Original completed Review',
    completed_at:'2026-05-04T10:00:00Z',completed_by:'Recorded reviewer',
    activity_setup:{recurring_ticket_number:'RECUR-42',cycle_ticket_number:'CYCLE-7'},
    evidence:[{evidence_id:'export-evidence-a',filename:'original.csv',version:1},
      {evidence_id:'export-evidence-b',filename:'original.csv',version:1}]};
  const original=JSON.stringify(occurrence),reviewId='export-history-review';
  const db=readStore();
  db.reviews.push({review_id:reviewId,client_id:'demo_brawndo',title:'Current title',occurrences:[occurrence]});
  db.evidence.push(...occurrence.evidence.map(item=>({...item,client_id:'demo_brawndo'})));
  saveStore(db);
  const params={client_id:'demo_brawndo',from_date:'2026-05-01',to_date:'2026-05-04'};
  const first=await text((await api.get('/reviews/completions/export',{params,responseType:'blob'})).data);
  expect(first).toContain('"Evidence IDs"');
  expect(first).toContain('"RECUR-42","CYCLE-7"');
  expect(first).toContain('"original.csv; original.csv","2"');
  expect(first).toContain('"export-evidence-a; export-evidence-b"');
  const changed=readStore(),review=changed.reviews.find(row=>row.review_id===reviewId);
  review.title='Later current title';
  review.activity_setup={recurring_ticket_number:'LATER-1',cycle_ticket_number:'LATER-2'};
  for(const item of changed.evidence.filter(row=>['export-evidence-a','export-evidence-b'].includes(row.evidence_id))){
    item.filename='later.csv';item.linked_type='risk';item.linked_id='later-source';
  }
  saveStore(changed);
  const repeated=await text((await api.get('/reviews/completions/export',{params,responseType:'blob'})).data);
  expect(repeated).toBe(first);
  expect(JSON.stringify(readStore().reviews.find(row=>row.review_id===reviewId).occurrences[0])).toBe(original);
});
