const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(process.cwd(), 'src/design-system.css'), 'utf8');
const palette = css.split('.light {')[0];
function color(token) {
  const match = palette.match(new RegExp('--color-' + token + ': (#[A-Fa-f0-9]{6})'));
  if (!match) throw new Error('Missing token: ' + token);
  return match[1];
}
function luminance(hex) {
  return hex.slice(1).match(/../g).map(x => parseInt(x,16)/255)
    .map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4)
    .reduce((sum,x,i) => sum+x*[.2126,.7152,.0722][i],0);
}
function contrast(a,b) {
  const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}
test.each(['text-primary','text-secondary','text-muted','text-help'])('%s remains readable on light workspace surfaces', token => {
  for (const surface of ['bg-app','bg-surface','bg-subtle','bg-row-hover']) {
    expect(contrast(color(token),color(surface))).toBeGreaterThanOrEqual(4.5);
  }
});
test.each(['critical','high','moderate','duesoon','success','info','neutral','accepted'])('%s badge label contrast', tone => {
  expect(contrast(color(tone),color(tone+'-bg'))).toBeGreaterThanOrEqual(4.5);
});
test('native controls and portals inherit the approved light theme', () => {
  expect(css).toContain('.light { color-scheme: light; }');
  expect(css).toContain('color-scheme: light');
  expect(css).not.toContain('color-scheme: dark');
});

test('shared motion respects reduced motion and keyboard work without animating layout', () => {
  expect(css).toContain('--duration-drawer: 240ms');
  expect(css).toContain('--ease-drawer: cubic-bezier(.32, .72, 0, 1)');
  expect(css).toContain('transform: scale(.96)');
  expect(css).toContain(':not([data-static])');
  expect(css).toContain('@media (hover: hover) and (pointer: fine)');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  expect(css).toContain('[data-input-modality="keyboard"]');
  expect(css).not.toMatch(/transition:\s*all|will-change:\s*all/);
});

test('floating surfaces keep viewport limits, keyboard focus, and trigger origins', () => {
  expect(css).toContain('max-width: calc(100vw - 24px)');
  expect(css).toContain('max-height: calc(100dvh - 32px)');
  expect(css).toContain('outline: 2px solid var(--color-focus-ring)');
  expect(css).toContain('transform-origin: var(--radix-dropdown-menu-content-transform-origin)');
  expect(css).toContain('.ui-tooltip[data-state="instant-open"] { animation: none; }');
});
test('dashboard work tables stack before their minimum width instead of clipping due dates and actions', () => {
  const base = fs.readFileSync(path.join(process.cwd(), 'src/index.css'), 'utf8');
  const min = Number(base.match(/\.app-workspace \.overflow-x-auto > table \{ min-width: (\d+)px; \}/)[1]);
  expect(css).toContain('.ops-table { container-type: inline-size; }');
  expect(css).toContain(`@container (max-width: ${min - 1}px)`);
  expect(css).toContain(':root .ops-table.overflow-x-auto > table { min-width: 0; }');
});
test('login fields on the dark access pane are never given the light workspace surface', () => {
  // The light-surface input rule once out-ranked the dark login rule and left typed text white on white.
  const lightInputRule = css.split('\n').find(line => line.includes('input:not([type="checkbox"])') && line.includes('background: var(--color-bg-surface)'));
  expect(lightInputRule).toBeDefined();
  expect(lightInputRule).not.toContain('.login-shell');
  expect(css).toMatch(/:root :is\(\.app-sidebar, \.login-shell\) \.ui-control \{ background: var\(--color-sidebar-hover-bg\); color: var\(--color-text-on-dark\)/);
});
