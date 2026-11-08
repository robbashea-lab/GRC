import {captureDemoReporting} from '../portfolioReporting';
import {prestigeHistoricalSources, prestigeHistoryFingerprint as fingerprint} from './prestigePreparedHistory';

const CID = 'demo_prestige', PROGRAM = CID + ':soc-2';
const copy = value => JSON.parse(JSON.stringify(value));

// Project authored native assessment-history entries through the existing calculation.
export function createPrestigeReportingHistory(candidate) {
  const rows = candidate.db.framework_assessments.filter(row => row.client_id === CID && row.framework_key === 'soc-2');
  const histories = rows.map(row => (row.assessment_history || [])
    .filter(event => event.provenance === 'newly_authored_synthetic_history'));
  if (rows.length !== 38 || histories.some(history => history.length !== 8))
    throw new Error('Prestige reporting requires all eight authored positions for every scoped criterion.');
  const dates = histories[0].map(event => event.at);
  if (histories.some(history => history.some((event, index) => event.at !== dates[index]))
    || dates.some((at, index) => !Number.isFinite(Date.parse(at)) || at > candidate.anchor || index && at <= dates[index - 1]))
    throw new Error('Prestige historical positions must share ordered, bounded source dates.');
  let previous = null, projection;
  const authored = [];
  for (const [index, at] of dates.entries()) {
    // Each explicitly authored year is a point, including a maintained posture with no status change.
    // Keep native scope/source identity lineage; do not pretend these points were observed save events.
    const previousPoint = previous ? {...previous,
      portfolio_reporting: {...previous.portfolio_reporting, snapshots: []}} : null;
    projection = {...candidate.db, clients: candidate.db.clients.filter(row => row.client_id === CID),
      framework_assessments: rows.map((row, n) => ({...row, ...histories[n][index],
        framework_assessment_id: row.framework_assessment_id, client_id: CID, framework_key: 'soc-2',
        definition_id: row.definition_id, last_saved: at, last_assessed: at, created_at: dates[0]})),
      portfolio_reporting: previousPoint ? copy(previousPoint.portfolio_reporting) : {}};
    captureDemoReporting(projection, previousPoint, at);
    authored.push(...projection.portfolio_reporting.snapshots.filter(row => row.program_id === PROGRAM));
    previous = projection;
  }
  const snapshots = authored
    .map(point => {
      const current = {...point.current};
      for (const key of ['effective_until', 'continuity_proven', 'continuity_source_event']) delete current[key];
      return {...point, observation_kind: 'demo_fixture', recorded_at: candidate.historyManifest.recorded_at,
      current: {...current, observation_kind: 'demo_fixture', provenance: {...current.provenance,
        kind: 'demo_fixture', label: 'New fictional historical positions against the unchanged 2017 criteria.',
        framework_context: point.effective_at < '2023-01-16T00:00:00.000Z'
          ? '2017 Trust Services Criteria; revised 2022 Points of Focus are not asserted for this period.'
          : '2017 Trust Services Criteria; management adopted the revised 2022 Points of Focus on 2023-01-16.',
        assessment_boundary: 'Current questionnaire answers were not executed or backdated into these fictional positions.'}}};
    });
  if (snapshots.length !== 8) throw new Error('Every authored historical position must produce one native snapshot.');
  const identities = projection.portfolio_reporting.identities.filter(row => row.program_id === PROGRAM);
  const db = {...candidate.db, portfolio_reporting: {...candidate.db.portfolio_reporting,
    snapshots: [...(candidate.db.portfolio_reporting?.snapshots || []).filter(row => row.program_id !== PROGRAM), ...snapshots],
    identities: [...(candidate.db.portfolio_reporting?.identities || []).filter(row => row.program_id !== PROGRAM), ...identities]}};
  const receipt = {fingerprint_format: 'stable-json-v1', point_ids: snapshots.map(row => row.snapshot_id),
    source_fingerprint: fingerprint(prestigeHistoricalSources(db)),
    point_fingerprints: Object.fromEntries(snapshots.map(row => [row.snapshot_id, fingerprint(row)])),
    identity_fingerprint: fingerprint(identities[0]),
    measure: 'Existing native implementation calculation, derived from authored assessment-history statuses.',
    limits: 'No interpolation, independent chart constants, historical questionnaire answers or post-anchor continuity.'};
  return {...candidate, db, reportingManifest: receipt};
}
