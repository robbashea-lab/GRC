import {fixtureFingerprint} from '../cisDemoHistoryContext';
import {stable} from '../commandRequests';

const CID = 'demo_prestige', PROGRAM = CID + ':soc-2', ANCHOR = '2026-11-02T00:00:00.000Z';
export const prestigeHistoryFingerprint = value => fixtureFingerprint(stable(value));
const fingerprint = prestigeHistoryFingerprint;
export function prestigeHistoricalSources(db) {
  return (db.framework_assessments || []).filter(row => row.client_id === CID && row.framework_key === 'soc-2')
    .map(row => ({id: row.framework_assessment_id, definition_id: row.definition_id,
      history: (row.assessment_history || []).filter(event => event.provenance === 'newly_authored_synthetic_history')}))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// An explicit qualified import only. No interpolation or post-anchor continuity is inferred.
function preparedPoints(db, at) {
  const marker = db.prestige_eight_year_fixture, receipt = marker?.history;
  const client = db.clients?.find(row => row.client_id === CID);
  if (db.user?.workspace_mode !== 'demo' || client?.environment !== 'Demo'
    || client.demo_program_version !== 'prestige-eight-year-v1'
    || marker?.version !== 'prestige-eight-year-v1' || receipt?.fingerprint_format !== 'stable-json-v1'
    || !Number.isFinite(Date.parse(at)) || at < ANCHOR || !Array.isArray(receipt.point_ids)
    || receipt.point_ids.length !== 8 || new Set(receipt.point_ids).size !== 8
    || fingerprint(prestigeHistoricalSources(db)) !== receipt.source_fingerprint) return null;
  const snapshots = [];
  for (const id of receipt.point_ids) {
    const matches = (db.portfolio_reporting?.snapshots || []).filter(row => row.snapshot_id === id);
    const point = matches[0];
    if (matches.length !== 1 || point.client_id !== CID || point.program_id !== PROGRAM
      || point.framework_key !== 'soc-2' || point.effective_at > ANCHOR || point.captured_at > ANCHOR
      || point.observation_kind !== 'demo_fixture'
      || fingerprint(point) !== receipt.point_fingerprints[id]) return null;
    snapshots.push(point);
  }
  return {receipt, snapshots};
}

export function getPrestigeDemoScenarioContext(db, clientId, at) {
  if (clientId !== CID) return null;
  const prepared = preparedPoints(db, at);
  return prepared ? {version: 'prestige-eight-year-v1', client_id: CID, program_id: PROGRAM,
    anchor: ANCHOR, point_ids: [...prepared.receipt.point_ids]} : null;
}

export function qualifiedPrestigePreparedHistory(db, at) {
  const prepared = preparedPoints(db, at);
  if (!prepared) return null;
  const {receipt, snapshots} = prepared;
  const identities = (db.portfolio_reporting?.identities || []).filter(row => row.program_id === PROGRAM);
  if (identities.length !== 1 || fingerprint(identities[0]) !== receipt.identity_fingerprint) return null;
  return {program_id: PROGRAM, snapshots, identities};
}
