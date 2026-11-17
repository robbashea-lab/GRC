const fs = require('fs');
const path = require('path');
const postcss = require('postcss');

// JSDOM has no layout engine; this guards scoped reference sizing, not measured bounds or zoom.
test('only the Portfolio implementation preview uses reference modal geometry and internal scrolling', () => {
  const css = postcss.parse(fs.readFileSync(path.join(__dirname, 'EnhancedPortfolio.css'), 'utf8'));
  const reference = postcss.parse(fs.readFileSync(path.join(__dirname, 'PortfolioReference.css'), 'utf8'));
  const declarations = rule => Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  const rules = [];
  css.walkRules('.portfolio-reference.portfolio-history-dialog.ep-history', rule => rules.push(rule));
  const wide = declarations(rules.find(rule => rule.parent.type === 'root'));
  expect(wide).toMatchObject({
    position: 'fixed', inset: '4dvh auto auto 50%', transform: 'translateX(-50%)',
    width: 'min(1080px,calc(100vw - 32px))', 'max-width': 'calc(100vw - 32px)',
    height: 'auto', 'max-height': '92dvh', overflow: 'hidden', 'border-radius': '22px',
    display: 'flex', 'flex-direction': 'column',
  });
  expect(rules).toHaveLength(1);
  let body = {};
  css.walkRules('.portfolio-reference .ep-history-body', rule => {
    if (rule.parent.type === 'root') body = {...body, ...declarations(rule)};
  });
  expect(body).toMatchObject({flex: '1', overflow: 'auto', 'min-height': '0'});
  let referenceBody;
  reference.walkRules('.portfolio-reference .m-body', rule => { referenceBody = declarations(rule); });
  expect(referenceBody).toMatchObject({overflow: 'auto', display: 'flex', 'flex-direction': 'column'});
  const scopedTokens = [];
  reference.walkRules(rule => {
    if (rule.nodes.some(node => node.type === 'decl' && node.prop === '--bg')) scopedTokens.push(rule.selector);
  });
  expect(scopedTokens.length).toBeGreaterThan(0);
  scopedTokens.forEach(selector => expect(selector).toContain('.portfolio-reference'));
  css.walkRules(rule => {
    if (rule.nodes.some(node => node.prop === 'width' && node.value === wide.width)) expect(rule.selector).toBe('.portfolio-reference.portfolio-history-dialog.ep-history');
  });
});
