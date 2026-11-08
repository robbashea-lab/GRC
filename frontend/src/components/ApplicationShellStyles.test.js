const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const {selectorSpecificity, compare} = require('@csstools/selector-specificity');

// This evaluates authored CSS, not browser layout, computed geometry or 200% zoom.
// Keep the actual competing route styles in the cascade, including their media rules.
const nativeFiles = [
  '../design-system.css', '../index.css', '../App.css', 'Brand.css',
  'BrawndoWorkspace.css', 'BrawndoSidebar.css', 'SixSurfaceAppearance.css',
  'AdditionalSectionsAppearance.css', 'BrawndoCisVisualShell.css', 'BrawndoPortalTheme.css',
  'BrawndoDemoDashboard.css', 'CisDashboardConcept.css', 'CisWorkspaceSizing.css',
];
const correction = 'ApplicationShell.css';
const sheets = Object.fromEntries([...nativeFiles, correction].map(name => [
  name, postcss.parse(fs.readFileSync(path.join(__dirname, name), 'utf8')),
]));
const orders = [
  ['normal', [...nativeFiles, correction]],
  ['inverted', [correction, ...[...nativeFiles].reverse()]],
];
const inherited = new Set(['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'letter-spacing', 'cursor']);
const selectorDetails = new Map();
let fixture;
let cachedMatches;
let cachedDeclarations;
let originalHtmlAttributes;

function details(selector) {
  if (!selectorDetails.has(selector)) {
    const parsed = selectorParser().astSync(selector).nodes[0];
    const lastCombinator = parsed.nodes.reduce((last, node, index) => node.type === 'combinator' ? index : last, -1);
    const compound = parsed.nodes.slice(lastCombinator + 1);
    selectorDetails.set(selector, {
      specificity: selectorSpecificity(parsed),
      tag: compound.find(node => node.type === 'tag')?.value,
      classes: compound.filter(node => node.type === 'class').map(node => node.value),
      ids: compound.filter(node => node.type === 'id').map(node => node.value),
    });
  }
  return selectorDetails.get(selector);
}

function declarations(node, width, files) {
  const key = `${width}:${files.join('|')}`;
  const cached = cachedDeclarations.get(node) || new Map();
  if (cached.has(key)) return cached.get(key);
  const found = [];
  for (const name of files) sheets[name].walkRules(rule => {
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type !== 'atrule') continue;
      if (parent.name !== 'media') return;
      const bounds = [...parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)];
      if (!bounds.length || bounds.some(([, kind, limit]) => kind === 'min' ? width < Number(limit) : width > Number(limit))) return;
    }
    for (const selector of rule.selectors) {
      if (selector.includes('::')) continue;
      const info = details(selector);
      const matches = cachedMatches.get(node) || new Map();
      if (!matches.has(selector)) {
        const possible = (!info.tag || info.tag.toLowerCase() === node.localName.toLowerCase())
          && info.classes.every(name => node.classList.contains(name)) && info.ids.every(id => node.id === id);
        const stateSelector = selector.replace(/:hover/g, '[data-css-hover]').replace(/:focus-visible/g, '[data-css-focus]');
        matches.set(selector, possible && node.matches(stateSelector));
        cachedMatches.set(node, matches);
      }
      if (matches.get(selector)) rule.walkDecls(declaration => found.push({declaration, specificity: info.specificity, important: Number(!!declaration.important)}));
    }
  });
  cached.set(key, found);
  cachedDeclarations.set(node, cached);
  return found;
}

function expanded(declaration, property) {
  const {prop, value} = declaration;
  if (prop === property) return value;
  if (prop === 'font' && ['font-family', 'font-size', 'font-weight', 'line-height'].includes(property)) {
    if (value === 'inherit') return value;
    const font = value.match(/^(?:(normal|bold|[1-9]\d{2})\s+)?(\d+(?:\.\d+)?px)(?:\/([\d.]+(?:px)?))?\s+(.+)$/);
    if (font) return {'font-family': font[4], 'font-size': font[2], 'font-weight': font[1] || 'normal', 'line-height': font[3] || 'normal'}[property];
  }
  const borderSide = property.match(/^border-(top|right|bottom|left)-width$/)?.[1];
  if (borderSide && (prop === 'border' || prop === `border-${borderSide}`))
    return value.match(/^(0|\d+(?:\.\d+)?px)(?:\s|$)/)?.[1];
  if (borderSide && prop === 'border-width') {
    const [top, right = top, bottom = top, left = right] = value.split(/\s+/);
    return {top, right, bottom, left}[borderSide];
  }
  for (const box of ['margin', 'padding', 'inset']) {
    const sides = box === 'inset' ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'bottom', 'left'].map(side => `${box}-${side}`);
    if (prop !== box || !sides.includes(property)) continue;
    const values = value.split(/\s+/);
    const [top, right = top, bottom = top, left = right] = values;
    return [top, right, bottom, left][sides.indexOf(property)];
  }
  return undefined;
}

