import {readFileSync} from 'fs';
import {join} from 'path';
import postcss from 'postcss';

const read=file=>readFileSync(join(process.cwd(),'src',file),'utf8');
const sheet=postcss.parse(read('design-system.css'));
const values=rule=>Object.fromEntries(rule.nodes.filter(node=>node.type==='decl').map(node=>[node.prop,node.value]));
const light=values(sheet.nodes.find(node=>node.selector===':root'));
const dark=values(sheet.nodes.find(node=>node.selector?.includes('.dark:not(')));
const luminance=hex=>hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const [high,low]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(high+.05)/(low+.05);};

test('the operational dark palette matches the approved Brawndo reference rather than scenic or legacy olive themes',()=>{
  expect(dark['--color-bg-app']).toBe('#071321');expect(dark['--color-bg-surface']).toBe('#0C1B30');
  expect(dark['--color-border']).toBe('#263C58');expect(dark['--color-text-primary']).toBe('#EDF3FF');
  expect(dark['--color-text-secondary']).toBe('#A8BAD5');expect(dark['--color-link']).toBe('#85D4FF');
  expect(dark['--color-success']).toBe('#39C7A5');expect(dark['--color-moderate']).toBe('#F5BC4F');
  expect(dark['--color-critical']).toBe('#FA7B85');expect(dark['--color-neutral']).toBe('#A2AEC4');
  expect(new Set(['success','moderate','critical','neutral'].map(role=>dark['--color-'+role])).size).toBe(4);
  expect(light['--color-brand-accent']).not.toBe(light['--color-success']);
});

test.each(['light','dark'])('%s operational text, controls, selected state and status labels retain readable contrast',theme=>{
  const palette=theme==='light'?light:{...light,...dark};
  for(const text of ['text-primary','text-secondary','text-muted','text-help','link','success','critical','info','duesoon-text'])
    for(const surface of ['bg-app','bg-surface','bg-subtle','bg-row-hover'])expect(contrast(palette['--color-'+text],palette['--color-'+surface])).toBeGreaterThanOrEqual(4.5);
  for(const tone of ['critical','high','moderate','duesoon','success','info','neutral','accepted'])expect(contrast(palette['--color-'+tone],palette['--color-'+tone+'-bg'])).toBeGreaterThanOrEqual(4.5);
  expect(contrast(palette['--color-input-border'],palette['--color-bg-surface'])).toBeGreaterThanOrEqual(3);
  expect(contrast(palette['--color-focus-ring'],palette['--color-bg-surface'])).toBeGreaterThanOrEqual(3);
  expect(contrast(palette['--color-selected-rail'],palette['--color-selected-bg'])).toBeGreaterThanOrEqual(3);
  for(const action of ['brand-accent','brand-accent-hover','brand-accent-active'])expect(contrast(palette['--color-brand-on-accent'],palette['--color-'+action])).toBeGreaterThanOrEqual(4.5);
});

