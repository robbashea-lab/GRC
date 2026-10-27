import {cisClientProgram,cisIdentityEligible,cisNativeClientRoute} from './cisExperience';
import {frameworkCatalog} from './frameworks';

export const SHARED_CLIENT_ROUTES = Object.freeze([
  '/dashboard','/calendar','/reviews','/action-items','/risks','/policies','/vendors','/ai-governance',
]);
const TARGET_FRAMEWORKS = ['iso-27001','soc-2'];
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
export const sharedClientRoute = pathname => SHARED_CLIENT_ROUTES.includes(pathname);
export const sharedNativeClientRoute = pathname => cisNativeClientRoute(pathname)
  || ['/compliance/iso-27001','/compliance/soc-2'].includes(pathname);

// Appearance reads finalized native enrollment; it neither enrolls clients nor grants access.
export function sharedClientPrograms(client) {
  if (!client?.client_id) return [];
  const cis = cisClientProgram(client);
  const programs = cis ? [{...cis,configuration:{implementation_group:cis.implementationGroup}}] : [];
  const projected = Object.hasOwn(client,'shared_programs');
  if (projected && !Array.isArray(client.shared_programs)) return programs;
  const settings = client.framework_settings;
  if (settings !== undefined && !object(settings)) return programs;
  for (const frameworkKey of TARGET_FRAMEWORKS) {
    const catalog = frameworkCatalog(frameworkKey),programId=`${client.client_id}:${frameworkKey}`;
    if (projected) {
      const matches=client.shared_programs.filter(program=>program?.framework_key===frameworkKey);
      if (matches.length!==1) continue;
      const program=matches[0];
      if (!object(program) || program.selected!==true || program.client_id!==client.client_id
        || program.program_id!==programId || program.version!==catalog.version) continue;
    } else {
      // Compatibility for unprojected internal fixtures, never an editable onboarding draft.
      const baseline=client.onboarding_baseline;
      if (baseline?.completed!==true || baseline.requirements?.[frameworkKey]!=='applies') continue;
    }
    const saved=settings?.[frameworkKey];
    if (saved!==undefined && !object(saved)) continue;
    const configuration=frameworkKey==='soc-2'?{categories:['security'],...saved}:{...saved};
    if (frameworkKey==='soc-2' && (!Array.isArray(configuration.categories)
      || !configuration.categories.includes('security')
      || new Set(configuration.categories).size!==configuration.categories.length
      || configuration.categories.some(category=>typeof category!=='string'||!Object.hasOwn(catalog.categories,category)))) continue;
    programs.push({clientId:client.client_id,programId,frameworkKey,version:catalog.version,configuration});
  }
  return programs;
}

export const sharedExperienceEligible = context => cisIdentityEligible(context)
  && sharedClientPrograms(context.currentClient).length>0;

// Record-free chrome may survive a background refresh; loaded records retain strict identity guards.
export function sharedPresentationEligible(context) {
  const identity={...context,orgLoading:false};
  delete identity.loadedClientId;
  return sharedExperienceEligible(identity);
}
