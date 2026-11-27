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

test('light sidebar client initials use the readable native token without changing assets or other tiles',()=>{
  const stylesheet=postcss.parse(fs.readFileSync(path.join(__dirname,'NativeStandard.css'),'utf8'));
  const selector='.native-standard[data-theme="light"] .side .tile';
  const rules=[];stylesheet.walkRules(rule=>{if(rule.selector===selector)rules.push(rule);});
  expect(rules).toHaveLength(1);
  const declarations={};rules[0].walkDecls(declaration=>{declarations[declaration.prop]=declaration.value;});
  expect(declarations).toEqual({color:'var(--text)'});
  const light={};stylesheet.walkRules(rule=>{
    if(rule.selectors.includes('.native-standard[data-theme="light"]'))
      rule.walkDecls(declaration=>{light[declaration.prop]=declaration.value;});
  });
  const luminance=hex=>{
    const channels=[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255)
      .map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  };
  const foreground=luminance(light['--text']),background=luminance(light['--side']);
  expect((Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)).toBeGreaterThanOrEqual(4.5);
  const shell=document.createElement('div');shell.className='native-standard';
  shell.innerHTML='<nav class="side"><button class="nav"><span class="tile">S</span><span class="ellip">Synthetic client</span></button><span class="tile"><img alt="" src="synthetic-logo.png"></span><span class="tile"><svg><path fill="#f5f50f"></path></svg></span></nav><main><span class="tile">M</span></main>';
  document.body.appendChild(shell);
  const initial=shell.querySelector('.nav .tile'),image=shell.querySelector('img'),svg=shell.querySelector('svg');
  const color=node=>{
    let value;stylesheet.walkRules(rule=>{
      if((rule.selector==='.native-standard .tile'||rule.selector===selector)&&node.matches(rule.selector))
        rule.walkDecls('color',declaration=>{value=declaration.value;});
    });return value;
  };
  try{
    shell.dataset.theme='light';
    expect(color(initial)).toBe('var(--text)');
    expect(color(shell.querySelector('main .tile'))).toBe('#FFFFFF');
    expect(image.matches(selector)).toBe(false);expect(svg.matches(selector)).toBe(false);
    expect(color(image)).toBeUndefined();expect(color(svg)).toBeUndefined();
    shell.dataset.theme='dark';expect(color(initial)).toBe('#FFFFFF');
    shell.removeAttribute('data-theme');expect(color(initial)).toBe('#FFFFFF');
    shell.className='';shell.dataset.theme='light';expect(color(initial)).toBeUndefined();
  }finally{shell.remove();}
});

