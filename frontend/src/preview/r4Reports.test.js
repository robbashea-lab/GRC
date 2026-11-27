import axios from 'axios';
import {webcrypto} from 'node:crypto';
import {TextEncoder} from 'node:util';
import {strFromU8, unzipSync} from 'fflate';
import {previewAdapter} from './adapter';
import {ids, readStore, saveStore, STORE_KEY} from './store';
import {activeDefinitions, frameworkCatalog} from '../lib/frameworks';

const api = axios.create({adapter: previewAdapter});
const CID = 'synthetic_r4_reports';
const ANALYST = 'synthetic_r4_reports_analyst';
const TYPES = ['assessment', 'executive', 'scope', 'risks', 'vendors', 'policies'];
const READ_ROLES = ['super_admin', 'platform_admin', 'client_grc_manager', 'client_contributor', 'client_readonly', 'client_viewer'];
const releases = [];
let nextIntent = 0;

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {configurable: true, value: webcrypto});
  globalThis.TextEncoder = TextEncoder;
});

function fixture() {
  const db = Object.fromEntries(Object.keys(ids).map(kind => [kind, []]));
  db.user = {user_id: 'synthetic_r4_reports_admin', name: 'Reports QA administrator',
    email: 'reports-qa-administrator@example.test', role: 'super_admin', status: 'active',
    client_ids: [CID], all_clients: false, workspace_mode: 'demo'};
  db.users = [{...db.user}];
  db.baselines = {};
  db.logs = [];
  return db;
}

function edit(mutator) {
  const db = readStore();
  mutator(db);
  saveStore(db);
}

// Official definitions supply input records; expected populations below are fixed
// acceptance facts, never results copied from the report/position calculator.
function installFramework(key = 'cis-ig1', clientId = CID) {
  edit(db => {
    let client = db.clients.find(row => row.client_id === clientId);
    if (!client) {
      client = {client_id: clientId, name: 'Owned synthetic Reports client', status: 'active', timezone: 'UTC',
        assigned_owner_id: ANALYST, framework_settings: {},
        onboarding_baseline: {version: 3, completed: true, requirements: {}, policies: {}, reviews: []}};
      db.clients.push(client);
    }
    const configuration = key === 'cis-ig1' ? {implementation_group: 1}
      : key === 'cmmc' ? {level: 1} : key === 'soc-2' ? {categories: ['security'], system_description: 'Owned synthetic scope'} : {};
    client.framework_settings[key] = configuration;
    client.onboarding_baseline.requirements[key] = 'applies';
    db.requirements.push({requirement_id: 'reports-program-' + clientId + '-' + key, client_id: clientId,
      baseline_key: key, baseline_response: 'applies'});
    db.framework_assessments = db.framework_assessments.filter(row => row.client_id !== clientId || row.framework_key !== key);
    const catalog = frameworkCatalog(key);
    for (const definition of activeDefinitions(key, configuration)) {
      db.framework_assessments.push({framework_assessment_id: 'reports-' + clientId + '-' + key + '-' + definition.id,
        client_id: clientId, framework_key: key, framework_version: catalog.version, definition_id: definition.id,
        title: definition.title, status: 'not_assessed', implementation: '', verification: 'not_verified', related_links: [],
        created_at: new Date().toISOString()});
    }
    if (!db.users.some(user => user.user_id === ANALYST)) db.users.push({user_id: ANALYST, name: 'Reports QA analyst',
      email: 'reports-qa-analyst@example.test', role: 'client_grc_manager', client_ids: [clientId], status: 'active'});
    else db.users.find(user => user.user_id === ANALYST).client_ids.push(clientId);
  });
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  // Own the complete test session; avoid loading the separately qualified large
  // Demo fixture or changing its data merely to exercise the report adapter.
  saveStore(fixture(), {resetFiles: true});
  await api.post('/demo/enter');
  installFramework();
});

afterEach(() => {
  releases.splice(0).forEach(release => release());
  jest.restoreAllMocks();
});

const params = (type = 'assessment', key = 'cis-ig1', clientId = CID) => ({client_id: clientId, framework_key: key, type});
const preview = async (type = 'assessment', key = 'cis-ig1', extra = {}) =>
  (await api.get('/reports/preview', {params: {...params(type, key), ...extra}})).data;