function value(node, property, width, files, depth = 0) {
  if (!node || depth > 30) return undefined;
  let selected;
  for (const candidate of declarations(node, width, files)) {
    const next = expanded(candidate.declaration, property);
    if (next === undefined) continue;
    if (!selected || candidate.important > selected.important
      || candidate.important === selected.important && compare(candidate.specificity, selected.specificity) >= 0) selected = {...candidate, value: next};
  }
  let result = selected?.value;
  if ((inherited.has(property) || property.startsWith('--')) && (!selected || ['inherit', 'unset'].includes(result)))
    return value(node.parentElement, property, width, files, depth + 1);
  const variable = typeof result === 'string' && result.match(/^var\((--[\w-]+)(?:,\s*(.*))?\)$/);
  if (variable) result = value(node, variable[1], width, files, depth + 1) ?? variable[2];
  return result;
}

const routes = [
  ['Portfolio', 'data-visual-surface="portfolio"', 'governara-portfolio-shell'],
  ['Administration', 'data-shared-shell="true"', 'governara-operational-shell'],
  ['Dashboard', 'data-cis-sizing="true" data-cis-dashboard-concept="true" data-cis-visual="true" data-visual-surface="dashboard"', 'governara-operational-shell'],
  ['Calendar', 'data-cis-sizing="true" data-visual-surface="calendar"', 'governara-operational-shell'],
  ['Native ISO/SOC program', 'data-shared-shell="true"', 'governara-operational-shell'],
  ['New unenrolled client', '', 'governara-operational-shell'],
];
const brand = (kind, mark) => `<div class="application-brand ${kind}"><img class="governara-feather ${mark}" alt=""><span><span class="application-brand-name">GoverNara</span><small class="application-brand-tagline">Turn complexity into clarity.</small></span></div>`;

function mount(route, theme = 'light', navigation = 'closed') {
  cachedMatches = new WeakMap();
  cachedDeclarations = new WeakMap();
  document.documentElement.dataset.brawndoWorkspace = theme;
  document.documentElement.dataset.brawndoPortal = theme;
  if (route[1].includes('data-visual-surface')) {
    document.documentElement.dataset.visualSurface = route[0] === 'Portfolio' ? 'portfolio' : route[0].toLowerCase();
    document.documentElement.dataset.visualTheme = theme;
  } else {
    delete document.documentElement.dataset.visualSurface;
    delete document.documentElement.dataset.visualTheme;
  }
  fixture.innerHTML = `<div class="brawndo-workspace-pilot" data-application-shell="true" data-theme="${theme}" data-navigation="${navigation}" ${route[1]}>
    <header class="bwp-topbar"><button class="bwp-mobile-nav">Navigation</button>${brand('bwp-brand', 'bwp-mark')}
      <div class="bwp-search"><input type="search"><kbd>Ctrl K</kbd></div><div class="bwp-top-actions"><button class="bwp-client">Native client selector</button><button class="bwp-theme">Theme</button><button data-testid="notification-bell">Notifications</button></div></header>
    <button class="bwp-nav-backdrop">Close navigation</button>
    <div class="bwp-body"><div class="app-shell ${route[2]}"><aside class="app-sidebar bsb" data-theme="${theme}"><div class="bsb-head">${brand('bsb-brand', 'bsb-mark')}<button class="bsb-client">Native client</button></div>
      <nav class="bsb-nav"><div class="bsb-group"><div class="bsb-group-label">Program</div><a class="bsb-link" href="/reviews"><span>Reviews</span></a></div></nav></aside>
      <main class="app-workspace"><section class="native-program"><h2>Native framework heading</h2><input value="Unsaved native draft"><button>Save</button></section></main></div></div>
    </div><section class="public-recovery"><div class="brand-lockup"><img class="governara-feather brand-mark" alt=""><div class="brand-name">GoverNara</div><div class="brand-owner">BY PRESTIGE WORLDWIDE</div></div><input type="password"></section>
    <div class="ui-dialog" role="dialog"><div class="ui-dialog-content"><h2>Native editor</h2><textarea>Retained native editor</textarea><button>Cancel</button></div></div>`;
  return fixture.firstElementChild;
}

