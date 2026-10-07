// Materialize reviewed content, not an application-time content generator.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../shared/catalogs');
const cis = require(path.join(root, 'cisIG1.json'));
const criteria = require(path.join(root, 'operatorGuidance/cisAssessmentCriteria.json'));
const guidance = require(path.join(root, 'operatorGuidance/cisAssessmentGuidance.json'));
const definitions = {};
for (const row of cis.requirements.filter(r => r.control > 1)) {
  const items = criteria.requirements[row.id]?.criteria;
  const aid = guidance.requirements[row.id];
  if (!items?.length || !aid?.evidence?.length || !row.official_text) throw new Error('Missing reviewed content: ' + row.id);
  const elements = items.map(c => ({id: c.id, text: c.text}));
  if (row.id === '11.1') elements.push({id: '11.1-guided-backup-procedures', text: 'The documented recovery process includes detailed backup procedures.'});
  if (row.id === '17.5') elements.push({id: '17.5-guided-third-parties', text: 'Incident-response responsibilities include relevant third parties.'});
  definitions[row.id] = {
    title: row.title, control: row.control, groups: [1, 2, 3].filter(g => g >= row.implementation_group),
    root: 'practice', source: criteria.requirements[row.id].source || row.source,
    guidance: row.guidance, evidence: aid.evidence,
    elements: elements.map(e => ({...e, conditional: /\b(where|when) (appropriate|supported|possible)|where a provider|where remote workers|where supported|when possible|to the extent possible/i.test(e.text)}))
  };
}
const pack = {version: 'cis-v8.1-program-1', framework_id: 'cis-ig1', framework_version: '8.1',
  reviewed_on: '2026-10-07', criteria_revision: criteria.revision, guidance_revision: guidance.revision,
  basis: 'Authored safeguard assessment criteria; CIS v8.1 requirements, not CAS metrics. Evidence examples and optional context do not impose additional obligations.', definitions};
const output = JSON.stringify(pack, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path.join(root, 'guidedCisProgram.json'), 'utf8').replace(/\r\n/g, '\n') !== output) throw new Error('Guided content differs from its reviewed inputs: review and version changes explicitly.');
  console.log('148 expanded Safeguard definitions match reviewed inputs');
} else process.stdout.write(output);
