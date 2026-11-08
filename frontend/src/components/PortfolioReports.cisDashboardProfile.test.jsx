import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import PortfolioHistoryDialog, {PortfolioHistoryChart} from './PortfolioReports';
import api from '@/lib/api';

jest.mock('@/lib/api', () => ({__esModule:true, default:{get:jest.fn()}, formatError:error => error.message}));

const AS_OF = '2026-10-23T12:00:00Z';
const scope = {framework_key:'cis-ig1', catalog_version:'8.1', configuration:{implementation_group:2}};
const position = (id, at, values, extra = {}) => ({snapshot_id:id, effective_at:at, captured_at:at,
  source_revision:id, observation_kind:'committed_event', scope_signature:'scope', measure_version:'native-implementation-v1', scope,
  denominator:values.reduce((total, value) => total + value, 0), implemented:values[0], availability:'available',
  counts:['addressed','in_progress','needs_attention','not_assessed'].map((key,index) => ({key,
    label:['Implemented','Partially implemented','Not implemented','Not assessed'][index], count:values[index]})), ...extra});
const old = position('saved-old', '2026-09-23T12:00:00Z', [23,12,5,14], {captured_at:'2026-09-23T12:04:00Z'});
const current = position('saved-current', AS_OF, [31,12,6,7]);
const program = {client_id:'isolated-cis', program_id:'isolated-cis:ig2', program_key:'cis-ig2', framework_key:'cis-ig1',
  program_label:'CIS IG2', to:'/compliance/cis-ig1?ig=2', current};
const report = {client_id:program.client_id, program_key:program.program_key, as_of:AS_OF, current, snapshots:[old,current],
  forecast_snapshots:[old,current], scope_changes:[], forecast_scope_changes:[], comparison:{comparable:false}};
const chartProps = {points:[old,current], start:'2026-04-23T12:00:00Z', asOf:AS_OF, view:'line', current, scopeChanges:[], unit:'safeguards', inline:true};
let container, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  api.get.mockReset(); api.get.mockResolvedValue({data:report});
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); });
const click = async label => act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === label).click());
const renderDialog = async (extra = {}) => act(async () => root.render(<PortfolioHistoryDialog inline referenceHistory
  client={{client_id:program.client_id,name:'Isolated'}} programs={[program]} selected={program.program_id}
  onNavigate={jest.fn()} asOf={AS_OF} {...extra}/>));

test('concept status card and history opt in only for inline CIS while keeping real sparse history',async()=>{
 await renderDialog({cisDashboardProfile:true,concept:true,profileContent:<section data-testid="profile">Actual domains and risks</section>});
 const card=container.querySelector('[data-concept=true]');
 expect(card.querySelector('.ph-concept-status .ph-current-value').textContent).toContain('31 of 56');
 expect(card.querySelector('.ph-concept-status').nextElementSibling.dataset.testid).toBe('profile');
 expect(card.querySelector('.ph-chart svg').getAttribute('height')).toBe('164');
 expect(card.querySelectorAll('.ph-scenario-area')).toHaveLength(0);
 expect(card.querySelector('.ph-line').getAttribute('d')).not.toContain('H');
 await click('View data');
 expect(card.querySelectorAll('#portfolio-history-data tbody tr')).toHaveLength(2);
 await renderDialog({concept:true});
 expect(container.querySelector('[data-concept]')).toBeNull();
 expect(container.querySelector('.ph-concept-status')).toBeNull();
 expect(container.querySelector('.ph-current-overview').nextElementSibling.className).toBe('ph-range');
});

test('concept fills only supported runs and retains native scope explanations and point counts',async()=>{
 const middle=position('middle','2026-10-01T12:00:00Z',[27,12,5,12]);
 const first={...old,continuity_proven:true,effective_until:middle.effective_at};
 const changed={...current,scope_signature:'changed-scope'};
 await act(async()=>root.render(<PortfolioHistoryChart {...chartProps} points={[first,middle,changed]} cisDashboardProfile concept/>));
 expect(container.querySelectorAll('.ph-scenario-area')).toHaveLength(1);
 const tipPoint=container.querySelector('.ph-inspection-point');
 await act(async()=>tipPoint.focus());
 const tip=container.querySelector('[role=tooltip]');
 expect(tip.textContent).toContain('23 implemented / 54 applicable safeguards');
 expect(tip.textContent).toContain('Captured');
 expect(tip.textContent).toContain('UTC');
});

