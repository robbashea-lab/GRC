const fs=require('fs');
const path=require('path');
const postcss=require('postcss');
const parser=require('postcss-selector-parser');
const {selectorSpecificity,compare}=require('@csstools/selector-specificity');
const files=['CisDashboardConcept.css','PortfolioReports.css','BrawndoDemoDashboard.css','CisDomainProfile.css','CisDashboardRiskMatrix.css','SixSurfaceAppearance.css','BrawndoPortalTheme.css','AdditionalSectionsAppearance.css','BrawndoCisVisualShell.css','BrawndoWorkspace.css','BrawndoSidebar.css'];
const styles=Object.fromEntries(files.map(name=>[name,postcss.parse(fs.readFileSync(path.join(__dirname,name),'utf8'))]));

// Bounded authored-cascade contract: selected declarations, width media and normal
// author specificity only. Actual browser layout/variables remain separate QA.
function winner(node,property,width,order){
  let selected;
  for(const name of order)styles[name].walkRules(rule=>{
    for(let parent=rule.parent;parent;parent=parent.parent){
      if(parent.type!=='atrule')continue;
      if(parent.name!=='media')return;
      const constraints=[...parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)];
      if(!constraints.length)return;
      if(constraints.some(([,kind,size])=>kind==='min'?width<Number(size):width>Number(size)))return;
    }
    for(const selector of rule.selectors){
      // Pseudo-elements style generated boxes, not the element under inspection.
      if(parser().astSync(selector).nodes[0].nodes.some(part=>part.type==='pseudo'&&part.value.startsWith('::')))continue;
      if(!node.matches(selector))continue;
      const specificity=selectorSpecificity(parser().astSync(selector).nodes[0]);
      rule.walkDecls(decl=>{
        let value=decl.prop===property?decl.value:null;
        const shorthand=property==='background-color'&&decl.prop==='background'?'background'
          :['font-size','line-height','font-family'].includes(property)&&decl.prop==='font'?'font':null;
        if(shorthand){
          const style=document.createElement('div').style;
          // Substitution tests shorthand expansion without pretending jsdom resolves custom properties.
          const expanded=decl.value.replace(/var\([^)]*\)/g,property==='background-color'?'rgb(1, 2, 3)':'Arial');
          style.setProperty(shorthand,expanded);
          let parsed=style.getPropertyValue(property);
          // background:none resets the element color to transparent; cssstyle omits that longhand.
          if(!parsed&&shorthand==='background'&&expanded==='none')parsed='rgba(0, 0, 0, 0)';
          if(!parsed&&shorthand==='font'){
            // cssstyle cannot expand compact font size/line-height. Limit this
            // fallback to the authored px/unitless grammar and validate longhands.
            const font=expanded.match(/^(?:(?:normal|italic|oblique|[1-9]00)\s+)*(\d+(?:\.\d+)?px)(?:\/(\d+(?:\.\d+)?))?\s+(.+)$/);
            if(!font)throw new Error(`Unsupported font shorthand in cascade contract: ${decl.value}`);
            style.fontSize=font[1];style.lineHeight=font[2]||'normal';style.fontFamily=font[3];
            expect(style.fontSize).not.toBe('');expect(style.lineHeight).not.toBe('');expect(style.fontFamily).not.toBe('');
            parsed=style.getPropertyValue(property);
          }
          expect(parsed).not.toBe('');
          value=property==='background-color'&&decl.value.includes('var(')?decl.value:parsed;
        }
        // The dialog contract inspects the actual overflow axes after shorthand reset.
        if(['overflow-x','overflow-y'].includes(property)&&decl.prop==='overflow'){
          const axes=decl.value.trim().split(/\s+/);
          if(axes.length>2||axes.some(axis=>!['visible','hidden','clip','scroll','auto'].includes(axis)))throw new Error(`Unsupported overflow shorthand: ${decl.value}`);
          value=property==='overflow-x'?axes[0]:axes[1]||axes[0];
        }
        if(property.startsWith('padding-')&&decl.prop==='padding'){
          const style=document.createElement('div').style;style.padding=decl.value;value=style.getPropertyValue(property);
        }
        if(value===null||value==='')return;
        const priority=decl.important?1:0;
        if(!selected||priority>selected.priority||priority===selected.priority&&compare(specificity,selected.specificity)>=0)
          selected={value,specificity,priority,selector,name};
      });
    }
  });
  return selected?.value;
}
let fixture;
let htmlAttributes,bodyAttributes;
beforeEach(()=>{
 htmlAttributes=document.documentElement.getAttributeNames().map(name=>[name,document.documentElement.getAttribute(name)]);bodyAttributes=document.body.getAttributeNames().map(name=>[name,document.body.getAttribute(name)]);
 document.documentElement.dataset.brawndoWorkspace='dark';document.documentElement.dataset.brawndoPortal='dark';document.documentElement.dataset.visualSurface='dashboard';document.documentElement.dataset.visualTheme='dark';
 fixture=document.createElement('div');fixture.innerHTML='<div class="brawndo-demo-dashboard" data-cis-dashboard-concept="true"><section class="brawndo-demo-program" data-concept="true" data-cis-dashboard-profile="true" data-reference-history="true"><header class="ph-cis-history-head"><div class="ph-range"><div class="ph-segmented"><button aria-pressed="true">6 months</button></div></div></header><div class="ph-history-panel"><div class="ph-metrics"><div class="ph-metric"><strong>32</strong><p>Native change</p><i class="ph-change-badge"></i></div><div class="ph-metric"><strong class="is-text">Unavailable</strong></div></div><div class="ph-chart-card"><div class="ph-chart" data-cis-history-inspection="true"><div class="ph-cis-history-tip"></div></div></div></div></section></div>';document.body.appendChild(fixture);
});
afterEach(()=>{fixture.remove();for(const [node,attributes] of [[document.documentElement,htmlAttributes],[document.body,bodyAttributes]]){for(const name of node.getAttributeNames())node.removeAttribute(name);for(const [name,value] of attributes)node.setAttribute(name,value);}});
const orders=[files,[...files].reverse()];

