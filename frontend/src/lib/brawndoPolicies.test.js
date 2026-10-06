import {policyStatus,policyAlignment,policyStatusLabel,nextPolicyReview,policyColumns,policyTiles} from './brawndoPolicies';
import {cis} from './frameworks';
import {tableColumns} from './tableColumns';
import {applyTableFilters} from './tableFilters';
test('legacy states remain distinct and approval is never inferred',()=>{
  expect(policyStatus({status:'draft',presence:'reported_missing'})).toBe('needs_creation');
  expect(policyStatus({status:'approved'})).toBe('needs_verification');
  expect(policyStatus({status:'approved',approved_at:'2024-01-01'})).toBe('approved');
  expect(policyStatus({status:'retired',presence:'reported_existing'})).toBe('retired');
  expect(policyStatus({status:'approved',presence:'not_applicable'})).toBe('not_applicable');
  expect(policyStatus({status:'in_review',approval_request_id:'request'})).toBe('pending_approval');
  expect(policyStatus({status:'in_review'})).toBe('in_review');
  expect(policyStatusLabel('not_applicable')).toBe('Previously excluded');
});
test('only catalog references in the applicable IG are presented as supporting mappings',()=>{
  const refs=policyAlignment({baseline_key:'policy-configuration-management-policy'},['cis-ig1']);
  expect(refs.map(r=>r.id)).toEqual(['4.1','4.2']); // Both are IG1 in the authoritative CIS v8.1 source.
  expect(policyAlignment({baseline_key:'policy-information-security-policy'},['cis-ig1']).map(r=>r.id)).toEqual(['8.1']);
  expect(policyAlignment({client_id:'c',policy_id:'p'},['cis-ig1'],[{client_id:'c',framework_key:'cis-ig1',definition_id:'8.4',related_links:[{kind:'policies',id:'p'}]}]).map(r=>r.id)).toEqual(['8.4']);
  expect(refs.every(r=>r.relation==='Supports')).toBe(true);
  expect(policyAlignment({title:'Access Control Policy'},['cis-ig1'])).toEqual([]);
  expect(policyAlignment({baseline_key:'policy-configuration-management-policy'},[])).toEqual([]);
  const policy={client_id:'c',policy_id:'p'},assessment={client_id:'c',framework_key:'cis-ig1',definition_id:'4.1',related_links:[{kind:'policies',id:'p'}]};
  expect(policyAlignment(policy,['cis-ig1'],[assessment]).map(r=>r.id)).toEqual(['4.1']);
  expect(policyAlignment(policy,['cis-ig1'],[{...assessment,client_id:'other'}])).toEqual([]);
});
test('annual calendar dates clamp leap day and preserve authorized cadence',()=>{
  expect(nextPolicyReview('2024-02-29')).toBe('2025-02-28');
  expect(nextPolicyReview('2025-04-15','quarterly')).toBe('2025-07-15');
  expect(nextPolicyReview('2025-04-15','none')).toBeNull();
});
test('status filters use presented state and undated values sort last in either direction',()=>{
  const rows=[{policy_id:'a',status:'in_review',approval_request_id:'r',next_review_date:'2026-01-01'},{policy_id:'b',status:'draft',next_review_date:null},{policy_id:'c',status:'draft',next_review_date:'2027-01-01'}];
  const columns=policyColumns(tableColumns('policies',{rows}),rows,[]);
  expect(columns.filter(c=>['title','alignment','status','owner_id','next_review_date','last_reviewed_at'].includes(c.key)).map(c=>c.key)).toEqual(['title','alignment','status','owner_id','next_review_date','last_reviewed_at']);
  expect(applyTableFilters(rows,columns,{filters:{status:['pending_approval']}}).map(r=>r.policy_id)).toEqual(['a']);
  for(const dir of ['asc','desc'])expect(applyTableFilters(rows,columns,{filters:{},sort:{key:'next_review_date',dir}}).at(-1).policy_id).toBe('b');
  expect(columns.find(c=>c.key==='status').sortable).toBe(false);
});


test.each([1,2,3])('policy labels, filters and tiles follow configured IG%i',group=>{
  const row={client_id:'c',policy_id:'p',baseline_key:'policy-information-security-policy'};
  // Retained higher-group records must not override a lower configured scope.
  const assessments=cis.requirements.map(d=>({client_id:'c',framework_key:'cis-ig1',definition_id:d.id,related_links:[]}));
  expect(policyAlignment(row,['cis-ig1'],assessments,group).every(a=>a.label===`CIS IG${group}`)).toBe(true);
  const columns=policyColumns(tableColumns('policies',{rows:[row]}),[row],['cis-ig1'],assessments,group);
  expect(columns.find(c=>c.key==='alignment').value(row)).toBe(`Supports CIS IG${group}`);
  expect(applyTableFilters([row],columns,{filters:{alignment:[`Supports CIS IG${group}`]}})).toEqual([row]);
  expect(applyTableFilters([row],columns,{filters:{alignment:[`Supports CIS IG${group===3?2:3}`]}})).toEqual([]);
  expect(policyTiles([row],['cis-ig1'],assessments,new Date(),group).find(t=>t.id==='mapped')).toMatchObject({label:`Mapped to CIS IG${group}`,count:1});
  const active=assessments.filter(a=>cis.requirements.find(d=>d.id===a.definition_id).implementation_group<=group);
  expect(policyAlignment(row,['cis-ig1'],active).every(a=>a.label===`CIS IG${group}`)).toBe(true);
  const linked={...row,baseline_key:undefined};
  const ig3={client_id:'c',framework_key:'cis-ig1',definition_id:'17.9',related_links:[{kind:'policies',id:'p'}]};
  expect(policyAlignment(linked,['cis-ig1'],[ig3],group).map(a=>a.id)).toEqual(group===3?['17.9']:[]);
  expect(policyAlignment(row,['cis-ig1'],[{...ig3,client_id:'foreign'}]).every(a=>a.label==='CIS IG1')).toBe(true);
});