test('opt-in places domain/Risk content before the heading, periods, compact native summaries and chart', async () => {
  await renderDialog({cisDashboardProfile:true, profileContent:<section data-testid="profile">Domain and Risk</section>});
  const children = [...container.querySelector('.brawndo-demo-program').children];
  const profile = container.querySelector('[data-testid="profile"]'), head = container.querySelector('.ph-cis-history-head');
  expect(children.indexOf(profile)).toBeGreaterThan(children.indexOf(container.querySelector('.ph-current-overview')));
  expect(children.indexOf(head)).toBe(children.indexOf(profile) + 1);
  expect(head.querySelector('.ph-chart-top').nextElementSibling).toBe(head.querySelector('.ph-range'));
  expect(head.nextElementSibling.querySelector('.ph-metrics').textContent).toContain('Not estimated yet');
  expect(head.nextElementSibling.querySelector('.ph-chart')).toBeTruthy();
  await click('View data');
  for (const [label, range] of [['1 month','1m'],['3 months','3m'],['6 months','6m'],['12 months','12m']]) {
    await click(label);
    expect(api.get).toHaveBeenLastCalledWith('/portfolio/reporting/history', expect.objectContaining({params:expect.objectContaining({client_id:program.client_id,program_key:'cis-ig2',range})}));
    expect(container.querySelector('#portfolio-history-data')).toBeTruthy();
  }
  await click('View status history');
  expect(container.querySelector('.ph-chart svg title').textContent).toBe('Status history');
  expect(container.querySelectorAll('#portfolio-history-data tbody tr')).toHaveLength(2);
  expect(container.querySelectorAll('.ph-step-band')).toHaveLength(0); // No continuity was recorded.
  await click('Implemented history');
  expect(container.querySelector('.ph-chart svg title').textContent).toBe('Implementation history');
});

test('default inline callers retain the old hierarchy and do not render an unapproved profile slot', async () => {
  await renderDialog({profileContent:<section data-testid="profile">Not enabled</section>});
  expect(container.querySelector('[data-cis-dashboard-profile]')).toBeNull();
  expect(container.querySelector('[data-testid="profile"]')).toBeNull();
  expect(container.querySelector('.ph-cis-history-head')).toBeNull();
  expect(container.querySelector('.ph-current-overview').nextElementSibling.className).toBe('ph-range');
  expect(container.querySelector('.ph-chart-card > .ph-chart-top')).toBeTruthy();
  expect(container.querySelector('.ph-inspection-point')).toBeNull();
});

