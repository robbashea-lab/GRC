import reviewed from './aiOnboardingCatalog.json';
import catalog from './aiGovernanceCatalog.json';

export const ONBOARDING_VERSION = 1;
export const questions = reviewed.questions;
export const tools = reviewed.tools;
export const catalogKeys = ['chatgpt','m365','claude','gemini','ghcopilot','cstudio','perplexity','zoomai','agentforce','grammarly'];
export const groups = [
  {key:'purposes', label:'Used for', values:catalog.purposes},
  {key:'data_types', label:'Data it can see', values:catalog.data_types},
  {key:'permitted_data_types', label:'Permitted data', values:catalog.data_types},
  {key:'access', label:'Access', values:catalog.access},
];
const sensitive = ['Confidential','Highly Confidential','PII','PHI','Financial','Customer Data','Employee Data','Credentials','Source Code / IP','Production Data'];
const canonicalSet = values => [...new Set(values)].sort();
export function screeningScope(row) {
  return {...Object.fromEntries(['provider','environment','description','restrictions'].map(key=>[key,row[key]||''])),vendor_id:row.vendor_id||null,
    ...Object.fromEntries(['purposes','data_types','permitted_data_types','access'].map(key=>[key,canonicalSet(row[key]||[])]))};
}
export const screeningStale=row=>!!row.onboarding_screening&&(!row.onboarding_screening.scope||row.onboarding_screening.schema_version!==1||row.onboarding_screening.catalog_version!==reviewed.reviewedOn||JSON.stringify(screeningScope(row.onboarding_screening.scope))!==JSON.stringify(screeningScope(row)));
export const screeningReviewSnapshot=row=>JSON.stringify([screeningScope(row),questions.map(question=>row.onboarding_screening?.answers?.[question.id]??null)]);
export function screeningDataError(row) {
  return [row.data_types||[],row.permitted_data_types||[]].some(values=>values.includes('No Sensitive Data')&&values.some(value=>sensitive.includes(value))) ? 'No Sensitive Data cannot be combined with confidential, personal or other sensitive classifications. Review the data selections.' : '';
}
export function screeningReviewPayload(row) {
  const error=screeningDataError(row);if(error)throw new Error(error);
  return {schema_version:1,catalog_version:reviewed.reviewedOn,answers:{...row.onboarding_screening.answers},reviewed:true};
}
export function reviewedScreening(old,candidate,input,actor,at) {
  const error=screeningDataError(candidate);if(error)throw new Error(error);
  const saved=old?.onboarding_screening;
  if(!saved||saved.schema_version!==1||saved.catalog_version!==reviewed.reviewedOn)throw new Error('This record retains its original native screening questionnaire');
  if(!input||Object.keys(input).sort().join(',')!=='answers,catalog_version,reviewed,schema_version'||input.schema_version!==1||input.catalog_version!==reviewed.reviewedOn||input.reviewed!==true||!input.answers||Object.keys(input.answers).sort().join(',')!==questions.map(question=>question.id).sort().join(',')||Object.values(input.answers).some(value=>value!==null&&typeof value!=='boolean'))throw new Error('Confirm the reviewed ten-question screening for this deployment');
  const {history,...previous}=saved;
  return {...saved,schema_version:1,catalog_version:reviewed.reviewedOn,answers:{...input.answers},scope:screeningScope(candidate),reviewed_at:at,reviewed_by:actor,history:[...(history||[]),previous]};
}

