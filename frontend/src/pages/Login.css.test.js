import { readFileSync } from 'fs';
import { join } from 'path';
import postcss from 'postcss';

const stylesheet = postcss.parse(readFileSync(join(__dirname, 'Login.css'), 'utf8'));
function declaration(selector, property) {
  let value;
  stylesheet.walkRules(rule => {
    if (rule.selector.split(',').map(item => item.trim()).includes(selector)) {
      rule.walkDecls(property, item => { value = item.value; });
    }
  });
  expect(value).toBeDefined();
  return value;
}
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

// Selected solid-color contracts; not a substitute for rendered accessibility QA.
test.each(['.link', '.secondary'])('%s small text has adequate light and dark contrast', selector => {
  expect(contrast(declaration(`#omni-login ${selector}`, 'color'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  expect(contrast(declaration(`#omni-login.dark ${selector}`, 'color'), '#102b47')).toBeGreaterThanOrEqual(4.5);
});
test.each(['button:focus-visible', 'a:focus-visible', '.login input:focus-visible'])('%s focus remains visible on both panel colors', selector => {
  const color = declaration(`#omni-login ${selector}`, 'outline').match(/#[0-9a-f]{6}/i)[0];
  for (const panel of ['#ffffff', '#102b47']) expect(contrast(color, panel)).toBeGreaterThanOrEqual(3);
});
test('primary action white text contrasts with both gradient endpoints', () => {
  const colors = declaration('#omni-login .primary', 'background').match(/#[0-9a-f]{6}/gi);
  expect(colors).toHaveLength(2);
  for (const color of colors) expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(4.5);
});
