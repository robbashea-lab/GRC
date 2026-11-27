import {CATALOGS,activeDefinitions} from './frameworks';

// Missing selection preserves historical onboarding contracts and optional choices.
export function selectedPolicies(catalog,state) {
  if(state.selected_policy_keys==null)return catalog.policies;
  const keys=state.selected_policy_keys;
  if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'||!catalog.policies.some(p=>p.key===key))||new Set(keys).size!==keys.length)
    throw new Error('Invalid policy selection.');
  return catalog.policies.filter(p=>keys.includes(p.key));
}

export function mappedPolicyKeys(state) {
  const keys=new Set();
  for(const [key,catalog] of Object.entries(CATALOGS)) {
    if(state.requirements?.[key]!=='applies')continue;
    const ids=new Set(activeDefinitions(key,state.framework_settings?.[key]).map(d=>d.id));
    for(const mapping of catalog.policy_mappings||[])if(mapping.safeguards.some(id=>ids.has(id)))keys.add(mapping.policy_key);
  }
  return [...keys];
}
