import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import postcss from 'postcss';

const css = readFileSync(join(__dirname,'LoginPrism.css'),'utf8');
const sheet = postcss.parse(css);
test('all Prism selectors and animation names remain Login-scoped', () => {
  sheet.walkRules(rule => {
    if (rule.parent.type === 'atrule' && rule.parent.name === 'keyframes') return;
    for (const selector of rule.selector.split(',')) expect(selector.trim()).toMatch(/^#login-prism(?:[\s.:#]|$)/);
  });
  sheet.walkAtRules('keyframes', rule => expect(rule.params).toMatch(/^login-prism-/));
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
  expect(css).toContain('#login-prism.paused .scene:after{animation:none}');
});
test('approved artwork is extracted unchanged, shared by scene/cards and bundled locally', () => {
  const artwork = readFileSync(join(__dirname,'../assets/login-grc-prism.png'));
  expect(createHash('sha256').update(artwork).digest('hex')).toBe('62f626cf5654e703050a5ee62d7d6f71d3285df7f037a8eaa3a2c8f92716268a');
  expect(css.match(/url\('\.\.\/assets\/login-grc-prism\.png'\)/g)).toHaveLength(2);
  expect(css).not.toMatch(/https?:|data:image/);
});
test('approved fixed-dark palette, desktop geometry and responsive breakpoints are preserved', () => {
  expect(css).toContain('--bg:#080e12');
  expect(css).toContain('--cyan:#76e5f6');
  expect(css).toContain('--purple:#a58aff');
  expect(css).toContain('grid-template-columns:minmax(0,1fr) 370px');
  expect(css).toContain('@media(max-width:1000px)');
  expect(css).toContain('@media(max-width:760px)');
  expect(css).toContain('width:min(1050px,calc(100% - 36px))');
});