test('one canonical palette reaches portal and class-based themes without private-alias cycles',()=>{
  const darkRule=sheet.nodes.find(node=>node.selector?.includes('.dark:not('));
  expect(darkRule.selector).toContain('html[data-brawndo-workspace="dark"]');
  expect(darkRule.selector).toContain('html[data-brawndo-portal="dark"]:not([data-brawndo-workspace])');
  expect(light['color-scheme']).toBe('light');expect(dark['color-scheme']).toBe('dark');
  for(const file of ['components/BrawndoWorkspace.css','components/BrawndoPortalTheme.css']){
    const css=read(file);
    expect(css).not.toMatch(/--color-[\w-]+\s*:/);
    expect(css).not.toMatch(/@import|https?:\/\//);
  }
  expect(read('components/BrawndoPortalTheme.css')).toContain('background-color:var(--color-bg-surface)');
  // Existing geometry/reduced-motion rules keep their important flags; new palette declarations do not add them.
  for(const rule of [sheet.nodes.find(node=>node.selector===':root'),darkRule])
    rule.walkDecls(decl=>expect(Boolean(decl.important)).toBe(false));
  postcss.parse(read('components/BrawndoPortalTheme.css')).walkDecls(decl=>expect(Boolean(decl.important)).toBe(false));
});

test('scenic artwork is confined to the portfolio variant and operational font changes preserve density',()=>{
  const sidebar=postcss.parse(read('components/BrawndoSidebar.css'));
  const scenic=[];sidebar.walkDecls(decl=>{if(/url\(/.test(decl.value))scenic.push(decl);});
  expect(scenic).toHaveLength(1);
  expect(scenic[0].parent.selector).toBe('.app-shell.governara-portfolio-shell .app-sidebar');
  expect(scenic[0].value).toContain("../assets/portfolio-city.webp");
  expect(read('components/BrawndoWorkspace.css')).not.toContain('url(');
  expect(read('index.css')).toContain("--font-body: 'Segoe UI', Inter, Arial, sans-serif;");
  expect(light['--register-row']).toBe('46px');expect(light['--register-gutter']).toBe('20px');
  expect(read('design-system.css')).toContain('--control-height: 32px');
  expect(read('design-system.css')).toContain('--page-title-size: 22px');
});

test('client and framework surfaces cannot reverse canonical roles into private palette aliases',()=>{
  // A reverse --color-critical -> --bp-critical alias invalidated both properties
  // on the same dark client surface. Local aliases may consume canonical roles
  // but must not redefine them through those aliases.
  for(const file of ['components/ClientSurface.css','components/BrawndoPage.css',
    'components/BrawndoCisOverview.css','components/BrawndoReviews.css','components/BrawndoProfile.css']){
    postcss.parse(read(file)).walkDecls(decl=>{
      if(decl.prop.startsWith('--color-'))
        expect(decl.value).not.toMatch(/var\(\s*--(?:bp|cs|rv|pf)-/);
    });
  }
});

test.each(['light','dark'])('%s changed action and guide-header selectors retain readable actual foreground roles',theme=>{
  const palette=theme==='light'?light:{...light,...dark};
  const workspace=postcss.parse(read('components/BrawndoWorkspace.css'));
  const declarations=selector=>values(workspace.nodes.find(rule=>rule.type==='rule'&&rule.selectors.includes(selector)));
  const resolve=value=>{
    if(value==='white')return '#FFFFFF';
    if(/^#[\da-f]{3}$/i.test(value))return '#'+[...value.slice(1)].map(char=>char+char).join('');
    const variable=value.match(/^var\((--[\w-]+)\)$/);
    return variable?palette[variable[1]]:value;
  };
  for(const selector of ['.brawndo-workspace-pilot .bpage-chip[aria-pressed=true]',
    '.brawndo-workspace-pilot .bprof-tabs button[aria-current=page]']){
    const rule=declarations(selector);
    expect(contrast(resolve(rule.color),resolve(rule.background))).toBeGreaterThanOrEqual(4.5);
    expect(rule.color).toBe('var(--color-brand-on-accent)');
  }
  for(const selector of ['.omni-workspace-window .omni-panel-header','.omni-window-controls',
    '.omni-workspace-window .omni-state-text']){
    const rule=declarations(selector);
    // Refined headers can layer these three canonical surfaces in their existing gradient.
    for(const surface of ['bg-subtle','bg-surface','bg-app'])
      expect(contrast(resolve(rule.color),palette['--color-'+surface])).toBeGreaterThanOrEqual(4.5);
  }
  expect(declarations('.omni-workspace-window .omni-panel-header').background).toBe('var(--color-bg-subtle)');
  expect(declarations('.omni-window-controls>button').border).toBe('1px solid var(--color-input-border)');
  expect(declarations('.omni-window-controls button:hover').background).toBe('var(--color-bg-row-hover)');
});

test('closed mobile navigation cannot paint or expose its controls while the existing open drawer remains unchanged',()=>{
  const workspace=postcss.parse(read('components/BrawndoWorkspace.css'));
  const mobile=workspace.nodes.find(node=>node.type==='atrule'&&node.params==='(max-width:650px)'&&
    node.nodes.some(rule=>rule.selector==='.brawndo-workspace-pilot[data-navigation=open] .app-sidebar'));
  const closed=mobile.nodes.find(rule=>rule.selector==='.brawndo-workspace-pilot[data-navigation=closed] .app-sidebar');
  expect(closed).toBeDefined();
  expect(values(closed)).toEqual({display:'none'});
  expect(Boolean(closed.nodes[0].important)).toBe(false);
  const open=mobile.nodes.find(rule=>rule.selector==='.brawndo-workspace-pilot[data-navigation=open] .app-sidebar');
  expect(values(open)).toEqual({position:'fixed','z-index':'45',display:'flex',width:'228px',left:'0'});
  const desktop=[];workspace.walkRules(rule=>{
    if(rule.selector==='.brawndo-workspace-pilot[data-navigation=closed] .app-sidebar')desktop.push(rule.parent);
  });
  expect(desktop).toEqual([mobile]);
});
