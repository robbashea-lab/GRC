import {calendarDay} from '@/lib/tableFilters';

// Framework-native context shown inside the workspace summary. Derived from the assessments and
// program configuration already loaded; it never changes a conclusion and is never an opinion.
const DAY = 86400000;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function socPeriod(configuration, today = new Date()) {
  const start = calendarDay(configuration?.period_start), end = calendarDay(configuration?.period_end);
  if (start == null || end == null || end <= start) return null;
  const now = calendarDay(today.toISOString()), length = Math.round((end - start) / DAY) + 1;
  const elapsed = Math.min(length, Math.max(0, Math.round((now - start) / DAY) + 1));
  return {start: configuration.period_start, end: configuration.period_end, length, elapsed,
    state: now < start ? 'upcoming' : now > end ? 'ended' : 'current'};
}

export function socControlExceptions(rows) {
  const seen = new Map();
  for (const row of rows) for (const c of row.management_controls || []) {
    const short = Number.isInteger(c.expected_instances) && Number.isInteger(c.collected_instances) && c.collected_instances < c.expected_instances;
    if (!seen.has(c.control_id)) seen.set(c.control_id, {operating: c.operating === 'gap' || c.design === 'gap', short});
  }
  const controls = [...seen.values()];
  return {controls: controls.length, gaps: controls.filter(c => c.operating).length, short: controls.filter(c => c.short).length};
}

export function isoPosture(rows) {
  const clauses = rows.filter(r => r.specification === 'isms_clause'), annex = rows.filter(r => r.specification === 'annex_control');
  const soa = value => annex.filter(r => (r.soa_applicability || '') === value).length;
  return {clauses: clauses.length, clausesAssessed: clauses.filter(r => r.status !== 'not_assessed').length,
    clausesConforming: clauses.filter(r => r.status === 'addressed').length,
    annex: annex.length, included: soa('included'), excluded: soa('excluded'), undetermined: soa('')};
}

export default function ProgramContext({frameworkKey, rows, configuration}) {
  if (frameworkKey === 'soc-2') {
    const period = socPeriod(configuration), exceptions = socControlExceptions(rows);
    return <div className="program-context" data-testid="soc-period">
      <p className="cis-measure-label">Observation period</p>
      <p className="text-sm">{period ? <>
        <strong>{period.start} to {period.end}</strong> · {period.state === 'current' ? `day ${period.elapsed} of ${period.length}` : period.state === 'upcoming' ? 'not started' : 'ended'}
        {' · '}{(configuration?.categories || []).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}
      </> : 'Not defined. Set the scope and observation period below.'}</p>
      <p className="text-sm text-ink-secondary">{plural(exceptions.controls, 'management control')} · {plural(exceptions.gaps, 'with a design or operating gap', 'with a design or operating gap')} · {plural(exceptions.short, 'short of expected instances', 'short of expected instances')}</p>
      <p className="cis-footnote">Internal readiness based on management's own testing. A SOC 2 report and its opinion come only from an independent CPA firm.</p>
    </div>;
  }
  if (frameworkKey === 'iso-27001') {
    const iso = isoPosture(rows);
    return <div className="program-context" data-testid="iso-posture">
      <p className="cis-measure-label">ISMS clauses and Statement of Applicability</p>
      <p className="text-sm">Clauses 4–10: <strong>{iso.clausesAssessed} of {iso.clauses}</strong> assessed · {iso.clausesConforming} implemented</p>
      <p className="text-sm">Annex A: <strong>{iso.included}</strong> included · {iso.excluded} excluded with justification · <span className={iso.undetermined ? 'text-semantic-moderate-text font-medium' : ''}>{iso.undetermined} undetermined</span></p>
      <p className="cis-footnote">Clause conformity and Annex A implementation are separate measures. Certification is an external decision, never an Omnisciente conclusion.</p>
    </div>;
  }
  return null;
}
