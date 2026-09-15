const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const css = fs.readFileSync(path.join(process.cwd(),'src/design-system.css'),'utf8');

test('approved system is shared, with only Reviews column geometry specialized', () => {
  expect(css).not.toContain('data-register-preview');
  expect(css).toContain('.register-table-frame[data-layout="reviews"] > table');
  expect(fs.existsSync(path.join(process.cwd(),'src/register-design.css'))).toBe(false);
});
test('pilot adds no decorative animation, blur or promoted layers', () => {
  expect(css).not.toMatch(/@keyframes|backdrop-filter|will-change|transition:\s*all/);
  expect(css).toContain('[data-input-modality="keyboard"]');
  expect(css).toContain('@media (hover: hover) and (pointer: fine)');
  expect(css).toContain('outline: 2px solid var(--color-focus-ring)');
});
const token = name => css.match(new RegExp('--color-'+name+': (#[A-Fa-f0-9]{6})'))[1];
const luminance = hex => hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const contrast = (a,b) => {const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05);};
test.each(['text-primary','text-secondary','text-muted','text-help'])('%s meets 4.5:1 across candidate surfaces', text => {
  for(const surface of ['bg-app','bg-surface','bg-subtle','bg-row-hover'])expect(contrast(token(text),token(surface))).toBeGreaterThanOrEqual(4.5);
});
test('search outline remains distinguishable from its fill',()=>{
  expect(contrast(token('input-border'),token('bg-subtle'))).toBeGreaterThanOrEqual(3);
});

test('four text levels are ordered and active boundaries remain distinguishable', () => {
  const levels = ['text-primary','text-secondary','text-muted','text-disabled'].map(name => luminance(token(name)));
  expect(levels).toEqual([...levels].sort((a,b)=>b-a));
  expect(new Set(levels).size).toBe(4);
  expect(contrast(token('control-active-border'),token('selected-bg'))).toBeGreaterThanOrEqual(3);
  expect(contrast(token('text-muted'),token('selected-bg'))).toBeGreaterThanOrEqual(4.5);
});

test('dark pilot structural colors are neutral, without replacing semantic accents', () => {
  const palette = postcss.parse(css).nodes.find(n => n.selector === ':root:not(.light)');
  expect(palette.selector).toContain(':not(.light)');
  palette.walkDecls(decl => {
    if (!/^--(?:background|foreground|card|popover|primary|secondary|muted|accent|border|input|color-(?:bg-|border|input-border|text-|sidebar-|brand-|selected-bg|neutral|control-))/.test(decl.prop) || decl.value.startsWith('var(')) return;
    if (decl.value.startsWith('#')) {
      const channels = decl.value.slice(1).match(/../g);
      expect(new Set(channels).size).toBe(1);
    } else expect(decl.value).toMatch(/^0 0% \d+%$/);
  });
});
