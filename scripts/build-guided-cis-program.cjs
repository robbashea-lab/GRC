// Materialize reviewed content, not an application-time content generator.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../shared/catalogs');
const cis = require(path.join(root, 'cisIG1.json'));
const criteria = require(path.join(root, 'operatorGuidance/cisAssessmentCriteria.json'));
const guidance = require(path.join(root, 'operatorGuidance/cisAssessmentGuidance.json'));
// Reviewed scope corrections apply to a new question version only. Historical
// program-1/program-2 packs retain their wording, matrix keys and group positions.
const correctedElements = {
  '2.2-c5': {conditional: true}, '2.2-c6': {conditional: true},
  '4.1-c3': {text: 'A documented secure-configuration process is established and maintained for enterprise assets and software.'},
  '4.10-c1': {conditional: true},
  '4.10-c4': {text: 'Supported laptops allow no more than 20 local failed authentication attempts before device lockout.', conditional: true},
  '4.12-c1': {conditional: true},
  '6.7-c3': {text: 'Where supported, centralized access control for enterprise assets uses a directory service or SSO provider.', conditional: true},
  '8.4-c3': {text: 'Time synchronization is standardized.', conditional: false},
  '8.6-c3': {text: 'DNS query audit logs are collected on enterprise assets where appropriate and supported.', conditional: true},
  '8.7-c3': {text: 'URL request audit logs are collected on enterprise assets where appropriate and supported.', conditional: true},
  '8.9-c4': {text: 'Where centralization is possible, centralized audit-log collection and retention follow the documented audit-log management process.', conditional: true},
  '13.2-c3': {text: 'Host-based intrusion detection is deployed on enterprise assets where appropriate and/or supported.', conditional: true},
  '13.3-c3': {text: 'Network intrusion detection is deployed on enterprise assets where appropriate.', conditional: true},
  '13.4-c3': {text: 'Traffic is filtered between network segments where appropriate.', conditional: true},
  '13.7-c4': {text: 'Host-based intrusion prevention is deployed on enterprise assets where appropriate and/or supported.', conditional: true},
  '13.7-c6': {text: 'For enterprise assets where host-based intrusion prevention is appropriate and/or supported, the solution provides prevention rather than detection alone.', conditional: true},
  '13.8-c4': {text: 'A network intrusion prevention solution is deployed where appropriate.', conditional: true},
  '18.4-c5': {conditional: true}
};
const retiredElements = new Set(['8.6-c4', '8.7-c4', '13.2-c4', '13.3-c4', '13.4-c4', '13.7-c5', '13.8-c5', '13.8-c6']);
const correctedGuidance = {
  '3.11': 'Encrypt sensitive data at rest. Storage-layer encryption meets the minimum; application-layer or client-side encryption may provide additional protection but is not mandatory.',
  '10.3': 'Assess removable-media autorun and autoplay auto-execute behavior, rather than requiring every media browsing or playback interface to be disabled.',
  '16.9': 'Train all software-development personnel at least annually for their development environments and responsibilities. Design training to promote security within the development team and build a culture of security among developers; example general-security topics are not a prescribed syllabus.',
  '15.5': 'Assess providers according to the provider-management policy; reassess annually, at a minimum, or with new and renewed contracts.',
  '17.5': 'Record who fulfils each relevant incident-response function, including providers where applicable. One person or team may fulfil multiple functions; separate departments are not required.'
};
const definitions = {};
for (const row of cis.requirements.filter(r => r.control > 1)) {
  const items = criteria.requirements[row.id]?.criteria;
  const aid = guidance.requirements[row.id];
  if (!items?.length || !aid?.evidence?.length || !row.official_text) throw new Error('Missing reviewed content: ' + row.id);
  const elements = items.map(c => ({id: c.id, text: c.text}));
  if (row.id === '11.1') elements.push({id: '11.1-guided-backup-procedures', text: 'The documented recovery process includes detailed backup procedures.'});
  if (row.id === '17.5') elements.push({id: '17.5-guided-third-parties', text: 'Incident-response responsibilities include relevant third parties.'});
  if (row.id === '13.1') elements.push({id: '13.1-guided-correlation-alerts', text: 'The centralized security-event platform has security-relevant correlation alerts configured and operating.'});
  if (row.id === '16.2') elements.push({id: '16.2-guided-external-policy-consideration', text: 'Where the enterprise develops applications for third parties, it considers an externally facing vulnerability-handling policy to set expectations for outside stakeholders.', conditional: true});
  if (row.id === '16.9') elements.push({id: '16.9-guided-security-culture', text: 'Training is designed to build a security culture among developers.', conditional: false});
  definitions[row.id] = {
    title: row.title, control: row.control, groups: [1, 2, 3].filter(g => g >= row.implementation_group),
    root: 'practice', source: criteria.requirements[row.id].source || row.source,
    guidance: correctedGuidance[row.id] || row.guidance, evidence: aid.evidence,
    elements: elements.filter(e => !retiredElements.has(e.id)).map(e => ({...e, conditional: e.conditional ?? /\b(where|when) (appropriate|supported|possible)|where a provider|where remote workers|where supported|when possible|to the extent possible/i.test(e.text), ...correctedElements[e.id]}))
  };
}
const pack = {version: 'cis-v8.1-program-3', framework_id: 'cis-ig1', framework_version: '8.1',
  reviewed_on: '2026-10-09', criteria_revision: criteria.revision, guidance_revision: guidance.revision,
  basis: 'Authored safeguard assessment criteria; CIS v8.1 requirements, not CAS metrics. Evidence examples and optional context do not impose additional obligations.', definitions};
const output = JSON.stringify(pack, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path.join(root, 'guidedCisProgram.json'), 'utf8').replace(/\r\n/g, '\n') !== output) throw new Error('Guided content differs from its reviewed inputs: review and version changes explicitly.');
  console.log('148 expanded Safeguard definitions match reviewed inputs');
} else process.stdout.write(output);
