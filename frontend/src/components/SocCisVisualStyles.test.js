import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import postcss from 'postcss';

// Authored selector/token contracts only; these do not establish browser geometry or pixel parity.
const ROOT='.soc-cis-program-visual';
const BOUNDARY='.section-body:has(> .soc-cis-program-visual)';
const CANVAS='.client-surface:has(.section-body > .soc-cis-program-visual)';
const SEGMENT_RESET='\n.soc-cis-program-visual .sbar button.sbar-segment { border:0; padding:0; appearance:none; }\n';
const SEGMENT_FOCUS='.soc-cis-program-visual .sbar button.sbar-segment:focus-visible { outline-offset:-2px; }\n';
const baseline={
  'BrawndoCisVisual.css':'139af93992d00a783eb0ccf6caaddbfdf5a2c4416c519b7e46b5113ce3ce9beb',
  'SixSurfaceAppearance.css':'317b36402abd7d2589c13c06402aabc499f6d676de4835d6b90e1915df1f9e6e',
  'SemanticPresentation.css':'3517c7e7edfbb87a2456f0e70e307f8e5f575d0005766444371b8677146daec4',
  'BrawndoCisVisualShell.css':'9b1e1cd202d6bdd68b2987e695fbc953d759e6aa394f055341766c0672ad0f0c',
};
const sources=Object.fromEntries(Object.keys(baseline).map(name=>[name,readFileSync(join(__dirname,name),'utf8').replace(/\r\n/g,'\n')]));
const sheets=Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,postcss.parse(source)]));
const rules=name=>{const found=[];sheets[name].walkRules(rule=>found.push(rule));return found;};
function shareRule(name,native,local){
  const found=rules(name).filter(rule=>rule.selectors.includes(native));
  expect(found.length).toBeGreaterThan(0);
  for(const rule of found)expect(rule.selectors).toContain(local);
}

test.each(Object.entries(baseline))('%s preserves every prior selector, declaration and order from ef5dfdd after removing local adapters',(name,digest)=>{
  const original=sources[name].replace(SEGMENT_RESET,'').replace(SEGMENT_FOCUS,'').replace(', '+BOUNDARY,'').replace(', '+CANVAS,'')
    .replace(/, \.soc-cis-program-visual[^{]+?(?=\s+\{)/g,'');
  expect(createHash('sha256').update(original).digest('hex')).toBe(digest);
});

test('new selector targets stay inside the SOC root or its direct section boundary, leaving external native portals and chrome untouched',()=>{
  const selectors=Object.keys(sheets).flatMap(name=>rules(name).flatMap(rule=>rule.selectors.filter(selector=>selector.includes(ROOT))));
  expect(selectors.length).toBeGreaterThan(100);
  for(const selector of selectors){
    expect(selector===BOUNDARY||selector===CANVAS||selector.startsWith(ROOT)).toBe(true);
    expect(selector).not.toMatch(/^(?:html|body)\b|\s(?:html|body)\b|\.app-sidebar|\.bwp-|\.ui-dialog|\.ui-sheet|\.ui-overlay/);
  }
});

test('header, summary, toolbar, groups and tag-independent expanded rows share the original declaration blocks',()=>{
  for(const selector of ['.page-head h1','.snap','.lg','.filters','.ghead','.grow','.sg','.sg-t small','.st','.ver'])
    shareRule('BrawndoCisVisual.css','.brawndo-cis-visual '+selector,ROOT+' '+selector);
  shareRule('BrawndoCisVisualShell.css','html[data-brawndo-cis-visual=true] .brawndo-workspace-pilot .brawndo-cis-visual[data-theme]',ROOT+'[data-theme]');
  shareRule('BrawndoCisVisualShell.css','.brawndo-cis-visual :is(button,input,select)',ROOT+' :is(button,input,select)');
  shareRule('BrawndoCisVisualShell.css','.brawndo-cis-visual .ver svg',ROOT+' .ver svg');
  shareRule('BrawndoCisVisualShell.css','.brawndo-cis-visual :is(.card-head,.snap,.card-foot)',ROOT+' :is(.card-head,.snap,.card-foot)');
  shareRule('BrawndoCisVisualShell.css','body[data-brawndo-cis-visual=true] :is(button,a,input,select,textarea,summary,[tabindex]):focus-visible',ROOT+' :is(button,a,input,select,textarea,summary,[tabindex]):focus-visible');
});

test('optional interactive segments reuse the native bar geometry, rounding and highlight with only a local button reset',()=>{
  for(const suffix of ['',':first-child',':last-child',':only-child'])
    shareRule('BrawndoCisVisual.css','.brawndo-cis-visual .sbar i'+suffix,ROOT+' .sbar button.sbar-segment'+suffix);
  shareRule('BrawndoCisVisual.css','.brawndo-cis-visual .sbar.hl i:not(.on)',ROOT+' .sbar.hl button.sbar-segment:not(.on)');
  const reset=rules('BrawndoCisVisual.css').find(rule=>rule.selector===ROOT+' .sbar button.sbar-segment'&&rule.nodes.some(node=>node.prop==='appearance'));
  expect(reset.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['border','0'],['padding','0'],['appearance','none']]);
  const focus=rules('BrawndoCisVisual.css').find(rule=>rule.selector===ROOT+' .sbar button.sbar-segment:focus-visible');
  expect(focus.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['outline-offset','-2px']]);
});

