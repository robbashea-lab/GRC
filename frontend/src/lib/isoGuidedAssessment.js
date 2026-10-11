import isms from '@catalogs/guidedIsoIsms.json';
import organizational from '@catalogs/guidedIsoOrganizationalPeople.json';
import technology from '@catalogs/guidedIsoPhysicalTechnology.json';
const catalog = {version: 'iso27001-omni-1', framework_id: 'iso-27001',
  definitions: {...isms.definitions, ...organizational.definitions, ...technology.definitions}};

export const isoGuidedCatalog = catalog;
const versions = {[catalog.version]: catalog};
const choices = ['Yes', 'Partially', 'No', 'Not sure'];
const contextChoices = ['Relevant', 'Not relevant here', 'Not sure'];
const extraQuestions = [
  {id: 'gaps', type: 'text', prompt: 'Additional gap context (optional; not a status decision)'},
  {id: 'unknowns', type: 'text', prompt: 'Additional confirmation context (optional; not a status decision)'},
  {id: 'evidence', type: 'text', prompt: 'Reported supporting records'},
];
const text = value => value?.trim() || '';
const concise = value => value.length > 500 ? `${value.slice(0, 500)}… (full response retained in the interview)` : value;

function definitionFor(id, version) {
  const source = versions[version || catalog.version];
  if (!source || !Object.hasOwn(source.definitions, id)) throw new Error('ISO question set is not available.');
  return source.definitions[id];
}

function normalizedGroups(id, version) {
  return definitionFor(id, version).groups.map(group => ({...group, questions: group.questions.map(question => {
    const type = question.type || 'select';
    return {...question, type, choices: question.choices || (type === 'context' ? contextChoices : type === 'select' ? choices : [])};
  })}));
}

function activeQuestions(id, answers, version) {
  const questions = normalizedGroups(id, version).flatMap(group => group.questions);
  const byId = new Map(questions.map(question => [question.id, question]));
  const active = (question, seen = new Set()) => {
    if (!question.condition) return true;
    const parent = byId.get(question.condition.id);
    if (!parent || seen.has(question.id)) return false;
    return answers[parent.id] === question.condition.equals && active(parent, new Set([...seen, question.id]));
  };
  return questions.filter(question => active(question));
}

// Presentation eligibility only; the authenticated native writer authorizes the tenant and action.
export function isoGuidedEnabled(clientId, user, frameworkKey, configuration = {}, definitionId) {
  if (!clientId || !user?.user_id || frameworkKey !== 'iso-27001' || configuration?.__program_active !== true) return false;
  return !definitionId || Object.hasOwn(catalog.definitions, definitionId);
}

export function isoQuestions(id, answers = {}, version = catalog.version) {
  return [...activeQuestions(id, answers, version), ...extraQuestions];
}

export function isoGroups(id, answers = {}, version = catalog.version) {
  const active = new Set(activeQuestions(id, answers, version).map(question => question.id));
  return normalizedGroups(id, version).map(group => ({...group, questions: group.questions.filter(question => active.has(question.id))})).filter(group => group.questions.length > 0);
}

export function validateIsoAnswers(id, answers, version = catalog.version) {
  const questions = new Map([...normalizedGroups(id, version).flatMap(group => group.questions), ...extraQuestions].map(question => [question.id, question]));
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Invalid ISO interview answers.');
  for (const [key, value] of Object.entries(answers)) {
    const detail = key.endsWith('_detail');
    const question = questions.get(detail ? key.slice(0, -7) : key);
    if (!question || typeof value !== 'string' || value.length > 2000 || (!detail && question.type !== 'text' && !question.choices.includes(value))) {
      throw new Error('Invalid ISO interview answer. Use the available choices and at most 2,000 characters.');
    }
  }
}

export function validateIsoCompletion(id, answers, version = catalog.version) {
  validateIsoAnswers(id, answers, version);
  for (const question of activeQuestions(id, answers, version)) {
    if (question.type === 'text') continue;
    if (!answers[question.id]) throw new Error('Answer each applicable ISO question before reviewing the summary.');
    if (question.type === 'context' && answers[question.id] === 'Not relevant here' && !text(answers[question.id + '_detail'])) {
      throw new Error('Explain why this conditional context is not relevant here before reviewing the summary.');
    }
  }
}

