import {readFileSync} from 'fs';
import {join} from 'path';
import postcss from 'postcss';

const sheet=postcss.parse(readFileSync(join(__dirname,'NativeNordic.css'),'utf8'));
const app=readFileSync(join(__dirname,'App.js'),'utf8');
function token(mode,name) {
 let value;
 sheet.walkRules(rule=>{
  if(!rule.selector.includes('data-theme="'+mode+'"')) return;
  rule.each(node=>{if(node.type==='decl'&&node.prop===name)value=node.value;});
 });
 return value;
}

test('Nordic styles are limited to the mounted native shell and its portals',()=>{
 sheet.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name)) return;
  for(const selector of rule.selectors) expect(selector).toMatch(/^(?:\.native-standard|html\[data-native-standard|:is\(html\[data-native-standard)/);
 });
 const imports=[...app.matchAll(/import ["']([^"']+\.css)["'];/g)].map(match=>match[1]);
 expect(imports[imports.length-1]).toBe('@/NativeNordic.css');
});

test('both themes and nested Portfolio surfaces retain the exact approved Nordic materials',()=>{
 expect(token('light','--bg')).toBe('#edf4f3');
 expect(token('light','--surface-solid')).toBe('#fff');
 expect(token('light','--text')).toBe('#123438');
 expect(token('light','--accent')).toBe('#116661');
 expect(token('dark','--bg')).toBe('#122325');
 expect(token('dark','--surface-solid')).toBe('#1a2d2e');
 expect(token('dark','--text')).toBe('#e9f3ef');
 expect(token('dark','--accent')).toBe('#8ad9c0');
 expect(sheet.toString()).toContain('.portfolio-reference.portfolio-reference[data-theme="light"]');
 expect(sheet.toString()).toContain('--color-bg-surface:var(--surface-solid)');
 expect(sheet.toString()).toContain('--gn-ink:var(--text)');
 expect(sheet.toString()).not.toMatch(/data-client-(?:id|name)|clients_demo_|Brawndo|Initech/);
});

test('Portfolio history portals receive Nordic tokens through the mounted document marker',()=>{
 const portal=document.createElement('section');
 portal.className='portfolio-reference portfolio-history-dialog ep-history';
 document.body.appendChild(portal);
 const original=document.documentElement.getAttribute('data-native-standard');
 try {
  for(const [mode,bg,ink] of [['light','#edf4f3','#123438'],['dark','#122325','#e9f3ef']]) {
   document.documentElement.setAttribute('data-native-standard',mode);portal.dataset.theme=mode;
   const own={};
   sheet.walkRules(rule=>{
    if(!rule.selector.includes('.portfolio-reference.portfolio-reference[data-theme='))return;
    if(rule.parent.type==='atrule')return;
    if(!portal.matches(rule.selector))return;
    rule.each(node=>{if(node.type==='decl')own[node.prop]=node.value;});
   });
   expect(own['--bg']).toBe(bg);expect(own['--text']).toBe(ink);
  }
 } finally {
  portal.remove();
  if(original===null)document.documentElement.removeAttribute('data-native-standard');
  else document.documentElement.setAttribute('data-native-standard',original);
 }
});
