import {FRAMEWORKS,frameworkDefinition} from '@/lib/frameworks';
import {mappingsFor} from '@/lib/frameworkMappings';
export default function FrameworkMappings({framework,definition}){
  const mappings=mappingsFor(framework,definition);
  if(!mappings.length)return null;
  return <section className="space-y-2" aria-label="Cross-framework support mappings"><h3 className="text-sm font-semibold">Cross-framework support</h3><p className="text-xs text-ink-secondary">Partial conceptual overlap, not equivalence. Link the same Evidence Library artifact where appropriate; each assessment remains independent.</p>{mappings.map(m=>{const d=frameworkDefinition(m.other.framework,m.other.definition);return <div key={m.other.framework+':'+m.other.definition} className="border border-line rounded p-3 text-sm"><p className="font-medium">{FRAMEWORKS.find(f=>f.key===m.other.framework)?.label} {m.other.definition} · {d?.title}</p><p className="text-xs text-ink-secondary mt-1">{m.type} · {m.notes}</p><p className="text-xs text-ink-muted mt-1">{m.provenance.publisher} · {m.provenance.researched_on}. {m.provenance.basis}</p><a className="text-link text-xs underline" href={d?.source} target="_blank" rel="noreferrer">Target source reference</a></div>;})}</section>;
}
