const fs=require('fs'),path=require('path'),postcss=require('postcss');
const css=fs.readFileSync(path.join(process.cwd(),'src/design-system.css'),'utf8');
const scope=':root';
const root=postcss.parse(css);
const palette=Object.fromEntries(root.nodes.find(n=>n.selector===scope).nodes.map(n=>[n.prop,n.value]));
const color=name=>palette['--color-'+name];
const lum=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((a,b)=>b-a);return(x+.05)/(y+.05);};

test('approved palette is shared across routes and floating UI, not a second pilot theme',()=>{
  expect(css).not.toContain(':has(.register-surface');
  expect(fs.existsSync(path.join(process.cwd(),'src/reviews-pilot.css'))).toBe(false);
  const seen=new Set();
  root.walkRules(rule=>{if(rule.selector===scope && rule.parent===root)rule.walkDecls(d=>{expect(seen.has(d.prop)).toBe(false);seen.add(d.prop);});});
  expect(css).not.toMatch(/@keyframes|backdrop-filter|will-change|transition:\s*all/);
});
test('authoritative neutral, brand and semantic values stay separate',()=>{
  expect(color('bg-app')).toBe('#F7F9FA');expect(color('bg-surface')).toBe('#FFFFFF');
  expect(color('sidebar-bg')).toBe('#293039');expect(color('brand-lime')).toBe('#A3DB33');
  expect(color('success')).toBe('#05603A');expect(color('critical')).toBe('#B42318');
  expect(color('link')).toBe('#2A55C8');expect(color('focus-ring')).toBe('#4172F4');
});
test('approved density stays shared without hiding columns or changing selected All',()=>{
  expect(palette['--register-row']).toBe('44px');
  expect(palette['--register-gutter']).toBe('20px');
  expect(css).toContain('min-width: 936px');
  expect(css).toContain('.register-col-recurrence + .register-col-date { width: 118px; }');
  expect(css).toContain('.quick-filters button:not([aria-pressed="true"]):hover');
  expect(css).not.toMatch(/text-overflow:\s*ellipsis|line-clamp|overflow:\s*hidden/);
  const selected=root.nodes.filter(n=>n.selector===scope+' .quick-filters button[aria-pressed="true"]').at(-1);
  expect(Object.fromEntries(selected.nodes.map(n=>[n.prop,n.value]))).toEqual({background:'var(--color-bg-surface)','border-color':'var(--color-control-active-border)'});
});
test('body, metadata, semantic text and controls retain readable contrast',()=>{
  for(const ink of ['text-primary','text-secondary','text-muted','text-help','link','critical','duesoon-text','success','info'])
    for(const surface of ['bg-app','bg-surface','bg-subtle']) expect(contrast(color(ink),color(surface))).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#FFFFFF',color('critical'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast('#FFFFFF',color('brand-charcoal'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color('input-border'),color('bg-surface'))).toBeGreaterThanOrEqual(3);
  expect(contrast(color('focus-ring'),color('bg-surface'))).toBeGreaterThanOrEqual(3);
});

test('inverse login/sidebar controls retain readable text and disabled buttons have no active hover fill',()=>{
  expect(contrast(color('text-on-dark'),color('sidebar-hover-bg'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color('sidebar-text'),color('sidebar-hover-bg'))).toBeGreaterThanOrEqual(4.5);
  expect(contrast(color('input-border'),color('sidebar-hover-bg'))).toBeGreaterThanOrEqual(3);
  expect(css).toContain(':is(.app-sidebar, .login-shell) .ui-control');
  expect(css).toContain('.ui-button.bg-primary:not(:disabled):hover');
});
