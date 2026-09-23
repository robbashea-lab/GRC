// Read-only installed-tree inventory. Sends public package names/versions only.
// Advisory matches are not a substitute for application reachability review.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '../node_modules'));
const packages = new Map();
function visit(directory) {
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith('.')) continue;
    const folder = path.join(directory, name);
    if (name.startsWith('@')) { visit(folder); continue; }
    const manifest = path.join(folder, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (data.name && data.version && !data.private) {
      const entries = packages.get(data.name) || [];
      entries.push({version: data.version, location: path.relative(root, folder)});
      packages.set(data.name, entries);
    }
    visit(path.join(folder, 'node_modules'));
  }
}
(async () => {
  visit(root);
  if (!packages.size) throw Error('No installed packages found');
  const inventory = Object.fromEntries([...packages].map(([name, rows]) => [name, [...new Set(rows.map(row => row.version))].sort()]));
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(inventory), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error('Registry advisory request failed: ' + response.status);
  const result = await response.json();
  console.log(JSON.stringify({packageNames: packages.size, advisories: Object.entries(result).flatMap(([name, advisories]) =>
    advisories.map(advisory => ({name, id: advisory.id, title: advisory.title, severity: advisory.severity,
      url: advisory.url, vulnerable_versions: advisory.vulnerable_versions, installed: packages.get(name)})))}, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
