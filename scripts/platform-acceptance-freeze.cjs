// QA-only source evidence; never updates application files or visual baselines.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');

const args = process.argv.slice(2);
const option = name => {const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1];};
const root = path.resolve(__dirname, '..');
const baseline = option('--baseline');
const candidate = option('--candidate') || baseline;
const output = path.resolve(option('--out') || path.join(root, 'docs/platform-acceptance/freeze-inventory.json'));
assert.match(baseline || '', /^[a-f0-9]{40}$/, 'Supply the exact approved baseline SHA');
assert.match(candidate || '', /^[a-f0-9]{40}$/, 'Supply an exact candidate SHA');
const dependencies = option('--dependencies');
const parserPath = require.resolve('@babel/parser', {paths: [path.join(root, 'frontend'), ...(dependencies ? [path.resolve(dependencies)] : [])]});
const parser = require(parserPath);
const parserVersion = require(path.join(path.dirname(parserPath), '../package.json')).version;
const git = argv => execFileSync('git', argv, {cwd: root, maxBuffer: 256 * 1024 * 1024});
for (const revision of [baseline, candidate]) assert.equal(git(['rev-parse', revision + '^{commit}']).toString().trim(), revision);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const staticAttrs = new Set(['title', 'placeholder', 'alt', 'aria-label', 'aria-description', 'aria-describedby', 'aria-labelledby', 'aria-live', 'aria-modal', 'role', 'tabIndex']);
const messageKeys = new Set(['label', 'title', 'description', 'subtitle', 'heading', 'help', 'helper', 'message', 'empty', 'notice', 'text', 'caption', 'aria-label', 'placeholder', 'alt']);

function tokens(source, filename) {
  const tree = parser.parse(source, {sourceType: 'unambiguous', plugins: ['jsx', ...(filename.endsWith('.ts') || filename.endsWith('.tsx') ? ['typescript'] : [])]});
  const visible = [], conservative = [];
  function add(destination, kind, value, node, context = '') {
    if (typeof value !== 'string' || !value.trim()) return;
    destination.push({kind, value, context, source_line: node.loc?.start.line || null});
  }
  function walk(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXText') add(visible, 'jsx_text', node.value, node);
    if (node.type === 'JSXAttribute' && staticAttrs.has(node.name?.name)) {
      const value = node.value?.type === 'StringLiteral' ? node.value.value : node.value?.type === 'JSXExpressionContainer' && node.value.expression?.type === 'StringLiteral' ? node.value.expression.value : null;
      add(visible, 'visible_attribute', value, node, node.name.name);
    }
    if (node.type === 'StringLiteral') {
      const property = parent?.type === 'ObjectProperty' ? parent.key?.name || parent.key?.value : '';
      add(conservative, 'source_string', node.value, node, property || parent?.type || '');
      if (messageKeys.has(property)) add(visible, 'named_copy_property', node.value, node, property);
    }
    if (node.type === 'TemplateElement') add(conservative, 'template_static_segment', node.value.raw, node, parent?.type || '');
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, node));
      else if (value && typeof value === 'object') walk(value, node);
    }
  }
  walk(tree, null);
  return {visible_copy_and_accessibility_tokens: visible, conservative_source_strings_and_messages: conservative};
}

