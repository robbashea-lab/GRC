// Canonical object keys leave array order and literal values intact.
export const stableJson = value => JSON.stringify(value, (_key, item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  return Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]]));
});