test.each(orders)('dark concept Risk score pills retain readable foreground without changing other scopes in order %j',(...order)=>{
 const portals=document.createElement('div');fixture.appendChild(portals);
 portals.innerHTML='<div class="cis-dashboard-risk-selection ui-dialog cis-dashboard-concept-portal" data-concept="true" data-theme="dark" data-state="open"><span class="cis-dashboard-risk-score">6 <span>→</span></span></div><div class="cis-dashboard-risk-selection ui-dialog cis-dashboard-concept-portal" data-concept="true" data-theme="light" data-state="open"><span class="cis-dashboard-risk-score">6 <span>→</span></span></div><div class="cis-dashboard-risk-selection ui-dialog" data-theme="dark" data-state="open"><span class="cis-dashboard-risk-score">Score 6<small>moderate</small></span></div>';
 const dark=portals.querySelector('[data-concept="true"][data-theme="dark"] .cis-dashboard-risk-score');
 expect(winner(dark,'color',1440,order)).toBe('#172741');
 const referenceBackground=document.createElement('div').style;referenceBackground.background='#f9e2b6';
 expect(winner(dark,'background-color',1440,order)).toBe(referenceBackground.backgroundColor);
 const legacy=order.filter(name=>name!=='CisDashboardRiskMatrix.css');
 for(const selector of ['[data-concept="true"][data-theme="light"] .cis-dashboard-risk-score','.ui-dialog:not([data-concept]) .cis-dashboard-risk-score']){
   const score=portals.querySelector(selector);
   expect(winner(score,'color',1440,order)).toBe(winner(score,'color',1440,legacy));
 }
});
test.each(orders)('concept history declarations win with stylesheet order %j',(...order)=>{
 const cases=[['.ph-cis-history-head','padding-top','17px'],['.ph-history-panel','border-radius','0 0 9px 9px'],['.ph-metric','padding-top','0px'],['.ph-metric','gap','2px'],['.ph-metric strong','font-size','17px'],['.ph-metric strong.is-text','font-size','15px'],['.ph-metric p','font-size','10px'],['.ph-change-badge','width','26px'],['.ph-change-badge','height','26px'],['.ph-change-badge','margin-right','0'],['.ph-chart-card','gap','4px'],['.ph-chart-card','padding-top','0px'],['.ph-cis-history-tip','width','300px'],['.ph-cis-history-tip','font-size','11px'],['.ph-cis-history-tip','line-height','1.45']];
 for(const [selector,property,value] of cases)expect({selector,property,value:winner(fixture.querySelector(selector),property,1440,order)}).toEqual({selector,property,value});
 expect(winner(fixture.querySelector('.ph-segmented'),'display',390,order)).toBe('inline-flex');
 expect(winner(fixture.querySelector('.ph-cis-history-head'),'padding-top',390,order)).toBe('15px');
});


