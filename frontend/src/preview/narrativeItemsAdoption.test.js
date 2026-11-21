import axios from 'axios';
import {previewAdapter} from './commandTestAdapter';
import {STORE_KEY, readStore} from './store';
import baseline from '@catalogs/onboardingCatalog.json';
import {FRAMEWORKS, CATALOGS} from '../lib/frameworks';
import {generateResult, visibleQuestions} from '../lib/guidedAssessment';
import {isoGuidedCatalog, isoGuidedRolloutCatalog, isoGuidedProspectiveCatalog, isoExtraQuestions, isoGuidedResult} from '../lib/isoGuidedAssessment';
import {socGuidedCatalog, socRolloutCatalog, socProposalCatalog, socExtraQuestions, socGuidedResult} from '../lib/socGuidedAssessment';
import {genericGuidedFramework, genericGuidedResult} from '../lib/genericGuidedAssessment';
import {generatedItems} from './assessmentItems';

const api = axios.create({adapter: previewAdapter});
const keys = ['cis-ig1', 'iso-27001', 'soc-2', 'hipaa', 'nist-csf-2', 'cmmc'];
beforeEach(async () => { sessionStorage.clear();localStorage.clear();await api.post('/demo/enter'); });

async function fixture(key, reportedEvidence) {
  const cid = (await api.post('/clients', {name: 'SYNTHETIC narrative and Items ' + key})).data.client_id;
  const state = {version: 3, step: 3, policies: Object.fromEntries(baseline.policies.map(item => [item.key, 'unsure'])),
    requirements: Object.fromEntries(FRAMEWORKS.map(item => [item.key, item.key === key ? 'applies' : 'does_not_apply'])),
    reviews: [], framework_reviews: {}};
  await api.post('/onboarding/baseline', {client_id: cid, state, finalize: true});
  const workspace = (await api.get('/frameworks/' + key, {params: {client_id: cid}})).data;
  const identity = {'cis-ig1': '2.1', 'iso-27001': '4.1', 'soc-2': 'CC1.1'}[key];
  let row = workspace.assessments.find(item => identity ? item.definition_id === identity
    : CATALOGS[key].requirements.find(definition => definition.id === item.definition_id).specification !== 'addressable');
  const path = '/framework_assessments/' + row.framework_assessment_id;
  row = (await api.patch(path, {status: 'in_progress', implementation: 'SYNTHETIC existing manual position.',
    expected_last_assessed: row.last_saved ?? row.last_assessed ?? null})).data;
  let draft = (await api.get(path + '/guided-assessment')).data;
  let answers, result;
  if (genericGuidedFramework(key)) {
    answers = {practice: 'Not sure', implementation: 'SYNTHETIC actual practice requires confirmation.',
      gap: 'Not sure', unknown: 'Yes', unknown_reason: 'SYNTHETIC accountable-person confirmation.'};
    result = genericGuidedResult(row.definition_id, answers, draft.version);
  } else {
    const catalogs = key === 'iso-27001' ? [isoGuidedCatalog, isoGuidedRolloutCatalog, isoGuidedProspectiveCatalog]
      : [socGuidedCatalog, socRolloutCatalog, socProposalCatalog];
    const catalog = catalogs.find(item => item.version === draft.version);
    const extras = {additional_gap: 'No', additional_confirmation: 'Yes', unknowns: 'SYNTHETIC requirement confirmation work.'};
    const questions = key === 'cis-ig1' ? visibleQuestions(row.definition_id, {practice: 'Not sure', ...extras}, draft.version)
      : [...catalog.definitions[row.definition_id].groups.flatMap(group => group.questions),
        ...(key === 'iso-27001' ? isoExtraQuestions({}, draft.version, true) : socExtraQuestions({}, draft.version, true))];
    answers = Object.fromEntries(questions.map(question => [question.id, question.type === 'matrix'
      ? Object.fromEntries(question.rows.map(name => [name, 'Not sure']))
      : question.type === 'text' ? '' : question.type === 'context' ? 'Relevant' : 'Not sure']));
    Object.assign(answers, extras);
    result = key === 'cis-ig1' ? generateResult(row.definition_id, answers, new Date(), draft.version)
      : key === 'iso-27001' ? isoGuidedResult(row.definition_id, answers, draft.version) : socGuidedResult(row.definition_id, answers, draft.version);
  }
  if (reportedEvidence !== undefined) answers.evidence = reportedEvidence;
  const wording = 'SYNTHETIC reviewed ' + key + ' wording — München Ω; uncertainty is retained.';
  const payload = {version: draft.version, answers, step: 0, completed: true, narrative: wording,
    result: {...result, narrative: wording}, expected_revision: draft.revision,
    base_assessment_token: draft.base_assessment_token, base_scope_fingerprint: draft.base_scope_fingerprint};
  if (['iso-27001', 'soc-2'].includes(key)) payload.summary_review = {version: draft.version, answers};
  draft = (await api.put(path + '/guided-assessment', payload)).data;
  expect((await api.get(path)).data).toEqual(row);
  return {path, row, draft, body: {implementation: wording,
    guided_assessment_source: Object.fromEntries(['version', 'revision', 'generated_at'].map(field => [field, draft[field]])),
    expected_last_assessed: row.last_saved ?? row.last_assessed ?? null}};
}

