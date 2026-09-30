import data from './operatorGuidance/cisAssessmentCriteria.json';
import catalog from './cisIG1.json';

test('all 56 safeguards have distinct, source-traceable criteria without legacy tier ids',()=>{
  expect(Object.keys(data.requirements)).toEqual(catalog.requirements.map(r=>r.id));
  expect(catalog.requirements).toHaveLength(56);
  let count=0;
  for(const r of catalog.requirements){
    const entry=data.requirements[r.id],url=new URL(entry.source);
    expect(url.origin).toBe('https://cas.docs.cisecurity.org');
    expect(url.pathname).toBe('/en/latest/source/Controls'+r.control+'/');
    expect(url.hash.startsWith('#'+r.id.replace('.','')+'-')).toBe(true);
    expect(entry.criteria.length).toBeGreaterThan(0);
    expect(new Set(entry.criteria.map(c=>c.id)).size).toBe(entry.criteria.length);
    for(const c of entry.criteria){
      expect(c.id).toMatch(new RegExp('^'+r.id.replace('.','\\.')+'-c[1-9]$'));
      expect(c.text).not.toMatch(/stronger practice|maturity|foundation tier|operational tier/i);
      count++;
    }
  }
  expect(count).toBe(85);
});
