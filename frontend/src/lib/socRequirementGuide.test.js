import catalog from '@catalogs/soc2.json';
import guide from '@catalogs/operatorGuidance/socRequirementGuide.json';
import practical from '@catalogs/operatorGuidance/socAssessmentGuidance.json';
import {GUIDE_QUESTIONS} from '../components/RequirementGuide';

test('every supported assessable TSC has exactly five tailored static answers',()=>{
 expect(guide.framework).toBe('soc-2');
 expect(guide.framework_version).toBe(catalog.version);
 expect(guide.revision).toBe('soc-requirement-guide-v1');
 expect(Object.keys(guide.requirements).sort()).toEqual(catalog.requirements.map(r=>r.id).sort());
 expect(catalog.requirements).toHaveLength(61);
 const answers=[];
 for(const [id,item] of Object.entries(guide.requirements)){
  expect(Object.keys(item)).toEqual(GUIDE_QUESTIONS.map(([key])=>key));
  expect(practical.criteria[id].source_reference).toBe(id);
  expect(practical.criteria[id].source_page).toBeGreaterThan(0);
  for(const text of Object.values(item)){
   expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(15);
   expect(text.split(/\s+/).length).toBeLessThanOrEqual(90);
   expect(text).not.toMatch(/demo_prestige|Prestige Worldwide|upload (your|a|the)|SOC 2 (requires|mandates) (annual|monthly|quarterly)|auditor (will|must) (approve|pass)/i);
   answers.push(text);
  }
 }
 expect(answers).toHaveLength(305);
 expect(new Set(answers).size).toBe(305);
});
test('guide provenance separates authored help from official text and unsupported prescriptions',()=>{
 expect(guide.classification).toBe('operational_guidance');
 expect(guide.source.wording).toMatch(/not verbatim/);
 expect(guide.source.url).toMatch(/^https:\/\/www\.aicpa-cima\.com\//);
 expect(guide.requirements['CC7.5'].gaps).toMatch(/without Availability/);
 expect(guide.requirements['P6.1'].plain).toMatch(/explicit consent before/);
 expect(guide.requirements['P6.7'].plain).toMatch(/held and its disclosures/);
 expect(guide.requirements['P6.4'].evidence).toMatch(/not prescribe/);
});