beforeEach(() => {
  originalHtmlAttributes = document.documentElement.getAttributeNames().map(name => [name, document.documentElement.getAttribute(name)]);
  fixture = document.createElement('div');
  document.body.appendChild(fixture);
});
afterEach(() => {
  fixture.remove();
  for (const name of document.documentElement.getAttributeNames()) document.documentElement.removeAttribute(name);
  for (const [name, previous] of originalHtmlAttributes) document.documentElement.setAttribute(name, previous);
});

test.each(orders.flatMap(([order, files]) => ['light', 'dark'].map(theme => [order, theme, files])))('%s import order, %s: every route receives the approved desktop chrome', (_order, theme, files) => {
  for (const route of routes) for (const width of [1280, 861]) {
    const shell = mount(route, theme), header = shell.querySelector('.bwp-topbar'), sidebar = shell.querySelector('.app-sidebar');
    const read = (node, property) => value(node, property, width, files);
    expect({route: route[0], width, top: read(header, 'height'), rail: read(sidebar, 'width'), minimum: read(sidebar, 'min-width'), maximum: read(sidebar, 'max-width'), offset: read(sidebar, 'top'), height: read(sidebar, 'height')})
      .toEqual({route: route[0], width, top: '60px', rail: '240px', minimum: '240px', maximum: '240px', offset: '60px', height: 'calc(100dvh - 60px)'});
    expect(read(header, 'background')).toBe('#081426');
    expect(read(header, 'color')).toBe('#edf3ff');
    expect(read(sidebar, 'background')).toBe('#071321');
    for (const side of ['top', 'right', 'bottom', 'left']) expect(read(sidebar, `border-${side}-width`)).toBe('0');
    const sidebarHead = shell.querySelector('.bsb-head');
    expect(['padding-top', 'padding-right', 'padding-bottom', 'padding-left'].map(property => read(sidebarHead, property)))
      .toEqual(['16px', '11px', '0', '11px']);
    expect(read(sidebarHead, 'gap')).toBe('12px');
    expect(read(sidebar, 'display')).toBe('flex');
    expect(read(sidebar, 'position')).toBe('sticky');
    expect(read(shell.querySelector('.bwp-mobile-nav'), 'display')).toBe('none');
    expect(read(shell.querySelector('.bwp-nav-backdrop'), 'display')).toBe('none');
    expect(read(shell.querySelector('.bwp-search'), 'max-width')).toBe('400px');
    expect(read(shell.querySelector('.bwp-search input'), 'height')).toBe('32px');
    for (const node of shell.querySelectorAll('.application-brand')) {
      expect(read(node, 'font-size')).toBe('20px');
      expect(read(node, 'font-family').split(',')[0].replace(/['"]/g, '')).toBe('GoverNara CIS Concept Inter');
      expect(read(node, 'cursor')).toBe('default');
      expect(read(node.querySelector('.governara-feather'), 'width')).toBe('32px');
      expect(read(node.querySelector('.governara-feather'), 'height')).toBe('32px');
      expect(read(node.querySelector('.application-brand-tagline'), 'text-transform')).toBe('none');
    }
    expect(read(shell.querySelector('.bwp-brand'), 'width')).toBe('155px');
    expect(shell.dataset.theme).toBe(theme);
    expect(shell.querySelector('.bsb-link').getAttribute('href')).toBe('/reviews');
  }
});

test('initial Portfolio can use the existing bundled brand face without loading the Dashboard route', () => {
  const faces = [];
  sheets[correction].walkAtRules('font-face', face => {
    const declarations = Object.fromEntries(face.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    if (declarations['font-family'].replace(/['"]/g, '') === 'GoverNara CIS Concept Inter') faces.push({face, declarations});
  });
  expect(faces).toHaveLength(1);
  expect(faces[0].face.parent.type).toBe('root');
  const source = faces[0].declarations.src.match(/^url\(['"]?([^'"\)]+)['"]?\)\s+format\(['"]woff2['"]\)$/)?.[1];
  expect(source).toBe('../assets/fonts/inter-dashboard-latin.woff2');
  expect(fs.readFileSync(path.resolve(__dirname, source)).subarray(0, 4).toString('ascii')).toBe('wOF2');
  expect(fs.readFileSync(path.join(__dirname, 'BrawndoWorkspace.jsx'), 'utf8')).toMatch(/import\s+['"]\.\/ApplicationShell\.css['"]/);
  for (const [, files] of orders) {
    const withoutDashboard = files.filter(name => !['BrawndoDemoDashboard.css', 'CisDashboardConcept.css'].includes(name));
    const shell = mount(routes[0]);
    for (const node of [shell.querySelector('.bwp-topbar'), ...shell.querySelectorAll('.application-brand')])
      expect(value(node, 'font-family', 1280, withoutDashboard).split(',')[0].replace(/['"]/g, '')).toBe('GoverNara CIS Concept Inter');
  }
  // Availability/declaration checks do not establish browser font loading or pixels.
});

test.each(orders)('%s import order: selected navigation retains its native selected treatment while hovered', (_order, files) => {
  for (const route of routes) for (const theme of ['light', 'dark']) {
    const shell = mount(route, theme), normal = shell.querySelector('.bsb-link');
    const hover = normal.cloneNode(true), selected = normal.cloneNode(true), selectedHover = normal.cloneNode(true);
    hover.dataset.cssHover = 'true';
    selected.classList.add('is-active');
    selectedHover.classList.add('is-active');
    selectedHover.dataset.cssHover = 'true';
    normal.parentElement.append(hover, selected, selectedHover);
    const read = (node, property) => value(node, property, 1280, files);
    expect(read(hover, 'background')).toBe('#13223a');
    expect(read(hover, 'color')).toBe('#edf3ff');
    expect(read(hover, 'font-weight')).toBe(read(normal, 'font-weight'));
    for (const node of [selected, selectedHover]) {
      expect(read(node, 'background')).toBe('#25416a');
      expect(read(node, 'color')).toBe('#fff');
      expect(read(node, 'font-weight')).toBe('600');
      expect(node.getAttribute('href')).toBe('/reviews');
    }
  }
});

test.each(orders)('%s import order: the shared 860px native navigation state survives all route overrides', (_order, files) => {
  for (const route of routes) for (const width of [860, 650, 390]) for (const navigation of ['closed', 'open']) {
    const shell = mount(route, 'light', navigation), sidebar = shell.querySelector('.app-sidebar');
    const read = (node, property) => value(node, property, width, files);
    expect(read(shell.querySelector('.bwp-topbar'), 'height')).toBe('60px');
    expect(read(shell.querySelector('.bwp-mobile-nav'), 'display')).toBe('grid');
    expect(read(shell.querySelector('.bwp-search'), 'display')).toBe('none');
    expect(read(shell.querySelector('.bwp-brand .application-brand-tagline'), 'display')).toBe('none');
    expect(read(shell.querySelector('.bwp-brand > span'), 'display')).toBe('block');
    expect(read(sidebar, 'display')).toBe(navigation === 'open' ? 'flex' : 'none');
    if (navigation === 'open') {
      expect(read(sidebar, 'position')).toBe('fixed');
      expect(read(sidebar, 'width')).toBe('260px');
      expect(read(sidebar, 'top')).toBe('60px');
      expect(read(shell.querySelector('.bwp-nav-backdrop'), 'display')).toBe('block');
      expect(read(shell.querySelector('.bwp-nav-backdrop'), 'top')).toBe('60px');
      expect(read(shell.querySelector('.bsb-client'), 'display')).toBe('flex');
      expect(read(shell.querySelector('.bsb-link > span'), 'display')).toBe('initial');
    }
  }
});

test.each(orders)('%s import order: chrome changes preserve content themes, native controls, public branding and external portals', (_order, files) => {
  const withoutCorrection = files.filter(name => name !== correction);
  const properties = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background', 'background-color', 'color-scheme', 'padding', 'border', 'border-color', 'border-radius', 'width', 'height', '--bg', '--surface', '--fg', '--color-bg-app', '--color-bg-surface', '--color-text-primary'];
  for (const route of routes) for (const theme of ['light', 'dark']) {
    const shell = mount(route, theme);
    const nodes = [shell.querySelector('main'), ...shell.querySelectorAll('.native-program, .native-program h2, .native-program input, .native-program button'),
      ...fixture.querySelectorAll('.public-recovery, .public-recovery *, .ui-dialog, .ui-dialog *')];
    for (const node of nodes) for (const property of properties) expect({route: route[0], theme, element: node.className || node.tagName, property, value: value(node, property, 1280, files)})
      .toEqual({route: route[0], theme, element: node.className || node.tagName, property, value: value(node, property, 1280, withoutCorrection)});
    expect(shell.querySelector('.native-program input').value).toBe('Unsaved native draft');
    if (route[0] === 'Portfolio') expect(value(shell, '--bg', 1280, files)).toBe(theme === 'dark' ? '#0A0F16' : '#F4F6F9');
  }
});