test.each(orders)('owned dark concept portals beat loaded legacy chrome in stylesheet order %j',(...order)=>{
 const portals=document.createElement('div');fixture.appendChild(portals);
 portals.innerHTML='<div class="ui-popover ui-floating cdp-domain-tip cdp-concept-tip cis-dashboard-concept-portal" data-state="open" data-theme="dark"></div><div class="ui-overlay" data-state="open"></div><div class="cis-dashboard-risk-selection ui-dialog cis-dashboard-concept-portal" data-concept="true" data-theme="dark" data-state="open"></div><div class="cis-dashboard-risk-tooltip ui-tooltip cis-dashboard-concept-portal" data-concept="true" data-theme="dark" data-state="delayed-open"></div><div class="ui-dialog" data-testid="risks-drawer" data-state="open"></div>';
 for(const [selector,size] of [['.cdp-concept-tip','11px'],['.cis-dashboard-risk-selection','13px'],['.cis-dashboard-risk-tooltip','11px']]){
   const node=portals.querySelector(selector);
   expect({selector,background:winner(node,'background-color',1440,order)}).toEqual({selector,background:'var(--cc-card,#fff)'});
   expect(winner(node,'font-size',1440,order)).toBe(size);
   expect(winner(node,'line-height',1440,order)).toBe('1.45');
   const family=winner(node,'font-family',1440,order);
   expect(family==='var(--font)'?winner(node,'--font',1440,order):family).toContain('GoverNara CIS Concept Inter');
   expect(winner(node,'--cc-card',1440,order)).toBe('#19283d');
   expect(winner(node,'--color-bg-surface',1440,order)).toBe('var(--cc-card)');
 }
 const referenceOverlay=document.createElement('div').style;referenceOverlay.background='#0b17355c';
 expect(referenceOverlay.backgroundColor).not.toBe('');
 expect(winner(portals.querySelector('.ui-overlay'),'background-color',1440,order)).toBe(referenceOverlay.backgroundColor);
 const native=portals.querySelector('[data-testid="risks-drawer"]'),legacy=order.filter(name=>!['CisDashboardConcept.css','CisDomainProfile.css','CisDashboardRiskMatrix.css'].includes(name));
 for(const property of ['background-color','font-size','line-height','font-family','color','--color-bg-surface'])
   expect(winner(native,property,1440,order)).toBe(winner(native,property,1440,legacy));
});


test.each(orders)('concept numeric and compact introduction rules survive legacy-last order %j',(...order)=>{
 const program=fixture.querySelector('.brawndo-demo-program');
 program.insertAdjacentHTML('beforeend','<div class="ph-current-value"><span>Current implementation</span><strong>57.1<span class="ph-unit">%</span></strong><p>32 implemented</p><small>Native position</small></div>');
 const headline=program.querySelector('.ph-current-value > strong'),intro=program.querySelector('.ph-current-value'),unit=program.querySelector('.ph-unit');
 expect(winner(headline,'font-variant-numeric',1440,order)).toBe('normal');
 expect(winner(headline,'font-feature-settings',1440,order)).toBe('normal');
 expect(winner(headline,'font-size',1440,order)).toBe('43px');
 expect(winner(unit,'margin',1440,order)).toBe('0');
 expect(winner(intro,'display',390,order)).toBe('flex');
 expect(winner(headline,'font-size',390,order)).toBe('36px');
});

