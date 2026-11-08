import {AI_LOGOS} from '@/components/BrawndoAITemplates';
import {VENDOR_WORKFLOW_LOGOS} from '@/components/BrawndoVendorWorkflowTemplates';
import {isCatalogKey, vendorCatalogName} from './registerCatalogIdentity';

// Only bundled picker assets are converted here; record-provided markup/URLs are never used.
const vendorLogos = Object.fromEntries(Object.entries(VENDOR_WORKFLOW_LOGOS).map(([name, markup]) => {
  const source = markup.startsWith('<svg ')
    ? `data:image/svg+xml,${encodeURIComponent(markup)}`
    : markup.match(/^<img\b[^>]*\bsrc="(data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)"[^>]*>$/)?.[1];
  return [name, source];
}));

export function registerCatalogLogo(kind, record) {
  const key = record?.catalog_key;
  if (!isCatalogKey(kind, key)) return undefined;
  return kind === 'vendors' ? vendorLogos[vendorCatalogName(key)] : AI_LOGOS[key];
}
