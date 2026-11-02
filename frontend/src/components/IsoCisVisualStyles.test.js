import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import {selectorSpecificity,compare} from '@csstools/selector-specificity';

// Authored source/token contracts only; these are not computed browser geometry or pixel evidence.
const ROOT='.iso-cis-program-visual',SOC='.soc-cis-program-visual';
const BOUNDARY='.section-body:has(> .iso-cis-program-visual)';
const CANVAS='.client-surface:has(.section-body > .iso-cis-program-visual)';
const baseline={
  'BrawndoCisVisual.css':'147de14bce41c8cbd0cbdf410d244da2ce379c1d60e47512e134103b8969a652',
  'BrawndoCisVisualShell.css':'1914e227c748280bf03a93f9b931e87a27da2dc8e456121300adb730775d1350',
  'SixSurfaceAppearance.css':'df9dd5c3d617954a18a7468b4b0124fa43d2b0d8e761d7a4d04d36e6eccae86d',
  'SemanticPresentation.css':'06d0f083e4df8110536df7e5ef990b9d5195c626e4e0c81925f7cad0a957c9c2',
};
const sources=Object.fromEntries(Object.keys(baseline).map(name=>[name,readFileSync(join(__dirname,name),'utf8').replace(/\r\n/g,'\n')]));
const sheets=Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,postcss.parse(source)]));
const isoSheet=postcss.parse(readFileSync(join(__dirname,'IsoProgramVisual.css'),'utf8'));
const cisSizingSheet=postcss.parse(readFileSync(join(__dirname,'CisWorkspaceSizing.css'),'utf8'));
const designSheet=postcss.parse(readFileSync(join(__dirname,'../design-system.css'),'utf8'));
const rules=name=>{const found=[];sheets[name].walkRules(rule=>found.push(rule));return found;};