test.each(orders)('tablet concept rail remains visible without changing unrelated navigation in order %j',(...order)=>{
 const rail=document.createElement('div');fixture.appendChild(rail);
 rail.innerHTML='<div class="brawndo-workspace-pilot" data-cis-dashboard-concept="true" data-theme="light" data-visual-surface="dashboard" data-navigation="closed"><aside class="app-sidebar"><a class="bsb-link" aria-label="Dashboard" title="Dashboard" href="/dashboard"><svg></svg><span>Dashboard</span></a></aside><button class="bwp-mobile-nav"></button><div class="bwp-nav-backdrop"></div></div>';
 const shell=rail.firstElementChild,sidebar=shell.querySelector('.app-sidebar'),label=shell.querySelector('.bsb-link > span');
 for(const state of ['closed','open']){
  shell.dataset.navigation=state;
  expect(winner(sidebar,'display',768,order)).toBe('flex');
  expect(winner(sidebar,'position',768,order)).toBe('sticky');
  expect(winner(sidebar,'width',768,order)).toBe('66px');
  expect(winner(label,'display',768,order)).toBe('none');
  expect(winner(shell.querySelector('.bwp-mobile-nav'),'display',768,order)).toBe('none');
 }
 shell.removeAttribute('data-cis-dashboard-concept');
 const legacy=order.filter(name=>name!=='CisDashboardConcept.css');
 for(const property of ['display','position','width','top'])expect(winner(sidebar,property,768,order)).toBe(winner(sidebar,property,768,legacy));
});

test.each(orders)('concept client text can shrink within the native sidebar in order %j',(...order)=>{
 const rail=document.createElement('div');fixture.appendChild(rail);
 const name='SYNTHETIC CIS Dashboard IG1 CIS378-20261023';
 rail.innerHTML=`<div class="brawndo-workspace-pilot" data-cis-dashboard-concept="true" data-cis-visual="true" data-theme="light"><aside class="app-sidebar bsb"><div class="bsb-head"><div class="bsb-client"><span class="bsb-client-mark"></span><span class="min-w-0"><span class="bsb-client-name">${name}</span><span class="bsb-client-industry">Industry not recorded</span></span></div></div></aside></div>`;
 const shell=rail.firstElementChild,text=shell.querySelector('.bsb-client > span:last-child'),label=shell.querySelector('.bsb-client-name');
 for(const marker of ['true','false']){
   document.documentElement.dataset.brawndoCisVisual=marker;
   expect(winner(text,'min-width',1440,order)).toBe('0');
   expect(winner(label,'white-space',1440,order)).toBe('nowrap');
   expect(winner(label,'text-overflow',1440,order)).toBe('ellipsis');
   expect(label.textContent).toBe(name);
 }
 shell.removeAttribute('data-cis-dashboard-concept');
 expect(winner(text,'min-width',1440,order)).toBe('auto');
});

// These controls load both native design-system and legacy timeline styles.
const controlFiles=['design-system.css','CompactProgramTimeline.css','CisActionItemsConcept.css','CisReviewsConcept.css'];
for(const name of controlFiles)styles[name]=postcss.parse(fs.readFileSync(path.join(__dirname,name==='design-system.css'?'../design-system.css':name),'utf8'));
const controlOrders=[controlFiles,[...controlFiles].reverse()];
function controlFixture(){
 const controls=document.createElement('div');fixture.appendChild(controls);
 controls.innerHTML='<main class="app-workspace"><section class="crr-root" data-visual-surface="reviews" data-theme="dark"><div class="register-toolbar"><div class="register-search"><input type="search" class="ui-control"></div><div class="bdr-filter-right"><label>Basis<select data-control="basis"></select></label><label>Sort<select data-control="sort"></select></label></div></div><section class="crr-overview"><div class="quarter-controls"><select data-control="year"></select></div></section></section><section class="crr-root" data-unmarked><div class="register-search"><input class="ui-control"></div></section><section class="brawndo-demo-actions cia-root cia-page"><div class="bda-summary"><div class="bda-cell kpi"><strong>12</strong></div></div></section><section class="brawndo-demo-actions" data-legacy><div class="bda-summary"><div class="bda-cell"><strong>12</strong></div></div></section></main><div role="dialog" class="ui-dialog"><input class="ui-control"><select></select></div><div role="dialog" class="crr-root crr-list"><div class="register-search"><input class="ui-control"></div></div>';
 return controls;
}
test.each(controlOrders)('marked Reviews controls retain authored ink and card surfaces against native styles in order %j',(...order)=>{
 const controls=controlFixture(),search=controls.querySelector('[data-visual-surface="reviews"] input');
 for(const width of [390,760,761,1440]){
  expect(winner(search,'background-color',width,order)).toBe('rgba(0, 0, 0, 0)');
  expect(winner(search,'color',width,order)).toBe('var(--text)');
  expect(winner(search,'border',width,order)).toBe('0');
  for(const name of ['basis','sort','year'])expect({name,background:winner(controls.querySelector(`[data-control="${name}"]`),'background-color',width,order)}).toEqual({name,background:'var(--card)'});
 }
});
test.each(controlOrders)('Reviews correction leaves unmarked and native portaled controls on their existing cascade in order %j',(...order)=>{
 const controls=controlFixture();
 for(const selector of ['[data-unmarked] input','.ui-dialog input','.ui-dialog select','.crr-list input']){
  const node=controls.querySelector(selector);
  expect(winner(node,'background-color',1440,order)).toBe('var(--color-bg-surface)');
  if(node.tagName==='INPUT')expect(winner(node,'color',1440,order)).toBe('var(--color-text-primary)');
 }
});
test.each(controlOrders)('concept Action KPI weight and breakpoint size survive legacy styles without altering legacy KPIs in order %j',(...order)=>{
 const controls=controlFixture(),concept=controls.querySelector('.cia-page strong'),legacy=controls.querySelector('[data-legacy] strong');
 for(const width of [390,540,760,761,1440]){
  expect({width,weight:winner(concept,'font-weight',width,order)}).toEqual({width,weight:'650'});
  expect({width,size:winner(concept,'font-size',width,order)}).toEqual({width,size:width<=760?'26px':'28px'});
  expect(winner(legacy,'font-weight',width,order)).toBe('600');
 }
});

