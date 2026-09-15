import { SCHEMAS } from './schemas';

// Display only: stored values, search, sorting and filter facets are unchanged.
const labels = Object.fromEntries(['review_type', 'recurrence'].map(key => [key,
  Object.fromEntries(SCHEMAS.reviews.fields.find(field => field.name === key).options.map(option => [option.value, option.label]))
]));

export function reviewDisplayValue(key, value) {
  if (!value) return '—';
  return labels[key]?.[value] || String(value).replaceAll('_', ' ');
}
