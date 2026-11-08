import axios from 'axios';
import {previewAdapter} from './adapter';
import {STORE_KEY, buildLegacyDemoStore, saveStore, seedStore, write} from './store';

const api = axios.create({adapter: previewAdapter});
const retainedRiskId = 'demo_brawndo_risk_0';
const storedRisk = () => JSON.parse(sessionStorage.getItem(STORE_KEY)).risks.find(r => r.risk_id === retainedRiskId);

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

test('retained seeded Risk keeps its original Added fallback through save, review and reload', async () => {
  // Exercise retained records without an identification date, not the new showcase fixture.
  saveStore(buildLegacyDemoStore(), {resetFiles: true});
  await api.post('/demo/enter');
  const original = storedRisk();
  expect(original.date_identified).toBeUndefined();
  expect(original.created_at).toBeTruthy();
  const path = '/risks/' + retainedRiskId;

  await api.patch(path, {description: original.description + '\nSynthetic regression check'});
  const saved = storedRisk();
  expect(saved.created_at).toBe(original.created_at);
  expect(saved.created_by).toBe(original.created_by);
  expect(saved).not.toHaveProperty('date_identified');

  const review = (await api.post(path + '/review')).data.review;
  await api.post('/reviews/' + review.review_id + '/complete', {occurrence_id: review.current_occurrence_id});
  const reloaded = (await api.get(path)).data;
  expect(reloaded.created_at).toBe(original.created_at);
  expect(reloaded).not.toHaveProperty('date_identified');
  expect(reloaded.last_reviewed).toBeTruthy();
  expect(reloaded.date_identified || reloaded.created_at).toBe(original.created_at);
});

test.each([null, '2025-02-28T00:00:00.000Z'])('existing Risk identification value %s is preserved rather than defaulted on an edit', identification => {
  const db = seedStore();
  const risk = db.risks.find(r => r.risk_id === retainedRiskId);
  risk.date_identified = identification;
  const createdAt = risk.created_at;
  const saved = write(db, 'risks', {notes: 'Synthetic metadata preservation check'}, risk.risk_id);
  expect(saved.date_identified).toBe(identification);
  expect(saved.created_at).toBe(createdAt);
});

test('a genuinely new Risk receives its identification date once and later edits retain it', () => {
  const db = seedStore();
  const before = Date.now();
  const risk = write(db, 'risks', {client_id: 'demo_brawndo', title: 'Synthetic new Risk', review_cadence: 'none'});
  expect(Date.parse(risk.date_identified)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(risk.date_identified)).toBeLessThanOrEqual(Date.now());
  const identified = risk.date_identified;
  const created = risk.created_at;
  const saved = write(db, 'risks', {title: 'Synthetic renamed Risk'}, risk.risk_id);
  expect(saved.date_identified).toBe(identified);
  expect(saved.created_at).toBe(created);
});
