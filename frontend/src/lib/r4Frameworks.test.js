import {activeDefinitions,activePlans,frameworkCatalog} from './frameworks';
import {cmmcRequirementPresentation,validateCmmcConfiguration} from './cmmcScope';
import {genericGuidedResult,genericGuidedVersion,validateGenericCompletion} from './genericGuidedAssessment';
import {r4FrameworkSource} from './r4FrameworkSource';
import {demoCurrentPositions} from '../preview/portfolioReporting';

test('CIS scope is cumulative and CMMC child checks retain their FAR parent context',()=>{
  expect([1,2,3].map(implementation_group=>activeDefinitions('cis-ig1',{implementation_group}).length)).toEqual([56,130,153]);
  const children=activeDefinitions('cmmc',{level:1});
  expect(children).toHaveLength(17);
  expect(new Set(children.map(item=>item.level_one_parent)).size).toBe(15);
  expect(children.filter(item=>item.level_one_parent==='ix').map(item=>item.id)).toEqual(['3.10.3','3.10.4','3.10.5']);
  const media=children.find(item=>item.id==='3.8.3'),raw=media.source_text;
  expect(cmmcRequirementPresentation(media,{level:1}).title).toContain('FCI');
  expect(cmmcRequirementPresentation(media,{level:1}).title).not.toContain('CUI');
  expect(cmmcRequirementPresentation(media,{level:2}).text).toBe(raw);
  expect(media.source_text).toBe(raw);
  expect(activeDefinitions('cmmc',{level:2})).toHaveLength(110);
  expect(activePlans('cmmc',{level:1}).flatMap(plan=>plan.safeguards).every(id=>children.some(item=>item.id===id))).toBe(true);
});

test('new tracked HIPAA children preserve native scope and dependency records',()=>{
  const definitions=frameworkCatalog('hipaa').requirements;
  expect(definitions).toHaveLength(81);
  expect(definitions.filter(item=>item.parent_assessment_id)).toHaveLength(5);
  expect(['164.302','164.105','164.530'].every(id=>definitions.some(item=>item.id===id))).toBe(true);
  const child=definitions.find(item=>item.id==='164.314(a)(2)(i)');
  expect(child.parent_assessment_id).toBe('164.314(a)(1)');
  expect(r4FrameworkSource('hipaa',child).qualification).toContain('not independent obligations');
});

test('uncertain guided answers produce confirmation items without fabricated gaps',()=>{
  const answers={practice:'Not sure',implementation:'Unconfirmed scope',gap:'Not sure',unknown:'Yes',unknown_reason:'Ask the accountable person'};
  const result=genericGuidedResult('GV.OC-01',answers,genericGuidedVersion('nist-csf-2'));
  expect(result.status).toBe('not_assessed');expect(result.gaps).toEqual([]);
  expect(result.unknowns).toContain('Ask the accountable person');
  expect(result.signals.every(signal=>signal.kind==='verification')).toBe(true);
  expect(()=>validateGenericCompletion('GV.OC-01',{...answers,unknown_reason:'  '},genericGuidedVersion('nist-csf-2'))).toThrow();
});

test('catalog source panels preserve qualification and strict level validation',()=>{
  const iso=frameworkCatalog('iso-27001').requirements[0],soc=frameworkCatalog('soc-2').requirements[0];
  expect(r4FrameworkSource('iso-27001',iso).qualification).toContain('not the complete clause/control');
  const licensed={...iso,official_text_mode:'LICENSED_TEXT',official_text:'Authorized fixture wording'};
  expect(r4FrameworkSource('iso-27001',licensed).text).toBe(licensed.official_text);
  expect(r4FrameworkSource('soc-2',soc).qualification).toContain('reports may contain exceptions');
  expect(()=>validateCmmcConfiguration({client_id:'a',level:3})).toThrow();
  expect(()=>validateCmmcConfiguration({client_id:'a',level:true})).toThrow();
  expect(validateCmmcConfiguration({client_id:'a',level:1,expected_updated_at:null})).toEqual({level:1});
});

test('native Demo CMMC positions retain the level and actual scope-save time',()=>{
  const client={client_id:'new-cmmc-client',onboarding_baseline:{completed:true},framework_settings:{cmmc:{level:1}},cmmc_configuration_updated_at:'2026-11-19T00:00:00Z'};
  const db={clients:[client],requirements:[{client_id:client.client_id,requirement_id:'cmmc-enrollment',baseline_key:'cmmc',baseline_response:'applies'}],
    framework_assessments:activeDefinitions('cmmc',{level:2}).map(definition=>({client_id:client.client_id,framework_key:'cmmc',framework_assessment_id:'assessment-'+definition.id,definition_id:definition.id,framework_version:frameworkCatalog('cmmc').version,status:'not_assessed'}))};
  const before=JSON.stringify(db),one=demoCurrentPositions(db,[client],'2026-11-20T00:00:00Z')[0];
  expect(one.program_label).toBe('CMMC Level 1');expect(one.current.scope.configuration).toEqual({level:1});
  expect(one.current.denominator).toBe(17);expect(one.current.provenance.source_as_of).toBe(new Date(client.cmmc_configuration_updated_at).toISOString());
  expect(JSON.stringify(db)).toBe(before);
  client.framework_settings.cmmc.level=2;
  const two=demoCurrentPositions(db,[client],'2026-11-20T00:00:00Z')[0];
  expect(two.current.denominator).toBe(110);expect(two.current.scope.configuration).toEqual({level:2});
  expect(two.program_id).toBe(one.program_id);
});
