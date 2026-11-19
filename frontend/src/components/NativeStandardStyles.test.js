import fs from 'fs';
import path from 'path';
import postcss from 'postcss';

test('R4 styles stay inside the protected application or its mounted portals', () => {
  const stylesheet = fs.readFileSync(path.join(__dirname,'NativeStandard.css'),'utf8');
  const root = postcss.parse(stylesheet);
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    for (const selector of rule.selectors) expect(selector).toMatch(/^(?:\.native-standard|html\[data-native-standard|:is\(\.native-standard)/);
  });
  expect(stylesheet).not.toMatch(/@import|https:\/\/fonts/);
  const drawers = [];
  root.walkRules(rule => {if (rule.selector === '.native-standard .drawer') rule.walkDecls('width', declaration => drawers.push(declaration.value));});
  expect(drawers.at(-1)).toBe('min(600px,100%)');
});
