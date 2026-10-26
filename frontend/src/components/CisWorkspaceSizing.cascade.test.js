const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const {selectorSpecificity, compare} = require('@csstools/selector-specificity');

const nativeFiles = [
  '../design-system.css', '../index.css', '../App.css', 'BrawndoWorkspace.css', 'BrawndoSidebar.css',
  'SixSurfaceAppearance.css', 'AdditionalSectionsAppearance.css', 'BrawndoCisVisualShell.css',
  'BrawndoPortalTheme.css',
  'BrawndoCisWorkspace.css', 'BrawndoCisOverview.css', 'BrawndoCisVisual.css',
  'BrawndoCisSafeguard.css', 'BrawndoCisAssessment.css', 'BrawndoCisVisualSafeguard.css',
  'GuidedAssessor.css', 'RefinedOmni.css', 'BrawndoCisVisualOmni.css',
  'BrawndoDemoDashboard.css', 'PortfolioReports.css', 'CisDashboardConcept.css',
  'CisDomainProfile.css', 'CisDashboardRiskMatrix.css',
  '../pages/BrawndoDemoCalendar.css', '../pages/BrawndoCalendar.css',
  '../pages/BrawndoDemoReviews.css', '../pages/BrawndoDemoActionItems.css',
  '../pages/BrawndoDemoRisks.css', 'CisReviewsConcept.css', 'CisActionItemsConcept.css',
  'CisRisksConcept.css', 'BrawndoAdditionalPolicyVendor.css', 'PoliciesConcept.css', 'CisVendorsConcept.css',
  'AdditionalAI.css', 'AIRegisterFirst.css',
];
const sizingFiles = ['CisWorkspaceSizing.css', 'CisRegisterSizing.css'];
const sheets = Object.fromEntries([...nativeFiles, ...sizingFiles].map(name => [
  name, postcss.parse(fs.readFileSync(path.join(__dirname, name), 'utf8')),
]));
const inheritedProperties = new Set(['font-size', 'font-family', 'font-weight', 'line-height', 'color', 'letter-spacing']);
const parsedSelectors = new Map();
let matchingDeclarations = new WeakMap();
let selectorMatches = new WeakMap();

function selectorDetails(selector) {
  if (!parsedSelectors.has(selector)) {
    const parsed = selectorParser().astSync(selector).nodes[0];
    const lastCombinator = parsed.nodes.reduce((last, node, index) => node.type === 'combinator' ? index : last, -1);
    const compound = parsed.nodes.slice(lastCombinator + 1);
    const pseudoElement = parsed.nodes.some(node => node.type === 'pseudo' && node.value.startsWith('::'));
    parsedSelectors.set(selector, {
      pseudoElement,
      specificity: pseudoElement ? undefined : selectorSpecificity(parsed),
      tag: compound.find(node => node.type === 'tag')?.value,
      ids: compound.filter(node => node.type === 'id').map(node => node.value),
      classes: compound.filter(node => node.type === 'class').map(node => node.value),
    });
  }
  return parsedSelectors.get(selector);
}

function canMatchCompound(node, details) {
  // Only direct positive requirements are rejected. Alternatives, negations,
  // attributes and functional pseudos still go through the native matcher.
  if (details.tag && node.localName.toLowerCase() !== details.tag.toLowerCase()) return false;
  if (node.ownerDocument.compatMode === 'BackCompat') return true;
  return details.ids.every(id => node.id === id) && details.classes.every(name => node.classList.contains(name));
}

// Bounded authored-cascade checks only: normal specificity, width media and the
// inspected longhands. Browser geometry, SVG scaling and actual zoom need UI QA.
function declarationValue(declaration, property) {
  if (declaration.prop === property) return declaration.value;
  if (declaration.prop === 'font' && ['font-size', 'font-family', 'font-weight', 'line-height'].includes(property)) {
    if (['inherit', 'unset', 'initial', 'revert'].includes(declaration.value)) return declaration.value;
    const font = declaration.value.match(/^(?:(normal|[1-9]\d{2})\s+)?(\d+(?:\.\d+)?px)(?:\/(\d+(?:\.\d+)?(?:px)?))?\s+(.+)$/);
    if (!font) throw new Error(`Unsupported inspected font shorthand: ${declaration.value}`);
    return {'font-size': font[2], 'font-family': font[4], 'font-weight': font[1] || 'normal', 'line-height': font[3] || 'normal'}[property];
  }
  if (property.startsWith('padding-') && declaration.prop === 'padding') {
    const style = document.createElement('div').style;
    style.padding = declaration.value;
    const expanded = style.getPropertyValue(property);
    if (!expanded) throw new Error(`Unsupported inspected padding shorthand: ${declaration.value}`);
    return expanded;
  }
  if (declaration.prop === 'flex' && ['flex-shrink', 'flex-basis'].includes(property)) {
    if (declaration.value === 'none') return property === 'flex-shrink' ? '0' : 'auto';
    const flex = declaration.value.match(/^([\d.]+)\s+([\d.]+)\s+(.+)$/);
    if (!flex) throw new Error(`Unsupported inspected flex shorthand: ${declaration.value}`);
    return property === 'flex-shrink' ? flex[2] : flex[3];
  }
  return undefined;
}

