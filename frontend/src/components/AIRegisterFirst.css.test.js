const fs=require('fs'),path=require('path'),postcss=require('postcss');

// Source-level cascade protection; measured browser geometry remains a separate gate.
test('AI portal sizing overrides the native dialog rule without affecting other portals',()=>{
  const native=postcss.parse(fs.readFileSync(path.join(__dirname,'../design-system.css'),'utf8'));
  const sheet=postcss.parse(fs.readFileSync(path.join(__dirname,'AIRegisterFirst.css'),'utf8'));
  const declarations=rule=>Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
  let shared;native.walkRules(':root .ui-dialog[data-state]',rule=>{shared=rule;});
  expect(shared).toBeDefined();
  const selector=':root .ui-dialog.airf-dialog[data-state]',rules=[];
  sheet.walkRules(selector,rule=>rules.push(rule));
  expect(selector.replace('.airf-dialog','')).toBe(shared.selector);
  expect(declarations(rules.find(rule=>rule.parent.type==='root'))).toMatchObject({width:'min(1120px,calc(100vw - 40px))','max-width':'1120px','max-height':'calc(100dvh - 36px)',overflow:'hidden'});
  expect(declarations(rules.find(rule=>rule.parent.params==='(max-width:650px)'))).toMatchObject({width:'calc(100vw - 18px)','max-height':'calc(100dvh - 18px)'});
  let overlay;sheet.walkRules(':root .ui-overlay[data-state]:has(+ .ui-dialog.airf-dialog)',rule=>{overlay=declarations(rule);});
  expect(overlay).toMatchObject({background:'#05132870','backdrop-filter':'blur(3px)'});
});
