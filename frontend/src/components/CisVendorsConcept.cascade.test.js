const fs=require('fs');
const path=require('path');
const postcss=require('postcss');
const parser=require('postcss-selector-parser');
const {selectorSpecificity,compare}=require('@csstools/selector-specificity');
const sheets=['BrawndoAdditionalPolicyVendor.css','CisVendorsConcept.css'].map(name=>postcss.parse(fs.readFileSync(path.join(__dirname,name),'utf8')));

// Check the real authored cascade at the native register's container breakpoint.
// Browser geometry remains a separate check; jsdom does not lay out CSS Grid.
function winner(node,property,containerWidth){
  let result;
  for(const sheet of sheets)sheet.walkRules(rule=>{
    for(let parent=rule.parent;parent;parent=parent.parent){
      if(parent.type!=='atrule')continue;
      if(!['media','container'].includes(parent.name))return;
      const width=parent.name==='container'?containerWidth:1280;
      const limits=[...parent.params.matchAll(/(min|max)-width:\s*(\d+)px/g)];
      if(!limits.length||limits.some(([,kind,value])=>kind==='min'?width<Number(value):width>Number(value)))return;
    }
    for(const selector of rule.selectors){
      if(selector.includes('::')||!node.matches(selector))continue;
      const specificity=selectorSpecificity(parser().astSync(selector).nodes[0]);
      rule.walkDecls(decl=>{
        if(decl.prop!==property)return;
        if(!result||compare(specificity,result.specificity)>=0)result={value:decl.value,specificity};
      });
    }
  });
  return result?.value;
}
function row(scoped){
  const page=document.createElement('div');page.className='bav-page'+(scoped?' cv-page':'');
  page.innerHTML='<div class="bav-table"><div class="bav-row"><div class="bav-item"></div><div class="bav-criticality"></div><div class="bav-types"><span class="bav-data-type">Employee Data</span></div><div class="bav-owner"></div><div class="bav-next"></div><div class="bav-assurance"></div><div class="bav-renewal"></div><svg class="bapv-chevron"></svg></div></div>';
  return page.querySelector('.bav-row');
}
test.each([974,1099,1101,1440])('CIS Vendor columns remain in one row at a %ipx register container',width=>{
  const node=row(true);
  expect(winner(node,'grid-template-areas',width)).toBe('none');
  expect(winner(node,'padding',width)).toBe('0');
  for(const cell of node.querySelectorAll(':scope > div'))expect(winner(cell,'grid-area',width)).toBe('auto');
  expect(winner(node.lastElementChild,'display',width)).toBe('block');
  expect(winner(node.querySelector('.bav-data-type'),'white-space',width)).toBe('normal');
  node.classList.add('bav-header');
  expect(winner(node,'display',width)).toBe('grid');
});
test('legacy non-concept Vendors retain their existing narrow-container named areas',()=>{
  const node=row(false);
  expect(winner(node,'grid-template-areas',974)).toBe('"item item" "crit types" "owner next" "asr ren"');
  expect(winner(node.firstElementChild,'grid-area',974)).toBe('item');
  expect(winner(node.lastElementChild,'display',974)).toBe('none');
  node.classList.add('bav-header');
  expect(winner(node,'display',974)).toBe('none');
});
const criticalityTokens=[
  ['critical','#ffd9d7','#a42a31','#4e2c3d','#f5b6c6'],
  ['high','#ffe4cc','#985516','#533d2d','#f8cd9a'],
  ['moderate','#fff0c9','#6a4c15','#443a26','#f2d896'],
  ['low','#dcf3ef','#265f59','#23453f','#9dded1'],
];
test.each(criticalityTokens.flatMap(([level,lightBg,lightFg,darkBg,darkFg])=>[
  [level,'light',lightBg,lightFg],[level,'dark',darkBg,darkFg],
]))('CIS Vendor %s badge uses approved %s reference tokens',(level,theme,background,color)=>{
  const page=document.createElement('div');page.className='cv-page';page.dataset.theme=theme;
  page.innerHTML=`<span class="bav-critical ${level}"></span>`;
  expect(winner(page.firstElementChild,'background',974)).toBe(background);
  expect(winner(page.firstElementChild,'color',974)).toBe(color);
});
test.each([['received','#253d60','#b6ceff'],['requested','#443922','#f2d58a']])('CIS Vendor dark %s assurance uses approved reference tokens',(status,background,color)=>{
  const page=document.createElement('div');page.className='cv-page';page.dataset.theme='dark';
  page.innerHTML=`<span class="cv-assurance-status cv-status-${status}"></span>`;
  expect(winner(page.firstElementChild,'background',974)).toBe(background);
  expect(winner(page.firstElementChild,'color',974)).toBe(color);
});
test.each(['received','reviewed'])('CIS Vendor light %s assurance uses approved reference foreground',status=>{
  const page=document.createElement('div');page.className='cv-page';page.dataset.theme='light';
  page.innerHTML=`<span class="cv-assurance-status cv-status-${status}"></span>`;
  expect(winner(page.firstElementChild,'color',974)).toBe('#1459dc');
});
// Resolve the inherited single custom-property tokens used by these badge rules.
function resolvedBadgeToken(node,property,width){
  const value=winner(node,property,width);
  const token=/^var\((--[\w-]+)\)$/.exec(value||'');
  if(!token)return value;
  for(let ancestor=node;ancestor;ancestor=ancestor.parentElement){
    const inherited=winner(ancestor,token[1],width);
    if(inherited!==undefined)return inherited;
  }
  return value;
}
const urgencyReferenceTokens={
  light:{today:['#e9f0ff','#1459dc'],week:['#fff0cd','#a16b09'],fortnight:['#fff5df','#966215'],month:['#edf4ff','#245da8'],later:['#f7f9fc','#647491'],overdue:['#fff1f4','#ad2e45']},
  dark:{today:['#233b5c','#b9d1ff'],week:['#403522','#f3c86f'],fortnight:['#3b3327','#f3d18b'],month:['#233b5c','#b9d1ff'],later:['#21334b','#a2b4d0'],overdue:['#402936','#f7a7b7']},
};
test.each(['cv-page','cv-tooltip','cv-event-list'].flatMap(scope=>Object.entries(urgencyReferenceTokens).flatMap(([theme,tokens])=>Object.entries(tokens).map(([urgency,[background,color]])=>[scope,theme,urgency,background,color]))))('%s %s %s urgency retains approved badge tokens',(scope,theme,urgency,background,color)=>{
  const page=document.createElement('div');page.className=scope;page.dataset.theme=theme;
  page.innerHTML=`<span class="cv-due cv-${urgency}"></span>`;
  expect(resolvedBadgeToken(page.firstElementChild,'background',974)).toBe(background);
  expect(resolvedBadgeToken(page.firstElementChild,'color',974)).toBe(color);
});
test.each([
  ['light','received','#edf4ff','#1459dc'],['dark','received','#253d60','#b6ceff'],
  ['light','requested','#fff4dd','#8d691d'],['dark','requested','#443922','#f2d58a'],
  ['light','not_recorded','#f7f9fc','#647491'],['dark','not_recorded','#21334b','#a2b4d0'],
])('%s %s assurance complete reference badge map',(theme,status,background,color)=>{
  const page=document.createElement('div');page.className='cv-page';page.dataset.theme=theme;
  page.innerHTML=`<span class="cv-assurance-status cv-status-${status}"></span>`;
  expect(resolvedBadgeToken(page.firstElementChild,'background',974)).toBe(background);
  expect(resolvedBadgeToken(page.firstElementChild,'color',974)).toBe(color);
});
