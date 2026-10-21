const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

// JSDOM has no layout engine; this guards scoped native sizing, not measured bounds or zoom.
test('only the Portfolio implementation preview reuses native wide geometry and internal scrolling', () => {
  const css = postcss.parse(fs.readFileSync(path.join(__dirname, 'EnhancedPortfolio.css'), 'utf8'));
  const declarations = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  const rules = [];
  css.walkRules('.portfolio-history-dialog.ep-history', rule => rules.push(rule));
  const wide = declarations(rules.find(rule => rule.parent.type === 'root'));
  expect(wide).toMatchObject({
    position: 'fixed', inset: '50% auto auto 50%', transform: 'translate(-50%, -50%)',
    width: 'min(1440px, calc(100vw - 64px))', 'max-width': 'calc(100vw - 64px)',
    height: 'min(92dvh, 1000px)', 'max-height': 'calc(100dvh - 48px)', overflow: 'hidden',
  });
  const mobile = declarations(rules.find(rule => rule.parent.type === 'atrule' && rule.parent.params === '(max-width: 600px)'));
  expect(mobile).toMatchObject({width: 'calc(100vw - 24px)', 'max-width': 'calc(100vw - 24px)', height: 'calc(100dvh - 32px)', 'max-height': 'calc(100dvh - 32px)'});
  let body = {};
  css.walkRules('.ep-history-body', rule => {
    if (rule.parent.type === 'root') body = {...body, ...declarations(rule)};
  });
  expect(body).toMatchObject({flex: '1', overflow: 'auto', 'min-height': '0'});
  css.walkRules(rule => {
    if (rule.nodes.some(node => node.prop === 'width' && node.value === wide.width)) expect(rule.selector).toBe('.portfolio-history-dialog.ep-history');
  });
});