function declarationsFor(node, width, files) {
  const key = `${width}:${files.join('|')}`;
  const cached = matchingDeclarations.get(node) || new Map();
  if (cached.has(key)) return cached.get(key);
  const declarations = [];
  for (const name of files) sheets[name].walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type !== 'atrule') continue;
      if (parent.name !== 'media') return;
      const constraints = [...parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)];
      if (!constraints.length || constraints.some(([, kind, value]) => kind === 'min' ? width < Number(value) : width > Number(value))) return;
    }
    for (const selector of rule.selectors) {
      const details = selectorDetails(selector);
      if (details.pseudoElement) continue;
      const matches = selectorMatches.get(node) || new Map();
      if (!matches.has(selector)) matches.set(selector, canMatchCompound(node, details) && node.matches(selector));
      selectorMatches.set(node, matches);
      if (!matches.get(selector)) continue;
      rule.walkDecls(declaration => declarations.push({declaration, specificity: details.specificity, priority: declaration.important ? 1 : 0}));
    }
  });
  cached.set(key, declarations);
  matchingDeclarations.set(node, cached);
  return declarations;
}

function winner(node, property, width, files) {
  let selected;
  for (const candidate of declarationsFor(node, width, files)) {
    const value = declarationValue(candidate.declaration, property);
    if (value === undefined) continue;
    if (!selected || candidate.priority > selected.priority || candidate.priority === selected.priority && compare(candidate.specificity, selected.specificity) >= 0)
      selected = {...candidate, value};
  }
  if ((inheritedProperties.has(property) || property.startsWith('--')) && (!selected || ['inherit', 'unset'].includes(selected.value)))
    return node.parentElement ? winner(node.parentElement, property, width, files) : undefined;
  return selected?.value;
}

function value(node, property, width, files) {
  const authored = winner(node, property, width, files);
  const variable = typeof authored === 'string' && authored.match(/^var\((--[\w-]+)(?:,\s*(.*))?\)$/);
  return variable ? winner(node, variable[1], width, files) || variable[2] : authored;
}

let fixture;
let originalHtmlAttributes;
let originalBodyAttributes;
beforeEach(() => {
  originalHtmlAttributes = document.documentElement.getAttributeNames().map(name => [name, document.documentElement.getAttribute(name)]);
  originalBodyAttributes = document.body.getAttributeNames().map(name => [name, document.body.getAttribute(name)]);
  fixture = document.createElement('div');
  document.body.appendChild(fixture);
});
afterEach(() => {
  fixture.remove();
  for (const [element, attributes] of [[document.documentElement, originalHtmlAttributes], [document.body, originalBodyAttributes]]) {
    for (const name of element.getAttributeNames()) element.removeAttribute(name);
    for (const [name, value] of attributes) element.setAttribute(name, value);
  }
});

function mount(content, {surface = 'dashboard', theme = 'light', eligible = true, navigation = 'closed'} = {}) {
  matchingDeclarations = new WeakMap();
  selectorMatches = new WeakMap();
  document.documentElement.dataset.brawndoWorkspace = theme;
  document.documentElement.dataset.brawndoPortal = theme;
  document.documentElement.dataset.visualSurface = surface;
  document.documentElement.dataset.visualTheme = theme;
  document.documentElement.dataset.brawndoCisVisual = 'true';
  document.body.dataset.brawndoCisVisual = 'true';
  if (['policies', 'vendors', 'ai'].includes(surface)) {
    document.documentElement.dataset.additionalSurface = surface;
    document.documentElement.dataset.additionalTheme = theme;
  }
  fixture.innerHTML = `<div class="brawndo-workspace-pilot" ${eligible ? 'data-cis-sizing="true"' : ''} data-theme="${theme}" data-navigation="${navigation}" data-cis-visual="true" data-visual-surface="${surface}" ${surface === 'dashboard' ? 'data-cis-dashboard-concept="true"' : ''}>
    <header class="bwp-topbar"><a class="bwp-brand"><span>GoverNara</span></a><button class="bwp-mobile-nav">Navigation</button></header>
    <button class="bwp-nav-backdrop">Close navigation</button>
    <div class="bwp-body"><div class="app-shell"><aside class="app-sidebar bsb"><div class="bsb-head"><div class="bsb-client"><span class="bsb-client-mark"></span><span class="min-w-0"><span class="bsb-group-label">Client</span><span class="bsb-client-name">Native client</span><span class="bsb-client-industry">Native industry</span></span></div></div><nav class="bsb-nav"><div class="bsb-group"><div class="bsb-group-label">Workspace</div><a class="bsb-link"><span>Dashboard</span></a></div></nav></aside><main class="app-workspace"><div class="section-body">${content}</div></main></div></div>
  </div>`;
  return fixture.firstElementChild;
}

