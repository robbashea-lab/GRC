import {collectEvidencePages,evidenceOverview,evidenceCoverage,evidenceFileSize} from './brawndoAdditionalEvidence';
import {calendarDay} from './managementDates';

test('overview paging reads the whole authorized collection and rejects partial or changing totals',async()=>{
  const page=jest.fn(async value=>({items:value===1?[1,2]:[3],total:3,page_size:2}));
  await expect(collectEvidencePages(page)).resolves.toEqual([1,2,3]);expect(page).toHaveBeenCalledTimes(2);
  await expect(collectEvidencePages(async value=>({items:value===1?[1,2]:[],total:3,page_size:2}))).rejects.toThrow('before all records');
  await expect(collectEvidencePages(async value=>({items:[value],total:value===1?2:3,page_size:1}))).rejects.toThrow('changed while loading');
  await expect(collectEvidencePages(async()=>({items:[],total:10001,page_size:100}))).rejects.toThrow('unavailable');
  const controller=new AbortController();controller.abort();await expect(collectEvidencePages(page,{signal:controller.signal})).rejects.toThrow('cancelled');
});

test('evidence summary uses exact authorized safeguard identity, actual closed periods and valid upload days',()=>{
  const references=[{kind:'framework_assessments',id:'cis-a',available:true},{kind:'framework_assessments',id:'unavailable',available:false}];
  const files=[{created_at:'2026-10-16T12:00:00Z',references},{created_at:'2026-08-01',references},{created_at:'2026-01-01',references:[{kind:'framework_assessments',id:'not-authorized',available:true}]},{created_at:'2027-01-01'},{created_at:'bad'}];
  const framework={selected:true,configured:true,active_definition_ids:['1.1','1.2'],assessments:[{framework_key:'cis-ig1',framework_assessment_id:'cis-a',definition_id:'1.1'},{framework_key:'cis-ig1',framework_assessment_id:'cis-b',definition_id:'1.2'},{framework_key:'cis-ig1',framework_assessment_id:'retained-out-of-scope',definition_id:'1.3'},{framework_key:'hipaa',framework_assessment_id:'other'}]};
  const sets=[{periods:[{status:'completed',evidence_count:2},{status:'completed',evidence_count:0},{status:'cancelled',evidence_count:2},{status:'in_progress',evidence_count:null},{status:'completed',evidence_count:null}]}];
  expect(evidenceOverview(files,framework,sets,calendarDay('2026-10-16'))).toEqual({files:5,recent:2,safeguards:1,safeguardTotal:2,periods:1,periodTotal:2});
  expect(evidenceOverview(files,{...framework,selected:false},sets).safeguardTotal).toBe(0);
});

test('coverage retains exact occurrence identity and never calls cancelled, unknown or unobserved periods missing',()=>{
  const coverage=evidenceCoverage([{reviewId:'r',title:'Monthly check',periods:[
    {occurrence_id:'closed',status:'completed',due_date:'2026-10-01',evidence_count:1},
    {occurrence_id:'gap',status:'completed',due_date:'2026-09-01',evidence_count:0},
    {occurrence_id:'edge',status:'completed',due_date:'2025-10-16',evidence_count:1},
    {occurrence_id:'old',status:'completed',due_date:'2025-10-15',evidence_count:0},
    {occurrence_id:'cancelled',status:'cancelled',due_date:'2026-09-02',evidence_count:0},
    {occurrence_id:'unknown',status:'completed',due_date:'2026-09-03',evidence_count:null},
    {occurrence_id:'active',status:'in_progress',due_date:'2026-09-04',evidence_count:0},
    {occurrence_id:'future',status:'completed',due_date:'2026-10-17',evidence_count:0},
    {occurrence_id:'undated',status:'completed',evidence_count:0}
  ]}],calendarDay('2026-10-16'));
  expect(coverage.months).toHaveLength(13);expect(coverage.months[0].key).toBe('2025-10');expect(coverage.months.at(-1).key).toBe('2026-10');
  expect(coverage.rows[0].periods.map(p=>p.occurrence_id)).toEqual(['closed','gap','edge']);expect(coverage.rows[0].withEvidence).toBe(2);expect(coverage.rows[0].missing).toBe(true);
  expect(evidenceCoverage([{reviewId:'r',periods:[]}],calendarDay('2026-10-16')).rows[0].missing).toBe(false);
  const leap=evidenceCoverage([],calendarDay('2028-02-29'));expect(leap.months[0].key).toBe('2027-02');expect(leap.months.at(-1).key).toBe('2028-02');
});

test('file size is omitted when unavailable and preserves actual zero',()=>{
  expect(evidenceFileSize({})).toBeNull();expect(evidenceFileSize({size_bytes:0})).toBe('0 B');expect(evidenceFileSize({size_bytes:2048})).toBe('2.0 KB');expect(evidenceFileSize({size_bytes:-1})).toBeNull();
});
