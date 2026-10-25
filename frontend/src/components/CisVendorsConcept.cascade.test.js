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