const orders = [[...nativeFiles, ...sizingFiles], [...sizingFiles, ...nativeFiles]];

test.each(orders.map((files,index)=>[index,files]))('Risk end dates fit the narrow plot without moving native ticks, order %i', (_index,files) => {
  const shell=mount('<section class="cis-risks-concept"><div class="overview-grid"><div class="date-axis"><span class="axis-label">Oct 1</span><span class="axis-label">Dec 24</span><span class="axis-label">Dec 31</span></div></div></section>',{surface:'risks'});
  const axis=shell.querySelector('.date-axis');
  expect(value(axis,'min-height',1440,files)).toBe('34px');
  for(const label of [...axis.children].slice(-2)) {
    expect(value(label,'font-size',1440,files)).toBe('11px');
    expect(value(label,'max-width',1440,files)).toBe('29px');
    expect(value(label,'white-space',1440,files)).toBe('normal');
    for(const property of ['position','left','right','top','transform'])
      expect(value(label,property,1440,files)).toBe(value(label,property,1440,nativeFiles));
  }
  expect(value(axis.firstElementChild,'white-space',1440,files)).toBe(value(axis.firstElementChild,'white-space',1440,nativeFiles));
});

test('sizing styles require the explicit client boundary and contain no theme, emphasis or inherited shell font change', () => {
  const shell = mount('<p>Native content</p>');
  const protectedProperties = new Set(['font', 'font-family', 'font-weight', 'font-style', 'letter-spacing', 'color', 'background', 'background-color', 'border', 'border-color', 'box-shadow', 'text-transform', 'text-overflow']);
  for (const file of sizingFiles) sheets[file].walkRules(rule => {
    for (const selector of rule.selectors) expect(selector).toMatch(/\.brawndo-workspace-pilot\[data-cis-sizing=(?:"true"|true)\]/);
    rule.walkDecls(declaration => {
      expect(protectedProperties.has(declaration.prop)).toBe(false);
      if (rule.selectors.some(selector => shell.matches(selector))) expect(['font-size', 'line-height'].includes(declaration.prop)).toBe(false);
    });
  });
});

test('workspace gutter never adds a second reservation to native modal scroll compensation', () => {
  for (const eligible of [true, false]) for (const role of ['dialog', 'alertdialog']) {
    mount('', {eligible});
    const nativeDefault = value(document.documentElement, 'scrollbar-gutter', 1440, nativeFiles);
    const workspaceDefault = eligible ? 'stable' : nativeDefault;
    const popup = document.createElement('div');
    popup.setAttribute('role', role);
    fixture.appendChild(popup);
    // Popovers and the guided assistant can be non-modal role=dialog surfaces.
    expect(value(document.documentElement, 'scrollbar-gutter', 1440, orders[0]))
      .toBe(workspaceDefault);
    const overlay = document.createElement('div');
    overlay.className = 'ui-overlay';
    fixture.appendChild(overlay);
    matchingDeclarations = new WeakMap(); selectorMatches = new WeakMap();
    expect(value(document.documentElement, 'scrollbar-gutter', 1440, orders[0])).toBe(nativeDefault);
    overlay.remove();
    matchingDeclarations = new WeakMap(); selectorMatches = new WeakMap();
    expect(value(document.documentElement, 'scrollbar-gutter', 1440, orders[0])).toBe(workspaceDefault);
  }
});

test('rightmost positive prefilter remains conservative around functional selectors and ancestry', () => {
  fixture.innerHTML = '<section class="native-parent"><button id="saved" class="native-action enabled">Native action</button></section>';
  const button = fixture.querySelector('button');
  for (const [selector, possible] of [
    ['.native-parent > button.native-action#saved', true],
    ['.other-parent > button.native-action', true],
    ['.native-parent > :is(button.native-action,a.other)', true],
    ['.native-parent > button:not(.disabled)', true],
    ['.native-parent > button:is(.missing,.enabled)', true],
    ['.native-parent > button[data-kind=review]', true],
    ['.native-parent > span.native-action', false],
    ['.native-parent > button.missing', false],
    ['.native-parent > button#another', false],
  ]) {
    expect(canMatchCompound(button, selectorDetails(selector))).toBe(possible);
    if (!possible) expect(button.matches(selector)).toBe(false);
  }
  expect(canMatchCompound(document.documentElement, selectorDetails('.onboarding-program-option:has(:checked)'))).toBe(false);
});

