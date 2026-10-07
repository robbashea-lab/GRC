// Release-time source comparison. Network access is explicit, never part of app runtime.
const cis = require('../shared/catalogs/cisIG1.json');
const plain = html => html.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([a-f\d]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&(?:rsquo|lsquo);/g, "'");
const normalize = value => plain(value).toLowerCase().replace(/[^a-z\d]/g, '');
async function verify() {
  const failures = [], found = new Set();
  for (let control = 1; control <= 18; control++) {
    const url = `https://cas.docs.cisecurity.org/en/latest/source/Controls${control}/`;
    const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    const html = await response.text();
    if (!html.includes('v8.1')) throw new Error('Unexpected source version: ' + url);
    const blocks = [...html.matchAll(/<h2[^>]*>(\d+\.\d+):\s*([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/g)];
    for (const [, id, title, body] of blocks) {
      found.add(id);
      const row = cis.requirements.find(r => r.id === id);
      const text = [...body.split('<table>')[0].matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]).join(' ');
      const groups = body.match(/<tbody>[\s\S]*?<td>[\s\S]*?<\/td>[\s\S]*?<td>[\s\S]*?<\/td>\s*<td>([^<]*)<\/td>/)?.[1];
      if (!row || normalize(row.title) !== normalize(title) || normalize(row.official_text) !== normalize(text) || !groups?.split(',').map(Number).includes(row.implementation_group)) {
        failures.push(id);
        console.log(JSON.stringify({id, title: plain(title), text: plain(text), groups}));
      }
    }
    console.log(`Control ${control}: ${blocks.length} source safeguards inspected`);
  }
  for (const row of cis.requirements) if (!found.has(row.id)) failures.push('missing ' + row.id);
  console.log(JSON.stringify({sourceSafeguards: found.size, catalogSafeguards: cis.requirements.length, differences: failures}));
  if (failures.length) process.exitCode = 1;
}
verify().catch(error => {console.error(error.message); process.exitCode = 1;});
