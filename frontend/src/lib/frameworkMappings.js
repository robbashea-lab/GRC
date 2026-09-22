import data from './frameworkMappings.json';
export const mappingsFor=(framework,definition)=>data.mappings.filter(m=>[m.source,m.target].some(r=>r.framework===framework&&r.definition===definition)).map(m=>({...m,other:m.source.framework===framework&&m.source.definition===definition?m.target:m.source}));