export function annualDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  const last = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return `${year + 1}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}

export function blankDraft(today = new Date().toISOString().slice(0,10)) {
  return {
    catalog_key:null, name:'', provider:'', environment:'', description:'', owner_id:null,
    purposes:[], data_types:[], permitted_data_types:[], access:[], restrictions:'',
    answers:Object.fromEntries(questions.map(q => [q.id,null])),
    vendor:{mode:'none',id:null,expected_updated_at:null,name:'',service:'',owner_id:null},
    creationDate:today, risk:{title:'',description:'',likelihood:null,impact:null,rationale:''},
    riskTextTouched:false, riskOverride:false, rationaleTouched:false, overrideRationaleEdited:false,
    confirmations:{details:null,screening:null,risk:null},
  };
}

export function applyTool(previous, index) {
  const draft = blankDraft(previous.creationDate);
  draft.owner_id = previous.owner_id;
  const tool = tools[index];
  if (tool) Object.assign(draft, {
    catalog_key:catalogKeys[index], name:tool.name, provider:tool.provider,
    environment:tool.plan, description:tool.purpose,
    purposes:[...tool.uses], data_types:[...tool.data], permitted_data_types:[...tool.permitted], access:[...tool.access],
    answers:Object.fromEntries(questions.map((q,i) => [q.id,tool.answers[i]==='Not sure'?null:tool.answers[i]==='Yes'])),
    vendor:{...draft.vendor,name:tool.provider,service:tool.name},
  });
  return refreshProposal(draft);
}

export function proposalFor(draft) {
  const preset = tools[catalogKeys.indexOf(draft.catalog_key)];
  const a = draft.answers, data = canonicalSet(draft.data_types), access = canonicalSet(draft.access);
  let likelihood = preset?.baselineLikelihood || 2, impact = preset?.baselineImpact || 2;
  const factors = [`Use-profile baseline: likelihood ${likelihood} × impact ${impact}.`];
  if (questions.some(q => typeof a[q.id] !== 'boolean')) return {
    likelihood:null, impact:null,
    factors:['One or more screening answers need clarification. A numerical proposal is withheld until context is established.'],
    rationale:'The selected use profile and screening contain uncertainty. Review the unresolved context before assigning likelihood and impact. A human override remains possible with a documented rationale.',
  };
  if (a.sensitive || a.external || data.some(x => sensitive.slice(0,8).includes(x))) {
    impact = Math.max(impact,3); factors.push('Sensitive information or customer/operational reliance raises proposed impact to at least 3.');
  }
  if (a.writes || a.consequential || a.harm || access.includes('Privileged Access')) {
    impact = Math.max(impact,4); factors.push('Production writes, privileged access, consequential decisions or material harm raises proposed impact to at least 4.');
  }
  if (!a.managed || !a.oversight || !a.settings) {
    likelihood = Math.max(likelihood,3); factors.push('An unmanaged account, absent important-output validation or settings not yet reviewed raises proposed likelihood to at least 3.');
  }
  if (a.autonomous || access.includes('Autonomous Action Capability')) {
    if (a.writes || access.includes('Privileged Access')) {
      likelihood = Math.max(likelihood,4); factors.push('Autonomous actions combined with production changes raises proposed likelihood to at least 4.');
    } else {
      likelihood = Math.max(likelihood,3); factors.push('Unattended actions raise proposed likelihood to at least 3.');
    }
  }
  return {likelihood,impact,factors,rationale:`Proposed assessment for ${draft.name||'this AI system'}, used for ${(draft.description||'the documented use').trim().replace(/[.!?]+$/,'')}. ${factors.join(' ')} Data exposure selected: ${data.length?data.join(', '):'not specified'}. Access selected: ${access.length?access.join(', '):'none'}. This is an illustrative product proposal based on the reviewed answers, not a provider certification or a standards-mandated score.`};
}

export function refreshProposal(draft) {
  const proposal = proposalFor(draft), risk = {...draft.risk};
  if (!draft.riskTextTouched) {
    risk.title = `AI data exposure and inaccurate output — ${draft.name||'new AI system'}`;
    risk.description = `Use of ${draft.name||'this AI system'} for ${(draft.description||'its intended business purpose').trim().replace(/[.!?]+$/,'')} may expose information, introduce inaccurate outputs or create service dependency. Selected data exposure: ${canonicalSet(draft.data_types).join(', ')||'not specified'}. Permitted data: ${canonicalSet(draft.permitted_data_types).join(', ')||'not yet defined'}. Access: ${canonicalSet(draft.access).join(', ')||'none selected'}. Confirm the actual deployment and operating boundaries for this client.`;
  }
  if (!draft.riskOverride) Object.assign(risk,{likelihood:proposal.likelihood,impact:proposal.impact});
  if (!draft.rationaleTouched) risk.rationale = proposal.rationale;
  return {...draft,risk,proposal};
}

export function attentionFor(row) {
  const a = row.answers || row.onboarding_screening?.answers;
  if (!a) return {tier:row.risk_tier ? row.risk_tier[0].toUpperCase()+row.risk_tier.slice(1) : 'Needs assessment',text:'Saved screening answers'};
  if(!row.answers&&screeningStale(row))return {tier:'Needs assessment',text:'The saved screening predates a material change. Reassess the current deployment.'};
  if (questions.some(q => typeof a[q.id] !== 'boolean')) return {tier:'Needs assessment',text:'The screening contains uncertainty. Clarify it or document why the linked risk remains unrated.'};
  const access = row.access || [], data = row.data_types || [];
  if (a.writes || a.autonomous || a.consequential || a.harm || access.some(x => ['Privileged Access','Autonomous Action Capability'].includes(x))) return {tier:'High',text:'The selected use or enabled access includes an elevated governance trigger. Review any mismatch below. This is separate from the risk’s likelihood × impact score.'};
  if (a.sensitive || a.connected || a.external || !a.managed || !a.oversight || !a.settings || data.some(x => sensitive.includes(x)) || access.length) return {tier:'Moderate',text:'Selected data exposure, connected access, operational reliance or settings requiring review need governance attention, even if a screening answer says No.'};
  return {tier:'Low',text:'The bounded use has no elevated screening trigger in these answers or selected data/access. Review the separate linked risk before adding the system.'};
}

export function governanceAnswers(row) {
  const saved=row.onboarding_screening;
  return saved?.schema_version===1&&saved.catalog_version===reviewed.reviewedOn ? saved.answers||{} : row.screening||{};
}
export function onboardingProjection(row) {
  if(!row.onboarding_screening)return null;
  const tier=attentionFor(row).tier;
  return {risk_tier:tier==='Needs assessment'?null:tier.toLowerCase(),screening_complete:tier!=='Needs assessment',screening_version:'onboarding-1',screening_requires_reassessment:screeningStale(row)};
}

export function mismatches(draft) {
  const a = draft.answers, access = draft.access, warnings = [];
  if (draft.data_types.some(x => sensitive.includes(x)) && a.sensitive === false) warnings.push('Data exposure includes a sensitive classification, but screening says no sensitive information. Confirm the actual exposure and adjust the selections or answer.');
  if (access.some(x => ['API / Integration Access','Production System Access','Privileged Access'].includes(x)) && a.connected === false) warnings.push('System or integration access is selected, but the connected-access answer is No. Review the actual enabled access.');
  if (access.includes('Autonomous Action Capability') && a.autonomous === false) warnings.push('Autonomous action capability is selected, but screening says actions require approval. Confirm the actual capability and operating restriction.');
  if (access.includes('Privileged Access') && a.writes === false) warnings.push('Privileged access is selected. Confirm whether it can change production systems or permissions before keeping the production-change answer at No.');
  return warnings;
}

export function detailSnapshot(draft) {
  return {...Object.fromEntries(['catalog_key','name','provider','environment','description','owner_id','restrictions'].map(k => [k,draft[k]])),
    ...Object.fromEntries(groups.map(g => [g.key,canonicalSet(draft[g.key])])), vendor:{...draft.vendor}};
}
export function snapshot(draft, step) {
  if (step === 'details') return JSON.stringify(detailSnapshot(draft));
  if (step === 'screening') return JSON.stringify([detailSnapshot(draft),questions.map(q => draft.answers[q.id])]);
  return JSON.stringify([detailSnapshot(draft),questions.map(q => draft.answers[q.id]),draft.risk,draft.riskOverride]);
}
export const confirmed = (draft, step) => draft.confirmations[step] === snapshot(draft,step);

export function updateDraft(previous, patch) {
  const next=refreshProposal({...previous,...patch,confirmations:{...previous.confirmations}});
  for(const step of ['details','screening','risk']) {
    if(snapshot(previous,step)!==snapshot(next,step))next.confirmations[step]=null;
  }
  return next;
}

export function detailsError(draft) {
  if (screeningDataError(draft)) return screeningDataError(draft);
  if (!draft.name.trim() || !draft.description.trim()) return 'Enter the system name and documented business use before continuing.';
  if (draft.vendor.mode === 'link' && !draft.vendor.id) return 'Choose the existing vendor to link.';
  if (draft.vendor.mode === 'create' && (!draft.vendor.name.trim() || !draft.vendor.service.trim())) return 'Enter the vendor name and service before continuing.';
  return '';
}

export function riskError(draft) {
  const r = draft.risk;
  if (!r.title.trim() || !r.description.trim() || !r.rationale.trim()) return 'Keep the risk title, description and assessment rationale documented.';
  if (draft.riskOverride && (!r.likelihood || !r.impact)) return 'Choose both likelihood and impact for the user-entered rating, or use the proposal.';
  if (draft.riskOverride && (r.likelihood !== draft.proposal.likelihood || r.impact !== draft.proposal.impact) && !draft.overrideRationaleEdited) return 'Explain the user-entered rating in the assessment rationale after changing likelihood or impact.';
  return '';
}

export function onboardingPayload(clientId, draft) {
  const error = detailsError(draft) || riskError(draft);
  if (error) throw new Error(error);
  if (!['details','screening','risk'].every(step => confirmed(draft,step))) throw new Error('Review all three steps before adding this AI system.');
  const {vendor,...ai} = detailSnapshot(draft);
  return {client_id:clientId,ai,screening:{schema_version:ONBOARDING_VERSION,catalog_version:reviewed.reviewedOn,answers:{...draft.answers}},
    vendor,risk:{...draft.risk,override:draft.riskOverride},confirmations:{details:true,screening:true,risk:true}};
}