test('ISO destination figures and section tabs reuse the approved secondary/control scale without changing hero figures or other frameworks',()=>{
  const localRules=[];isoSheet.walkRules(rule=>localRules.push(rule));
  const values=selector=>Object.fromEntries(localRules.find(rule=>rule.selector===selector).nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
  const figure=values(ROOT+' .iso-card-current .now-value');
  const reference=rules('BrawndoCisVisual.css').find(rule=>rule.selectors.includes('.brawndo-cis-visual .lg-val b'));
  const referenceValues=Object.fromEntries(reference.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
  for(const property of ['font-size','letter-spacing','line-height'])expect(figure[property]).toBe(referenceValues[property]);
  const tabs=values(ROOT+' .framework-tabs .ui-button');
  const segment=rules('BrawndoCisVisual.css').find(rule=>rule.selectors.includes('.brawndo-cis-visual .seg button'));
  const segmentValues=Object.fromEntries(segment.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
  for(const property of ['padding','border-radius'])expect(tabs[property]).toBe(segmentValues[property]);
  // Cancel the old 36px minimum: intrinsic option height plus wrapper padding matches the shared segment.
  expect(tabs['min-height']).toBe('0');expect(tabs.font).toBe('500 12.5px/1.5 var(--font)');
  expect(values(ROOT+' .framework-tabs .ui-button[aria-selected="true"]')).toMatchObject({background:'var(--seg-on)',color:'var(--fg)','font-weight':'600','box-shadow':'var(--shadow-seg)'});
  expect(localRules.some(rule=>rule.selector===ROOT+' .now-value')).toBe(false);
  for(const rule of localRules)for(const selector of rule.selectors)expect(selector.startsWith(ROOT+' ')).toBe(true);
});

test('ISO program type matches the approved CIS sizing cascade, not only the smaller shared primitive defaults',()=>{
  const declarations=(sheet,selector)=>{
    let rule;sheet.walkRules(candidate=>{if(candidate.selectors.includes(selector))rule=candidate;});
    expect(rule).toBeDefined();
    return Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
  };
  for(const [local,reference] of [
    [ROOT+' .page-head h1','.brawndo-workspace-pilot[data-cis-sizing=true] .brawndo-cis-visual[data-theme] > .page-head h1'],
    [ROOT+' :is(.iso-program-register,.iso-audit-packages,.iso-audit-register) .card-head h2','.brawndo-workspace-pilot[data-cis-sizing=true] .brawndo-cis-visual[data-theme] > .pcard .card-head h2'],
    [ROOT+' .pcard :is(.now-head p,.now-head small,.bd-head,.lg-val > span,.card-foot,.summary,.ghead,.gname small,.fig > span,.sg-t small,.ver small)','.brawndo-workspace-pilot[data-cis-sizing=true] .brawndo-cis-visual[data-theme] > .pcard :is(.now-head p,.now-head small,.bd-head,.lg-val > span,.card-foot,.summary,.ghead,.gname small,.fig > span,.sg-t small,.ver small)'],
    [ROOT+' .pcard :is(.gname b,.sg-t,.fig b)','.brawndo-workspace-pilot[data-cis-sizing=true] .brawndo-cis-visual[data-theme] > .pcard :is(.gname b,.sg-t,.fig b)'],
  ]){
    const iso=declarations(isoSheet,local),cis=declarations(cisSizingSheet,reference);
    for(const [property,value] of Object.entries(cis))expect(iso[property]).toBe(value);
  }
});

test.each(Object.entries(baseline))('%s retains every approved CIS/SOC selector, declaration and order from 333b0052 after removing only ISO aliases',(name,digest)=>{
  const sheet=postcss.parse(sources[name]);
  sheet.walkRules(rule=>{
    const alias=rule.selectors.find(selector=>selector.includes(ROOT));
    if(!alias)return;
    const start=rule.selector.indexOf(', '+alias);
    expect(start).toBeGreaterThan(0);
    rule.selector=rule.selector.slice(0,start);
  });
  expect(createHash('sha256').update(sheet.toString()).digest('hex')).toBe(digest);
});

test('ISO aliases share all corresponding SOC declaration blocks and never add global chrome or portal selectors',()=>{
  const local=[];
  for(const name of Object.keys(sheets))for(const rule of rules(name)){
    for(const selector of rule.selectors.filter(value=>value.includes(SOC)))expect(rule.selectors).toContain(selector.replaceAll(SOC,ROOT));
    local.push(...rule.selectors.filter(selector=>selector.includes(ROOT)));
  }
  expect(local.length).toBeGreaterThan(100);
  for(const selector of local){
    expect(selector===BOUNDARY||selector===CANVAS||selector.startsWith(ROOT)).toBe(true);
    expect(selector).not.toMatch(/^(?:html|body)\b|\s(?:html|body)\b|\.app-sidebar|\.bwp-|\.ui-dialog|\.ui-sheet|\.ui-overlay/);
  }
});

test('header, summary, aligned register, responsive rows and focus rules reuse the canonical blocks',()=>{
  for(const suffix of ['.page-head h1','.snap','.lg','.filters','.ghead','.grow','.gbar .sbar','.sg','.sg-t small','.st','.ver','.reg']){
    const native=rules('BrawndoCisVisual.css').filter(rule=>rule.selectors.includes('.brawndo-cis-visual '+suffix));
    expect(native.length).toBeGreaterThan(0);
    native.forEach(rule=>expect(rule.selectors).toContain(ROOT+' '+suffix));
  }
  for(const suffix of ['.sg','.grow','.sgs']){
    const responsive=rules('BrawndoCisVisual.css').find(rule=>rule.parent.name==='container'&&rule.selectors.includes(ROOT+' '+suffix));
    expect(responsive).toBeDefined();expect(responsive.parent.params).toBe('(max-width: 860px)');
  }
  const reset=rules('BrawndoCisVisual.css').find(rule=>rule.selectors.includes(ROOT+' .sbar button.sbar-segment')&&rule.nodes.some(node=>node.prop==='appearance'));
  expect(reset.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['border','0'],['padding','0'],['appearance','none']]);
  const focus=rules('BrawndoCisVisual.css').find(rule=>rule.selectors.includes(ROOT+' .sbar button.sbar-segment:focus-visible'));
  expect(focus.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['outline-offset','-2px']]);
});

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

let fixture;
beforeEach(()=>{fixture=document.createElement('div');document.body.appendChild(fixture);});
afterEach(()=>fixture.remove());
test.each(['light','dark'])('selected ISO tabs retain native segment colors in %s against real global hover/active rules regardless of source order',theme=>{
  fixture.innerHTML=`<section class="bcis iso-cis-program-visual" data-theme="${theme}"><div class="framework-tabs"><button class="ui-button bg-primary" role="tab" aria-selected="true">Internal Audit</button></div></section>`;
  const tab=fixture.querySelector('button'),tokens=authoredRootValues(fixture.firstElementChild);
  // Bounded authored cascade for a fine pointer: state markers emulate selector matching, not browser paint.
  const winner=(property,sheets)=>{
    let selected;
    for(const sheet of sheets)sheet.walkRules(rule=>{
      if(rule.parent.type==='atrule'&&rule.parent.name==='media'&&!rule.parent.params.includes('(hover: hover)'))return;
      for(const selector of rule.selectors){
        if(!selector.includes('.ui-button'))continue;
        const matching=selector.replaceAll(':hover','[data-test-hover]').replaceAll(':active','[data-test-active]');
        if(!tab.matches(matching))continue;
        const weight=selectorSpecificity(selectorParser().astSync(selector).nodes[0]);
        for(const declaration of rule.nodes.filter(node=>node.type==='decl'&&node.prop===property)){
          const important=Number(!!declaration.important);
          if(!selected||important>selected.important||important===selected.important&&compare(weight,selected.weight)>=0)
            selected={value:declaration.value,weight,important,selector};
        }
      }
    });
    return selected;
  };
  for(const state of ['hover','active']){
    tab.setAttribute(`data-test-${state}`,'');
    const globalSelector=`:root .ui-button.bg-primary:not(:disabled):${state}`;
    let globalRule;designSheet.walkRules(rule=>{if(rule.selectors.includes(globalSelector))globalRule=rule;});
    expect(globalRule).toBeDefined();
    const globalWeight=selectorSpecificity(selectorParser().astSync(globalSelector).nodes[0]);
    for(const order of [[designSheet,isoSheet],[isoSheet,designSheet]]){
      const background=winner('background',order),foreground=winner('color',order);
      expect(background.value).toBe('var(--seg-on)');expect(foreground.value).toBe('var(--fg)');
      expect(compare(background.weight,globalWeight)).toBeGreaterThan(0);
      expect(resolve({...tokens,background:background.value},'background')).toBe(theme==='dark'?'#243042':'#FFFFFF');
      expect(resolve({...tokens,color:foreground.value},'color')).toBe(theme==='dark'?'#EDF3FF':'#132A49');
    }
    tab.removeAttribute(`data-test-${state}`);
  }
});
test.each(['light','dark'])('ISO %s font, native token mappings and implementation fills equal the approved SOC source without document markers',theme=>{
  const markers=[document.documentElement.dataset.brawndoCisVisual,document.body.dataset.brawndoCisVisual];
  fixture.innerHTML=`<section class="bcis iso-cis-program-visual" data-theme="${theme}"></section><section class="bcis soc-cis-program-visual" data-theme="${theme}"></section><section class="dashboard"><div class="ui-dialog"></div></section>`;
  const iso=authoredRootValues(fixture.children[0]),soc=authoredRootValues(fixture.children[1]);
  for(const property of ['--font','--font-body','--font-heading','--color-bg-app','--color-bg-surface','--color-text-primary','--color-link','--color-focus-ring','--c-impl','--c-part','--c-not','--c-none'])expect(resolve(iso,property)).toBe(resolve(soc,property));
  expect(resolve(iso,'--font-body')).toBe("'Segoe UI', Inter, Arial, sans-serif");
  expect(iso.font).toBe('13.5px/1.5 var(--font)');expect(iso['--bg']).toBe(theme==='dark'?'#071321':'#EDF3FA');
  expect(['--c-impl','--c-part','--c-not','--c-none'].map(property=>resolve(iso,property))).toEqual(['#168566','#dcb13e','#d95e7d',theme==='dark'?'#607088':'#d2dae5']);
  expect(authoredRootValues(fixture.querySelector('.ui-dialog'))['--font']).toBeUndefined();
  expect([document.documentElement.dataset.brawndoCisVisual,document.body.dataset.brawndoCisVisual]).toEqual(markers);
});

test('local ISO canvas and padding adapters leave other program and Dashboard boundaries untouched',()=>{
  fixture.innerHTML='<div class="client-surface"><div class="section-body"><section class="iso-cis-program-visual" data-theme="light"></section></div></div><div class="client-surface"><div class="section-body"><section class="soc-cis-program-visual"></section></div></div><div class="client-surface"><div class="section-body"><section class="iso-program-visual"></section></div></div><div class="client-surface"><div class="section-body"><section class="dashboard"></section></div></div>';
  const padding=rules('BrawndoCisVisualShell.css').find(rule=>rule.selectors.includes(BOUNDARY));
  const canvas=rules('BrawndoCisVisualShell.css').find(rule=>rule.selectors.includes(CANVAS));
  expect(padding.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['padding','0']]);
  expect(canvas.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value])).toEqual([['padding','0'],['background','transparent'],['min-height','0']]);
  expect([...fixture.children].map(node=>node.matches(CANVAS))).toEqual([true,false,false,false]);
  expect([...fixture.querySelectorAll('.section-body')].map(node=>node.matches(BOUNDARY))).toEqual([true,false,false,false]);
});