test.each(keys)('%s explicit narrative-and-Items adoption retains manual judgment and resolved Item identity', async key => {
  const {path, row, draft, body} = await fixture(key), dbBefore = readStore();
  const counts = [dbBefore.findings.length, dbBefore.tasks.length];
  const saved = (await api.patch(path, body)).data;
  for (const field of ['status', 'verification', 'assessment_recorded_at', 'assessment_recorded_by']) expect(saved[field] ?? null).toEqual(row[field] ?? null);
  expect(saved.implementation).toBe(draft.narrative);expect(saved.last_saved).not.toBe(row.last_saved);
  expect(saved.last_assessed).toBe(saved.last_saved);
  expect(saved.assessment_history).toHaveLength(row.assessment_history.length + 1);
  expect(saved.items_to_address.length).toBeGreaterThan(0);
  expect(saved.items_to_address.every(item => item.kind === 'verification')).toBe(true);
  expect([readStore().findings.length, readStore().tasks.length]).toEqual(counts);
  const item = saved.items_to_address[0];
  const resolved = (await api.patch(path + '/items/' + encodeURIComponent(item.item_id), {
    expected_revision: saved.items_revision, state: 'resolved', resolution: 'SYNTHETIC retained analyst resolution.'})).data;
  const repeated = (await api.patch(path, {...body, expected_last_assessed: resolved.last_saved})).data;
  for (const field of ['items_to_address', 'items_revision', 'assessment_history', 'last_saved', 'last_assessed', 'status', 'verification'])
    expect(repeated[field]).toEqual(resolved[field]);
});

test.each(keys)('%s narrative-only contract rejects null, mixed edits, unreviewed text and changed source without saved-store changes', async key => {
  const {path, row, draft, body} = await fixture(key);
  const missingToken = {...body};delete missingToken.expected_last_assessed;
  const variants = [
    [missingToken, 428], [{...body, expected_last_assessed: 'synthetic-stale-token'}, 409],
    [{...body, status: null}, 422], [{...body, notes: row.notes || ''}, 422], [{...body, record_assessment: false}, 422],
    [{...body, implementation: 'Unreviewed text'}, 422],
    [{...body, guided_assessment_source: {...body.guided_assessment_source, revision: draft.revision + 1}}, 409],
  ];
  if (key !== 'cis-ig1') variants.push([{...body, status: row.status}, 422]);
  for (const [payload, status] of variants) {
    const before = sessionStorage.getItem(STORE_KEY);
    await expect(api.patch(path, payload)).rejects.toMatchObject({response: {status}});
    expect(sessionStorage.getItem(STORE_KEY)).toBe(before);
  }
});

