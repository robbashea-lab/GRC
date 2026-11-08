import {frameworkCatalog} from './frameworks';
import {brawndoDemoProgram} from './brawndoDemoDashboard';

// Native enrollment chooses each separate program. The work queue stays client-wide.
export function frameworkDashboardPrograms(programs, metadata, clientId) {
  return programs.flatMap(program => {
    if (program.key === 'cis-ig1') {
      const cis = brawndoDemoProgram(programs, metadata, clientId);
      return cis ? [cis] : [];
    }
    if (!['iso-27001', 'soc-2'].includes(program.key) || program.id !== `${clientId}:${program.key}`) return [];
    const source = metadata?.[program.key], catalog = frameworkCatalog(program.key);
    if (source?.selected !== true || source.framework?.key !== program.key || source.framework.version !== catalog.version
      || !Array.isArray(source.assessments) || source.assessments.some(row => !row || row.client_id !== clientId
        || row.framework_key !== program.key || row.framework_version !== catalog.version)) return [];
    const current = program.implementation_position;
    if (current && current.program_id !== program.id) return [];
    if (current?.scope && (current.scope.framework_key !== program.key || current.scope.catalog_version !== catalog.version)) return [];
    const soc = program.key === 'soc-2';
    return [{client_id:clientId, program_id:program.id, program_key:program.key, framework_key:program.key,
      program_label:program.label || catalog.label, scope_label:current?.scope_label || program.name || catalog.label,
      unit_label:soc ? 'criteria' : 'requirements and controls', noun:soc ? 'readiness' : 'implementation',
      verb:soc ? 'addressed' : 'implemented', to:`/compliance/${program.key}?client_id=${encodeURIComponent(clientId)}`,
      current}];
  });
}
