import {buildFrameworkDomainProfile} from './frameworkDomainProfile';
import {frameworkDashboardFixture} from '../testUtils/frameworkDashboard';
import {cisWorkspace} from '../testUtils/cisExperience';
import {buildCisDomainProfile} from './cisDomainProfile';
import {cisSecurityDomainMapping} from './brawndoSecurityDomains';
import {hierarchyPath} from './frameworkWorkspace';

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

test('SOC readable display names retain all eleven native groups when every criterion is unassessed', () => {
  const fixture = frameworkDashboardFixture('soc-2', ['security', 'availability', 'confidentiality']);
  fixture.source.assessments.forEach(row => { row.status = 'not_assessed'; });
  fixture.refresh();
  const before = JSON.stringify(fixture.source), model = build(fixture);
  expect(model.available).toBe(true);
  expect(model.domains.map(domain => [domain.id, domain.name])).toEqual([
    ['security/CC1', 'Governance and accountability'],
    ['security/CC2', 'Information and communications'],
    ['security/CC3', 'Risk evaluation'],
    ['security/CC4', 'Control monitoring'],
    ['security/CC5', 'Control deployment'],
    ['security/CC6', 'Access safeguards'],
    ['security/CC7', 'System operations'],
    ['security/CC8', 'Change governance'],
    ['security/CC9', 'Risk mitigation'],
    ['availability/A1', 'Availability'],
    ['confidentiality/C1', 'Confidentiality'],
  ]);
  for (const domain of model.domains) {
    const definitions = fixture.source.definitions.filter(row => `${row.category}/${row.control}` === domain.id);
    expect(domain.name).toBe(definitions[0].control_name);
    expect(domain.subjectIds).toEqual(definitions.map(row => row.id));
    expect(domain.assessmentIds).toEqual(definitions.map(definition => fixture.source.assessments.find(row => row.definition_id === definition.id).framework_assessment_id));
    expect(domain.counts).toEqual({addressed: 0, in_progress: 0, needs_attention: 0, not_assessed: definitions.length});
    expect(domain.applicable).toBe(definitions.length); expect(domain.implemented).toBe(0); expect(domain.rate).toBe(0);
  }
  expect(model.totals.applicable).toBe(38); expect(model.totals.implemented).toBe(0);
  expect(model.totals.counts.not_assessed).toBe(38);
  expect(JSON.stringify(fixture.source)).toBe(before);
});

test.each([
  [['security', 'processing_integrity'], 10, 38],
  [['security', 'privacy'], 17, 51],
  [['security', 'availability', 'confidentiality', 'processing_integrity', 'privacy'], 20, 61],
])('SOC selected categories %j retain their canonical groups and readable titles', (categories, groups, criteria) => {
  const fixture = frameworkDashboardFixture('soc-2', categories), before = JSON.stringify(fixture.source), model = build(fixture);
  const expected = [...new Map(fixture.source.definitions.map(row => [`${row.category}/${row.control}`, row.control_name])).entries()];
  expect(model.available).toBe(true); expect(model.domains).toHaveLength(groups);
  expect(model.domains.map(domain => [domain.id, domain.name])).toEqual(expected);
  expect(model.totals.subjectIds).toHaveLength(criteria); expect(model.totals.applicable).toBe(criteria);
  expect(model.domains.flatMap(domain => domain.subjectIds)).toEqual(fixture.source.active_definition_ids);
  for (const domain of model.domains) {
    expect(domain.counts).toEqual(Object.fromEntries(['addressed', 'in_progress', 'needs_attention', 'not_assessed'].map(status => [status, fixture.source.assessments.filter(row => domain.subjectIds.includes(row.definition_id) && row.status === status).length])));
    expect(domain.rate).toBe(domain.implemented / domain.applicable * 100);
  }
  expect(model.domains.some(domain => domain.id === 'processing_integrity/PI1')).toBe(categories.includes('processing_integrity'));
  expect(model.domains.filter(domain => domain.id.startsWith('privacy/'))).toHaveLength(categories.includes('privacy') ? 8 : 0);
  expect(JSON.stringify(fixture.source)).toBe(before);
});

test.each([
  ['legacy catalog', fixture => { fixture.source.framework = {...fixture.source.framework, version: 'retained-unsupported-version'}; }],
  ['missing criterion', fixture => { fixture.source.assessments.pop(); }],
  ['missing group mapping', fixture => { fixture.source.definitions = fixture.source.definitions.filter(row => row.control !== 'CC9'); }],
  ['mismapped readable title', fixture => { fixture.source.definitions = fixture.source.definitions.map((row, index) => index ? row : {...row, control_name: 'Untrusted alternate title'}); }],
])('SOC label presentation still fails closed for %s', (_name, change) => {
  const fixture = frameworkDashboardFixture('soc-2'); change(fixture); const before = JSON.stringify(fixture.source), model = build(fixture);
  expect(model.available).toBe(false); expect(model.domains).toEqual([]); expect(model.totals).toBeNull();
  expect(JSON.stringify(fixture.source)).toBe(before);
});

test('SOC display labels leave native navigation labels and protected ISO and CIS domain models unchanged', () => {
  const iso = frameworkDashboardFixture('iso-27001'), isoBefore = build(iso);
  const cis = cisWorkspace('synthetic-protected-cis', 1), cisBefore = buildCisDomainProfile(cis, {clientId: 'synthetic-protected-cis', implementationGroup: 1});
  const soc = frameworkDashboardFixture('soc-2');
  expect(build(soc).domains[0].name).toBe('Governance and accountability');
  expect(hierarchyPath('soc-2', soc.source.definitions[0]).at(-1).label).toBe('CC1 — Governance and accountability');
  expect(isoBefore.available).toBe(true);
  expect(isoBefore.domains.map(domain => domain.name)).toEqual([...new Map(iso.source.definitions.map(row => [hierarchyPath('iso-27001', row).map(part => part.id).join('/'), hierarchyPath('iso-27001', row).at(-1).label])).values()]);
  expect(isoBefore.domains[0].name).toBe('4 — Context of the Organization');
  expect(build(iso)).toEqual(isoBefore);
  expect(cisBefore.available).toBe(true);
  expect(cisBefore.domains.map(domain => [domain.id, domain.name])).toEqual(cisSecurityDomainMapping(1).map(domain => [domain.id, domain.label]));
  expect(buildCisDomainProfile(cis, {clientId: 'synthetic-protected-cis', implementationGroup: 1})).toEqual(cisBefore);
});
