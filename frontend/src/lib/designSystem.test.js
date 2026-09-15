const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(process.cwd(), 'src/design-system.css'), 'utf8');
const dark = css.split('.light {')[0];
function color(token) {
  const match = dark.match(new RegExp('--color-' + token + ': (#[A-Fa-f0-9]{6})'));
  if (!match) throw new Error('Missing token: ' + token);
  return match[1];
}
function luminance(hex) {
  return hex.slice(1).match(/../g).map(x => parseInt(x,16)/255)
    .map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4)
    .reduce((sum,x,i) => sum+x*[.2126,.7152,.0722][i],0);
}
function contrast(a,b) {
  const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}
test.each(['text-primary','text-secondary','text-muted','text-help'])('%s remains readable on charcoal surfaces', token => {
  for (const surface of ['bg-app','bg-surface','bg-subtle','bg-row-hover']) {
    expect(contrast(color(token),color(surface))).toBeGreaterThanOrEqual(4.5);
  }
});
test.each(['critical','high','moderate','duesoon','success','info','neutral','accepted'])('%s badge label contrast', tone => {
  expect(contrast(color(tone),color(tone+'-bg'))).toBeGreaterThanOrEqual(4.5);
});
test('light remains an explicit supported theme and native controls inherit theme', () => {
  expect(css).toContain(':root:not(.light)');
  expect(css).toContain('.light { color-scheme: light; }');
  expect(css).toContain('color-scheme: dark');
});