styles['CisRisksConcept.css']=postcss.parse(fs.readFileSync(path.join(__dirname,'CisRisksConcept.css'),'utf8'));
const dialogFiles=[...controlFiles,'CisDashboardRiskMatrix.css','CisRisksConcept.css','SixSurfaceAppearance.css'];
const dialogOrders=[dialogFiles,[...dialogFiles].reverse()];
test.each(dialogOrders)('Reviews date-list retains its bounded shell and content-only scrolling in either stylesheet order %j',(...order)=>{
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualSurface='reviews';document.documentElement.dataset.visualTheme=theme;
  const portal=document.createElement('div');fixture.appendChild(portal);
  portal.innerHTML=`<div role="dialog" class="ui-dialog crr-root crr-list" data-state="open" data-theme="${theme}"><div class="dialog-shell"><div class="dialog-heading"><h2>Reviews due</h2></div><div class="dialog-content"></div><div class="dialog-footer"></div></div></div>`;
  const dialog=portal.firstElementChild,content=dialog.querySelector('.dialog-content');
  for(const width of [390,540,541,1280]){
   const actual={theme,width,widthValue:winner(dialog,'width',width,order),maxHeight:winner(dialog,'max-height',width,order),maxWidth:winner(dialog,'max-width',width,order),overflowX:winner(dialog,'overflow-x',width,order),overflowY:winner(dialog,'overflow-y',width,order),padding:winner(dialog,'padding',width,order),gap:winner(dialog,'gap',width,order)};
   expect(actual).toEqual({theme,width,widthValue:width<=540?'calc(100vw - 22px)':'min(710px,calc(100vw - 40px))',maxHeight:width<=540?'calc(100dvh - 24px)':'calc(100dvh - 56px)',maxWidth:'none',overflowX:'hidden',overflowY:'hidden',padding:'0',gap:'0'});
   expect(winner(content,'overflow-y',width,order)).toBe('auto');
   expect(winner(content,'max-height',width,order)).toBe('calc(100dvh - 245px)');
   expect(winner(dialog.querySelector('h2'),'font-size',width,order)).toBe(width<=540?'19px':'20px');
  }
 }
});
test.each(dialogOrders)('Reviews date-list geometry does not change unmarked native or Risk dialogs in order %j',(...order)=>{
 const portals=document.createElement('div');fixture.appendChild(portals);
 portals.innerHTML='<div role="dialog" class="ui-dialog" data-state="open" data-testid="risks-drawer"></div><div role="dialog" class="ui-dialog cis-dashboard-risk-selection cis-dashboard-concept-portal" data-concept="true" data-theme="dark" data-state="open"></div>';
 const withoutReviews=order.filter(name=>name!=='CisReviewsConcept.css');
 for(const dialog of portals.children)for(const width of [390,540,541,1280])for(const property of ['width','max-width','max-height','overflow-x','overflow-y','padding','gap'])
  expect({classes:dialog.className,width,property,value:winner(dialog,property,width,order)}).toEqual({classes:dialog.className,width,property,value:winner(dialog,property,width,withoutReviews)});
});