let fixture;
beforeEach(()=>{fixture=document.createElement('div');document.body.appendChild(fixture);});
afterEach(()=>fixture.remove());
function authoredRootValues(node){
  const values={};
  for(const name of ['SemanticPresentation.css','SixSurfaceAppearance.css','BrawndoCisVisual.css','BrawndoCisVisualShell.css']){
    for(const rule of rules(name)){
      if(rule.parent.type==='atrule'||!rule.selectors.some(selector=>node.matches(selector)))continue;
      for(const declaration of rule.nodes.filter(item=>item.type==='decl'))values[declaration.prop]=declaration.value;
    }
  }
  return values;
}
const resolve=(values,property)=>{
  const reference=/^var\((--[\w-]+)\)$/.exec(values[property]);
  return reference?resolve(values,reference[1]):values[property];
};

test.each(['light','dark'])('local %s palette/font/fill adapters use the approved CIS values without document markers',theme=>{
  const markers=[document.documentElement.dataset.brawndoCisVisual,document.body.dataset.brawndoCisVisual];
  fixture.innerHTML=`<section class="bcis soc-cis-program-visual" data-theme="${theme}"></section><section class="dashboard"><div class="ui-dialog"></div></section>`;
  const values=authoredRootValues(fixture.firstElementChild);
  expect(resolve(values,'--font-body')).toBe("'Segoe UI', Inter, Arial, sans-serif");
  expect(values.font).toBe('13.5px/1.5 var(--font)');
  expect(values['--bg']).toBe(theme==='dark'?'#071321':'#EDF3FA');
  expect(['--c-impl','--c-part','--c-not','--c-none'].map(property=>resolve(values,property)))
    .toEqual(['#168566','#dcb13e','#d95e7d',theme==='dark'?'#607088':'#d2dae5']);
  expect(authoredRootValues(fixture.querySelector('.ui-dialog'))['--font']).toBeUndefined();
  expect([document.documentElement.dataset.brawndoCisVisual,document.body.dataset.brawndoCisVisual]).toEqual(markers);
});

test('the ancestor padding adapter matches only a section containing the direct SOC visual root',()=>{
  fixture.innerHTML='<div class="section-body"><section class="soc-cis-program-visual" data-theme="light"></section></div><div class="section-body"><section class="brawndo-cis-visual"></section></div><div class="section-body"><section class="iso-program-visual"></section></div><div class="section-body"><section class="dashboard"></section></div>';
  const rule=rules('BrawndoCisVisualShell.css').find(item=>item.selectors.includes(BOUNDARY));
  expect(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['padding','0']]);
  expect([...fixture.children].map(node=>node.matches(BOUNDARY))).toEqual([true,false,false,false]);
});

test('the optional ClientSurface canvas adapter is confined to the SOC program page',()=>{
  fixture.innerHTML='<div class="client-surface"><div class="section-body"><section class="soc-cis-program-visual" data-theme="light"></section></div></div><div class="client-surface"><div class="section-body"><section class="iso-program-visual"></section></div></div><div class="client-surface"><div class="section-body"><section class="dashboard"></section></div></div>';
  const rule=rules('BrawndoCisVisualShell.css').find(item=>item.selectors.includes(CANVAS));
  expect(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['padding','0'],['background','transparent'],['min-height','0']]);
  expect([...fixture.children].map(node=>node.matches(CANVAS))).toEqual([true,false,false]);
});
