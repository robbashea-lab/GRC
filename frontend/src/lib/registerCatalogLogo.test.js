import identity from '@catalogs/registerCatalogIdentity.json';
import {AI_LOGOS, AI_TEMPLATES, aiTemplateDraft} from '@/components/BrawndoAITemplates';
import {VENDOR_WORKFLOW_LOGOS, VENDOR_WORKFLOW_TEMPLATES} from '@/components/BrawndoVendorWorkflowTemplates';
import {registerCatalogLogo} from './registerCatalogLogo';
import {isCatalogKey, validateCatalogKey, vendorTemplateCatalogKey} from './registerCatalogIdentity';
import {aiScope} from './brawndoAI';

test('every native picker entry has an exact shared catalog identity', () => {
  expect(VENDOR_WORKFLOW_TEMPLATES.map(template => vendorTemplateCatalogKey(template)).sort()).toEqual(Object.keys(identity.vendors).sort());
  expect(AI_TEMPLATES.map(template => aiTemplateDraft(template).catalog_key).sort()).toEqual([...identity.ai_systems].sort());
});

test('iVenture uses its existing picker image and other available Vendor SVG assets remain unchanged', () => {
  const logo = registerCatalogLogo('vendors', {catalog_key:'iventure-solutions'});
  expect(logo.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(VENDOR_WORKFLOW_LOGOS['iVenture Solutions']).toContain(logo);
  for (const key of ['microsoft-365', 'salesforce']) {
    expect(decodeURIComponent(registerCatalogLogo('vendors', {catalog_key:key}).split(',').slice(1).join(','))).toBe(VENDOR_WORKFLOW_LOGOS[identity.vendors[key]]);
  }
  expect(registerCatalogLogo('vendors', {catalog_key:'knowbe4'})).toBeUndefined();
});

test('same-provider products resolve only through their distinct native keys', () => {
  for (const key of ['chatgpt', 'm365', 'cstudio', 'ghcopilot']) {
    expect(registerCatalogLogo('ai_systems', {catalog_key:key})).toBe(AI_LOGOS[key]);
  }
  // The native picker currently shares Microsoft artwork for two distinct entries.
  expect(registerCatalogLogo('ai_systems', {catalog_key:'cstudio', provider:'GitHub'})).toBe(AI_LOGOS.cstudio);
  expect(registerCatalogLogo('ai_systems', {catalog_key:'m365'})).not.toBe(AI_LOGOS.ghcopilot);
});

test('renaming a catalog-backed record retains its exact logo without mutating the record', () => {
  const record = Object.freeze({catalog_key:'chatgpt', ai_system_id:'same-id', name:'Internal writing assistant', status:'active', approval_status:'approved'});
  expect(registerCatalogLogo('ai_systems', record)).toBe(AI_LOGOS.chatgpt);
  expect(record.name).toBe('Internal writing assistant');
  expect(record.approval_status).toBe('approved');
});

test.each([undefined, null, '', 'missing', 'toString', '__proto__', 'https://logo.invalid', {}, ['chatgpt']])('invalid/missing identity %p never guesses from brand-like names or record URLs', key => {
  const row = {catalog_key:key, name:'ChatGPT Microsoft 365', provider:'OpenAI Microsoft', logo:'https://logo.invalid', svg:'<svg onload="unsafe"/>'};
  expect(registerCatalogLogo('ai_systems', row)).toBeUndefined();
  expect(registerCatalogLogo('vendors', row)).toBeUndefined();
});

test('catalog validation rejects cross-module identities and logo decoration cannot change approval scope', () => {
  expect(validateCatalogKey('vendors', null)).toBeNull();
  expect(isCatalogKey('vendors', 'm365')).toBe(false);
  expect(() => validateCatalogKey('vendors', 'm365')).toThrow('Invalid catalog key');
  expect(() => validateCatalogKey('ai_systems', 'microsoft-365')).toThrow('Invalid catalog key');
  const row = {name:'Test',provider:'Microsoft',screening:{third_party:true},approval_status:'approved'};
  expect(aiScope({...row, catalog_key:'m365'})).toEqual(aiScope({...row, catalog_key:'cstudio'}));
});
