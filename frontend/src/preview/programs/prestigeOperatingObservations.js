import facts from './prestigeCurrentControlFacts.json';
import {organizationalControlRequest} from '../organizationalControls';
import {stable} from '../commandRequests';

const CID = 'demo_prestige', VERSION = 'prestige-operating-observations-v1';
const MARKER = 'prestige_operating_observations_fixture';
const copy = value => JSON.parse(JSON.stringify(value));
const fail = message => { throw new Error('Prestige operating fixture: ' + message); };
async function sha(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
const digest = value => sha(new TextEncoder().encode(stable(value)));
function withoutReceipt(db) { const result = copy(db); delete result[MARKER]; return result; }

// Substantive, immutable workpapers precede these native observations; an index is not evidence.
export async function recordPrestigeOperatingObservations(candidate, source, evidenceIds, {purpose} = {}) {
  if (purpose !== 'operating_observation_source_qa' || candidate?.clientId !== CID
    || candidate.db?.user?.workspace_mode !== 'demo' || candidate.db.user.status !== 'active'
    || candidate.manifest?.client_id !== CID || candidate.controlsManifest?.client_id !== CID
    || source?.manifest?.client_id !== CID || source.manifest.model_receipt_sha256 !== candidate.manifest.receipt_sha256)
    fail('bind the actual current model, native designs and material workpaper source.');
  const {receipt_sha256: sourceReceipt, ...sourceManifest} = source.manifest;
  if (sourceReceipt !== await digest(sourceManifest) || source.manifest.workpaper_sha256 !== await digest({
    populations: source.workpapers, sources: source.source_registry,
  }))
    fail('the material source or workpaper contents changed.');
  const result = copy(candidate), db = result.db, prior = db[MARKER];
  const inputHash = await digest({source_receipt: sourceReceipt, evidence_ids: evidenceIds});
  if (prior) {
    const {receipt_sha256: receipt, ...unsigned} = prior;
    if (receipt !== await digest(unsigned) || prior.input_sha256 !== inputHash
      || prior.state_sha256 !== await digest(withoutReceipt(db))
      || stable(candidate.operatingManifest) !== stable(prior)) fail('the operating-stage retry changed.');
    return result;
  }
  const controls = db.organizational_controls.filter(row => row.client_id === CID);
  if (controls.length !== 25 || controls.some(row => row.observations.length)
    || source.workpapers.length !== 31 || new Set(source.workpapers.map(row => row.key)).size !== 31
    || new Set(source.artifacts.map(row => row.key)).size !== source.artifacts.length)
    fail('use the fresh 25-design, 31-population stage without prior operating records.');
  if (source.workpapers.reduce((n, row) => n + row.members.length, 0) !== 256
    || source.workpapers.reduce((n, row) => n + row.members.filter(member => member.detailed).length, 0) !== 136)
    fail('retain every membership and expanded selection from the approved workpaper population.');
  const evidence = new Map();
  for (const artifact of source.artifacts) {
    const id = evidenceIds?.[artifact.key];
    const matches = db.evidence.filter(row => row.client_id === CID && row.evidence_id === id);
    const row = matches[0];
    if (matches.length !== 1 || row.filename !== artifact.filename || row.content_base64 !== artifact.content_base64
      || row.size !== artifact.decoded_file_bytes || source.manifest.artifact_sha256[artifact.key] !== artifact.sha256)
      fail('resolve the exact available native Evidence bytes for ' + artifact.key + '.');
    const bytes = Uint8Array.from(atob(row.content_base64), char => char.charCodeAt(0));
    if (bytes.length !== row.size || await sha(bytes) !== artifact.sha256) fail('Evidence payload integrity changed.');
    evidence.set(artifact.key, row);
  }
  const records = {};
  for (const controlFact of facts.controls) {
    const controlId = candidate.controlsManifest.control_ids[controlFact.key];
    let control = controls.find(row => row.control_id === controlId);
    if (!control) fail('the returned native Control identity is missing.');
    const papers = controlFact.populations.map(population => {
      const paper = source.workpapers.find(row => row.key === population.key);
      if (!paper || paper.control_fact_key !== controlFact.key || paper.request_id !== population.request_id
        || paper.count_unit !== population.count_unit || paper.period_start !== population.period_start
        || paper.period_end !== population.period_end || paper.expected_instances !== population.expected_instances
        || paper.collected_instances !== population.collected_instances || paper.members.length !== paper.collected_instances
        || new Set(paper.members.map(row => row.key)).size !== paper.members.length
        || paper.members.some(row => !row.source_key || !row.required_checks?.length || !row.input_refs?.length
          || typeof row.proposed_result !== 'string' || !row.proposed_result.trim()
          || typeof row.exception_disposition !== 'string' || !row.exception_disposition.trim()
          || row.detailed && !row.detail_rows?.length)
        || typeof paper.bounded_evaluation_statement !== 'string' || !paper.bounded_evaluation_statement.trim()
        || paper.native_observation_state !== 'unrecorded')
        fail('complete the substantive scoped workpaper before recording ' + population.key + '.');
      const artifacts = source.artifacts.filter(row => row.population_keys.includes(population.key));
      if (!artifacts.length) fail('the workpaper population has no material artifact.');
      return {population, paper, artifacts};
    });
    const links = [...control.related_links];
    for (const artifact of papers.flatMap(row => row.artifacts)) {
      const id = evidence.get(artifact.key).evidence_id;
      if (!links.some(link => link.kind === 'evidence' && link.id === id)) links.push({kind: 'evidence', id});
    }
    if (stable(links) !== stable(control.related_links))
      fail('finalize Evidence links before binding the actual design revision and recording observations.');
    for (const {population, paper, artifacts} of papers) {
      const notes = population.notes + '\n' + paper.bounded_evaluation_statement
        + '\nFictional source files: ' + artifacts.map(row => row.filename + ' SHA-256 ' + row.sha256).join('; ')
        + '\nNative recording time and actor remain separate from the fictional operating period.';
      if (notes.length > 4000) fail('the complete evaluation exceeds the native note limit.');
      control = organizationalControlRequest(db, ['organizational-controls', controlId, 'observations'], 'post', {}, {
        request_id: population.request_id, expected_updated_at: control.updated_at,
        period_start: population.period_start, period_end: population.period_end, operating: population.operating,
        expected_instances: population.expected_instances, collected_instances: population.collected_instances, notes,
      });
      const observation = control.observations.find(row => row.request_id === population.request_id);
      records[population.key] = {control_id: controlId, request_id: observation.request_id,
        control_revision: observation.control_revision, recorded_at: observation.at, recorded_by: observation.by,
        evidence_ids: artifacts.map(row => evidence.get(row.key).evidence_id),
        source_sha256: artifacts.map(row => row.sha256), count_unit: paper.count_unit};
    }
  }
  const manifest = {version: VERSION, client_id: CID, anchor: facts.anchor,
    input_sha256: inputHash, material_source_receipt_sha256: sourceReceipt,
    observations_recorded: Object.keys(records).length, observations: records,
    state_sha256: await digest(db)};
  manifest.receipt_sha256 = await digest(manifest);
  db[MARKER] = copy(manifest);
  return {...result, db, operatingManifest: manifest};
}