const exportReport = (type = 'risks', format = 'csv', key = 'cis-ig1', intent = 'reports-owned-intent-' + (++nextIntent), extra = {}) =>
  api.post('/reports/exports', {...params(type, key), format, ...extra}, {headers: {'Idempotency-Key': intent}});
const ownExports = () => (readStore().report_exports || []).filter(row => row.client_id === CID);
const section = (dto, title) => dto.sections.find(item => item.title === title);
const readBlob = (blob, method = 'readAsArrayBuffer') => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader[method](blob);
});
const downloadBytes = async (metadata, client = api) => {
  const response = await client.get(metadata.download_url);
  expect(response.data).toBeInstanceOf(Blob);
  return new Uint8Array(await readBlob(response.data));
};
function addRisk(title = 'Owned synthetic risk') {
  edit(db => db.risks.push({risk_id: 'reports-owned-risk', display_id: 'RISK-001', client_id: CID, title,
    status: 'assessed', likelihood_score: 2, impact_score: 3, owner_id: ANALYST,
    updated_at: new Date().toISOString()}));
}
function scopeRow(key, definitionId, changes) {
  edit(db => Object.assign(db.framework_assessments.find(row => row.client_id === CID && row.framework_key === key
    && row.definition_id === definitionId), changes));
}
function pauseNextHash() {
  let arrive, release;
  const ready = new Promise(resolve => { arrive = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  releases.push(release);
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  jest.spyOn(globalThis.crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    arrive();
    await gate;
    return digest(...args);
  });
  return {ready, release};
}

test('a completed shared Review retains open work in the gap report and respects narrower assignments',async()=>{
  installFramework('cmmc');
  edit(db=>{
    const cid=CID, source='shared-review', cis=db.framework_assessments.find(row=>row.framework_key==='cis-ig1');
    const cmmc=db.framework_assessments.find(row=>row.framework_key==='cmmc');
    db.reviews.push({client_id:cid,review_id:source,title:'Finished review',status:'completed',
      framework_drivers:[{framework_key:'cis-ig1',framework_safeguards:[cis.definition_id]}]});
    cmmc.related_links=[{kind:'findings',id:'narrowed'}];
    db.framework_assessments.push({client_id:'elsewhere',framework_assessment_id:'outside',related_links:[{kind:'findings',id:'open-finding'}]});
    for(const [fid,status] of [['open-finding','open'],['closed-finding','closed'],['narrowed','open']])
      db.findings.push({client_id:cid,review_id:source,finding_id:fid,title:fid,status});
    for(const [tid,fid] of [['corrective','closed-finding'],['other-program-action','narrowed'],['review-followup',null]])
      db.tasks.push({client_id:cid,review_id:source,task_id:tid,finding_id:fid,title:tid,status:'open'});
  });
  const report=await preview('scope'), rows=report.sections[0].rows;
  const linked=rows.find(row=>row[0]==='1.1')[4];
  for(const text of ['Finding open-finding:','Action item corrective:','Action item review-followup:']){
    expect(linked).toContain(text);
    expect(rows.filter(row=>row[0]!=='1.1').some(row=>row[4]?.includes(text))).toBe(false);
  }
  for(const text of ['closed-finding','other-program-action','narrowed','Finished review'])expect(linked).not.toContain(text);
  const metadata=(await exportReport('scope','xlsx')).data;
  const sheet=strFromU8(unzipSync(await downloadBytes(metadata))['xl/worksheets/sheet1.xml']);
  expect(sheet).toContain(linked);
});

test('all six previews use native identities and GETs leave saved state unchanged', async () => {
  readStore();
  const before = sessionStorage.getItem(STORE_KEY);
  const actor = readStore().user.user_id;
  for (const type of TYPES) {
    const dto = await preview(type);
    expect(dto.header.client).toEqual({id: CID, name: 'Owned synthetic Reports client'});
    expect(dto.header.prepared_by.id).toBe(actor);
    expect(dto.header.lead).toEqual({id: ANALYST, name: 'Reports QA analyst'});
    expect(dto.header.as_of).toBe(new Date().toISOString().slice(0, 10));
    expect(dto.header.qualifier).toMatch(/readiness.*not a certification/i);
    expect(dto.provenance.consistency).toMatch(/browser-local/i);
    expect(dto.sections.length).toBeGreaterThan(0);
  }
  expect((await api.get('/reports/frameworks', {params: {client_id: CID}})).data.frameworks.map(row => row.key)).toEqual(['cis-ig1']);
  expect((await api.get('/reports/history', {params: params()})).data.exports).toEqual([]);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
});

test('CIS IG1 reports all 56 real safeguards without granting assessment credit', async () => {
  const dto = await preview('scope');
  expect(dto.sections[0].rows).toHaveLength(56);
  expect(dto.sections[0].rows.some(row => row[0] === '1.1')).toBe(true);
  expect(dto.sections[0].rows.some(row => row[0] === '18.1')).toBe(false);
  expect(dto.stats[0].value).toBe('0.0%');
  expect(dto.stats[0].detail).toContain('0 of 56');
  expect(dto.stats.find(row => row.label === 'Not Assessed').value).toBe(56);
});

test('CMMC Level 1 retains the 17-check denominator and separate 15-parent scope qualification', async () => {
  installFramework('cmmc');
  const originalIds = readStore().framework_assessments.filter(row => row.client_id === CID && row.framework_key === 'cmmc')
    .map(row => row.definition_id);
  const dto = await preview('scope', 'cmmc');
  expect(dto.sections[0].rows).toHaveLength(17);
  expect(dto.sections[0].rows.map(row => row[0])).toEqual(originalIds);
  expect(dto.header.program.name).toBe('CMMC Level 1');
  expect(dto.stats[0].value).toBe('0.0%');
  expect(dto.stats[0].detail).toContain('0 of 17');
  expect(dto.provenance.implementation_position.denominator).toBe(17);
  const option = (await api.get('/reports/frameworks', {params: {client_id: CID}})).data.frameworks.find(row => row.key === 'cmmc');
  expect(option.scope).toContain('15 parent requirements');
  expect(option.scope).toContain('17 mapped child checks');
});

test('ISO SoA retains 93 decisions and separates included, excluded and undetermined statuses', async () => {
  installFramework('iso-27001');
  scopeRow('iso-27001', 'A.5.1', {soa_applicability: 'included', soa_justification: 'Owned included control', status: 'addressed'});
  scopeRow('iso-27001', 'A.5.2', {soa_applicability: 'excluded', soa_justification: 'Owned documented exclusion', status: 'needs_attention'});
  scopeRow('iso-27001', 'A.5.3', {soa_applicability: 'undetermined', status: 'in_progress'});
  const dto = await preview('scope', 'iso-27001');
  expect(dto.header.title).toBe('Statement of Applicability');
  expect(dto.sections[0].rows).toHaveLength(93);
  expect(dto.sections[0].rows.find(row => row[0] === 'A.5.1').slice(2, 4)).toEqual(['included', 'Owned included control']);
  expect(dto.sections[0].rows.find(row => row[0] === 'A.5.2').slice(2, 4)).toEqual(['excluded', 'Owned documented exclusion']);
  expect(dto.sections[0].rows.find(row => row[0] === 'A.5.3')[2]).toBe('undetermined');
  expect(dto.stats.find(row => row.label === 'Partially Implemented').value).toBe(0);
  expect(dto.stats.find(row => row.label === 'Not Implemented / Needs Validation').value).toBe(0);
});

test('SOC readiness uses the configured 33 security criteria and saved accountable owner', async () => {
  installFramework('soc-2');
  const first = readStore().framework_assessments.find(row => row.client_id === CID && row.framework_key === 'soc-2');
  scopeRow('soc-2', first.definition_id, {owner_id: ANALYST});
  const dto = await preview('scope', 'soc-2');
  expect(dto.sections[0].rows).toHaveLength(33);
  expect(dto.sections[0].rows.every(row => row[2] === 'Security / Common Criteria')).toBe(true);
  expect(dto.sections[0].rows.find(row => row[0] === first.definition_id)[3]).toBe('Reports QA analyst');
  expect(dto.allowed_formats).toEqual([]);
});

test('Demo exposes only supported formats and PDF rejection never creates history', async () => {
  const before = ownExports();
  for (const type of TYPES) {
    expect((await preview(type)).allowed_formats).toEqual(type === 'scope' ? ['xlsx'] : ['risks', 'vendors', 'policies'].includes(type) ? ['csv'] : []);
    await expect(exportReport(type, 'pdf')).rejects.toMatchObject({response: {status: 501}});
  }
  expect(ownExports()).toEqual(before);
  await expect(exportReport('assessment', 'csv')).rejects.toMatchObject({response: {status: 422}});
  await expect(api.get('/reports/framework', {params: {...params(), detail: 'full', trend_period: '6m'}}))
    .rejects.toMatchObject({response: {status: 501}});
  expect(ownExports()).toEqual(before);
});

test('CSV downloads preserve Unicode, quotes and line breaks while neutralizing formulas', async () => {
  addRisk('=2+2,café 日本語 🔒\n"quoted"');
  edit(db => db.risks.push({risk_id: 'reports-closed', client_id: CID, title: 'Closed risk must not leak into the active register',
    status: 'closed', likelihood_score: 5, impact_score: 5}));
  expect(readStore().risks.find(row => row.risk_id === 'reports-owned-risk').display_id).toBe('RISK-001');
  const result = (await exportReport()).data;
  const bytes = await downloadBytes(result);
  expect(Array.from(bytes.slice(0, 3))).toEqual([0xEF, 0xBB, 0xBF]);
  const text = strFromU8(bytes);
  expect(text).toContain("'=2+2,café 日本語 🔒\n");
  expect(text).toContain('""quoted""');
  expect(text).toContain('RISK-001');
  expect(text).toContain('Reports QA analyst');
  expect(text).not.toContain('Closed risk must not leak');
  expect(result.bytes).toBe(bytes.length);
  expect(result.content_type).toMatch(/^text\/csv/);
});

test('XLSX is a real ZIP/XML workbook with literal saved text and no formulas', async () => {
  installFramework('iso-27001');
  scopeRow('iso-27001', 'A.5.1', {soa_applicability: 'included', soa_justification: '=2+2 <café> 日本語 🔒'});
  const result = (await exportReport('scope', 'xlsx', 'iso-27001')).data;
  const files = unzipSync(await downloadBytes(result));
  expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']));
  const sheet = new DOMParser().parseFromString(strFromU8(files['xl/worksheets/sheet1.xml']), 'application/xml');
  expect(sheet.querySelector('parsererror')).toBeNull();
  expect(sheet.getElementsByTagName('f')).toHaveLength(0);
  expect(Array.from(sheet.getElementsByTagName('c')).every(cell => cell.getAttribute('t') === 'inlineStr')).toBe(true);
  expect(sheet.documentElement.textContent).toContain('=2+2 <café> 日本語 🔒');
});

test('spreadsheet capacity rejects oversized saved text instead of shortening it', async () => {
  installFramework('iso-27001');
  scopeRow('iso-27001', 'A.5.1', {soa_applicability: 'included', soa_justification: 'x'.repeat(32767)});
  const result = (await exportReport('scope', 'xlsx', 'iso-27001')).data;
  const files = unzipSync(await downloadBytes(result));
  const sheet = new DOMParser().parseFromString(strFromU8(files['xl/worksheets/sheet1.xml']), 'application/xml');
  expect(Array.from(sheet.getElementsByTagName('t')).some(cell => cell.textContent === 'x'.repeat(32767))).toBe(true);
  const before = ownExports();
  for (const oversized of ['x'.repeat(32768), '🔒'.repeat(16384)]) {
    scopeRow('iso-27001', 'A.5.1', {soa_justification: oversized});
    await expect(exportReport('scope', 'xlsx', 'iso-27001')).rejects.toMatchObject({response: {status: 422}});
    expect(ownExports()).toEqual(before);
  }
});

test('all recognized read roles retain export, history and download capabilities', async () => {
  addRisk();
  for (const role of READ_ROLES) {
    edit(db => {
      db.user = {...db.user, role, client_ids: [CID], all_clients: false};
      Object.assign(db.users.find(user => user.user_id === db.user.user_id), db.user);
    });
    const result = (await exportReport()).data;
    expect((await preview('risks')).header.prepared_by.id).toBe(readStore().user.user_id);
    expect((await api.get('/reports/history', {params: params()})).data.exports.some(row => row.export_id === result.export_id)).toBe(true);
    expect(strFromU8(await downloadBytes(result))).toContain('Owned synthetic risk');
  }
  const before = ownExports();
  expect(before).toHaveLength(READ_ROLES.length);
  edit(db => {
    db.user = {...db.user, role: 'not_a_platform_role', client_ids: [CID], status: 'active'};
    Object.assign(db.users.find(user => user.user_id === db.user.user_id), db.user);
  });
  await expect(preview('risks')).rejects.toMatchObject({response: {status: 403}});
  await expect(exportReport()).rejects.toMatchObject({response: {status: 403}});
  await expect(api.get('/reports/history', {params: params()})).rejects.toMatchObject({response: {status: 403}});
  await expect(api.get(before[0].download_url)).rejects.toMatchObject({response: {status: 403}});
  expect(ownExports()).toEqual(before);
});

test('foreign preview, history and retained bytes remain inaccessible to a scoped account', async () => {
  const foreignId = 'synthetic_r4_reports_foreign';
  installFramework('cis-ig1', foreignId);
  const foreign = (await exportReport('risks', 'csv', 'cis-ig1', 'reports-foreign-owned-intent', {client_id: foreignId})).data;
  edit(db => { db.user = {...db.user, role: 'platform_admin', client_ids: [CID], all_clients: false}; });
  await expect(api.get('/reports/preview', {params: params('risks', 'cis-ig1', foreignId)})).rejects.toMatchObject({response: {status: 403}});
  await expect(api.get('/reports/history', {params: {client_id: foreignId, framework_key: 'cis-ig1'}})).rejects.toMatchObject({response: {status: 403}});
  await expect(api.get(foreign.download_url)).rejects.toMatchObject({response: {status: 403}});
  expect((await preview('risks')).header.client.id).toBe(CID);
});

test('report materials include only saved dated register events for this client and selected program',async()=>{
  const at='2026-11-18T03:00:00Z';
  edit(db=>{
    db.clients.find(row=>row.client_id===CID).profile={scope:{statement:'Production boundary',systems:'Billing platform',private:'Excluded note'}};
    db.policies.push({client_id:CID,policy_id:'p1',title:'Access policy',status:'approved',
      decision_history:[{action:'external_approval_recorded',recorded_at:at,subject:{private:'Confidential approval attachment'}}]},
    {client_id:'foreign',policy_id:'p2',title:'Foreign policy',status:'approved',approved_at:at});
    db.reviews.push({client_id:CID,review_id:'r1',title:'Selected review',framework_key:'cis-ig1',
      occurrences:[{completed_at:at}],completion_date:at.slice(0,10)},
    {client_id:CID,review_id:'r2',title:'Other program review',framework_drivers:[{framework_key:'soc-2'}],completion_date:at});
  });
  const bundle=(await api.get('/reports/materials',{params:params()})).data;
  expect(bundle).toMatchObject({client_id:CID,framework_key:'cis-ig1'});
  expect(bundle.registers.clients[0].profile.scope).toEqual({statement:'Production boundary',systems:'Billing platform'});
  expect(Object.keys(bundle.reports).sort()).toEqual(['assessment','executive','policies','risks','scope','vendors']);
  expect(bundle.register_history.filter(row=>row.record==='Access policy').map(row=>row.event)).toEqual(['External approval recorded']);
  expect(bundle.register_history.filter(row=>row.record==='Selected review').map(row=>row.event)).toEqual(['Review completed']);
  expect(bundle.register_history.some(row=>row.record==='Other program review')).toBe(false);
  expect(bundle.registers.reviews.some(row=>row.title==='Other program review')).toBe(false);
  expect(JSON.stringify(bundle)).not.toMatch(/Confidential approval attachment|Foreign policy/);
  edit(db=>{db.requirements.find(row=>row.client_id===CID&&row.baseline_key==='cis-ig1').baseline_response='excluded';});
  await expect(api.get('/reports/materials',{params:params()})).rejects.toMatchObject({response:{status:403}});
});

test('a browser-prepared file has one scoped audit receipt and rejects different bytes on replay',async()=>{
  const body={client_id:CID,framework_key:'cis-ig1',kind:'executive-summary',sha256:'a'.repeat(64),bytes:1234,period_start:'2026-01-01',period_end:'2026-11-24'};
  const options={headers:{'Idempotency-Key':'reports-browser-delivery-synthetic'}};
  const first=(await api.post('/reports/deliveries',body,options)).data;
  expect((await api.post('/reports/deliveries',body,options)).data).toEqual(first);
  const logs=readStore().logs.filter(row=>row.entity_type==='report-delivery');
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({entity_id:first.delivery_id,meta:{type:'executive-summary',browser_reported_sha256:body.sha256,event:'browser_download_requested'}});
  await expect(api.post('/reports/deliveries',{...body,bytes:3333},options)).rejects.toMatchObject({response:{status:409}});
  await expect(api.post('/reports/deliveries',{...body,period_end:'2025-01-01'},options)).rejects.toMatchObject({response:{status:422}});
  edit(db=>{Object.assign(db.user,{role:'client_readonly',client_ids:['other'],all_clients:false});});
  await expect(api.post('/reports/deliveries',body,options)).rejects.toMatchObject({response:{status:403}});
});

test('malformed actor grants cannot preview, export, replay or download and leave all saved state unchanged', async () => {
  const intent = 'reports-malformed-grants-original';
  const retained = (await exportReport('risks', 'csv', 'cis-ig1', intent)).data;
  for (const client_ids of [CID, CID+'_foreign', [CID+'_foreign'], undefined, null, false, {0:CID,length:1}]) {
    edit(db => { Object.assign(db.user, {role:'platform_admin',client_ids,all_clients:false}); });
    readStore();
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(preview('risks')).rejects.toMatchObject({response:{status:403}});
    await expect(api.get('/reports/history', {params:params()})).rejects.toMatchObject({response:{status:403}});
    await expect(api.get(retained.download_url)).rejects.toMatchObject({response:{status:403}});
    await expect(exportReport('risks', 'csv', 'cis-ig1', intent)).rejects.toMatchObject({response:{status:403}});
    await expect(exportReport('risks', 'csv', 'cis-ig1', 'reports-malformed-new-intent')).rejects.toMatchObject({response:{status:403}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
});

test('report names require actual identity membership while native IDs remain intact', async () => {
  addRisk();
  for (const client_ids of [CID, CID+'_foreign', [CID+'_foreign'], null]) {
    edit(db => { db.users.find(user => user.user_id === ANALYST).client_ids = client_ids; });
    readStore();
    const before = sessionStorage.getItem(STORE_KEY);
    const dto = await preview('risks');
    expect(dto.header.lead).toEqual({id:ANALYST,name:null});
    expect(dto.sections[0].rows[0][4]).toBe(ANALYST);
    expect(JSON.stringify(dto)).not.toContain('Reports QA analyst');
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
  edit(db => { db.users.find(user => user.user_id === ANALYST).client_ids = [CID]; });
  expect((await preview('risks')).header.lead).toEqual({id:ANALYST,name:'Reports QA analyst'});
});

test('saved bytes survive later native edits, reload and exact replay without duplicate exports', async () => {
  addRisk('Original report value café');
  const intent = 'reports-immutable-owned-intent';
  const first = (await exportReport('risks', 'csv', 'cis-ig1', intent)).data;
  const bytes = await downloadBytes(first);
  const risk = readStore().risks.find(row => row.risk_id === 'reports-owned-risk');
  const changed = await api.patch('/risks/' + risk.risk_id, {title: 'Later native source value', expected_updated_at: risk.updated_at});
  expect(changed.data.title).toBe('Later native source value');
  const reloaded = axios.create({adapter: previewAdapter});
  expect(await downloadBytes(first, reloaded)).toEqual(bytes);
  expect((await exportReport('risks', 'csv', 'cis-ig1', intent)).data).toEqual(first);
  expect(ownExports()).toHaveLength(1);
  expect(readStore().logs.filter(row => row.entity_id === first.export_id && row.action === 'generate')).toHaveLength(1);
  await expect(exportReport('vendors', 'csv', 'cis-ig1', intent)).rejects.toMatchObject({response: {status: 409}});
  expect(ownExports()).toHaveLength(1);
  expect(strFromU8(bytes)).toContain('Original report value café');
  expect(strFromU8(bytes)).not.toContain('Later native source value');
});

test('missing files and tampered bytes or snapshots cannot be replaced by a cached receipt', async () => {
  for (const mode of ['missing', 'bytes', 'snapshot', 'missing-snapshot']) {
    const intent = 'reports-corruption-owned-' + mode;
    const result = (await exportReport('risks', 'csv', 'cis-ig1', intent)).data;
    edit(db => {
      const row = db.report_exports.find(item => item.export_id === result.export_id);
      if (mode === 'missing') db.report_exports = db.report_exports.filter(item => item.export_id !== result.export_id);
      else if (mode === 'bytes') row.content_base64 = btoa('tampered report bytes');
      else if (mode === 'missing-snapshot') delete row.snapshot;
      else row.snapshot.header.client.name = 'Tampered retained snapshot';
    });
    await expect(api.get(result.download_url)).rejects.toMatchObject({response: {status: mode === 'missing' ? 404 : 409}});
    await expect(exportReport('risks', 'csv', 'cis-ig1', intent)).rejects.toMatchObject({response: {status: 409}});
  }
});

test('arbitrary historical dates and forged export metadata save no file', async () => {
  await expect(preview('risks', 'cis-ig1', {as_of: '2000-01-01'})).rejects.toMatchObject({response: {status: 409}});
  await expect(exportReport('risks', 'csv', 'cis-ig1', undefined, {as_of: '2000-01-01'})).rejects.toMatchObject({response: {status: 409}});
  await expect(exportReport('risks', 'csv', 'cis-ig1', undefined, {prepared_by: {id: 'another-account'}})).rejects.toMatchObject({response: {status: 422}});
  await expect(api.post('/reports/exports', {...params('risks'), format: 'csv'})).rejects.toMatchObject({response: {status: 422}});
  expect(ownExports()).toEqual([]);
});

test('source changes during hashing reject the old export while preserving the new native value', async () => {
  addRisk('Before concurrent change');
  const gate = pauseNextHash();
  const pending = exportReport().then(value => ({value}), error => ({error}));
  await gate.ready;
  edit(db => { db.risks.find(row => row.risk_id === 'reports-owned-risk').title = 'Concurrent saved value'; });
  gate.release();
  const result = await pending;
  expect(result.error).toMatchObject({response: {status: 409}});
  expect(readStore().risks.find(row => row.risk_id === 'reports-owned-risk').title).toBe('Concurrent saved value');
  expect(ownExports()).toEqual([]);
});

test('an account change during hashing cannot retain or disclose the previous actor export', async () => {
  const originalActor = readStore().user.user_id;
  const gate = pauseNextHash();
  const pending = exportReport().then(value => ({value}), error => ({error}));
  await gate.ready;
  await api.post('/auth/logout');
  edit(db => {
    db.user = {user_id: ANALYST, name: 'Reports QA analyst', email: 'reports-qa-analyst@example.test',
      role: 'client_grc_manager', client_ids: [CID], status: 'active'};
  });
  await api.post('/demo/enter');
  gate.release();
  const result = await pending;
  expect(result.error).toMatchObject({response: {status: 401}});
  expect((await api.get('/auth/me')).data.user_id).toBe(ANALYST);
  expect(readStore().user.user_id).not.toBe(originalActor);
  expect(ownExports()).toEqual([]);
});

test('missing, duplicate and pending native assessments fail closed without repairing GETs', async () => {
  const original = readStore().framework_assessments.filter(row => row.client_id === CID && row.framework_key === 'cis-ig1');
  for (const mode of ['missing', 'duplicate', 'pending']) {
    edit(db => {
      db.framework_assessments = db.framework_assessments.filter(row => row.client_id !== CID || row.framework_key !== 'cis-ig1');
      db.framework_assessments.push(...JSON.parse(JSON.stringify(original)));
      const row = db.framework_assessments.find(item => item.client_id === CID);
      if (mode === 'missing') db.framework_assessments = db.framework_assessments.filter(item => item.framework_assessment_id !== row.framework_assessment_id);
      else if (mode === 'duplicate') db.framework_assessments.push({...row, framework_assessment_id: row.framework_assessment_id + '-duplicate'});
      else row._r4_context_pending = 'synthetic-pending-context';
    });
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(preview()).rejects.toMatchObject({response: {status: 409}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
    expect(ownExports()).toEqual([]);
  }
});
