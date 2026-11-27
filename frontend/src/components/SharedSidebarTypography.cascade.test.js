const fs=require('fs');
const path=require('path');
const postcss=require('postcss');
const selectorParser=require('postcss-selector-parser');
const {selectorSpecificity,compare}=require('@csstools/selector-specificity');

// Integrate the actual native styles. This bounded authored cascade is not a
// browser geometry/zoom substitute; Agent 007 verifies the recorded native route loop.
const names=['../design-system.css','../index.css','../App.css','BrawndoSidebar.css',
  'BrawndoWorkspace.css','SixSurfaceAppearance.css','AdditionalSectionsAppearance.css','BrawndoCisVisualShell.css',
  'BrawndoDemoDashboard.css','CisDashboardConcept.css','CisWorkspaceSizing.css'];
const sheets=Object.fromEntries(names.map(name=>[name,postcss.parse(fs.readFileSync(path.join(__dirname,name),'utf8'))]));
const orders=[names,[...names].reverse()];
const inherited=new Set(['font-family','font-size','font-weight','line-height','color','letter-spacing']);
const details=new Map();
let fixture,cache,matches,originalCisMarker;

function direct(declaration,property){
  const {prop,value}=declaration;if(prop===property)return value;
  if(prop==='font'&&['font-family','font-size','font-weight','line-height'].includes(property)){
    if(value==='inherit')return value;
    const parts=value.match(/^(?:(normal|[1-9]\d{2})\s+)?(\d+(?:\.\d+)?px)(?:\/(\d+(?:\.\d+)?(?:px)?))?\s+(.+)$/);
    if(parts)return {'font-family':parts[4],'font-size':parts[2],'font-weight':parts[1]||'normal','line-height':parts[3]||'normal'}[property];
  }
  for(const shorthand of ['padding','margin'])if(prop===shorthand&&property.startsWith(shorthand+'-')){
    const style=document.createElement('i').style;style.setProperty(prop,value);return style.getPropertyValue(property)||undefined;
  }
  if(property.match(/^border-(top|bottom)-width$/)&&prop==='border'){
    const width=value.match(/^(0|\d+(?:\.\d+)?px)(?:\s|$)/);return width?.[1];
  }
  return undefined;
}
function specificity(selector){
  if(!details.has(selector)){
    const parsed=selectorParser().astSync(selector).nodes[0];
    const last=parsed.nodes.reduce((prior,node,index)=>node.type==='combinator'?index:prior,-1),compound=parsed.nodes.slice(last+1);
    details.set(selector,{specificity:selectorSpecificity(parsed),tag:compound.find(node=>node.type==='tag')?.value,
      classes:compound.filter(node=>node.type==='class').map(node=>node.value),ids:compound.filter(node=>node.type==='id').map(node=>node.value)});
  }
  return details.get(selector);
}
function candidates(node,order,baseline){
  const key=order.join('|')+baseline;
  const prior=cache.get(node)||new Map();if(prior.has(key))return prior.get(key);
  const found=[];
  for(const name of order)sheets[name].walkRules(rule=>{
    // The correction is a direct sidebar-only block in the appearance sheet.
    if(baseline&&name==='SixSurfaceAppearance.css'&&rule.selector.includes('data-cis-sizing'))return;
    for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'){
      if(parent.name!=='media')return;
      const widths=[...parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)];
      if(!widths.length||widths.some(([,kind,width])=>kind==='min'?1280<Number(width):1280>Number(width)))return;
    }
    for(const selector of rule.selectors){
      if(selector.includes('::'))continue;
      const info=specificity(selector),prior=matches.get(node)||new Map();
      if(!prior.has(selector)){
        // Reject only direct positives; functional alternatives still use matches().
        const possible=(!info.tag||info.tag.toLowerCase()===node.localName.toLowerCase())&&info.classes.every(name=>node.classList.contains(name))&&info.ids.every(id=>node.id===id);
        const match=selector.replace(/:hover/g,'[data-css-hover]').replace(/:focus-visible/g,'[data-css-focus]');
        prior.set(selector,possible&&node.matches(match));matches.set(node,prior);
      }
      if(prior.get(selector))rule.walkDecls(declaration=>found.push({declaration,specificity:info.specificity,important:declaration.important?1:0}));
    }
  });
  prior.set(key,found);cache.set(node,prior);return found;
}
function value(node,property,order,baseline=false,depth=0){
  if(!node||depth>30)return undefined;
  let selected;
  for(const item of candidates(node,order,baseline)){
    const next=direct(item.declaration,property);if(next===undefined)continue;
    if(!selected||item.important>selected.important||item.important===selected.important&&compare(item.specificity,selected.specificity)>=0)selected={...item,value:next};
  }
  let result=selected?.value;
  if((inherited.has(property)||property.startsWith('--'))&&(!selected||['inherit','unset'].includes(result)))return value(node.parentElement,property,order,baseline,depth+1);
  const variable=typeof result==='string'&&result.match(/^var\((--[\w-]+)(?:,\s*(.*))?\)$/);
  if(variable)result=value(node,variable[1],order,baseline,depth+1)??variable[2];
  return result;
}
const family=value=>String(value).replace(/['"]/g,'').split(',').map(part=>part.trim()).join(',');
const px=value=>Number.parseFloat(value)||0;
function rowHeight(node,order,baseline=false,{borderWidth,lineCount=1}={}){
  const size=px(value(node,'font-size',order,baseline)),line=value(node,'line-height',order,baseline);
  const lineHeight=line?.endsWith('px')?px(line):size*Number(line);
  const padding=['padding-top','padding-bottom'].reduce((sum,key)=>sum+px(value(node,key,order,baseline)),0);
  const border=borderWidth===undefined?['border-top-width','border-bottom-width'].reduce((sum,key)=>sum+px(value(node,key,order,baseline)),0):borderWidth*2;
  return Math.max(px(value(node,'min-height',order,baseline)),lineHeight*lineCount+padding+border);
}
function mount(route,{eligible=true,shared=false,active=false}={}){
  const visual={dashboard:'dashboard',calendar:'calendar',reviews:'reviews','action-items':'actions'}[route];
  fixture.innerHTML=`<div class="brawndo-workspace-pilot" ${eligible?'data-cis-sizing="true"':''} ${shared?'data-shared-shell="true"':''} data-theme="light" data-navigation="closed" ${visual?'data-visual-surface="'+visual+'"':''} ${route==='dashboard'?'data-cis-dashboard-concept="true"':''} ${route==='evidence'?'data-additional-surface="evidence"':''}>
    <header class="bwp-topbar"><a class="bwp-brand">Native header</a></header><div class="bwp-body"><div class="app-shell">
    <aside class="app-sidebar bsb" data-theme="light"><div class="bsb-head"><div class="bsb-client"><span class="bsb-client-mark">Q</span><span class="min-w-0"><span class="bsb-client-name">Long native client identity retained</span><span class="bsb-client-industry">Existing native industry</span></span></div></div>
    <nav class="bsb-nav"><div class="bsb-group"><span class="bsb-group-label">Work</span><a class="bsb-link${active?' is-active':''}" href="/${route}"><span>Native destination</span></a></div></nav></aside>
    <main class="app-workspace"><section class="brawndo-demo-dashboard" data-cis-dashboard-concept="true"><div class="bdd-heading"><h1>Protected Dashboard</h1></div><input value="Retained native draft"></section><section class="native-iso-program"><h2>Native program</h2></section></main></div></div></div>
    <div class="ui-dialog" role="dialog"><textarea>Native editor</textarea></div>`;
  cache=new WeakMap();matches=new WeakMap();return fixture.querySelector('.brawndo-workspace-pilot');
}
beforeEach(()=>{originalCisMarker=document.documentElement.getAttribute('data-brawndo-cis-visual');fixture=document.createElement('div');document.body.appendChild(fixture);cache=new WeakMap();matches=new WeakMap();});
afterEach(()=>{fixture.remove();if(originalCisMarker===null)document.documentElement.removeAttribute('data-brawndo-cis-visual');else document.documentElement.setAttribute('data-brawndo-cis-visual',originalCisMarker);});

test.each(orders.flatMap((order,index)=>['dashboard','calendar','reviews','action-items','reports','evidence'].map(route=>[index,route,order])))('import order %i: %s keeps current Calendar navigation typography/row geometry',(_index,route,order)=>{
    const shell=mount(route),link=shell.querySelector('.bsb-link'),group=shell.querySelector('.bsb-group > .bsb-group-label');
    expect({route,family:family(value(link,'font-family',order)),size:value(link,'font-size',order),line:value(link,'line-height',order),height:rowHeight(link,order)})
      .toEqual({route,family:'Segoe UI,Inter,Arial,sans-serif',size:'13px',line:'1.5',height:33.5});
    expect({size:value(group,'font-size',order),line:value(group,'line-height',order),left:value(group,'margin-left',order)})
      .toEqual({size:'11px',line:'1.5',left:'10px'});
    expect(link.getAttribute('href')).toBe('/'+route);
});

test.each(orders.map((order,index)=>[index,order]))('shared-shell-only native program navigation retains typography without a CIS body marker, order %i',(_index,order)=>{
  const shell=mount('program',{eligible:false,shared:true}),link=shell.querySelector('.bsb-link');
  expect(shell.hasAttribute('data-cis-sizing')).toBe(false);
  expect(family(value(link,'font-family',order))).toBe('Segoe UI,Inter,Arial,sans-serif');
  expect(value(link,'font-size',order)).toBe('13px');expect(rowHeight(link,order)).toBe(33.5);
});

test.each(orders.map((order,index)=>[index,order]))('bordered native fallback preserves its frame and natural wrapping, order %i',(_index,order)=>{
  const shell=mount('reports',{active:true}),link=shell.querySelector('.bsb-link');
  expect(value(link,'border-top-width',order)).toBe(value(link,'border-top-width',order,true));
  expect(value(link,'font-weight',order)).toBe(value(link,'font-weight',order,true));
  // NAV_BOX_METRICS captured this pre-fix CSS border at DPR1.5. This is arithmetic
  // over authored declarations, not a measurement of the corrected hosted build.
  expect(rowHeight(link,order,false,{borderWidth:0.666667})).toBe(33.5);
  expect(rowHeight(link,order,false,{borderWidth:1})).toBe(33.5);
  expect(rowHeight(link,order,false,{borderWidth:0.666667,lineCount:2})).toBeGreaterThan(33.5);
  expect(value(link,'height',order)).toBeUndefined();expect(value(link,'max-height',order)).toBeUndefined();
});

test.each(orders.map((order,index)=>[index,order]))('long native client names retain their intended ellipsis without expanding the rail, order %i',(_index,order)=>{
  // Native markup already asks for min-w-0 and ellipsis; the retained CIS shell
  // can restore min-width:auto. Dashboard has an existing local repair for it.
  document.documentElement.dataset.brawndoCisVisual='true';
  const shell=mount('calendar'),card=shell.querySelector('.bsb-client'),text=card.lastElementChild,name=card.querySelector('.bsb-client-name');
  expect({minimum:value(card,'min-width',order),maximum:value(card,'max-width',order),textMinimum:value(text,'min-width',order),textFlex:value(text,'flex',order)})
    .toEqual({minimum:'0',maximum:'100%',textMinimum:'0',textFlex:'1'});
  expect(value(name,'overflow',order)).toBe('hidden');expect(value(name,'text-overflow',order)).toBe('ellipsis');expect(value(name,'white-space',order)).toBe('nowrap');
  for(const node of [card,name])for(const property of ['display','font-size','font-weight','color','background','border','border-color','border-top-width'])
    expect({property,value:value(node,property,order)}).toEqual({property,value:value(node,property,order,true)});
});

test.each(orders.map((order,index)=>[index,order]))('the scoped correction preserves each route emphasis, palette, hover, focus and borders, order %i',(_index,order)=>{
  const protectedProperties=['font-weight','color','background','background-color','border','border-color','border-top-width','border-bottom-width','border-radius','box-shadow','outline','outline-color','outline-offset','letter-spacing'];
  for(const route of ['dashboard','calendar','reports','evidence'])for(const state of ['normal','active','hover','focus']){
    const shell=mount(route,{active:state==='active'}),link=shell.querySelector('.bsb-link');
    if(state==='hover')link.dataset.cssHover='true';if(state==='focus')link.dataset.cssFocus='true';
    for(const property of protectedProperties)expect({route,state,property,value:value(link,property,order)}).toEqual({route,state,property,value:value(link,property,order,true)});
  }
});

test.each(orders.map((order,index)=>[index,order]))('the correction leaves noneligible navigation, Dashboard content/header, native programs and portals unchanged, order %i',(_index,order)=>{
  for(const eligible of [false,true]){
    const shell=mount('dashboard',{eligible}),link=shell.querySelector('.bsb-link');
    const untouched=[shell.querySelector('.app-sidebar'),shell.querySelector('.bsb-head'),shell.querySelector('.bwp-topbar'),shell.querySelector('.bwp-brand'),shell.querySelector('main'),shell.querySelector('.bdd-heading h1'),shell.querySelector('.native-iso-program'),fixture.querySelector('.ui-dialog'),fixture.querySelector('textarea')];
    if(!eligible)untouched.push(link,shell.querySelector('.bsb-group-label'));
    for(const node of untouched)for(const property of ['font-family','font-size','line-height','font-weight','color','background','padding-top','padding-bottom','width','height','min-height'])
      expect({eligible,element:node.className||node.tagName,property,value:value(node,property,order)}).toEqual({eligible,element:node.className||node.tagName,property,value:value(node,property,order,true)});
    expect(shell.querySelector('input').value).toBe('Retained native draft');
  }
});

test('new appearance declarations remain direct verified-sidebar font/geometry longhands only',()=>{
  const allowed=new Set(['font-family','font-size','line-height','padding','padding-top','padding-bottom','padding-left','padding-right','margin','margin-top','margin-bottom','margin-left','margin-right','min-height','gap','min-width','max-width','flex']);
  const rules=[];sheets['SixSurfaceAppearance.css'].walkRules(rule=>{if(rule.selector.includes('data-cis-sizing'))rules.push(rule);});
  expect(rules.length).toBeGreaterThan(0);
  for(const rule of rules){
    for(const selector of rule.selectors){expect(selector).toContain('.app-sidebar');expect(selector).not.toMatch(/app-workspace|bwp-topbar|ui-dialog|:root|\bhtml\b|\bbody\b/);}
    for(const selector of rule.selectors)expect(selector).toMatch(/^\.brawndo-workspace-pilot:is\(\[data-cis-sizing=true\],\[data-shared-shell=true\]\)/);
    rule.walkDecls(declaration=>{expect(allowed.has(declaration.prop)).toBe(true);expect(declaration.prop.startsWith('--')).toBe(false);});
  }
});
