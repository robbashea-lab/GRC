import {zipSync,strToU8} from 'fflate';

export const FAMILIES = ['AC','AT','AU','CM','IA','IR','MA','MP','PS','PE','RA','CA','SC','SI'];
export const poamId = row => 'POAM-' + row.id;
export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : '';
}
export const displayDate = value => String(value || '').slice(0,10);
export function officeZip(parts,generatedAt) {
  return zipSync(Object.fromEntries(parts.map(([path, value]) =>
    [path,typeof value === 'string' ? strToU8(value) : value])),{level:4,mtime:generatedAt});
}
