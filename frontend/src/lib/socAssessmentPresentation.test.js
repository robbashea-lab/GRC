import catalog from '@catalogs/soc2.json';
import guidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import presentation from '@catalogs/operatorGuidance/socAssessmentPresentation.json';

test('every supported SOC criterion has stable criterion-only checks supported by existing persistence',()=>{
 const ids=catalog.requirements.map(row=>row.id).sort();
 expect(Object.keys(presentation.criteria).sort()).toEqual(ids);
 const seen=new Set();
 for(const id of ids){
  const entry=guidance.criteria[id];
  expect(entry.assessment_criteria.length).toBeGreaterThan(0);
  for(const [index,item] of entry.assessment_criteria.entries()){
   expect(item.id).toBe(`${id}-assessment-v1-${index+1}`);
   expect(item.text.trim()).toBe(item.text);
   expect(seen.has(item.id)).toBe(false);seen.add(item.id);
   expect(entry.items.find(existing=>existing.id===item.id)).toEqual({...item,tier:'criterion_requirements',source_type:'criterion',source_reference:id});
  }
  // Every historical and new response can coexist below the API selection limit.
  expect(entry.items.length).toBeLessThanOrEqual(30);
  expect(new Set(entry.items.map(item=>item.id)).size).toBe(entry.items.length);
  expect(presentation.criteria[id].source).toBe(guidance.source.document_url);
  expect(presentation.criteria[id].trigger===null||typeof presentation.criteria[id].trigger==='string').toBe(true);
 }
 expect(seen.size).toBe(148);
});

test('source presentation preserves explicit timing without inventing numeric cadences',()=>{
 expect(presentation.criteria['P6.4'].trigger).toMatch(/periodically and as needed/);
 expect(presentation.criteria['P3.2'].trigger).toMatch(/before collecting/);
 expect(presentation.criteria['P6.1'].trigger).toMatch(/before third-party disclosure/);
 expect(presentation.criteria['P6.7'].trigger).toMatch(/on request/);
 expect(presentation.criteria['A1.3'].trigger).toBeNull();
 expect(presentation.criteria['P4.2'].trigger).toBeNull();
 for(const row of Object.values(presentation.criteria))expect(row.trigger||'').not.toMatch(/annually|quarterly|monthly|weekly|six months/i);
});
