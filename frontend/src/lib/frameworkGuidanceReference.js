import {FRAMEWORKS,frameworkCatalog} from './frameworks';
import {cmmcRequirementPresentation} from './cmmcScope';

// Source editions describe the displayed requirement, never its interview version.
export function frameworkGuidanceReference(reference,{frameworkKey,definition,configuration}={}) {
  const catalog=frameworkCatalog(frameworkKey);
  const source=definition||catalog?.requirements?.find(item=>item.id===reference);
  const supplied=typeof reference==='string'&&reference.trim()?reference:null;
  if(!source)return supplied;
  const cmmc=frameworkKey==='cmmc'&&source.family?cmmcRequirementPresentation(source,configuration):null;
  if(supplied&&![source.id,cmmc?.id,cmmc?.practice].includes(supplied))return supplied;
  // The native CMMC adapter distinguishes mapped FAR children from retained Level 2 requirements.
  if(cmmc&&configuration?.level===1&&source.level_one_parent)
    return `CMMC Level 1 · ${cmmc.id} · ${cmmc.practice}`;
  const citation=source.source_citation;
  if(typeof citation==='string'&&/\b(?:CIS|NIST|ISO|SOC|HIPAA|CMMC|FAR|CFR)\b/i.test(citation)
    &&/(?:\bv\d|\d{4}|Rev\s*\d|CSF\s+\d|\bCFR\b|52\.204-21)/i.test(citation))return citation;
  const native=catalog?.requirements?.find(item=>item.id===source.id);
  const framework=FRAMEWORKS.find(item=>item.key===frameworkKey),version=source.version||(native&&catalog.version);
  if(!framework||!version)return supplied||source.id;
  if(cmmc)return `${framework.label} Level 2 · ${version} · ${cmmc.id} · ${cmmc.practice}`;
  const label=frameworkKey==='cis-ig1'?`CIS v${version}`
    :frameworkKey==='iso-27001'?`${framework.name}:${version}`
    :frameworkKey==='nist-csf-2'?`${framework.label.replace(` ${framework.version}`,'')} ${version}`
    :`${framework.label} ${version}`;
  return `${label} · ${source.id}`;
}
