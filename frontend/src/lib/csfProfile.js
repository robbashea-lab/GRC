export const EMPTY_CSF_PROFILE={target_selected:false,target_outcome:'',priority:'',gap_state:'not_evaluated',gap_notes:''};
export const CSF_GAPS={not_evaluated:'Not evaluated',gap:'Gap identified',aligned:'Aligned with target'};
export const CSF_STATUSES={not_assessed:'Not Assessed',in_progress:'Partially Achieved',addressed:'Achieved',needs_attention:'Not Achieved / Needs Validation',not_applicable:'Not Applicable'};
const PRIORITY={critical:4,high:3,medium:2,low:1};
export const prioritizeCsfGaps=rows=>[...rows].sort((a,b)=>(PRIORITY[b.csf_profile?.priority]||0)-(PRIORITY[a.csf_profile?.priority]||0)||a.definition_id.localeCompare(b.definition_id));
export function validateCsfProfile(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(EMPTY_CSF_PROFILE,k)))throw new Error('Invalid CSF profile fields');
  const p={...EMPTY_CSF_PROFILE,...value};
  if(typeof p.target_selected!=='boolean'||!['','low','medium','high','critical'].includes(p.priority)||!Object.hasOwn(CSF_GAPS,p.gap_state))throw new Error('Invalid CSF profile decision');
  for(const key of ['target_outcome','gap_notes']){if(typeof p[key]!=='string'||p[key].trim().length>4000)throw new Error('Invalid CSF profile narrative');p[key]=p[key].trim();}
  if(p.target_selected&&!p.target_outcome)throw new Error('Describe the selected target outcome');
  if(p.gap_state!=='not_evaluated'&&(!p.target_selected||!p.gap_notes))throw new Error('A gap decision requires a selected target and comparison rationale');
  return p;
}
