import {buildFrameworkDomainProfile} from './frameworkDomainProfile';
import {frameworkDashboardFixture} from '../testUtils/frameworkDashboard';

const build=fixture=>buildFrameworkDomainProfile(fixture.source,{clientId:fixture.client.client_id,frameworkKey:fixture.source.framework.key});

test.each(['iso-27001','soc-2'])('%s radar and table read one complete native subject model without writes',framework=>{
  const fixture=frameworkDashboardFixture(framework),before=JSON.stringify(fixture.db),model=build(fixture);
  expect(model.available).toBe(true);
  expect(model.mapping.source).toContain('hierarchyPath');
  expect(model.mapping.catalogVersion).toBe(fixture.source.framework.version);
  expect(new Set(model.domains.flatMap(domain=>domain.subjectIds)).size).toBe(fixture.source.active_definition_ids.length);
  expect(model.domains.reduce((sum,domain)=>sum+domain.applicable,0)).toBe(fixture.source.implementation_position.denominator);
  expect(model.domains.reduce((sum,domain)=>sum+domain.implemented,0)).toBe(fixture.source.implementation_position.implemented);
  for(const domain of model.domains){
    expect(domain.rate).toBe(domain.applicable?domain.implemented/domain.applicable*100:null);
    expect(domain.assessmentIds).toEqual(domain.subjectIds.map(id=>fixture.source.assessments.find(row=>row.definition_id===id).framework_assessment_id));
  }
  expect(JSON.stringify(fixture.db)).toBe(before);
});

test('ISO requirements, included Annex A, exclusions and undetermined SoA remain distinct',()=>{
  const fixture=frameworkDashboardFixture();
  const controls=fixture.source.assessments.filter(row=>row.definition_id.startsWith('A.'));
  controls[0].status='addressed';controls[0].soa_applicability='excluded';
  controls[1].status='addressed';controls[1].soa_applicability='';controls[1].soa_justification='';
  fixture.refresh();const model=build(fixture);
  expect(model.available).toBe(true);
  expect(model.domains).toHaveLength(11);
  expect(model.totals.applicable).toBe(121);
  expect(model.totals.excludedIds).toEqual([controls[0].definition_id]);
  expect(model.totals.undeterminedIds).toEqual([controls[1].definition_id]);
  expect(model.domains.find(domain=>domain.id==='annex_control/A.5').subjectIds).toHaveLength(37);
  expect(model.domains.find(domain=>domain.id==='isms_clause/4').subjectIds).toEqual(['4.1','4.2','4.3','4.4']);
});

test('SOC category changes preserve native groups, exclude N/A and never invent an all-category denominator',()=>{
  const fixture=frameworkDashboardFixture('soc-2',['security','availability','confidentiality']);
  fixture.source.assessments[0].status='not_applicable';fixture.source.assessments[0].na_rationale='Synthetic valid exclusion';
  fixture.refresh();let model=build(fixture);
  expect(model.available).toBe(true);expect(model.totals.applicable).toBe(37);
  expect(model.domains).toHaveLength(11);
  expect(model.domains.map(domain=>domain.id)).toEqual(['security/CC1','security/CC2','security/CC3','security/CC4','security/CC5','security/CC6','security/CC7','security/CC8','security/CC9','availability/A1','confidentiality/C1']);
  const security=frameworkDashboardFixture('soc-2',['security']);model=build(security);
  expect(model.available).toBe(true);expect(model.totals.applicable).toBe(33);expect(model.domains).toHaveLength(9);
  expect(model.labels.needs_attention).toBe('Needs Remediation / Validation');
  expect(model.verb).toBe('addressed');
});

test('a domain with only excluded controls has no invented 100 percent',()=>{
  const fixture=frameworkDashboardFixture();
  fixture.source.assessments.filter(row=>row.definition_id.startsWith('A.6.')).forEach(row=>{row.soa_applicability='excluded';row.status='addressed';});
  fixture.refresh();const domain=build(fixture).domains.find(row=>row.id==='annex_control/A.6');
  expect(domain.applicable).toBe(0);expect(domain.implemented).toBe(0);expect(domain.rate).toBeNull();
});

test('retained SOC criteria outside selected categories stay intact and are not scored as active scope',()=>{
  const fixture=frameworkDashboardFixture('soc-2',['security']);
  const retained=frameworkDashboardFixture('soc-2',['security','availability','confidentiality','processing_integrity','privacy']);
  fixture.source.definitions=retained.source.definitions;
  fixture.source.assessments=retained.source.assessments;
  fixture.db.framework_assessments=fixture.source.assessments;
  fixture.refresh();const before=JSON.stringify(fixture.db),model=build(fixture);
  expect(model.available).toBe(true);expect(model.totals.subjectIds).toHaveLength(33);
  expect(model.domains.flatMap(domain=>domain.subjectIds).some(id=>id.startsWith('P'))).toBe(false);
  expect(fixture.source.assessments).toHaveLength(61);
  expect(JSON.stringify(fixture.db)).toBe(before);
});

test.each([
  ['foreign client',f=>{f.source.assessments[0].client_id='foreign';}],
  ['unverified enrollment type',f=>{f.source.selected='true';}],
  ['malformed definition',f=>{f.source.definitions=[null];}],
  ['malformed assessment',f=>{f.source.assessments.push(null);}],
  ['empty assessment identity',f=>{f.source.assessments[0].framework_assessment_id=' ';}],
  ['duplicate identity',f=>{f.source.assessments.push({...f.source.assessments[0]});}],
  ['wrong version',f=>{f.source.assessments[0].framework_version='old';}],
  ['missing record',f=>{f.source.assessments.pop();}],
  ['invented group',f=>{f.source.definitions=f.source.definitions.map((row,index)=>index?row:{...row,control:'invented'});}],
  ['scope mismatch',f=>{f.source.implementation_position={...f.source.implementation_position,scope:{...f.source.implementation_position.scope,definition_ids:[]}};}],
  ['count mismatch',f=>{f.source.implementation_position={...f.source.implementation_position,implemented:999};}],
])('domain rates fail closed for %s',(_name,change)=>{
  const fixture=frameworkDashboardFixture();change(fixture);
  expect(build(fixture).available).toBe(false);
  expect(build(fixture).domains).toEqual([]);
});

test('unknown and partial work keep native meaning without claiming a confirmed failure',()=>{
  const fixture=frameworkDashboardFixture('soc-2');
  const model=build(fixture),domain=model.domains[0];
  expect(domain.focusSummary.detail).toContain('needs remediation / validation');
  expect(domain.focusSummary.detail).toContain('partially addressed');
  expect(domain.focusSummary.detail).toContain('unknown, not an assessed failure');
});

test.each(['__proto__','toString',{}])('SOC rejects invalid or inherited category identifiers %j',extra=>{
  const fixture=frameworkDashboardFixture('soc-2');
  fixture.source.configuration={categories:['security',extra]};
  expect(build(fixture).available).toBe(false);
});
