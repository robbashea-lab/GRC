import data from '@catalogs/operatorGuidance/cisAssessmentCriteria.json';
import catalog from '@catalogs/cisIG1.json';
import audit from '../../../docs/cis-assessment-layout-source-audit.json';

test('all 153 safeguards have distinct source-only checks and preserve historical assertion identities',()=>{
  expect(Object.keys(data.requirements)).toEqual(catalog.requirements.map(r=>r.id));
  expect(catalog.requirements).toHaveLength(153);
  let count=0;
  for(const r of catalog.requirements){
    const entry=data.requirements[r.id],url=new URL(entry.source);
    expect(url.origin).toBe('https://cas.docs.cisecurity.org');
    expect(url.pathname).toBe('/en/latest/source/Controls'+r.control+'/');
    expect(url.hash.startsWith('#'+r.id.replace('.','')+'-')).toBe(true);
    expect(entry.criteria.length).toBeGreaterThan(0);
    const all=[...entry.criteria,...(entry.legacy_criteria||[])];
    expect(new Set(all.map(c=>c.id)).size).toBe(all.length);
    expect(all.length).toBeLessThanOrEqual(20);
    for(const c of all){
      expect(c.id).toMatch(new RegExp('^'+r.id.replace('.','\\.')+'-c[1-9][0-9]*$'));
    }
    for(const c of entry.criteria){
      expect(c.text).not.toMatch(/stronger practice|foundation tier|operational tier/i);
      if(r.id!=='18.1')expect(c.text).not.toMatch(/maturity/i);
      expect(c.text).not.toMatch(/Confirm coverage and resolve|No fixed|No separate numeric|select .*schedule|existing .*records|safe .*test results|upload|CAS|Omnisciente/);
      count++;
    }
    for(const historical of audit.requirements[r.id].historical_criteria){
      expect(all.some(c=>c.id===historical.id)).toBe(true);
      const legacy=entry.legacy_criteria?.find(c=>c.id===historical.id);
      if(legacy)expect(legacy.text).toBe(historical.text);
    }
  }
  expect(count).toBe(480);
});

const text=id=>data.requirements[id].criteria.map(c=>c.text).join(' ');
test.each([
 ['1.3',/active discovery tool.*configured.*daily/i],['1.4',/all DHCP servers.*logs.*weekly/i],
 ['2.4',/tools.*discovery.*when possible.*documentation/i],['2.7',/authorized scripts.*blocked.*six months/i],
 ['3.11',/encrypted.*servers.*encrypted.*applications.*encrypted.*databases/i],['4.10',/supported.*20.*10/i],
 ['5.5',/department owner.*review date.*purpose.*quarterly/i],['8.4',/where supported.*at least two synchronized/i],
 ['8.6',/appropriate.*supported/i],['8.9',/to the extent possible.*documented/i],
 ['9.5',/DMARC.*SPF.*DKIM/i],['12.5',/authentication.*authorization.*auditing/i],
 ['13.5',/anti-malware.*configuration.*operating systems.*applications/i],
 ['16.2',/External entities.*responsible parties.*intake.*remediation testing.*severity.*metrics/i],
 ['16.10',/Least privilege.*every user operation.*untrusted.*attack surface/i],
 ['16.11',/vetted.*standardized.*currently accepted.*extensively reviewed/i],
 ['18.1',/size.*complexity.*industry.*maturity.*scope.*frequency.*limitations.*contact.*remediation.*retrospective/i],
])('%s preserves distinct source obligations and conditional scope',(id,pattern)=>expect(text(id)).toMatch(pattern));

test('examples and evaluator tasks are not mandatory checklist assertions',()=>{
 expect(text('5.2')).not.toMatch(/8.character|14.character/);
 expect(text('9.7')).not.toMatch(/sandbox|attachment scanning/);
 expect(text('13.9')).not.toMatch(/user.*authentication|device.*authentication/);
 expect(text('15.5')).toMatch(/annually at minimum, or with new and renewed contracts/);
 expect(text('15.5')).not.toMatch(/annually at minimum, and with/);
 expect(text('16.13')).not.toMatch(/annual|critical.*require|critical.*must/);
 expect(text('17.7')).not.toMatch(/track.*improvements/);
});

test('independently satisfiable inventory and process attributes have independent checks',()=>{
 const items=id=>data.requirements[id].criteria.map(c=>c.text);
 for(const field of ['hardware address','machine name','enterprise asset owner','department']){
  const matches=items('1.1').filter(t=>t.includes(field));
  expect(matches).toHaveLength(1);
  for(const other of ['hardware address','machine name','enterprise asset owner','department'].filter(x=>x!==field))expect(matches[0]).not.toContain(other);
 }
 for(const field of ['title','publisher','initial install/use date','business purpose'])expect(items('2.1').filter(t=>t.includes(field))).toHaveLength(1);
 for(const field of ['event source','date','username','timestamp','source addresses','destination addresses'])expect(items('8.5').filter(t=>t===`Logs include ${field}.`)).toHaveLength(1);
 expect(items('7.5')).toContain('Authenticated internal vulnerability scans are conducted.');
 expect(items('7.5')).toContain('Unauthenticated internal vulnerability scans are conducted.');
 expect(data.requirements['1.1'].legacy_criteria.find(c=>c.id==='1.1-c3').text).toBe('Records identify static network address, hardware address, machine name, owner, department and connection approval.');
});

test('workbook authority keeps mandatory obligations complete without promoting optional implementations',()=>{
 expect(text('7.1')).toMatch(/process is established and maintained.*reviewed and updated annually, or when significant enterprise changes/);
 expect(data.requirements['7.1'].legacy_criteria).toEqual(expect.arrayContaining([
  {id:'7.1-c1',text:'Enterprise assets are covered by a documented vulnerability-management process.'},
  {id:'7.1-c2',text:'Documentation is reviewed annually and after relevant significant changes.'}
 ]));
 expect(data.requirements['4.12'].criteria.map(c=>c.id)).toEqual(['4.12-c1']);
 expect(data.requirements['4.12'].legacy_criteria).toEqual(expect.arrayContaining([
  {id:'4.12-c4',text:'Enterprise applications are separated from personal applications.'},
  {id:'4.12-c5',text:'Enterprise data is separated from personal data.'}
 ]));
 expect(text('3.7')).not.toMatch(/data is classified/);
 expect(data.requirements['3.7'].legacy_criteria).toContainEqual({id:'3.7-c5',text:'Enterprise data is classified according to the scheme.'});
 expect(text('11.1')).toMatch(/scope.*prioriti.*backup-data security.*reviewed and updated/i);
 expect(text('11.1')).not.toMatch(/detailed backup procedures/);
 expect(text('12.2')).toMatch(/designed and maintained.*segmentation.*least privilege.*availability/i);
 expect(text('17.5')).toMatch(/legal.*IT.*information-security.*facilities.*public-relations.*HR.*incident responders.*analysts/);
 expect(text('17.5')).not.toMatch(/third parties/);
});
