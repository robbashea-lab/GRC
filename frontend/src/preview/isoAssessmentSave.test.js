import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY} from './store';
import criteria from '@catalogs/operatorGuidance/isoAssessmentCriteria.json';
const api=axios.create({adapter:previewAdapter});
beforeEach(async()=>{sessionStorage.clear();localStorage.clear();await api.post('/demo/enter');});
// Routine seeded controls may omit history for storage; the next save starts it without inventing entries.
test('Dunder ISO assessment without stored history saves and starts its history',async()=>{
  const ws=(await api.get('/frameworks/iso-27001',{params:{client_id:'demo_dunder'}})).data;
  const row=ws.assessments.find(a=>a.status==='addressed'&&!a.assessment_history);
  expect(row).toBeTruthy();
  const {data}=await api.patch('/framework_assessments/'+row.framework_assessment_id,{notes:'Re-confirmed in QA',expected_last_assessed:row.last_assessed??null});
  expect(data).toMatchObject({client_id:'demo_dunder',notes:'Re-confirmed in QA',status:'addressed'});
  expect(data.assessment_history).toHaveLength(1);
  expect(data.assessment_history[0]).toMatchObject({notes:'Re-confirmed in QA'});
});

test('ISO checks validate the unit, deduplicate, retain legacy selections and survive reload/history',async()=>{
  const rows=(await api.get('/frameworks/iso-27001',{params:{client_id:'demo_dunder'}})).data.assessments;
  const row=rows.find(a=>a.definition_id==='4.1'),path='/framework_assessments/'+row.framework_assessment_id;
  const selected=criteria.requirements['4.1'].criteria[0].id;
  const db=JSON.parse(sessionStorage.getItem(STORE_KEY));
  db.framework_assessments.find(a=>a.framework_assessment_id===row.framework_assessment_id).iso_assessment_checks=['retired:context'];
  sessionStorage.setItem(STORE_KEY,JSON.stringify(db));
  const saved=(await api.patch(path,{iso_assessment_checks:[selected,selected,'retired:context'],expected_last_assessed:row.last_assessed??null})).data;
  expect(saved.iso_assessment_checks).toEqual([selected,'retired:context']);
  expect(saved.assessment_history.at(-1).iso_assessment_checks).toEqual(saved.iso_assessment_checks);
  expect((await api.get(path)).data.iso_assessment_checks).toEqual(saved.iso_assessment_checks);
  await expect(api.patch(path,{iso_assessment_checks:['4.2:parties'],expected_last_assessed:saved.last_assessed})).rejects.toBeTruthy();
  await expect(api.patch(path,{iso_assessment_checks:[...Array(31)].map(()=>selected),expected_last_assessed:saved.last_assessed})).rejects.toBeTruthy();
  const pending=rows.find(a=>a.definition_id==='A.5.1');
  await expect(api.patch('/framework_assessments/'+pending.framework_assessment_id,{iso_assessment_checks:['A.5.1:invented'],expected_last_assessed:pending.last_assessed??null})).rejects.toBeTruthy();
});

test('verified ISO criteria are distinct stable identities and pending units offer no checks',()=>{
  expect(Object.keys(criteria.requirements)).toHaveLength(123);
  for(const [id,entry] of Object.entries(criteria.requirements)){
    expect(new Set(entry.criteria.map(c=>c.id)).size).toBe(entry.criteria.length);
    expect(entry.criteria.length).toBeLessThanOrEqual(30);
    expect(entry.criteria.every(c=>c.id.startsWith(id+':')&&!!c.text)).toBe(true);
    if(entry.coverage==='pending')expect(entry.criteria).toEqual([]);
    else expect(entry.source.length).toBeGreaterThan(0);
  }
});

test('every publicly available ISO unit is covered and SoA obligations remain clause-specific',()=>{
  const covered=['4.1','4.2','4.3','4.4','5.1','5.2','5.3','6.1.1','6.1.2','6.1.3','6.2','6.3'];
  expect(Object.entries(criteria.requirements).filter(([,e])=>e.coverage==='verified').map(([id])=>id)).toEqual(covered);
  expect(Object.values(criteria.requirements).filter(e=>e.coverage==='pending')).toHaveLength(111);
  for(const id of ['5.1','5.2','6.1.1','6.1.2','6.1.3','6.2']){
    expect(criteria.requirements[id].criteria.every(c=>c.source_reference.startsWith(id+' '))).toBe(true);
    expect(criteria.requirements[id].source[0].section).toBe(id);
  }
  expect(criteria.requirements['6.1.2'].criteria).toHaveLength(20);
  expect(criteria.requirements['6.1.3'].criteria.map(c=>c.id)).toEqual(['6.1.3:defined','6.1.3:applied','6.1.3:options','6.1.3:controls','6.1.3:annex-comparison','6.1.3:omissions','6.1.3:soa-controls','6.1.3:soa-inclusion','6.1.3:soa-implementation','6.1.3:soa-exclusions','6.1.3:plan','6.1.3:approval','6.1.3:acceptance','6.1.3:documented']);
  expect(criteria.requirements['6.1.3'].trigger).toBeNull();
  expect(criteria.requirements['6.1.1'].trigger).toBe('When planning the ISMS.');
  expect(criteria.requirements['6.2'].trigger).toBe('Update security objectives as appropriate.');
});

test('ISO clause subrequirements cannot be concealed in one combined response',()=>{
  expect(criteria.requirements['4.2'].criteria.map(c=>c.id)).toEqual(['4.2:parties','4.2:requirements','4.2:addressed']);
  expect(criteria.requirements['4.3'].criteria.map(c=>c.id)).toEqual(['4.3:scope','4.3:context','4.3:requirements','4.3:interfaces','4.3:documented']);
  expect(criteria.requirements['4.4'].criteria.map(c=>c.id)).toEqual(['4.4:established','4.4:implemented','4.4:maintained','4.4:improved']);
});

test('ISO source qualifiers retain purpose, prevention/reduction and appropriate treatment selection',()=>{
  const check=(unit,id)=>criteria.requirements[unit].criteria.find(c=>c.id===id).text;
  expect(check('4.1','4.1:context')).toContain('relevant to organizational purpose');
  expect(check('6.1.1','6.1.1:effects')).toContain('prevent or reduce unwanted effects');
  expect(check('6.1.3','6.1.3:options')).toBe('Appropriate treatment options are selected using risk-assessment results.');
});