test('qualified native CIS and Omni invitation primaries retain CTA foregrounds without repainting other controls',()=>{
  const stylesheet=postcss.parse(fs.readFileSync(path.join(__dirname,'NativeStandard.css'),'utf8'));
  const legacy=postcss.parse(fs.readFileSync(path.join(__dirname,'BrawndoCisVisual.css'),'utf8'));
  const omni=postcss.parse(fs.readFileSync(path.join(__dirname,'BrawndoCisVisualOmni.css'),'utf8'));
  const selectors=['.native-standard .brawndo-cis-visual .btn.primary',
    '.native-standard .brawndo-cis-visual-omni .cis-omni-invitation-actions .ui-button.bg-primary'];
  const rules=[];stylesheet.walkRules(rule=>{if(selectors.includes(rule.selector))rules.push(rule);});
  expect(rules).toHaveLength(2);
  for(const rule of rules){
    const declarations={};rule.walkDecls(declaration=>{declarations[declaration.prop]=declaration.value;});
    expect(declarations).toEqual({color:'var(--cta-fg)'});
  }
  const hover={};legacy.walkRules(rule=>{
    if(rule.selectors.includes('.brawndo-cis-visual .btn.primary:hover'))
      rule.walkDecls(declaration=>{hover[declaration.prop]=declaration.value;});
  });expect(hover).toEqual({filter:'brightness(1.08)'});
  const omniHover={};omni.walkRules(rule=>{
    if(rule.selector.endsWith(' .ui-button.bg-primary:hover'))
      rule.walkDecls(declaration=>{omniHover[declaration.prop]=declaration.value;});
  });expect(omniHover).toEqual({background:'var(--rail)',filter:'brightness(1.08)'});
  const shell=document.createElement('div');shell.className='native-standard';
  shell.innerHTML=['brawndo-cis-visual','soc-cis-program-visual','iso-cis-program-visual'].map(name=>
    `<section class="${name}"><button class="btn primary" ${name==='brawndo-cis-visual'?'data-target':'data-preserve'}><svg><path stroke="currentColor"></path></svg>Continue</button><button class="btn" data-preserve>Neutral</button><button class="ui-button bg-primary" data-preserve>Existing primary</button></section>`).join('')+
    '<div class="brawndo-cis-visual-omni"><div class="guided-launcher omni-free-dock"><div class="cis-omni-invitation-actions"><button class="ui-button bg-primary" data-target>Show next steps</button><button class="ui-button border" data-preserve>Not now</button></div></div><button class="ui-button bg-primary" data-preserve>Other Omni</button></div><div class="shared-program-omni"><div class="cis-omni-invitation-actions"><button class="ui-button bg-primary" data-preserve>Other program</button></div></div><button class="btn primary" data-preserve>Other surface</button>';
  document.body.appendChild(shell);
  const properties=node=>{const result={};for(const rule of rules)if(node.matches(rule.selector))
    rule.walkDecls(declaration=>{result[declaration.prop]=declaration.value;});return result;};
  try{
    for(const [theme,foreground] of [['light','#FFFFFF'],['dark','#0B1630']]){
      shell.dataset.theme=theme;
      const tokens={};stylesheet.walkRules(rule=>{
        if(rule.selectors.some(value=>['.native-standard.native-standard','.native-standard[data-theme="light"]'].includes(value)&&shell.matches(value)))
          rule.walkDecls(declaration=>{tokens[declaration.prop]=declaration.value;});
      });
      expect(tokens['--surface']).toMatch(/^linear-gradient\(/);
      expect(tokens['--cta-fg']).toBe(foreground);
      for(const primary of shell.querySelectorAll('[data-target]')){
        expect(properties(primary)).toEqual({color:'var(--cta-fg)'});
        primary.disabled=true;expect(properties(primary)).toEqual({color:'var(--cta-fg)'});primary.disabled=false;
        const icon=primary.querySelector('svg');if(icon)expect(properties(icon)).toEqual({});
      }
      for(const other of shell.querySelectorAll('[data-preserve]'))expect(properties(other)).toEqual({});
    }
    shell.className='';for(const primary of shell.querySelectorAll('[data-target]'))expect(properties(primary)).toEqual({});
  }finally{shell.remove();}
});

test('only the first native CIS recommendation keeps its primary foreground while later recommendations stay secondary',()=>{
  const stylesheet=postcss.parse(fs.readFileSync(path.join(__dirname,'NativeStandard.css'),'utf8'));
  const selector='.native-standard .brawndo-cis-visual-omni .omni-recommendation:first-child>.ui-button.bg-primary';
  const rules=[];stylesheet.walkRules(rule=>{if(rule.selector===selector)rules.push(rule);});
  expect(rules).toHaveLength(1);
  const declarations={};rules[0].walkDecls(declaration=>{declarations[declaration.prop]=declaration.value;});
  expect(declarations).toEqual({color:'var(--cta-fg)'});
  const shell=document.createElement('div');shell.className='native-standard';
  shell.innerHTML='<div class="brawndo-cis-visual-omni"><div class="omni-recommendations"><article class="omni-recommendation"><button class="ui-button bg-primary" data-target>Open safeguard 14.8</button><button class="ui-button" data-preserve>Neutral</button></article><article class="omni-recommendation"><button class="ui-button bg-primary" data-preserve>Open safeguard 9.1</button></article></div></div><div class="shared-program-omni"><article class="omni-recommendation"><button class="ui-button bg-primary" data-preserve>Other program</button></article></div>';
  document.body.appendChild(shell);
  try{
    for(const theme of ['light','dark']){
      shell.dataset.theme=theme;
      const target=shell.querySelector('[data-target]');
      expect(target.matches(selector)).toBe(true);
      target.disabled=true;expect(target.matches(selector)).toBe(true);target.disabled=false;
      for(const other of shell.querySelectorAll('[data-preserve]'))expect(other.matches(selector)).toBe(false);
    }
    shell.className='';expect(shell.querySelector('[data-target]').matches(selector)).toBe(false);
  }finally{shell.remove();}
});