const quarter = '<section class="quarter-card"><div class="quarter-heading"><h2>Calendar quarter</h2><p>Saved work</p><div class="quarter-controls"><strong>Q1</strong><select><option>2026</option></select></div></div><div class="quarter-content"><aside class="agenda"><button class="agenda-entry"><span class="agenda-title">Native work title</span><span class="agenda-date">Mar 1</span></button></aside><div class="timeline-column"><span class="month-name">March</span></div></div></section>';
const registerCases = [
  {
    surface: 'reviews',
    html: `<section class="crr-root" data-visual-surface="reviews"><header class="page-heading"><h1>Reviews</h1><p>Native description</p></header><div class="kpis"><button class="kpi"><strong>12</strong><small>Saved work</small></button></div>${quarter}<section class="register"><div class="register-heading"><h2>Review register</h2></div><table class="bdr-table"><tbody><tr><td><button class="bdr-name">Native title</button><span class="bdr-meta">Native metadata</span></td><td><span class="bdr-owner"><span>AB</span><span>Native owner</span></span></td><td class="bdr-c-due"><time>Mar 1</time><small>In 2 days</small></td><td class="bdr-c-cad"><span>Annual</span><small>Native basis</small></td></tr></tbody></table></section></section>`,
    roles: [['.page-heading h1', '26px'], ['.register-heading h2', '16px'], ['.kpi strong', '32px'], ['.bdr-name', '14px'], ['.bdr-owner > span:last-child', '14px'], ['.bdr-c-due time', '14px'], ['.bdr-c-cad > span', '14px'], ['.bdr-meta', '12.5px'], ['.bdr-c-due small', '12.5px'], ['.agenda-title', '14px'], ['.agenda-date', '12.5px']],
  },
  {
    surface: 'actions',
    html: `<section class="brawndo-demo-actions cia-root cia-page bpage"><header class="bpage-head"><h1>Action Items</h1><p class="bpage-subtitle">Native description</p></header><div class="kpis"><button class="kpi bda-cell"><strong>12</strong><small>Saved work</small></button></div>${quarter}<section class="cia-register"><header class="cia-register-head"><h2>Action register</h2></header><table class="bda-table-scroll"><tbody><tr><td><button class="bda-title">Native title</button><span class="bda-meta">Native metadata</span></td><td><span class="register-owner"><span>Native owner</span><small>Native team</small></span></td><td class="bda-due"><time>Mar 1</time><small>In 2 days</small></td></tr></tbody></table></section></section>`,
    roles: [['.bpage-head h1', '26px'], ['.cia-register-head h2', '16px'], ['.kpi strong', '32px'], ['.bda-title', '14px'], ['.register-owner > span', '14px'], ['.bda-due time', '14px'], ['.bda-meta', '12.5px'], ['.register-owner small', '12.5px'], ['.agenda-title', '14px'], ['.agenda-date', '12.5px']],
  },
  {
    surface: 'risks',
    html: `<section class="cis-risks-concept"><header class="page-heading"><h1>Risks</h1><p>Native description</p></header><div class="kpis"><button class="kpi"><strong>12</strong><small>Saved work</small></button></div><div class="overview-grid">${quarter}</div><section class="register"><header class="register-heading"><h2>Risk register</h2></header><table class="risk-table"><tbody><tr><td><button class="risk-title">Native title</button><span class="risk-id">RISK-001</span></td><td><span class="risk-owner">Native owner</span></td><td class="next-review-cell"><time>Mar 1</time><span class="review-relative">In 2 days</span></td></tr></tbody></table></section></section>`,
    roles: [['.page-heading h1', '26px'], ['.register-heading h2', '16px'], ['.kpi strong', '32px'], ['.risk-title', '14px'], ['.risk-owner', '14px'], ['.next-review-cell time', '14px'], ['.risk-id', '12.5px'], ['.review-relative', '12.5px'], ['.agenda-title', '14px'], ['.agenda-date', '12.5px']],
  },
  {
    surface: 'vendors',
    html: '<section class="bav-page cv-page"><header class="bapv-page-head"><h1>Vendors</h1><p>Native description</p></header><div class="cv-kpis"><button class="cv-kpi"><strong>12</strong><small>Saved work</small></button></div><section class="cv-quarter"><header class="cv-quarter-heading"><h2>Calendar quarter</h2></header><div class="cv-agenda"><button class="cv-agenda-entry"><b>Native work title</b><span>Mar 1</span></button></div></section><section class="bapv-card"><header class="cv-register-heading"><h2>Vendor register</h2></header><div class="bav-table"><div class="bav-row"><div class="bav-item"><button class="bapv-name">Native title</button><span class="bapv-meta">Native metadata</span></div><div class="bav-owner"><span class="bapv-owner"><span>Native owner</span></span></div><div class="bav-next"><span>Mar 1</span><small>In 2 days</small></div><div class="bav-renewal"><span>Mar 2</span><small>In 3 days</small></div></div></div></section></section>',
    roles: [['.bapv-page-head h1', '26px'], ['.cv-register-heading h2', '16px'], ['.cv-kpi strong', '32px'], ['.bapv-name', '14px'], ['.bav-owner .bapv-owner > span', '14px'], ['.bav-next > span', '14px'], ['.bav-renewal > span', '14px'], ['.bapv-meta', '12.5px'], ['.bav-next small', '12.5px'], ['.cv-agenda-entry b', '14px']],
  },
];