function manifest(revision) {
  const lines = git(['ls-tree', '-r', revision, '--', 'frontend/src', 'frontend/public', 'shared/catalogs']).toString().trim().split('\n').filter(Boolean);
  const entries = lines.map(line => {const [metadata, filename] = line.split('\t'); const [mode, type, blob] = metadata.split(' '); return {path: filename, mode, type, git_blob: blob};})
    .filter(row => row.type === 'blob' && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(row.path) && !row.path.includes('/__snapshots__/'));
  // cat-file receives all selected immutable objects in one process below.
  const objects = execFileSync('git', ['cat-file', '--batch'], {cwd: root, input: entries.map(row => row.git_blob + '\n').join(''), maxBuffer: 256 * 1024 * 1024});
  let cursor = 0;
  for (const entry of entries) {
    const end = objects.indexOf(10, cursor); assert.ok(end >= cursor);
    const [object, type, length] = objects.subarray(cursor, end).toString().split(' ');
    assert.equal(object, entry.git_blob); assert.equal(type, 'blob');
    const size = Number(length); assert.ok(Number.isSafeInteger(size));
    const bytes = objects.subarray(end + 1, end + 1 + size); cursor = end + 2 + size;
    entry.sha256 = sha256(bytes); entry.bytes = size; delete entry.type;
    const stylesheetOrAsset = /\.(?:css|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/i.test(entry.path);
    const catalog = entry.path.startsWith('shared/catalogs/') || /\.json$/.test(entry.path);
    entry.kind = stylesheetOrAsset ? 'frozen_style_artwork_font' : catalog ? 'frozen_catalog_or_static_data' : 'interface_source';
    if (/\.[cm]?[jt]sx?$/.test(entry.path)) Object.assign(entry, tokens(bytes.toString('utf8'), entry.path));
  }
  assert.equal(cursor, objects.length);
  assert.equal(new Set(entries.map(row => row.path)).size, entries.length);
  return {revision, entries};
}

// Self-check: visible copy/attributes are extracted, ordinary source keys remain conservative.
const sample = tokens('const config={label:"Status"}; export default ()=><button aria-label="Open"><span>Save</span>{`Count: ${count}`}</button>;', 'sample.jsx');
assert.ok(sample.visible_copy_and_accessibility_tokens.some(t => t.value === 'Save'));
assert.ok(sample.visible_copy_and_accessibility_tokens.some(t => t.context === 'aria-label' && t.value === 'Open'));
assert.ok(sample.conservative_source_strings_and_messages.some(t => t.kind === 'template_static_segment' && t.value === 'Count: '));
const current = manifest(candidate);
const frozen = candidate === baseline ? current : manifest(baseline);
const copyValues = row => (row?.visible_copy_and_accessibility_tokens || []).map(({source_line, ...t}) => t);
const strings = row => (row?.conservative_source_strings_and_messages || []).map(({source_line, ...t}) => t);
const before = new Map(frozen.entries.map(row => [row.path, row]));
const after = new Map(current.entries.map(row => [row.path, row]));
const changes = [...new Set([...before.keys(), ...after.keys()])].filter(filename => before.get(filename)?.sha256 !== after.get(filename)?.sha256).map(filename => {
  const a = before.get(filename), b = after.get(filename);
  return {path: filename, change: !a ? 'added' : !b ? 'removed' : 'changed', kind: b?.kind || a.kind,
    frozen_style_or_catalog_changed: (b?.kind || a.kind) !== 'interface_source',
    visible_copy_or_attribute_tokens_changed: JSON.stringify(copyValues(a)) !== JSON.stringify(copyValues(b)),
    conservative_strings_or_messages_changed: JSON.stringify(strings(a)) !== JSON.stringify(strings(b))};
});
const report = {schema_version: 1, baseline_commit: baseline, candidate_commit: candidate,
  method: 'Immutable git blobs; SHA-256 bytes; existing Babel AST JSX/static attribute/named copy tokens; conservative source strings/template segments',
  parser_version: parserVersion, file_count: current.entries.length, files: current.entries, changes,
  limitations: [
    'This is source evidence, not a visual screenshot/accessibility or functional acceptance pass.',
    'The visible-token extractor is partial: translated/computed copy and arbitrary expression strings can be missed. Conservative strings flag technical/API changes too and require source review.',
    'Backend-generated static messages require separate final source-diff review; this manifest covers frontend/public/shared catalogs.',
    'Do not permit a stylesheet/artwork/font/catalog or interface-wording change simply because a historical preservation script allowed it.',
    'Compare hosted screenshots on matching viewport/theme/role/fixture/route; no broad masks or regenerated baseline to accept an unauthorized change.'
  ], screenshots: {captured_here: false, coordinator_baseline_viewport: '1440x900', required_matches: ['viewport', 'theme', 'role', 'fixture values', 'route', 'OmniBot/window state']},
  freeze: 'Presentation and static interface copy unchanged; legitimate business data and approved generated narrative may update normally.',
  self_checks: 'Token sample, commit identity, batch object identities/lengths and unique file paths passed'};
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({baseline, candidate, file_count: report.file_count, changed_files: changes.length, output, source_only: true}));
if (changes.some(row => row.frozen_style_or_catalog_changed || row.visible_copy_or_attribute_tokens_changed)) process.exitCode = 1;
