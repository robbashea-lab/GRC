import React, {act, useState} from 'react';
import {createRoot} from 'react-dom/client';
import CisVisualRegister, {CisVisualHeader, CisVisualSnapshot} from './BrawndoCisVisualRegister';
import {cis, FRAMEWORKS} from '@/lib/frameworks';
import {cisSummary} from '@/lib/cisVerification';
import {matchesAssessment} from '@/lib/frameworkWorkspace';
import {securityDomainModel, securityDomainMapping} from '@/lib/brawndoSecurityDomains';
import {BRAWNDO_CIS, brawndoVerification} from '@/preview/brawndoProgram';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn()}));

function fixture(statusOverrides = {}) {
  const today = Date.now(), day = 86400000;
  const definitions = JSON.parse(JSON.stringify(cis.requirements.filter(row => row.implementation_group === 1)));
  const assessments = definitions.map(definition => {
    const sample = BRAWNDO_CIS[definition.id], status = statusOverrides[definition.id] || sample[0];
    return {framework_assessment_id: `native-${definition.id}`, definition_id: definition.id,
      client_id: 'demo_brawndo', framework_key: 'cis-ig1', framework_version: '8.1', status,
      verification: brawndoVerification(sample), technology: sample[2], implementation: sample[3],
      last_assessed: sample[1] == null ? null : new Date(today - sample[1] * day).toISOString(),
      na_rationale: status === 'not_applicable' ? 'Approved native scope exclusion' : '',
      work: {context_complete: true, evidence_count: sample[4] == null ? 0 : 1,
        latest_evidence_at: sample[4] == null ? null : new Date(today - sample[4] * day).toISOString(),
        finding_ids: [], review_ids: [], open_actions: 0, open_findings: 0, overdue_actions: 0, overdue_reviews: 0}};
  });
  const rows = definitions.map((definition, index) => ({...definition, ...assessments[index]}));
  const summary = cisSummary(rows);
  const data = {framework: {...FRAMEWORKS.find(row => row.key === 'cis-ig1')}, selected: true, configured: true,
    configuration: {implementation_group: 1}, definitions, assessments, active_definition_ids: definitions.map(row => row.id),
    implementation_position: {program_id: 'demo_brawndo:cis-ig1', availability: 'available',
      total: summary.total, denominator: summary.applicable, implemented: summary.addressed, excluded: summary.na,
      counts: [{key: 'addressed', count: summary.addressed}, {key: 'in_progress', count: summary.partial},
        {key: 'needs_attention', count: summary.gap}, {key: 'not_assessed', count: summary.notAssessed}]}};
  return {data, rows, domains: securityDomainModel(data, rows, 'demo_brawndo')};
}