const workspaceCases = [
  {
    surface: 'dashboard',
    html: '<section class="brawndo-demo-dashboard" data-cis-dashboard-concept="true"><div class="cis-dashboard-concept-presentation"><header class="bdd-heading"><h1>Dashboard</h1><p>Native program</p></header><section class="bdd-summary"><button><span>Open items</span><strong>12</strong><small>Saved work</small></button></section><section class="brawndo-demo-program" data-concept="true" data-cis-dashboard-profile="true" data-reference-history="true"><header class="ph-program-head"><h3>CIS program</h3></header><div class="ph-current-value"><span>Current implementation</span><strong>57.1<span class="ph-unit">%</span></strong><small>Native scope</small></div><div class="ph-metric"><strong>2</strong></div></section><section class="cdp-card cdp-concept"><header><h2>Domain profile</h2></header><div class="cdp-table-wrap"><table><thead><tr><th>Domain</th></tr></thead><tbody><tr><th><button class="cdp-domain-name">Native domain</button></th><td>20</td></tr></tbody></table></div></section></div><section class="bdd-card"><header><h2>Priority work</h2></header><table><tbody><tr><td><button class="bdd-item">Native title</button><small class="bdd-meta">Native metadata</small></td><td><span class="bdd-owner"><span>Native owner</span></span></td><td class="bdd-cell-due"><time>Mar 1</time><small>In 2 days</small></td></tr></tbody></table></section></section>',
    roles: [['.bdd-heading h1', '26px'], ['.ph-program-head h3', '16px'], ['.bdd-card h2', '16px'], ['.bdd-summary strong', '32px'], ['.ph-current-value > strong', '48px'], ['.ph-unit', '25px'], ['.ph-metric strong', '21px'], ['.cdp-table-wrap thead th', '12px'], ['.cdp-table-wrap td', '13px'], ['.cdp-domain-name', '12.5px'], ['.bdd-item', '14px'], ['.bdd-owner > span', '14px'], ['.bdd-cell-due time', '14px'], ['.bdd-meta', '12.5px']],
  },
  {
    surface: 'calendar',
    html: '<section class="bdcal"><header class="bpage-head"><h1>Calendar</h1></header><section class="kstrip"><button class="kcell"><span>Scheduled</span><strong>12</strong><small>Saved work</small></button></section><div class="cal-layout"><section class="pcard"><div class="cal-nav"><h2>March 2026</h2></div><span class="dow">Monday</span><button class="ev">Native event</button><div class="week"><div class="wcol"><button class="card"><span class="ct">Native event type</span><b>Native week event</b><span class="cm">Native owner · Open</span><span class="cl">Tracked by an action item</span></button></div></div></section><aside class="pcard"><header class="card-head"><h2>Scheduled items</h2></header><button class="ag-item"><span class="ag-date"><small>Mar</small><b>1</b></span><span class="ag-main"><b>Native title</b><span class="ag-meta">Native metadata</span></span></button></aside></div><span class="owner">Native owner</span><span class="dt">Mar 1</span></section>',
    roles: [['.bpage-head h1', '26px'], ['.card-head h2', '16px'], ['.cal-nav h2', '20px'], ['.kcell strong', '32px'], ['.ag-date b', '19px'], ['.ag-main > b', '14px'], ['.owner', '14px'], ['.dt', '14px'], ['.ag-meta', '12.5px'], ['.dow', '12.5px'], ['.ev', '12.5px'], ['.card .ct', '12.5px'], ['.card .cl', '12.5px'], ['.card .cm', '14px'], ['.card > b', '14px']],
  },
  {
    surface: 'cis',
    html: '<section class="brawndo-cis-visual" data-theme="light"><header class="page-head"><h1>CIS IG3</h1></header><section class="pcard"><div class="now-head"><strong class="now-value">50<span class="unit">%</span></strong><small>Native scope</small></div></section><section class="pcard"><header class="card-head"><h2>Safeguards</h2></header><div class="gname"><b>Native domain</b><small>Native mapping</small></div><button class="sg"><span class="sg-t">Native safeguard<small>Native linked work</small></span></button><div class="seg"><button>All safeguards</button></div></section></section>',
    roles: [['.page-head h1', '26px'], ['.card-head h2', '16px'], ['.now-value', '56px'], ['.gname b', '14px'], ['.sg-t', '14px'], ['.sg-t small', '12.5px'], ['.gname small', '12.5px'], ['.seg button', '12.5px']],
  },
  {
    surface: 'policies',
    html: '<section class="policies-concept"><header class="bapv-page-head"><h1>Policies</h1><p>Native description</p></header><section class="bap-status"><h2>Policy status</h2><span class="pc-card-copy"><strong>12</strong><b>Approved</b><small>Native scope</small></span></section><section class="bap-review"><div class="bap-review-date"><strong>Annual review</strong><small>Native cadence</small></div><dl><dt>Owner</dt><dd>Native owner</dd></dl></section><button class="bapv-name">Native title</button><span class="bapv-meta">Native metadata</span><span class="bapv-owner"><i>AB</i><span>Native owner</span></span><span class="bap-last"><span>Mar 1</span></span><div class="bapv-summary bap-summary"><span class="bap-summary-left"><span role="status">Showing 1 policy</span><button class="bapv-filter-chip">Approved ×</button></span><span>Select a policy to open its record.</span></div></section>',
    roles: [['.bapv-page-head h1', '26px'], ['.bap-status h2', '16px'], ['.pc-card-copy strong', '36px'], ['.pc-card-copy b', '14px'], ['.bap-review-date strong', '25px'], ['.bap-review dd', '14px'], ['.bapv-name', '14px'], ['.bapv-owner > span', '14px'], ['.bap-last > span', '14px'], ['.bapv-meta', '12.5px'], ['.bapv-summary .bapv-filter-chip', '12.5px']],
  },
  {
    surface: 'ai',
    html: '<main class="airf airf-page"><section class="page-heading"><div><h1>AI Governance</h1><p>Native inventory</p></div></section><section class="summary"><button class="summary-card"><span><span class="metric-label">AI systems</span><strong>12</strong></span></button></section><section class="register"><div class="register-toolbar"><input type="search"></div><div class="table-scroll"><table><thead><tr><th>AI system</th><th><span class="sr-only">Expand</span></th></tr></thead><tbody><tr class="system-row"><td><button class="system-name"><span><strong>Native title</strong><span class="system-secondary">Native provider</span></span></button></td><td><span class="owner">Native owner</span></td><td><button class="risk-link">rsk_ABCDEF0123456789-ABCDEF0123456789</button></td><td><button class="row-chevron" aria-label="Expand native system">⌄</button></td></tr></tbody></table></div></section></main>',
    // The reference's .ai-risk-link uses the supporting --small identity role.
    roles: [['.page-heading h1', '26px'], ['.summary strong', '32px'], ['.metric-label', '12.5px'], ['.system-name', '14px'], ['.owner', '14px'], ['.risk-link', '12.5px'], ['.system-secondary', '12.5px'], ['th', '12.5px']],
  },
  ...registerCases,
];

