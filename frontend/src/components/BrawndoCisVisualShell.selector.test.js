import {readFileSync} from 'fs';
import {join} from 'path';
import postcss from 'postcss';

const css=postcss.parse(readFileSync(join(__dirname,'BrawndoCisVisualShell.css'),'utf8'));
const rules=[];css.walkRules(rule=>rules.push(rule));
const paletteRules=[];postcss.parse(readFileSync(join(__dirname,'SixSurfaceAppearance.css'),'utf8')).walkRules(rule=>paletteRules.push(rule));
const pendingSelector='html:not([data-brawndo-cis-visual=true])';
const matches=(rule,target)=>rule.selectors.some(selector=>target.matches(selector));
const declaration=(rule,property,value)=>rule.nodes.some(node=>node.type==='decl'&&node.prop===property&&node.value===value);
const media=rule=>rule.parent.type==='atrule'?rule.parent.params:'';
let shell,portal;

beforeEach(()=>{
  shell=document.createElement('div');shell.className='brawndo-workspace-pilot';shell.dataset.cisVisual='true';shell.dataset.navigation='closed';
  shell.innerHTML='<header class="bwp-topbar"><div class="bwp-search"><kbd>Ctrl K</kbd></div><button class="bwp-mobile-nav"></button></header><aside class="app-sidebar"><div class="bsb-head"></div></aside><main><div class="section-body"><section class="brawndo-cis-visual" data-theme="light"></section></div></main>';
  portal=document.createElement('div');portal.className='ui-dialog';
  document.body.append(shell,portal);
});
afterEach(()=>{shell.remove();portal.remove();delete document.documentElement.dataset.brawndoCisVisual;delete document.body.dataset.brawndoCisVisual;});

test.each([
  ['.bwp-topbar','padding','0 max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px))',''],
  ['.bwp-search kbd','display','block',''],
  ['.bsb-head','padding','16px 12px 0',''],
  ['.section-body','padding','0',''],
  ['.brawndo-cis-visual','padding','28px max(24px,env(safe-area-inset-right,0px)) 120px 24px',''],
  ['.app-sidebar','display','none','(max-width:860px)'],
  ['.brawndo-cis-visual','padding-left','max(16px,env(safe-area-inset-left,0px))','(max-width:860px)'],
])('qualified pending chrome applies existing %s %s without loaded markers', (selector,property,value,breakpoint)=>{
  const target=shell.querySelector(selector);
  const matchingRules=rules.filter(rule=>media(rule)===breakpoint&&declaration(rule,property,value));
  const pendingRules=matchingRules.filter(rule=>rule.selectors.some(selector=>selector.includes(pendingSelector)));
  expect(pendingRules.some(rule=>matches(rule,target))).toBe(true);

  delete shell.dataset.cisVisual;
  expect(pendingRules.some(rule=>matches(rule,target))).toBe(false);
  shell.dataset.cisVisual='true';document.documentElement.dataset.brawndoCisVisual='true';
  // The pending branch cannot change the approved loaded cascade.
  expect(pendingRules.some(rule=>rule.selectors.filter(selector=>selector.includes(pendingSelector)).some(selector=>target.matches(selector)))).toBe(false);
  expect(matchingRules.some(rule=>matches(rule,target))).toBe(true);
});

test('record-free shell chrome cannot style an external assessment portal or enable document color-scheme',()=>{
  const portalRule=rules.find(rule=>declaration(rule,'background','var(--surface)')&&rule.selector.startsWith('body[data-brawndo-cis-visual=true]'));
  const schemeRule=rules.find(rule=>declaration(rule,'color-scheme','normal'));
  expect(matches(portalRule,portal)).toBe(false);expect(matches(schemeRule,document.documentElement)).toBe(false);
  expect(rules.filter(rule=>rule.selector.includes(pendingSelector)).some(rule=>matches(rule,portal))).toBe(false);
  document.body.dataset.brawndoCisVisual='true';document.documentElement.dataset.brawndoCisVisual='true';
  expect(matches(portalRule,portal)).toBe(true);expect(matches(schemeRule,document.documentElement)).toBe(true);
});

test.each([['light','#EDF3FA'],['dark','#071321']])('pending %s chrome resolves the existing palette and font aliases only within its qualified wrapper',(theme,background)=>{
  shell.dataset.theme=theme;
  const variables=target=>Object.fromEntries(paletteRules.filter(rule=>matches(rule,target)).flatMap(rule=>rule.nodes.filter(node=>node.type==='decl'&&node.prop.startsWith('--')).map(node=>[node.prop,node.value])));
  const resolve=(values,key)=>{
    const reference=/^var\((--[\w-]+)\)$/.exec(values[key]);
    return reference?resolve(values,reference[1]):values[key];
  };
  const qualified=variables(shell);
  expect(resolve(qualified,'--bwp-bg')).toBe(background);
  expect(resolve(qualified,'--font-body')).toBe("'Segoe UI', Inter, Arial, sans-serif");
  expect(variables(portal)['--bg']).toBeUndefined();
  delete shell.dataset.cisVisual;
  expect(variables(shell)['--bg']).toBeUndefined();
});
