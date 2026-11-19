import fs from 'fs';
import path from 'path';
import postcss from 'postcss';

test('R4 styles stay inside the protected application or its mounted portals', () => {
  const stylesheet = fs.readFileSync(path.join(__dirname,'NativeStandard.css'),'utf8');
  const root = postcss.parse(stylesheet);
  root.walkRules(rule => {
    if (rule.parent.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
    for (const selector of rule.selectors) expect(selector).toMatch(/^(?:\.native-standard|html\[data-native-standard|:is\(\.native-standard)/);
  });
  expect(stylesheet).not.toMatch(/@import|https:\/\/fonts/);
  const drawers = [];
  root.walkRules(rule => {if (rule.selector === '.native-standard .drawer') rule.walkDecls('width', declaration => drawers.push(declaration.value));});
  expect(drawers.at(-1)).toBe('min(600px,100%)');
});

test('the portalled Review Guide separates and wraps real support chips only while protected styling is mounted',()=>{
  const stylesheet=postcss.parse(fs.readFileSync(path.join(__dirname,'NativeStandard.css'),'utf8'));
  const portal=document.createElement('div');portal.className='ui-dialog';
  portal.innerHTML='<section aria-label="Review guide"><div class="chip-row"><span class="mini-chip">Updated risk record</span><span class="mini-chip">Rating change</span></div><button class="cta">Save checklist progress</button></section>';
  document.body.appendChild(portal);
  const properties=node=>{const result={};stylesheet.walkRules(rule=>{
    if(rule.selector.startsWith('html[data-native-standard]')&&rule.selector.includes('[aria-label="Review guide"]')&&node.matches(rule.selector))
      rule.walkDecls(declaration=>{result[declaration.prop]=declaration.value;});
  });return result;};
  const previous=document.documentElement.getAttribute('data-native-standard');
  try{
    for(const theme of ['dark','light']){
      document.documentElement.setAttribute('data-native-standard',theme);
      expect(properties(portal.querySelector('.chip-row'))).toMatchObject({display:'flex','flex-wrap':'wrap',gap:'5px'});
      expect(properties(portal.querySelector('.mini-chip'))).toMatchObject({padding:'1px 7px',border:'1px solid var(--divider)',background:'var(--surface-2)','white-space':'nowrap'});
      expect(properties(portal.querySelector('.cta'))).toMatchObject({'min-height':'40px',background:'var(--cta)',color:'var(--cta-fg)',display:'inline-flex'});
      const save=portal.querySelector('.cta');save.disabled=true;
      expect(properties(save)).toMatchObject({cursor:'not-allowed',opacity:'.5'});save.disabled=false;
    }
    document.documentElement.removeAttribute('data-native-standard');
    expect(properties(portal.querySelector('.chip-row'))).toEqual({});expect(properties(portal.querySelector('.cta'))).toEqual({});
  }finally{portal.remove();if(previous===null)document.documentElement.removeAttribute('data-native-standard');else document.documentElement.setAttribute('data-native-standard',previous);}
});