function freeze(value) {
  Object.freeze(value);
  Object.values(value).forEach(child => {if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);});
  return value;
}

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  jest.clearAllMocks();
});
afterEach(async () => {await act(async () => root.unmount()); container.remove();});
const click = element => act(async () => element.click());
const button = name => [...container.querySelectorAll('button')].find(element => element.textContent === name);
const groups = () => [...container.querySelectorAll('.grp')];
const groupNames = () => groups().map(group => group.querySelector('.gname b').textContent);
const ids = () => [...container.querySelectorAll('.sg-id')].map(element => element.textContent);
async function render(source, overrides = {}) {
  const props = {rows: source.rows, visible: source.rows, domains: source.domains, filter: 'all', search: '',
    onOpen: jest.fn(), onFilter: jest.fn(), onSearch: jest.fn(), onClear: jest.fn(), ...overrides};
  await act(async () => root.render(<CisVisualRegister {...props}/>));
  return props;
}
async function chooseOrder(value) {
  await act(async () => {
    const select = container.querySelector('select'); select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
}
async function searchFor(value) {
  await act(async () => {
    const input = container.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', {bubbles: true}));
  });
}

test('native domains partition all 56 safeguards and retain exact opening references and complete titles', async () => {
  const source = freeze(fixture()), props = await render(source);
  expect(source.domains.every(domain => domain.available)).toBe(true);
  expect(groupNames()).toEqual(securityDomainMapping.domains.map(domain => domain.label));
  expect(groups()).toHaveLength(11);
  expect(container.querySelector('.summary').textContent).toContain('56 safeguards in 11 domains');
  expect(container.querySelectorAll('.sg')).toHaveLength(0);
  await click(button('Expand all'));
  expect(ids()).toEqual(securityDomainMapping.domains.flatMap(domain => domain.safeguardIds));
  expect(new Set(ids()).size).toBe(56);
  const displayed = [...container.querySelectorAll('.sg')];
  expect(displayed.every(element => element.tagName === 'BUTTON' && element.type === 'button')).toBe(true);
  expect(displayed.map(element => element.querySelector('.sg-t').textContent)).toEqual(source.domains.flatMap(domain => domain.rows.map(row => row.title)));
  const representative = [displayed[0], container.querySelector('[data-testid="requirement-14.7"]'), displayed.at(-1)];
  await act(async () => {
    representative.forEach(element => element.click());
  });
  props.onOpen.mock.calls.forEach(([record], index) => {
    expect(record).toBe(source.rows.find(row => row.definition_id === representative[index].querySelector('.sg-id').textContent));
  });
  expect(props.onOpen).toHaveBeenCalledTimes(3);
});

test('CIS controls retain native program order, partition all 56 safeguards and collapse together', async () => {
  const source = freeze(fixture()), props = await render(source);
  await click(button('CIS control'));
  expect(groups()).toHaveLength(15); expect(container.querySelectorAll('.sg')).toHaveLength(0);
  expect(container.querySelector('.summary').textContent).toContain('56 safeguards in 15 controls');
  await click(button('Expand all'));
  expect(ids()).toEqual(source.rows.map(row => row.definition_id));
  const displayed = [...container.querySelectorAll('.sg')];
  await act(async () => {displayed[0].click(); displayed.at(-1).click();});
  expect(props.onOpen.mock.calls[0][0]).toBe(source.rows[0]);
  expect(props.onOpen.mock.calls[1][0]).toBe(source.rows.at(-1));
  await click(button('Collapse all')); expect(container.querySelectorAll('.sg')).toHaveLength(0);
});

test('read-only ordering uses the full native groups and grouping preserves source records', async () => {
  const source = freeze(fixture()), before = JSON.stringify(source), props = await render(source);
  await chooseOrder('gaps');
  const ratios = groups().map(group => {
    const native = source.domains.find(domain => domain.label === group.querySelector('.gname b').textContent);
    return native.addressed / native.applicable;
  });
  expect(ratios).toEqual([...ratios].sort((a, b) => a - b));
  await chooseOrder('program');
  expect(groupNames()).toEqual(source.domains.map(domain => domain.label));
  await click(button('CIS control')); expect(groups()).toHaveLength(15);
  expect(props.onOpen).not.toHaveBeenCalled(); expect(JSON.stringify(source)).toBe(before);
  Object.values(api).forEach(method => expect(method).not.toHaveBeenCalled());
});

test('search and status intersection filters children while full-group status counts stay truthful', async () => {
  const source = fixture(), selected = source.rows.find(row => row.definition_id === '2.1');
  const visible = source.rows.filter(row => matchesAssessment(row, 'addressed', selected.title));
  const props = await render(source, {visible, filter: 'addressed', search: selected.title});
  expect(ids()).toEqual(['2.1']); expect(groups()).toHaveLength(1);
  expect(container.querySelector('.summary').textContent).toContain('1 safeguards in 1 domains');
  expect(container.querySelector('.gname small').textContent).toContain('5 safeguards');
  expect(container.querySelector('.g-impl b').textContent).toBe('2 of 5');
  expect(container.querySelector('.g-ass b').textContent).toBe('5 of 5');
  expect(container.querySelector('.sbar.hl .on').title).toBe('Implemented: 2 of 5');
  expect(button('Expand all')).toBeUndefined(); expect(button('Collapse all')).toBeUndefined();
  await click(container.querySelector('[aria-label="Clear search and filters"]'));
  expect(props.onClear).toHaveBeenCalledTimes(1);
});

test('read-only expansion and collapse preserve native records without writes or record opening', async () => {
  const source = freeze(fixture()), before = JSON.stringify(source), props = await render(source);
  await click(button('Expand all')); expect(container.querySelectorAll('.sg')).toHaveLength(56);
  await click(button('Collapse all')); expect(container.querySelectorAll('.sg')).toHaveLength(0);
  expect(props.onOpen).not.toHaveBeenCalled(); expect(JSON.stringify(source)).toBe(before);
  Object.values(api).forEach(method => expect(method).not.toHaveBeenCalled());
});

test('native read-only search and filters preserve data and never open records', async () => {
  const source = freeze(fixture()), before = JSON.stringify(source), onOpen = jest.fn();
  function NativeView() {
    const [filter, setFilter] = useState('all'), [search, setSearch] = useState('');
    return <CisVisualRegister rows={source.rows} domains={source.domains} filter={filter} search={search}
      visible={source.rows.filter(row => matchesAssessment(row, filter, search))} onOpen={onOpen}
      onFilter={setFilter} onSearch={setSearch} onClear={() => {setFilter('all'); setSearch('');}}/>;
  }
  await act(async () => root.render(<NativeView/>));
  await click([...container.querySelectorAll('[aria-label="Show safeguards"] button')].find(element => element.textContent.startsWith('Not assessed')));
  expect(ids()).toEqual(source.rows.filter(row => row.status === 'not_assessed').map(row => row.definition_id));
  await searchFor('Securely Dispose of Data'); expect(ids()).toEqual(['3.5']);
  await click(container.querySelector('[aria-label="Clear search and filters"]'));
  expect(container.querySelector('input[type="search"]').value).toBe('');
  expect(container.querySelector('.summary').textContent).toContain('56 safeguards');
  expect(onOpen).not.toHaveBeenCalled(); expect(JSON.stringify(source)).toBe(before);
  Object.values(api).forEach(method => expect(method).not.toHaveBeenCalled());
});

test('N/A stays in its native group and is excluded from implementation and assessed denominators', async () => {
  const source = fixture({'1.1': 'not_applicable'});
  await render(source);
  expect(source.domains.every(domain => domain.available)).toBe(true);
  expect(container.querySelector('.gname small').textContent).toContain('5 safeguards');
  expect(container.querySelector('.gname small').textContent).toContain('1 not applicable');
  expect(container.querySelector('.g-impl b').textContent).toBe('2 of 4');
  expect(container.querySelector('.g-impl').textContent).toContain('50.0%');
  expect(container.querySelector('.g-ass b').textContent).toBe('4 of 4');
  await click(container.querySelector('.grow'));
  expect(container.querySelector('[data-testid="requirement-1.1"] .st').textContent).toBe('Not applicable');
  const summary = cisSummary(source.rows, new Date(), source.data.implementation_position);
  await act(async () => root.render(<CisVisualSnapshot summary={summary} filter="all" onFilter={jest.fn()}/>));
  expect(container.querySelector('.now-value').textContent).toBe('58.2%');
  expect(container.querySelector('.now-head p').textContent).toBe('32 of 55 safeguards implemented');
  expect(container.querySelector('.bd-head').textContent).toContain('Assessed 48 of 55');
  expect(container.querySelector('.card-foot').textContent).toContain('1 not applicable');
});

test('empty intersections offer the native clear callback without fake results', async () => {
  const source = fixture(), props = await render(source, {visible: [], filter: 'not_assessed', search: 'no native title matches'});
  expect(container.querySelector('.empty h3').textContent).toBe('No safeguards match');
  expect(groups()).toHaveLength(0); expect(container.querySelectorAll('.sg')).toHaveLength(0);
  await click(button('Clear filters')); expect(props.onClear).toHaveBeenCalledTimes(1);
  expect(props.onOpen).not.toHaveBeenCalled();
});

test('unavailable native source stays unavailable in both groupings rather than publishing inferred zeros', async () => {
  const source = fixture(); source.data.implementation_position.availability = 'partial';
  source.domains = securityDomainModel(source.data, source.rows, 'demo_brawndo');
  await render(source);
  expect(groups()).toHaveLength(11);
  for (const group of groups()) {
    expect(group.querySelector('.g-impl b').textContent).toBe('Unavailable');
    expect(group.querySelector('.g-impl > span').textContent).toBe('—');
    expect(group.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Status mix unavailable');
    expect(group.textContent).not.toMatch(/undefined|NaN|Infinity|0 of 0/);
  }
  await click(button('CIS control'));
  for (const group of groups()) {
    expect(group.querySelector('.g-impl b').textContent).toBe('Unavailable');
    expect(group.querySelector('.g-impl > span').textContent).toBe('—');
    expect(group.querySelector('[role="img"]').getAttribute('aria-label')).toBe('Status mix unavailable');
  }
});

test('unavailable and zero-applicable snapshots do not fabricate a percentage or assessment date', async () => {
  const source = fixture(), onFilter = jest.fn();
  const unavailable = {...cisSummary(source.rows), available: false, reason: 'Native source is incomplete.'};
  await act(async () => root.render(<CisVisualSnapshot summary={unavailable} filter="all" onFilter={onFilter}/>));
  expect(container.querySelector('.now-value').textContent).toBe('—');
  expect(container.querySelector('.now-head').textContent).toContain('Implementation source unavailable');
  expect(container.querySelector('.now-head small').textContent).toBe('Assessment date unavailable');
  expect(container.querySelector('.sbar').getAttribute('aria-label')).toBe('Status mix unavailable');
  expect(container.querySelector('.card-foot').textContent).toContain('Native source is incomplete.');
  expect(container.textContent).not.toMatch(/undefined|NaN|Infinity|100\.0%|Oct 15, 2026/);
  const allExcluded = fixture(Object.fromEntries(source.rows.map(row => [row.definition_id, 'not_applicable'])));
  const summary = cisSummary(allExcluded.rows, new Date(), allExcluded.data.implementation_position);
  await act(async () => root.render(<CisVisualSnapshot summary={summary} filter="all" onFilter={onFilter}/>));
  expect(container.querySelector('.now-value').textContent).toBe('—');
  expect(container.querySelector('.now-head p').textContent).toBe('0 of 0 safeguards implemented');
  expect(container.querySelector('.now-value .unit')).toBeNull();
});

test('snapshot status selection remains a read-only filter and native Continue preserves its destination', async () => {
  const source = fixture(), summary = cisSummary(source.rows), onFilter = jest.fn(), onContinue = jest.fn(), onTheme = jest.fn();
  const resume = source.rows.find(row => row.definition_id === '1.2');
  const view = filter => <><CisVisualHeader rows={source.rows} summary={summary} asOf="Native saved date" resume={resume}
    onContinue={onContinue} theme="light" onTheme={onTheme}/><CisVisualSnapshot summary={summary} filter={filter} onFilter={onFilter} asOf="Native saved date"/></>;
  await act(async () => root.render(view('all')));
  expect(container.querySelector('.page-head p').textContent).toContain('15 controls · 56 safeguards · As of Native saved date');
  await click(container.querySelector('.head-actions .primary')); expect(onContinue).toHaveBeenCalledTimes(1);
  await click(container.querySelector('.head-actions .ghost')); expect(onTheme).toHaveBeenCalledTimes(1);
  await click(container.querySelector('.lg-cell')); expect(onFilter).toHaveBeenLastCalledWith('addressed');
  await act(async () => root.render(view('addressed')));
  expect(container.querySelector('.lg-cell').getAttribute('aria-pressed')).toBe('true');
  await click(container.querySelector('.lg-cell')); expect(onFilter).toHaveBeenLastCalledWith('all');
  Object.values(api).forEach(method => expect(method).not.toHaveBeenCalled());
});


test.each([
  [{open_findings: 2, overdue_actions: 1, overdue_reviews: 3}, 'Linked work: 2 open Findings · 1 overdue Action Item · 3 overdue Reviews'],
  [{open_findings: 0, overdue_actions: 0, overdue_reviews: 1}, 'Linked work: 1 overdue Review'],
])('native linked work counts form the secondary line without selecting an Action', async (counts, expected) => {
  const source = fixture(), row = source.rows.find(record => record.definition_id === '1.1');
  Object.assign(row.work, counts, {priority_records: [{kind: 'tasks', task_id: 'native-linked-action', title: 'Do not infer this as a primary Action'}]});
  freeze(source); const before = JSON.stringify(source);
  const props = await render(source, {visible: [row], search: row.title});
  const opener = container.querySelector('[data-testid="requirement-1.1"]');
  expect(opener.querySelector('.sg-t').firstChild.textContent).toBe(row.title);
  expect(opener.querySelector('.sg-t small').textContent).toBe(expected);
  expect(opener.textContent).not.toContain('Do not infer this as a primary Action');
  await click(opener);
  expect(props.onOpen).toHaveBeenCalledTimes(1);
  expect(props.onOpen.mock.calls[0][0]).toBe(row);
  expect(JSON.stringify(source)).toBe(before);
  Object.values(api).forEach(method => expect(method).not.toHaveBeenCalled());
});

test('known zero native work counts omit the secondary line', async () => {
  const source = freeze(fixture()), row = source.rows.find(record => record.definition_id === '1.1');
  await render(source, {visible: [row], search: row.title});
  const title = container.querySelector('[data-testid="requirement-1.1"] .sg-t');
  expect(title.textContent).toBe(row.title);
  expect(title.querySelector('small')).toBeNull();
});

test.each([
  ['missing work', undefined],
  ['incomplete context', {context_complete: false, open_findings: 2, overdue_actions: 1, overdue_reviews: 1}],
  ['unconfirmed context', {open_findings: 2, overdue_actions: 0, overdue_reviews: 0}],
  ['missing count', {context_complete: true, open_findings: 2, overdue_actions: 0}],
  ['negative count', {context_complete: true, open_findings: -1, overdue_actions: 0, overdue_reviews: 0}],
  ['fractional count', {context_complete: true, open_findings: 1.5, overdue_actions: 0, overdue_reviews: 0}],
  ['untyped count', {context_complete: true, open_findings: '2', overdue_actions: 0, overdue_reviews: 0}],
  ['non-finite count', {context_complete: true, open_findings: Infinity, overdue_actions: 0, overdue_reviews: 0}],
])('%s remains explicitly unavailable rather than becoming a known zero or partial work count', async (_reason, work) => {
  const source = fixture(), row = source.rows.find(record => record.definition_id === '1.1');
  row.work = work; freeze(source);
  await render(source, {visible: [row], search: row.title});
  const title = container.querySelector('[data-testid="requirement-1.1"] .sg-t');
  expect(title.firstChild.textContent).toBe(row.title);
  expect(title.querySelector('small').textContent).toBe('Linked work unavailable');
  expect(title.textContent).not.toMatch(/0 open|0 overdue|2 open Findings|undefined|NaN|Infinity/);
});
