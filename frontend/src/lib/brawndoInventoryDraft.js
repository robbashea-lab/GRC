import {visibleQuestions} from './guidedAssessment';

const hasText = value => typeof value === 'string' && !!value.trim();
// Route explicit uncertainty as reported; do not infer an owner or interpret the rest of the prose.
const uncertain = value => hasText(value) && /(?:^unknown\b|\b(?:not sure|not known|not confirmed|unconfirmed|unsure|needs confirmation|to be confirmed)\b)/i.test(value.trim());
const quote = value => `“${value}”`;

// Wording only: the caller supplies the native evaluation and owns every save.
export function brawndoInventoryDraft(answers, version, result, clientName = 'Brawndo') {
  const questions = visibleQuestions('1.1', answers, version);
  const active = new Set(questions.map(question => question.id));
  const answer = id => active.has(id) ? answers[id] : undefined;
  const opening = {
    Yes: `${clientName} reports maintaining an enterprise asset inventory.`,
    Partially: `${clientName} reports a partially established enterprise asset inventory.`,
    No: `${clientName} reports that an enterprise asset inventory is not currently in place.`,
  }[answer('inventory')] || `${clientName} has not confirmed whether an enterprise asset inventory is in place.`;
  const practice = [opening];
  const gaps = [...result.gaps];
  const confirmations = [...result.unknowns];

  // The original interview mixed gaps and uncertainty in one free-text answer.
  if (version === 'brawndo-cis-pilot-1' && hasText(answer('gaps'))) {
    const historical = `Reviewer-reported follow-up: ${answer('gaps').trim()}`;
    const index = gaps.indexOf(historical);
    if (index !== -1) gaps.splice(index, 1);
    confirmations.push(`Historical follow-up, not classified as a confirmed gap: ${quote(answer('gaps'))}.`);
  }

  for (const [id, label] of [
    ['existing', 'Reported existing information and current practice'],
    ['system', 'Reported inventory tool or location'],
    ['owner', 'Reported inventory responsibility'],
    ['sources', 'Reported inventory source arrangement'],
    ['maintenance_detail', 'Reported inventory update process'],
    ['last_review', 'Reported last complete inventory review date'],
    ['reconciled', 'Reported reconciliation against discovery or management sources'],
    ['scope_reason', 'Reported applicability explanation'],
    ['evidence', 'Reported supporting records, not independently verified'],
  ]) {
    const value = answer(id);
    if (hasText(value)) (uncertain(value) ? confirmations : practice).push(`${label}: ${quote(value)}.`);
  }

  const maintenance = answer('maintenance');
  const updatePractice = {
    Yes: 'Asset additions, changes and retirements are reported to be reflected consistently in the inventory.',
    Partially: 'Inventory updates for asset additions, changes and retirements are reported as only partly consistent.',
    No: 'Inventory updates for asset additions, changes and retirements are reported as inconsistent.',
  }[maintenance];
  if (updatePractice) practice.push(updatePractice);
  else if (hasText(maintenance)) confirmations.push(`Consistency of inventory updates requires confirmation; reported answer: ${quote(maintenance)}.`);

  const frequency = answer('frequency');
  if (hasText(frequency)) {
    if (uncertain(frequency)) confirmations.push(`Complete-inventory review frequency requires confirmation; reported answer: ${quote(frequency)}.`);
    else practice.push(`The complete inventory is reportedly reviewed and updated ${frequency.toLowerCase()}.`);
  }

  if (answer('sources')?.startsWith('Multiple') && hasText(answers.sources_detail)) {
    (uncertain(answers.sources_detail) ? confirmations : practice).push(`Reported sources and their scope: ${quote(answers.sources_detail)}.`);
  }

  for (const question of questions.filter(item => item.type === 'matrix')) {
    const positive = question.rows.filter(row => answer(question.id)?.[row] === 'Yes');
    const excluded = question.rows.filter(row => answer(question.id)?.[row] === 'Not applicable');
    if (positive.length) practice.push(`${question.id === 'coverage' ? 'The reported inventory covers' : 'The inventory is reported to record'}: ${positive.join('; ')}.`);
    if (excluded.length) practice.push(`Reported non-applicability: ${excluded.join('; ')}.`);
    // Native gap/unknown messages already identify the deficient and uncertain rows.
  }

  for (const question of questions) {
    const key = question.id + '_detail';
    // A detail may itself be a native question; source scope is active only for multiple sources.
    if (active.has(key) || question.id === 'sources' || !hasText(answers[key])) continue;
    confirmations.push(`Additional reported context, not separately classified — ${question.prompt}: ${quote(answers[key])}.`);
  }

  if (version !== 'brawndo-cis-pilot-1' && hasText(answer('gaps'))) {
    const index = gaps.indexOf(`Reviewer-reported follow-up: ${answer('gaps').trim()}`);
    const detail = `Additional reported gap detail: ${quote(answer('gaps'))}.`;
    if (index === -1) gaps.push(detail);
    else gaps[index] = detail;
  }
  if (hasText(answer('unknowns'))) {
    const index = confirmations.indexOf(`Reviewer-reported uncertainty: ${answer('unknowns').trim()}`);
    const detail = `Additional reported uncertainty: ${quote(answer('unknowns'))}.`;
    if (index === -1) confirmations.push(detail);
    else confirmations[index] = detail;
  }

  const bullets = items => [...new Set(items)].map(item => `- ${item}`).join('\n');
  return [
    practice.join(' '),
    'Identified gaps\n' + (gaps.length ? bullets(gaps) : 'No additional gaps were reported in these answers.'),
    'Items requiring confirmation\n' + (confirmations.length ? bullets(confirmations) : 'No additional items requiring confirmation were reported in these answers.'),
  ].join('\n\n');
}
