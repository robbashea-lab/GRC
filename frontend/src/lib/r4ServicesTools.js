import catalog from '@catalogs/r4ServicesTools.json';
import {recordUuid} from './recordUuid';
export { catalog as serviceCatalog };
export const copy = value => JSON.parse(JSON.stringify(value));
export const defaultServices = () => ({
  areas: {},
  custom_tools: [],
  preset: null,
  exclusions: {}
});
export const serviceArea = (services, id) => services?.areas?.[id] || {
  responsibility: 'un',
  tool_ids: []
};
export const toolList = (tools, services) => [...tools, ...(services?.custom_tools || [])].filter((t, i, all) => all.findIndex(x => x.tool_id === t.tool_id) === i);
export function commonToolDefinitions() {
  const tools = new Map();
  for (const [area, names] of Object.entries(catalog.common_tools)) for (const name of names) {
    const id = 'common_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (tools.has(id)) tools.get(id).area_ids.push(area);else tools.set(id, {
      tool_id: id,
      name,
      vendor: '',
      category: 'custom',
      area_ids: [area],
      description: 'Common tool option. Confirm its actual scope and operation for this client.',
      retired: false
    });
  }
  return [...tools.values()];
}
export function applyServicePreset(services, key) {
  const next = copy(services),
    preset = catalog.presets[key];
  if (!preset) throw new Error('Unknown engagement type');
  next.areas ||= {};
  for (const [id, [responsibility, tool_ids]] of Object.entries(preset.set)) next.areas[id] = {
    ...serviceArea(next, id),
    responsibility,
    tool_ids: [...tool_ids]
  };
  next.preset = key;
  return next;
}
export function newClientTool(name, areaId) {
  const value = name.trim();
  if (!value) throw new Error('Enter a tool name');
  return {
    tool_id: 'custom_' + recordUuid(),
    name: value,
    vendor: '',
    category: 'custom',
    area_ids: [areaId],
    description: '',
    retired: false
  };
}
export function setupDraft(entry, clientVersion) {
  return {
    activity_id: entry.activity_id,
    review_id: entry.review_id,
    expected_updated_at: entry.expected_updated_at ?? null,
    expected_client_updated_at: clientVersion ?? null,
    area_id: entry.area_id,
    responsibility: entry.responsibility === 'un' ? null : entry.responsibility,
    recurring_ticket_number: entry.setup?.recurring_ticket_number || '',
    recurring_ticket_url: entry.setup?.recurring_ticket_url || '',
    recurring_ticket_summary: entry.setup?.recurring_ticket_summary || '',
    cadence: entry.cadence || 'annual',
    custom_days: entry.custom_days ?? null,
    first_next_due: entry.first_next_due || null,
    notes: entry.setup?.notes || '',
    ticket_confirmed: true
  };
}
