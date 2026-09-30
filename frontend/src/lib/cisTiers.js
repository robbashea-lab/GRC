import data from './operatorGuidance/cisTiers.json';

export const TIERS = [['foundation', 'Foundation'], ['operational', 'Operational'], ['mature', 'Mature']];
const KEYS = TIERS.map(([k]) => k);

export function tiersFor(id) {
  if (!id || id === '_note' || !Object.prototype.hasOwnProperty.call(data, id)) return null;
  const e = data[id];
  const out = {};
  KEYS.forEach((k) => { out[k] = (e[k] || []).map((c) => ({ id: c.id, text: c.text, stronger: c.stronger === true })); });
  return out;
}

export function validChecklistIds(id) {
  const t = tiersFor(id);
  return new Set(t ? KEYS.flatMap((k) => t[k].map((c) => c.id)) : []);
}

export function normalizeChecklist(checklist, id) {
  const t = tiersFor(id);
  const out = {};
  KEYS.forEach((k) => {
    const valid = new Set(t ? t[k].map((c) => c.id) : []);
    const src = checklist && Array.isArray(checklist[k]) ? checklist[k] : [];
    out[k] = [...new Set(src.filter((x) => valid.has(x)))];
  });
  return out;
}

export function tierProgress(checklist, id) {
  const t = tiersFor(id);
  const n = normalizeChecklist(checklist, id);
  const out = {};
  KEYS.forEach((k) => { out[k] = { done: n[k].length, total: t ? t[k].length : 0 }; });
  return out;
}

export function tierSignal(progress) {
  if (!progress) return null;
  const p = (k) => progress[k] || { done: 0, total: 0 };
  if (KEYS.every((k) => !p(k).done)) return null;
  const incomplete = (k) => p(k).done < p(k).total;
  if (incomplete('foundation')) return 'Foundation checks incomplete';
  if (incomplete('operational')) return 'Foundation checks complete · Operational verification incomplete';
  if (incomplete('mature')) return 'Foundation and operational checks complete';
  return 'All verification checks complete';
}
