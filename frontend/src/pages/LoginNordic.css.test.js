import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import postcss from 'postcss';

const sheet=postcss.parse(readFileSync(join(__dirname,'LoginNordic.css'),'utf8'));
function value(selector,property,container=sheet) {
 let result;
 for(const rule of container.nodes) {
  if(rule.type!=='rule'||!rule.selectors.includes(selector))continue;
  rule.each(node=>{if(node.type==='decl'&&node.prop===property)result=node.value;});
 }
 return result;
}

test('Nordic Login styles and motion stay inside the public native login',()=>{
 sheet.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
  for(const selector of rule.selectors)expect(selector).toMatch(/^#login-governara(?:\s|$)/);
 });
 sheet.walkAtRules(/keyframes$/,rule=>expect(rule.params).toBe('login-nordic-spin'));
 const reduced=sheet.nodes.find(node=>node.type==='atrule'&&node.params==='(prefers-reduced-motion:reduce)');
 expect(value('#login-governara *','animation',reduced)).toBe('none');
 expect(value('#login-governara :focus-visible','outline')).toBe('2px solid var(--mint)');
});

test('the native login uses the exact approved Nordic decorative scene and layout',()=>{
 const image=readFileSync(join(__dirname,'../assets/login-nordic-background.webp'));
 expect(image.length).toBe(211184);
 expect(createHash('sha256').update(image).digest('hex')).toBe('4fef7ca60a564e0c5bb728afcc11202a75ba5c1663e9091df111b0fb07788e87');
 expect(value('#login-governara main','grid-template-columns')).toBe('minmax(0, 1fr) minmax(350px, 445px)');
 expect(value('#login-governara .card','background')).toBe('linear-gradient(165deg, #163b3df5, #102e30f8)');
 expect(value('#login-governara .primary','background')).toBe('var(--mint)');
 const mobile=sheet.nodes.find(node=>node.type==='atrule'&&node.params==='(max-width: 730px)');
 expect(value('#login-governara main','flex-direction',mobile)).toBe('column');
});