test('point tooltip uses its own denominator, all counts, UTC capture time and simultaneous scope/status explanation', async () => {
  const changed = {...old, snapshot_id:'saved-scope-change'};
  const change = {after_snapshot_id:changed.snapshot_id, membership_known:true, added_ids:['new-1','new-2'],
    before:{denominator:52,implemented:22}, after:{denominator:54,implemented:23}, status_changes_known:true,
    status_changes:[{definition_id:'1.1',before_status:'needs_attention',after_status:'addressed'}]};
  await act(async () => root.render(<PortfolioHistoryChart {...chartProps} points={[changed,current]} scopeChanges={[change]} cisDashboardProfile/>));
  const point = container.querySelector('.ph-inspection-point');
  await act(async () => point.focus());
  const tooltip = container.querySelector('[role="tooltip"]');
  expect(point.getAttribute('aria-describedby')).toBe(tooltip.id);
  expect(tooltip.textContent).toContain('42.6%');
  expect(tooltip.textContent).toContain('23 implemented / 54 applicable safeguards');
  expect(tooltip.textContent).not.toContain('31 implemented / 56');
  expect([...tooltip.querySelectorAll('.ph-tip-rows b')].map(node => node.textContent)).toEqual(['23','12','5','14']);
  expect(tooltip.querySelector('[role="img"]').getAttribute('aria-label')).toContain('14 Not assessed');
  expect(tooltip.textContent).toContain('Captured'); expect(tooltip.textContent).toContain('UTC');
  expect(tooltip.textContent).toContain('Both implementation and scope changed.');
  expect(tooltip.textContent).toContain('1.1: Not Implemented → Implemented');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => point.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(container.querySelector('[role="tooltip"]')).toBeTruthy();
  await act(async () => document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => point.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  const outsideControl = document.createElement('button'); container.appendChild(outsideControl);
  await act(async () => outsideControl.focus());
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
});

test('tooltip is viewport-clamped on layout/scroll and stays open when pointer crosses onto its content', async () => {
  const rect = (left,top,width,height) => ({left,top,width,height,right:left+width,bottom:top+height});
  const bounds = jest.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function () {
    if (this.classList?.contains('ph-chart')) return rect(window.innerWidth-330,window.innerHeight-250,320,236);
    if (this.classList?.contains('ph-cis-history-tip')) return rect(0,0,300,260);
    if (this.tagName.toLowerCase() === 'svg') return rect(window.innerWidth-330,window.innerHeight-250,320,236);
    return rect(0,0,0,0);
  });
  try {
    jest.useFakeTimers();
    await act(async () => root.render(<PortfolioHistoryChart {...chartProps} cisDashboardProfile/>));
    const point = container.querySelector('.ph-inspection-point');
    await act(async () => point.dispatchEvent(new MouseEvent('pointerover',{bubbles:true})));
    const tip = container.querySelector('[role="tooltip"]');
    expect(tip).toBeTruthy();
    expect(parseFloat(tip.style.left)).toBeGreaterThanOrEqual(8);
    expect(parseFloat(tip.style.left)+300).toBeLessThanOrEqual(window.innerWidth-8);
    expect(parseFloat(tip.style.top)+260).toBeLessThanOrEqual(window.innerHeight-8);
    await act(async () => {
      point.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:tip}));
      tip.dispatchEvent(new MouseEvent('pointerover',{bubbles:true,relatedTarget:point}));
      jest.advanceTimersByTime(200);
    });
    expect(container.querySelector('[role="tooltip"]')).toBe(tip);
    await act(async () => window.dispatchEvent(new Event('scroll')));
    expect(parseFloat(tip.style.top)).toBeGreaterThanOrEqual(8);
    await act(async () => {
      tip.dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body}));
      jest.advanceTimersByTime(200);
    });
    expect(container.querySelector('[role="tooltip"]')).toBeNull();
  } finally { bounds.mockRestore(); }
});

test('touch inspection stays pinned after pointer leave until outside or Escape, without replacing the selected snapshot', async () => {
  jest.useFakeTimers();
  await act(async () => root.render(<PortfolioHistoryChart {...chartProps} cisDashboardProfile/>));
  const points = container.querySelectorAll('.ph-inspection-point');
  const tap = new MouseEvent('pointerdown',{bubbles:true});
  Object.defineProperty(tap,'pointerType',{value:'touch'});
  await act(async () => {
    points[0].dispatchEvent(tap);
    points[0].dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body}));
    jest.advanceTimersByTime(500);
    points[1].dispatchEvent(new MouseEvent('pointerover',{bubbles:true}));
  });
  expect(container.querySelector('[role="tooltip"]').textContent).toContain('23 implemented / 54 applicable safeguards');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
  await act(async () => points[1].dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(container.querySelector('[role="tooltip"]').textContent).toContain('31 implemented / 56 applicable safeguards');
  await act(async () => {
    points[1].dispatchEvent(new MouseEvent('pointerout',{bubbles:true,relatedTarget:document.body}));
    jest.advanceTimersByTime(500);
  });
  expect(container.querySelector('[role="tooltip"]')).toBeTruthy();
  await act(async () => document.body.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true})));
  expect(container.querySelector('[role="tooltip"]')).toBeNull();
});

test.each([
  [position('zero',AS_OF,[0,0,0,0]), 'N/A', '0 implemented / 0 applicable safeguards'],
  [position('invalid',AS_OF,[4,0,0,1],{denominator:99,reason:'Missing source records'}), 'Unavailable', 'Missing source records']
])('zero or invalid historical scope stays truthful in keyboard inspection', async (point, rate, detail) => {
  await act(async () => root.render(<PortfolioHistoryChart {...chartProps} points={[point]} cisDashboardProfile/>));
  await act(async () => container.querySelector('svg').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true})));
  expect(container.querySelector('[role="tooltip"]').textContent).toContain(rate);
  expect(container.querySelector('[role="tooltip"]').textContent).toContain(detail);
  expect(container.querySelectorAll('.ph-band')).toHaveLength(0);
});