test.each(keys)('%s manual Item commands retain judgment, stable identity and removal history',async key=>{
  const {path,row,body}=await fixture(key);
  const input={expected_revision:row.items_revision||0,request_id:'synthetic-manual-item-'+key,item_type:'confirmation',text:'SYNTHETIC confirm source — München Ω'};
  const saved=(await api.post(path+'/items',input)).data;
  const item=saved.items_to_address.find(item=>item.request_id===input.request_id);
  expect(item).toMatchObject({origin:'manual',item_type:'confirmation',kind:'verification',state:'open',text:input.text});
  expect(item).not.toHaveProperty('question_id');expect(item).not.toHaveProperty('source_version');
  for(const field of ['status','verification','implementation','assessment_history','last_saved','last_assessed'])expect(saved[field]).toEqual(row[field]);
  expect((await api.post(path+'/items',input)).data).toEqual(saved);
  const bytes=sessionStorage.getItem(STORE_KEY);
  await expect(api.post(path+'/items',{...input,request_id:'synthetic-other-item-'+key})).rejects.toMatchObject({response:{status:409}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(bytes);
  const removed=(await api.post(path+'/items/'+encodeURIComponent(item.item_id)+'/remove',{expected_revision:saved.items_revision})).data;
  const retained=removed.items_to_address.find(current=>current.item_id===item.item_id);
  expect(retained.state).toBe('removed');expect(retained.history.slice(0,-1)).toEqual(item.history);
  const adopted=(await api.patch(path,body)).data;
  expect(adopted.items_to_address.find(current=>current.item_id===item.item_id)).toEqual(retained);
});

test.each(keys)('%s pending Item operations share explicit narrative Save and stale edits leave storage unchanged',async key=>{
  const {path,row,draft,body}=await fixture(key),proposed=generatedItems(row,draft)[0];
  const batch={expected_revision:row.items_revision||0,operations:[
    {operation:'add',request_id:'synthetic-pending-item-'+key,item_type:'evidence',text:'SYNTHETIC evidence link needs confirmation — Ω'},
    {operation:'resolve',target:{question_id:proposed.question_id,kind:proposed.kind},state:'resolved',resolution:'SYNTHETIC reviewed with owner'}]};
  expect((await api.get(path)).data).toEqual(row);
  const saved=(await api.patch(path,{...body,item_draft:batch})).data;
  expect(saved.status).toBe(row.status);expect(saved.verification).toBe(row.verification);
  expect(saved.implementation).toBe(draft.narrative);expect(saved).not.toHaveProperty('item_draft');
  expect(saved.assessment_history.at(-1)).not.toHaveProperty('item_draft');
  const manual=saved.items_to_address.find(item=>item.origin==='manual');expect(manual.item_type).toBe('evidence');
  expect(saved.items_to_address.find(item=>item.item_id===proposed.item_id).state).toBe('resolved');
  const bytes=sessionStorage.getItem(STORE_KEY);
  await expect(api.patch(path,{...body,expected_last_assessed:saved.last_saved,item_draft:{...batch,operations:[
    {operation:'resolve',target:{item_id:manual.item_id},state:'resolved',resolution:'SYNTHETIC stale alteration'}]}})).rejects.toMatchObject({response:{status:409}});
  expect(sessionStorage.getItem(STORE_KEY)).toBe(bytes);expect((await api.get(path)).data).toEqual(saved);
});
async function rereviewReportedEvidence(path, body) {
  const current = (await api.get(path + '/guided-assessment')).data;
  const compare = {version: current.version, answers: current.answers, step: current.step,
    narrative: current.narrative, completed: false, rebase: true, expected_revision: current.revision,
    base_assessment_token: current.current_assessment_token, base_scope_fingerprint: current.current_scope_fingerprint};
  const compared = (await api.put(path + '/guided-assessment', compare)).data;
  const completion = {...compare, rebase: false, completed: true, result: current.result,
    expected_revision: compared.revision, base_assessment_token: compared.base_assessment_token, base_scope_fingerprint: compared.base_scope_fingerprint};
  if (current.summary_review) completion.summary_review = current.summary_review;
  const reviewed = (await api.put(path + '/guided-assessment', completion)).data;
  expect(reviewed.answers).toEqual(current.answers);expect(reviewed.narrative).toBe(current.narrative);
  const row = (await api.get(path)).data;
  return {...body, expected_last_assessed: row.last_saved,
    guided_assessment_source: Object.fromEntries(['version', 'revision', 'generated_at'].map(key => [key, reviewed[key]]))};
}
test.each(keys)('%s reported Evidence follow-up uses actual canonical links, preserving source history and artifact', async key => {
  const reported = '  SYNTHETIC reported records need linking; contents and location unverified — Ω.  ';
  let {path, row, draft, body} = await fixture(key, reported);
  expect((await api.get(path + '/related')).data.evidence).toEqual([]);
  expect(generatedItems(row, draft).some(item => item.question_id === 'evidence')).toBe(false);
  expect(generatedItems(row, draft, {evidenceLinked: null}).some(item => item.question_id === 'evidence')).toBe(false);
  expect(generatedItems(row, draft, {evidenceLinked: true}).some(item => item.question_id === 'evidence')).toBe(false);
  expect(generatedItems(row, {...draft, answers: {...draft.answers, evidence: ' \n\t '}}, {evidenceLinked: false}).some(item => item.question_id === 'evidence')).toBe(false);
  expect(generatedItems(row, draft, {evidenceLinked: false}).find(item => item.question_id === 'evidence')).toMatchObject({
    kind: 'verification', text: 'Link the reported evidence: ' + reported.trim()});
  let saved = (await api.patch(path, body)).data;
  const item = saved.items_to_address.find(item => item.question_id === 'evidence');
  expect(item).toMatchObject({kind: 'verification', state: 'open', text: 'Link the reported evidence: ' + reported.trim()});
  expect([saved.status, saved.verification]).toEqual([row.status, row.verification]);
  expect(readStore().findings.filter(item => item.client_id === row.client_id)).toEqual([]);
  expect(readStore().tasks.filter(item => item.client_id === row.client_id)).toEqual([]);
  saved = (await api.patch(path + '/items/' + encodeURIComponent(item.item_id), {
    expected_revision: saved.items_revision, state: 'resolved', resolution: 'SYNTHETIC retained follow-up note.'})).data;
  expect((await api.patch(path, {...body, expected_last_assessed: saved.last_saved})).data).toEqual(saved);
  const artifact = (await api.post('/evidence', {client_id: row.client_id, linked_type: 'framework_assessment',
    linked_id: row.framework_assessment_id, filename: 'SYNTHETIC reported record Ω.txt', mime_type: 'text/plain', content_base64: 'c3ludGhldGljCg=='})).data;
  const storedArtifact = readStore().evidence.find(entry => entry.evidence_id === artifact.evidence_id);
  const readBefore = sessionStorage.getItem(STORE_KEY);
  expect((await api.get(path + '/related')).data.evidence.map(entry => entry.evidence_id)).toEqual([artifact.evidence_id]);
  expect((await api.get(path)).data).toEqual(saved);
  expect(sessionStorage.getItem(STORE_KEY)).toBe(readBefore);
  body = await rereviewReportedEvidence(path, body);
  saved = (await api.patch(path, body)).data;
  const archived = saved.items_to_address.find(current => current.item_id === item.item_id);
  expect(archived).toMatchObject({state: 'superseded', resolution: 'SYNTHETIC retained follow-up note.'});
  await api.delete(path + '/links', {data: {kind: 'evidence', id: artifact.evidence_id}});
  expect((await api.get(path + '/related')).data.evidence).toEqual([]);
  const current = (await api.get(path)).data;
  expect(current.items_to_address).toEqual(saved.items_to_address);
  body = await rereviewReportedEvidence(path, body);
  const restored = (await api.patch(path, body)).data;
  const itemAfter = restored.items_to_address.find(entry => entry.item_id === item.item_id);
  expect(itemAfter).toMatchObject({state: 'open', resolution: 'SYNTHETIC retained follow-up note.'});
  expect(itemAfter.history.slice(0, archived.history.length)).toEqual(archived.history);
  expect(readStore().evidence.find(entry => entry.evidence_id === artifact.evidence_id)).toEqual(storedArtifact);
});
