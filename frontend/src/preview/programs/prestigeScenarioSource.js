import {clientProfileRequest} from '../clientProfile';
import {write} from '../store';

const CID = 'demo_prestige';
const copy = value => JSON.parse(JSON.stringify(value));

// Reconcile fictional context before native guided tokens capture that context.
export function preparePrestigeScenarioSource(source, {purpose} = {}) {
  const client = source?.clients?.find(row => row.client_id === CID);
  if (purpose !== 'eight_year_source_qa' || source.user?.workspace_mode !== 'demo'
    || !['super_admin', 'platform_admin'].includes(source.user.role)
    || client?.environment !== 'Demo' || client.status !== 'active')
    throw new Error('Use an authorized canonical Prestige Demo source.');
  const db = copy(source), current = () => db.clients.find(row => row.client_id === CID);
  const context = 'DEMO - SYNTHETIC DATA. Eight-year media licensing and technology program, 2018-11-02 through 2026-11-02. Security, Availability and Confidentiality are the selected SOC 2 scope. Internal readiness is not certification or an independent auditor opinion.';
  clientProfileRequest(db, CID, 'patch', {section: 'organization', values: {notes: context},
    expected_updated_at: current().updated_at ?? null});
  clientProfileRequest(db, CID, 'patch', {section: 'technical', values: {
    identity: ['Okta'], productivity: ['Google Workspace'], cloud: ['AWS']},
    expected_updated_at: current().updated_at ?? null});
  clientProfileRequest(db, CID, 'patch', {section: 'security', values: {
    disaster_recovery: 'Implemented', restoration: 'Implemented', ai_governance: 'Partial'},
    expected_updated_at: current().updated_at ?? null});
  write(db, 'clients', {notes: context}, CID);
  return {source: db, backup: copy(source), context_changes: [
    'Replace year-two description with explicit fictional eight-year interval',
    'Reconcile identity/productivity/cloud with the approved Okta/Google Workspace/AWS story',
    'Report the documented full-service recovery state; AI approvals remain separate and incomplete',
  ]};
}

export function createPrestigeScenarioAssets(candidate, {purpose} = {}) {
  if (purpose !== 'eight_year_assets_source_qa' || candidate?.clientId !== CID
    || candidate.manifest?.client_id !== CID || candidate.db.user?.workspace_mode !== 'demo'
    || candidate.db.user.status !== 'active' || !['super_admin', 'platform_admin'].includes(candidate.db.user.role)
    || candidate.db.assets.some(row => row.client_id === CID))
    throw new Error('Create the fictional systems only on an empty current-model asset slice.');
  const result = copy(candidate), assetIds = {};
  const systems = [
    ['portal', 'Licensing portal and customer delivery APIs', 'application', 'critical'],
    ['data', 'AWS media objects, rights metadata and search index', 'database', 'critical'],
    ['identity', 'Okta workforce identity and direct-account removal routes', 'saas', 'high'],
    ['delivery', 'GitHub delivery pipeline and change approvals', 'saas', 'high'],
    ['endpoints', 'Managed creative and engineering endpoints', 'workstation', 'high'],
    ['recovery', 'Secondary backup and complete-service recovery workflow', 'application', 'critical'],
  ];
  for (const [key, name, asset_type, criticality] of systems) {
    const row = write(result.db, 'assets', {client_id: CID, name, asset_type, criticality,
      owner_id: 'demo_prestige_user_2', status: 'active', location: 'Fictional Prestige service boundary'});
    assetIds[key] = row.asset_id;
  }
  return {...result, assetManifest: {client_id: CID, asset_ids: assetIds,
    provenance: 'New fictional current system records; historical adoption is documented separately.'}};
}