describe.each(orders.map(files => [files]))('sizing declarations with stylesheet order %j', files => {
  test.each(workspaceCases)('$surface keeps primary text distinct from supporting text without retheming it', ({surface, html, roles}) => {
    const shell = mount(html, {surface});
    for (const [selector, expected] of roles) {
      const node = shell.querySelector(selector);
      expect(node).not.toBeNull();
      expect({selector, size: value(node, 'font-size', 1440, files)}).toEqual({selector, size: expected});
      for (const property of ['font-family', 'font-weight', 'color', 'background', 'border-color', 'letter-spacing'])
        expect({selector, property, value: value(node, property, 1440, files)}).toEqual({selector, property, value: value(node, property, 1440, nativeFiles)});
    }
    if (surface === 'ai') {
      const linkedId = shell.querySelector('.system-row .risk-link');
      // Authored fitting constraints only; real cell/expander bounds need browser measurement.
      expect(value(linkedId, 'max-width', 1440, files)).toBe('100%');
      expect(value(linkedId, 'white-space', 1440, files)).toBe('normal');
      expect(value(linkedId, 'overflow-wrap', 1440, files)).toBe('anywhere');
      expect(value(linkedId, 'text-overflow', 1440, files)).toBe(value(linkedId, 'text-overflow', 1440, nativeFiles));
      const scroll = shell.querySelector('.table-scroll'), table = scroll.querySelector('table');
      const expandHeading = shell.querySelector('th .sr-only');
      expect(expandHeading.textContent).toBe('Expand');
      // Preserve native columns and accessible text while containing its absolute box.
      for (const width of [390, 861, 1440]) {
        expect(value(scroll, 'position', width, files)).toBe('relative');
        expect(value(scroll, 'overflow', width, files)).toBe('auto');
        expect(value(table, 'min-width', width, files)).toBe(value(table, 'min-width', width, nativeFiles));
        for (const property of ['position', 'width', 'height', 'clip', 'white-space'])
          expect(value(expandHeading, property, width, files)).toBe(value(expandHeading, property, width, nativeFiles));
      }
    }
  });

  test.each(workspaceCases.flatMap(({surface}) => [861, 900, 1440, 1920].map(width => [surface, width])))('%s shell stays 240/60 and non-shrinking at %ipx', (surface, width) => {
    const shell = mount('', {surface});
    const header = shell.querySelector('.bwp-topbar'), sidebar = shell.querySelector('.app-sidebar');
    expect(value(header, 'height', width, files)).toBe('60px');
    expect(value(sidebar, 'width', width, files)).toBe('240px');
    expect(value(sidebar, 'min-width', width, files)).toBe('240px');
    expect(value(sidebar, 'max-width', width, files)).toBe('240px');
    expect(value(sidebar, 'flex-shrink', width, files)).toBe('0');
    expect(value(sidebar, 'top', width, files)).toBe('60px');
    expect(value(sidebar, 'display', width, files)).toBe('flex');
    expect(value(shell.querySelector('.bwp-mobile-nav'), 'display', width, files)).toBe('none');
    expect(value(shell.querySelector('.bsb-client .bsb-group-label'), 'display', width, files)).toBe('none');
    expect(value(shell.querySelector('.bsb-group > .bsb-group-label'), 'display', width, files)).toBe('block');
  });

  test.each(['dashboard', 'calendar', 'reviews', 'ai'].flatMap(surface => [390, 860].flatMap(width => ['closed', 'open'].map(navigation => [surface, width, navigation]))))('%s retains the shared navigation control at %ipx while %s', (surface, width, navigation) => {
    const shell = mount('', {surface, navigation});
    const sidebar = shell.querySelector('.app-sidebar');
    expect(value(shell.querySelector('.bwp-topbar'), 'height', width, files)).toBe('60px');
    expect(value(shell.querySelector('.bwp-mobile-nav'), 'display', width, files)).toBe('grid');
    expect(value(sidebar, 'display', width, files)).toBe(navigation === 'open' ? 'flex' : 'none');
    if (navigation === 'open') {
      expect(value(sidebar, 'width', width, files)).toBe('260px');
      expect(value(sidebar, 'position', width, files)).toBe('fixed');
      expect(value(sidebar, 'top', width, files)).toBe('60px');
      expect(value(shell.querySelector('.bwp-nav-backdrop'), 'display', width, files)).toBe('block');
      expect(value(shell.querySelector('.bwp-nav-backdrop'), 'top', width, files)).toBe('60px');
      expect(value(shell.querySelector('.bsb-client .bsb-group-label'), 'display', width, files)).toBe('none');
      expect(value(shell.querySelector('.bsb-group > .bsb-group-label'), 'display', width, files)).toBe('block');
    }
  });

  test.each(workspaceCases)('$surface without the eligibility marker retains its authored baseline', ({surface, html, roles}) => {
    const shell = mount(html, {surface, eligible: false});
    const nodes = [shell.querySelector('.bwp-topbar'), shell.querySelector('.app-sidebar'), ...roles.map(([selector]) => shell.querySelector(selector))];
    for (const node of nodes) for (const property of ['font-size', 'line-height', 'width', 'height', 'display', 'color'])
      expect(value(node, property, 1440, files)).toBe(value(node, property, 1440, nativeFiles));
  });
});

