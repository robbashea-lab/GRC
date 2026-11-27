import {aiProjection} from './aiGovernance';
import {screeningScope} from './aiOnboarding';
import {annualDate,blankDraft,applyTool,tools,questions,refreshProposal,updateDraft,snapshot,confirmed,onboardingPayload,proposalFor} from './aiOnboarding';

const acknowledge=draft=>({...draft,confirmations:Object.fromEntries(['details','screening','risk'].map(step=>[step,snapshot(draft,step)]))});
test('annual review uses calendar years including leap-day clamping',()=>{
  expect(annualDate('2024-02-29')).toBe('2025-02-28');
  expect(annualDate('2026-12-31')).toBe('2027-12-31');
});
test('all ten reviewed tools preserve the exact ten reviewed answers',()=>{
  expect(tools).toHaveLength(10);
  tools.forEach((tool,index)=>{
    const draft=applyTool(blankDraft('2026-10-25'),index);
    expect(draft.name).toBe(tool.name);
    expect(questions.map(question=>draft.answers[question.id])).toEqual(tool.answers.map(value=>value==='Not sure'?null:value==='Yes'));
    expect(onboardingPayload('client-a',acknowledge(draft)).ai.catalog_key).toBe(draft.catalog_key);
  });
});
test('meaningful changes permanently clear downstream acknowledgments; set order does not',()=>{
  const original=acknowledge(applyTool(blankDraft(),0));
  const reordered=updateDraft(original,{data_types:[...original.data_types].reverse()});
  expect(['details','screening','risk'].every(step=>confirmed(reordered,step))).toBe(true);
  const changed=updateDraft(original,{name:'Changed'});
  const restored=updateDraft(changed,{name:original.name});
  expect(['details','screening','risk'].every(step=>!confirmed(restored,step))).toBe(true);
  const answer=updateDraft(original,{answers:{...original.answers,managed:!original.answers.managed}});
  expect(confirmed(answer,'details')).toBe(true);
  expect(confirmed(answer,'screening')).toBe(false);
  expect(confirmed(answer,'risk')).toBe(false);
});
test('uncertainty remains Unrated; reset preserves edited scenario and clears user rating',()=>{
  let draft=applyTool(blankDraft(),0);
  draft=updateDraft(draft,{answers:{...draft.answers,managed:null}});
  expect(proposalFor(draft)).toMatchObject({likelihood:null,impact:null});
  draft=refreshProposal({...draft,riskTextTouched:true,riskOverride:true,rationaleTouched:true,risk:{title:'Specific scenario',description:'Saved description',likelihood:4,impact:5,rationale:'Human rationale'}});
  const reset=updateDraft(draft,{riskOverride:false,rationaleTouched:false});
  expect(reset.risk).toMatchObject({title:'Specific scenario',description:'Saved description',likelihood:null,impact:null});
});
test('final payload rejects missing confirmations and sensitive-data contradictions',()=>{
  const draft=applyTool(blankDraft(),0);
  expect(()=>onboardingPayload('a',draft)).toThrow(/three steps/);
  const invalid=acknowledge(updateDraft(draft,{data_types:['No Sensitive Data','PII']}));
  expect(()=>onboardingPayload('a',invalid)).toThrow(/cannot be combined/);
});

test('native alerts use versioned answers while retaining legacy classifications and records',()=>{
  const row={ai_system_id:'ai',client_id:'a',status:'active',purposes:['Document Drafting'],data_types:['Public'],screening:{consequential:false,sensitive:false,third_party:true}};
  row.onboarding_screening={schema_version:1,catalog_version:'2026-10-25',scope:screeningScope(row),answers:{consequential:true,sensitive:true}};
  const alerts=value=>aiProjection(value).alerts.map(alert=>alert.key);
  expect(alerts(row)).toEqual(expect.arrayContaining(['oversight','sensitive','vendor']));
  const reviewed={...row,screening:{...row.screening,consequential:true,sensitive:true},onboarding_screening:{...row.onboarding_screening,answers:{consequential:false,sensitive:false}}};
  expect(alerts(reviewed)).not.toContain('oversight');expect(alerts(reviewed)).not.toContain('sensitive');
  expect(alerts(reviewed)).toContain('vendor');
  expect(alerts({...reviewed,screening:{...reviewed.screening,employment:true}})).toContain('oversight');
  expect(alerts({...reviewed,purposes:['HR / Employment']})).toContain('oversight');
  expect(alerts({...reviewed,onboarding_screening:undefined})).toEqual(expect.arrayContaining(['oversight','sensitive','vendor']));
  expect(alerts({...reviewed,onboarding_screening:{...reviewed.onboarding_screening,schema_version:2}})).toEqual(expect.arrayContaining(['oversight','sensitive','screening']));
});
