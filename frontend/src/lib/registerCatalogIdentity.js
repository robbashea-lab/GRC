import catalog from '@catalogs/registerCatalogIdentity.json';

export function isCatalogKey(kind, value) {
  if (typeof value !== 'string') return false;
  if (kind === 'vendors') return Object.prototype.hasOwnProperty.call(catalog.vendors, value);
  return kind === 'ai_systems' && catalog.ai_systems.includes(value);
}

export function validateCatalogKey(kind, value) {
  if (value == null) return null;
  if (!isCatalogKey(kind, value)) throw new Error('Invalid catalog key');
  return value;
}

// Called only for an explicit native catalog selection, never for a saved record name.
export function vendorTemplateCatalogKey(template) {
  return Object.entries(catalog.vendors).find(([, name]) => name === template?.name)?.[0] ?? null;
}

export function vendorCatalogName(key) {
  return isCatalogKey('vendors', key) ? catalog.vendors[key] : null;
}