const dialogBody = '<div class="dialog-shell"><header class="dialog-heading"><h2 data-protected>Native heading</h2><p data-protected>Native description</p></header><div class="dialog-content"><button class="date-review"><span class="list-title" data-protected>Native saved record</span><span class="list-details" data-protected>Native owner and date</span></button></div><footer class="dialog-footer"><button class="button" data-protected>Close</button></footer></div>';
const aiDialog = '<div role="dialog" data-protected class="ui-dialog airf airf-dialog" data-state="open"><div class="dialog-shell"><header class="dialog-heading"><h2 data-protected>Native AI editor</h2></header><div class="dialog-body"><label class="field"><span class="field-label" data-protected>Native field</span><input class="input" data-protected></label><div class="picker-popover" data-protected><button class="picker-option" data-protected><b>Native tool</b><small data-protected>Native catalogue detail</small></button></div><div class="screening-question" data-protected>Native screening question</div></div></div></div>';
const protectedCases = [
  {
    surface: 'dashboard',
    inline: '<section class="brawndo-demo-dashboard" data-cis-dashboard-concept="true"><section class="brawndo-demo-program" data-concept="true" data-cis-dashboard-profile="true"><div class="ph-chart" data-cis-history-inspection="true"><div role="tooltip" class="ph-history-tip ph-cis-history-tip" data-protected><div class="ph-tip-date" data-protected>Native position date</div><p data-protected>Native scope explanation</p></div></div></section></section>',
    portals: '<div class="ui-popover ui-floating cdp-domain-tip cdp-concept-tip cis-dashboard-concept-portal" data-state="open" data-protected><h3 data-protected>Native domain</h3><div class="cdp-tip-rate"><strong data-protected>50%</strong></div><div class="cdp-focus"><p data-protected>Native gaps</p></div></div><div class="ui-tooltip cis-dashboard-risk-tooltip cis-dashboard-concept-portal" data-concept="true" data-state="open" data-protected><strong data-protected>Native score details</strong></div><div role="dialog" class="ui-dialog cis-dashboard-risk-selection cis-dashboard-concept-portal" data-concept="true" data-state="open" data-protected><span class="cis-dashboard-risk-score" data-protected>6</span></div>',
  },
  {surface: 'calendar', inline: '<section class="bdcal"><div role="tooltip" class="tip" data-protected><span class="tt" data-protected>Native event type</span><span class="tl" data-protected>Native event title</span><span data-protected>Native owner and date</span></div></section>', portals: `<div role="dialog" class="ui-dialog" data-state="open" data-protected>${dialogBody}</div>`},
  {surface: 'reviews', inline: '<section class="crr-root" data-visual-surface="reviews"><section class="quarter-card"><div role="tooltip" class="tooltip crr-tooltip" data-protected><h3 data-protected>Native occurrence</h3><div class="tip-due" data-protected>Native date</div><div class="tip-meta" data-protected>Native owner</div></div></section></section>', portals: `<div role="dialog" class="ui-dialog crr-root crr-list" data-state="open" data-protected>${dialogBody}</div>`},
  {surface: 'actions', inline: '', portals: `<div role="tooltip" class="ui-tooltip cia-root cia-tooltip" data-state="open" data-protected><h3 data-protected>Native Action</h3><div class="tip-meta" data-protected>Native source</div></div><div role="dialog" class="ui-dialog cia-root cia-selector" data-state="open" data-protected>${dialogBody}</div>`},
  {surface: 'risks', inline: '', portals: `<div class="cis-risks-concept cr-tooltip-root"><div role="tooltip" class="tooltip" data-protected><h3 data-protected>Native Risk event</h3><div class="tip-meta" data-protected>Native owner</div></div></div><div role="dialog" class="ui-dialog cis-risks-concept cr-list-dialog" data-state="open" data-protected>${dialogBody}</div>`},
  {surface: 'vendors', inline: '', portals: '<div role="tooltip" class="ui-tooltip cv-tooltip" data-state="open" data-protected><h3 data-protected>Native Vendor event</h3><p data-protected>Native assurance date</p></div><div role="dialog" class="ui-dialog cv-event-list" data-state="open" data-protected><header><h2 data-protected>Native date list</h2></header><div class="cv-list-items"><button><b data-protected>Native Vendor</b><small data-protected>Native work type</small></button></div></div>'},
  {surface: 'policies', inline: '', portals: `<div role="dialog" class="ui-dialog" data-state="open" data-protected>${dialogBody}</div>`},
  {surface: 'ai', inline: '<main class="airf airf-page"><section class="register"><div class="table-scroll"><table><tbody><tr class="expanded-row"><td><div class="inline-system-detail" data-protected><div class="record-grid"><div class="record-field"><small data-protected>Next review</small><strong data-protected>Native saved date</strong></div></div><div class="inline-actions"><button class="button primary" data-protected>Open system record</button></div></div></td></tr></tbody></table></div></section></main>', portals: aiDialog},
  {surface: 'cis', inline: '', portals: '<div role="dialog" class="ui-dialog brawndo-cis-assessment brawndo-cis-visual-safeguard" data-state="open" data-protected><header class="brawndo-assessment-header"><h2 data-protected>Native safeguard</h2></header><div class="assessment-layout"><section role="tabpanel" data-state="active"><div class="brawndo-cis-visual-requirement"><h3 data-protected>Official requirement</h3><p data-protected>Native source text</p></div><textarea class="assessment-implementation" data-protected>Native assessment</textarea></section></div></div><div class="guided-pilot guided-lifecycle omni-refined brawndo-cis-visual-omni"><section class="guided-panel omni-workspace-window omni-refined-window" data-protected><div class="guided-panel-body"><fieldset class="omni-question-group"><div class="omni-question" data-protected>Native guided question</div><div class="omni-answer-choices"><button data-protected>Native choice</button></div></fieldset><div class="omni-action-bar"><button data-protected>Save assessment</button></div></div></section></div>'},
];

describe.each(orders.map(files => [files]))('protected authored presentation with stylesheet order %j', files => {
  test.each(protectedCases.flatMap(testCase => ['light', 'dark'].map(theme => ({...testCase, theme}))))('$surface $theme inline and portal surfaces keep native declarations and inherited typography', ({surface, inline, portals, theme}) => {
    mount(inline, {surface, theme});
    const portalRoot = document.createElement('div');
    portalRoot.innerHTML = portals;
    for (const node of portalRoot.querySelectorAll('[data-protected]')) node.setAttribute('data-theme', theme);
    fixture.appendChild(portalRoot);
    const nodes = [...fixture.querySelectorAll('[data-protected]')];
    expect(nodes.length).toBeGreaterThan(0);
    for (const width of [390, 1440]) for (const node of nodes) {
      for (const property of ['font-size', 'font-family', 'font-weight', 'line-height', 'color', 'background', 'border-color', 'box-shadow', 'width', 'height', 'max-width', 'max-height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'overflow'])
        expect({surface, width, element: node.className || node.tagName, property, value: value(node, property, width, files)}).toEqual({surface, width, element: node.className || node.tagName, property, value: value(node, property, width, nativeFiles)});
    }
  });
});