export function isoGuidedResult(id, answers, version = catalog.version, clientName = 'The organization') {
  validateIsoAnswers(id, answers, version);
  const definition = definitionFor(id, version), active = activeQuestions(id, answers, version);
  const basis = [], gaps = [], unknowns = [], nextSteps = [], signals = [], breakdown = [];
  let meaningful = false, confirmedNo = false, substantive = 0;
  const addSignal = (kind, question, message) => {
    signals.push({kind, questionId: question.id, text: message});
    (kind === 'gap' ? gaps : unknowns).push(message);
    nextSteps.push(kind === 'gap' ? question.remediation || `Address ${question.topic || question.prompt}.` : `Confirm ${question.topic || question.prompt} with the responsible team.`);
  };
  for (const group of isoGroups(id, answers, version)) {
    const facts = [];
    for (const question of group.questions) {
      const value = answers[question.id], detail = text(answers[question.id + '_detail']), topic = question.topic || question.prompt;
      const suffix = detail ? ` — ${detail}` : '', summarySuffix = detail ? ` — ${concise(detail)}` : '';
      if (question.type === 'text') {
        if (text(value)) facts.push(`${topic}: ${concise(text(value))}`);
        continue;
      }
      if (question.type === 'context') {
        if (value === 'Relevant') facts.push(`${topic}: conditional context reported relevant${summarySuffix}.`);
        else if (value === 'Not relevant here' && detail) facts.push(`${topic}: conditional context reported not relevant here — ${concise(detail)}.`);
        else { addSignal('verification', question, `${topic}: conditional relevance needs confirmation${suffix}.`); facts.push(`${topic}: conditional relevance needs confirmation${summarySuffix}.`); }
        continue;
      }
      substantive += 1;
      if (value === 'Yes') { meaningful = true; basis.push(`${topic}: reported in place${suffix}.`); facts.push(`${topic}: reported in place${summarySuffix}.`); }
      else if (value === 'Partially') { meaningful = true; addSignal('gap', question, `${topic}: reported partially in place${suffix}.`); facts.push(`${topic}: reported partially in place${summarySuffix}.`); }
      else if (value === 'No') { confirmedNo = true; addSignal('gap', question, `${topic}: reported not in place${suffix}.`); facts.push(`${topic}: reported not in place${summarySuffix}.`); }
      else { addSignal('verification', question, `${topic}: needs confirmation${suffix}.`); facts.push(`${topic}: needs confirmation${summarySuffix}.`); }
    }
    if (facts.length) breakdown.push(`${group.title}\n${facts.map(fact => `- ${fact}`).join('\n')}`);
  }
  if (!substantive) {
    unknowns.push('No substantive practice is established by the applicable answers; confirm the implementation assessment in the ISMS scope.');
    nextSteps.push('Confirm the applicable practices before making a native implementation decision.');
  }
  const additionalContext = ['gaps', 'unknowns'].map(key => text(answers[key])).filter(Boolean);
  if (additionalContext.length) breakdown.push(`Additional reported context (optional notes; separate from the selected-answer outcome)\n${additionalContext.map(context => `- ${concise(context)}`).join('\n')}`);
  const status = confirmedNo ? 'needs_attention' : !meaningful ? 'not_assessed' : gaps.length || unknowns.length ? 'in_progress' : 'addressed';
  const position = {addressed: 'practices addressing', in_progress: 'partial or unresolved practices for', needs_attention: 'confirmed deficiencies affecting', not_assessed: 'an unconfirmed implementation position for'}[status];
  const overview = `${clientName} reports ${position} ${id} — ${definition.title} within the ISMS scope. This is reported implementation, not independent verification or certification.`;
  const actions = [...new Set(nextSteps)];
  const narrative = `OVERVIEW\n${overview}\n\nIMPLEMENTATION BREAKDOWN\n${breakdown.join('\n\n') || 'No practices have been reported.'}\n\nITEMS TO ADDRESS\n${actions.length ? actions.map(action => `- ${concise(action)}`).join('\n') : 'No confirmation or remediation actions were derived from the selected substantive answers.'}${additionalContext.length?'\nReview the optional reported context above separately; it does not change the proposed status.':''}`;
  if (narrative.length > 20000) throw new Error('The generated write-up exceeds 20,000 characters. Shorten the interview details before reviewing it.');
  return {version, status, narrative, basis, gaps, unknowns, nextSteps: actions, evidence: text(answers.evidence) ? [text(answers.evidence)] : [],
    answers: [...active, ...extraQuestions].filter(question => text(answers[question.id])).map(question => ({prompt: question.prompt,
      answer: answers[question.id] + (text(answers[question.id + '_detail']) ? `\nReported supporting detail: ${text(answers[question.id + '_detail'])}` : '')})), signals};
}
