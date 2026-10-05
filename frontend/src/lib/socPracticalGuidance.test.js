import {createHash} from 'crypto';
import guidance from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import catalog from '@catalogs/soc2.json';

test('versioned shared practical guidance covers every supported criterion without activating categories',()=>{
 const expected=catalog.requirements.map(c=>c.id);
 expect(Object.keys(guidance.criteria).sort()).toEqual(expected.sort());
 expect(guidance.version).toBe('soc-guidance-v3');
 expect(guidance.practical_provenance).toEqual({summary:'criterion_summary',review:'assessment_guidance',evidence:'evidence_examples',outcome:'assessment_guidance',operational:'operational_guidance',enhanced:'enhanced_assurance'});
 const seen=[];
 for(const [id,entry] of Object.entries(guidance.criteria)){
  expect(entry.source_reference).toBe(id);
  expect(entry.practical.summary).toBeTruthy();
  for(const key of ['review','evidence','outcome','operational','enhanced']){
   expect(Array.isArray(entry.practical[key])).toBe(true);
   if(key!=='enhanced')expect(entry.practical[key].length).toBeGreaterThan(0);
   for(const text of entry.practical[key]){
    expect(text.trim()).toBe(text);expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/demo_prestige|Prestige Worldwide|upload (a|the|your)|SOC 2 (requires|mandates) (annual|quarterly|monthly)|auditor (will|must) (pass|approve)/i);
    seen.push(text);
   }
  }
 }
 // Shared explanatory context belongs once in context, not cloned per criterion.
 expect(new Set(seen).size).toBe(seen.length);
 expect(Object.values(guidance.criteria).some(c=>!c.practical.enhanced.length)).toBe(true);
});

test('legacy checkbox definitions stay byte-for-byte equivalent in meaning and stable IDs',()=>{
 const items=Object.fromEntries(Object.entries(guidance.criteria).map(([id,entry])=>[id,entry.items.filter(item=>!item.id.includes('-assessment-'))]).filter(([,items])=>items.length));
 expect(createHash('sha256').update(JSON.stringify(items)).digest('hex')).toBe('a7cffdb6268068f90be2b0497a0b7c0e9522f0bd405d4ff937cdc7038c080f0a');
});

test('context separates client obligations, Type 2 operation and unresolved gaps from suggestions',()=>{
 expect(guidance.context.obligations).toMatch(/not optional/);
 expect(guidance.context.obligations).toMatch(/frequencies/);
 expect(guidance.context.type2).toMatch(/across the review period/);
 expect(guidance.context.type2).toMatch(/policy or screenshot alone/);
 expect(guidance.context.evidence).toMatch(/MSP\/MSSP/);
 expect(guidance.context.gaps).toMatch(/does not establish/);
});