test.each(dialogOrders)('Action date-list also retains bounded shell and content-only scrolling in order %j',(...order)=>{
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualSurface='reviews';document.documentElement.dataset.visualTheme=theme;
  const portal=document.createElement('div');fixture.appendChild(portal);
  portal.innerHTML=`<div role="dialog" class="ui-dialog cia-root cia-selector" data-state="open" data-theme="${theme}"><div class="dialog-heading"></div><div class="dialog-content date-list"></div></div>`;
  const dialog=portal.firstElementChild,content=dialog.querySelector('.dialog-content');
  for(const width of [390,540,541,1280]){
   expect({theme,width,widthValue:winner(dialog,'width',width,order),maxHeight:winner(dialog,'max-height',width,order),maxWidth:winner(dialog,'max-width',width,order),overflowX:winner(dialog,'overflow-x',width,order),overflowY:winner(dialog,'overflow-y',width,order),padding:winner(dialog,'padding',width,order),gap:winner(dialog,'gap',width,order),radius:winner(dialog,'border-radius',width,order),shadow:winner(dialog,'box-shadow',width,order)}).toEqual({theme,width,widthValue:width<=540?'calc(100vw - 22px)':'min(710px,calc(100vw - 40px))',maxHeight:width<=540?'calc(100dvh - 24px)':'calc(100dvh - 56px)',maxWidth:'none',overflowX:'hidden',overflowY:'hidden',padding:'0',gap:'0',radius:'11px',shadow:'0 24px 90px #08152440'});
   expect(winner(content,'overflow-y',width,order)).toBe('auto');
  }
 }
});
test.each(dialogOrders)('Reviews overlay tint is owned by its actual sibling list and leaves native and Risk overlays unchanged in order %j',(...order)=>{
 const portals=document.createElement('div');fixture.appendChild(portals);
 portals.innerHTML='<div data-pair="reviews"><div class="ui-overlay" data-state="open"></div><div role="dialog" class="ui-dialog crr-root crr-list" data-theme="dark" data-state="open"></div></div><div data-pair="native"><div class="ui-overlay" data-state="open"></div><div role="dialog" class="ui-dialog" data-state="open"></div></div><div data-pair="risk"><div class="ui-overlay" data-state="open"></div><div role="dialog" class="ui-dialog cis-dashboard-risk-selection cis-dashboard-concept-portal" data-concept="true" data-theme="dark" data-state="open"></div></div>';
 const overlay=portals.querySelector('[data-pair="reviews"] .ui-overlay');
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualSurface='reviews';document.documentElement.dataset.visualTheme=theme;
  expect(winner(overlay,'background',1280,order)).toBe('#08152468');
  expect(winner(overlay,'backdrop-filter',1280,order)).toBe('blur(2px)');
 }
 const withoutReviews=order.filter(name=>name!=='CisReviewsConcept.css');
 for(const pair of ['native','risk'])for(const property of ['background','backdrop-filter']){
  const native=portals.querySelector(`[data-pair="${pair}"] .ui-overlay`);
  expect(winner(native,property,1280,order)).toBe(winner(native,property,1280,withoutReviews));
 }
});

