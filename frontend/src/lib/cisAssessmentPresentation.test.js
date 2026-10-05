import presentation from '@catalogs/operatorGuidance/cisAssessmentPresentation.json';
import criteria from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import catalog from '@catalogs/cisIG1.json';

test('all cumulative safeguard presentations use verified requirement links and explicit source timing only',()=>{
 expect(presentation.version).toBe(catalog.version);
 expect(Object.keys(presentation.requirements)).toEqual(catalog.requirements.map(r=>r.id));
 let triggers=0;
 for(const r of catalog.requirements){
  const item=presentation.requirements[r.id];
  expect(Object.keys(item)).toEqual(['trigger','source']);
  expect(item.source).toBe(criteria.requirements[r.id].source);
  const url=new URL(item.source);
  expect(url.origin).toBe('https://cas.docs.cisecurity.org');
  expect(url.pathname).toBe(`/en/latest/source/Controls${r.control}/`);
  expect(url.hash).toMatch(new RegExp('^#'+r.id.replace('.','')+'-'));
  if(item.trigger){
   triggers++;
   expect(item.trigger).not.toMatch(/recommended|suggested|Omnisciente|CAS|no fixed|no numeric|governance meeting|interpret/i);
  } else expect(item.trigger).toBeNull();
 }
 expect(triggers).toBe(76);
});

test('operation, review, inactivity, retention and event timing remain distinct',()=>{
 const trigger=id=>presentation.requirements[id].trigger;
 expect(trigger('1.1')).toMatch(/Review and update.*six months/);
 expect(trigger('1.3')).toMatch(/Execute active discovery daily/);
 expect(trigger('3.4')).toMatch(/Retain.*minimum and maximum.*documented/);
 expect(trigger('4.3')).toMatch(/inactivity.*15 minutes.*two minutes/);
 expect(trigger('5.3')).toMatch(/45 days of inactivity.*where supported/);
 expect(trigger('8.10')).toMatch(/Retain.*90 days/);
 expect(trigger('14.1')).toMatch(/Train at hire.*annually.*review and update content annually/);
 expect(trigger('15.5')).toBe('Reassess service providers annually, at minimum, or with new and renewed contracts.');
 expect(trigger('16.12')).toMatch(/within the application lifecycle/);
 expect(trigger('16.14')).toMatch(/before code is created/);
 expect(trigger('18.1')).toMatch(/Define.*frequency.*enterprise testing program/);
 expect(trigger('18.4')).toMatch(/after each penetration test.*if deemed necessary/);
 for(const id of ['2.4','3.6','5.2','8.3','8.12','13.7','14.9','15.6','16.13'])expect(trigger(id)).toBeNull();
});