test.each(dialogOrders)('owned date-list fonts and palette tokens survive the actual shared surface chrome in order %j',(...order)=>{
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualTheme=theme;
  for(const [surface,classes,font,card,text,line] of [['reviews','crr-root crr-list','GoverNara Policy Vendor Inter','--card','--text','--line'],['action-items','cia-root cia-selector','GoverNara Action Concept Inter','--cia-card','--cia-text','--cia-line'],['risks','cis-risks-concept cr-list-dialog','GoverNara CIS Risks Inter','--card','--text','--line']]){
   document.documentElement.dataset.visualSurface=surface;
   const dialog=document.createElement('div');fixture.appendChild(dialog);dialog.className=`ui-dialog ${classes}`;dialog.setAttribute('role','dialog');dialog.dataset.state='open';dialog.dataset.theme=theme;
   expect(winner(dialog,'font-size',1280,order)).toBe('12px');
   expect(winner(dialog,'line-height',1280,order)).toBe('1.45');
   const family=winner(dialog,'font-family',1280,order);
   expect(family).toBe(surface==='action-items'?'var(--cia-font)':'var(--font)');
   expect(winner(dialog,surface==='action-items'?'--cia-font':'--font',1280,order)).toContain(font);
   expect(winner(dialog,card,1280,order)).toBe(theme==='dark'?'#19283d':'#fff');
   expect(winner(dialog,text,1280,order)).toBe(theme==='dark'?'#e3ebf8':surface==='risks'?'#0c1b34':'#10213b');
   expect(winner(dialog,line,1280,order)).toBe(theme==='dark'?'#31435e':surface==='risks'?'#dce5f3':'#dfe6f1');
  }
 }
});
test.each(dialogOrders)('Action adjacent overlay retains the approved tint in both surface themes in order %j',(...order)=>{
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualSurface='action-items';document.documentElement.dataset.visualTheme=theme;
  const portal=document.createElement('div');fixture.appendChild(portal);portal.innerHTML=`<div class="ui-overlay" data-state="open"></div><div class="ui-dialog cia-root cia-selector" data-state="open" data-theme="${theme}"></div>`;
  expect(winner(portal.firstElementChild,'background',1280,order)).toBe('#08152468');
  expect(winner(portal.firstElementChild,'backdrop-filter',1280,order)).toBe('blur(2px)');
 }
});

test.each(dialogOrders)('Risk date-list retains its already-correct bounded geometry with shared chrome loaded in order %j',(...order)=>{
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualSurface='risks';document.documentElement.dataset.visualTheme=theme;
  const dialog=document.createElement('div');fixture.appendChild(dialog);dialog.className='ui-dialog cis-risks-concept cr-list-dialog';dialog.dataset.state='open';dialog.dataset.theme=theme;
  for(const width of [390,540,541,1280])expect({theme,width,widthValue:winner(dialog,'width',width,order),maxHeight:winner(dialog,'max-height',width,order),maxWidth:winner(dialog,'max-width',width,order),overflowX:winner(dialog,'overflow-x',width,order),overflowY:winner(dialog,'overflow-y',width,order),padding:winner(dialog,'padding',width,order),gap:winner(dialog,'gap',width,order),radius:winner(dialog,'border-radius',width,order),shadow:winner(dialog,'box-shadow',width,order)}).toEqual({theme,width,widthValue:width<=540?'calc(100vw - 22px)':'min(710px,calc(100vw - 40px))',maxHeight:width<=540?'calc(100dvh - 24px)':'calc(100dvh - 56px)',maxWidth:'none',overflowX:'hidden',overflowY:'hidden',padding:'0',gap:'0',radius:'11px',shadow:'0 24px 90px #08152440'});
 }
});
test.each(dialogOrders)('Risk adjacent overlay retains approved tint in both themes without retheming full editors in order %j',(...order)=>{
 for(const theme of ['light','dark']){
  document.documentElement.dataset.visualSurface='risks';document.documentElement.dataset.visualTheme=theme;
  const portal=document.createElement('div');fixture.appendChild(portal);portal.innerHTML=`<div class="ui-overlay" data-state="open"></div><div class="ui-dialog cis-risks-concept cr-list-dialog" data-state="open" data-theme="${theme}"></div><section><div class="ui-overlay" data-state="open"></div><div role="dialog" class="ui-dialog" data-state="open" data-testid="risks-drawer"></div></section>`;
  expect(winner(portal.firstElementChild,'background',1280,order)).toBe('#08152468');
  expect(winner(portal.firstElementChild,'backdrop-filter',1280,order)).toBe('blur(2px)');
  const native=portal.querySelector('section .ui-overlay'),withoutConcepts=order.filter(name=>!['CisReviewsConcept.css','CisActionItemsConcept.css','CisRisksConcept.css'].includes(name));
  for(const property of ['background','backdrop-filter'])expect(winner(native,property,1280,order)).toBe(winner(native,property,1280,withoutConcepts));
  const form=portal.querySelector('[data-testid="risks-drawer"]');
  for(const property of ['font-family','font-size','line-height','background','color','border-radius','width','max-height','overflow-y'])expect(winner(form,property,1280,order)).toBe(winner(form,property,1280,withoutConcepts));
 }
});
