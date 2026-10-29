import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoDashboard from './BrawndoDemoDashboard';

const fs=require('fs'),path=require('path'),postcss=require('postcss');
const selectorParser=require('postcss-selector-parser');
const {selectorSpecificity,compare}=require('@csstools/selector-specificity');
jest.mock('@/lib/api',()=>({formatError:error=>error.message}));

// Authored paint/cascade checks do not establish browser layout or visual acceptance.
const files=['SemanticPresentation.css','../pages/GoverNaraPortfolio.css','PortfolioReports.css',
  'BrawndoCisVisual.css','BrawndoDemoDashboard.css','CisDashboardConcept.css','CisDomainProfile.css','CisVendorsConcept.css'];
const sheets=Object.fromEntries(files.map(file=>[file,postcss.parse(fs.readFileSync(path.join(__dirname,file),'utf8'))]));
const specificityCache=new Map();
function specificity(selector){
  if(!specificityCache.has(selector))specificityCache.set(selector,selectorSpecificity(selectorParser().astSync(selector).nodes[0]));
  return specificityCache.get(selector);
}
function authoredValue(node,property,selectedFiles=files,depth=0){
  if(!node||depth>20)return undefined;
  let chosen;
  for(const file of selectedFiles)sheets[file].walkRules(rule=>{
    if(rule.parent.type==='atrule')return;
    const declarations=rule.nodes.filter(node=>node.type==='decl'&&node.prop===property);
    if(!declarations.length)return;
    for(const selector of rule.selectors){
      if(selector.includes('::'))continue;
      let matches=false;
      try{matches=node.matches(selector);}catch{return;}
      if(!matches)continue;
      const weight=specificity(selector);
      for(const declaration of declarations){
        const important=Number(!!declaration.important);
        if(!chosen||important>chosen.important||important===chosen.important&&compare(weight,chosen.weight)>=0)
          chosen={value:declaration.value,weight,important};
      }
    }
  });
  if(!chosen&&(property.startsWith('--')||property==='color'))return authoredValue(node.parentElement,property,selectedFiles,depth+1);
  const value=chosen?.value,variable=value?.match(/^var\((--[\w-]+)(?:,\s*(.*))?\)$/);
  return variable?authoredValue(node,variable[1],selectedFiles,depth+1)??variable[2]:value;
}

let fixture,originalHtmlAttributes;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  originalHtmlAttributes=[...document.documentElement.attributes].map(attribute=>[attribute.name,attribute.value]);
  fixture=document.createElement('div');document.body.appendChild(fixture);
});
afterEach(()=>{
  fixture.remove();localStorage.clear();
  for(const attribute of [...document.documentElement.attributes])document.documentElement.removeAttribute(attribute.name);
  for(const [name,value] of originalHtmlAttributes)document.documentElement.setAttribute(name,value);
});

test.each(['light','dark'])('equivalent %s implementation fills agree across actual Portfolio, history, program and CIS snapshot',theme=>{
  document.documentElement.dataset.brawndoPortal=theme;
  document.documentElement.dataset.brawndoCisVisual='true';
  document.documentElement.dataset.brawndoCisTheme=theme;
  fixture.innerHTML=`
    <section class="governara-portfolio" data-theme="${theme}"><div class="gp-statusbar">${['implemented','partial','not','unassessed'].map(role=>`<i class="is-${role}"></i>`).join('')}</div></section>
    <section class="portfolio-history-dialog">${['implemented','partial','not','unassessed'].map(role=>`<i class="is-${role}"></i>`).join('')}</section>
    <section class="brawndo-demo-program">${['implemented','partial','not','unassessed'].map(role=>`<i class="is-${role}"></i>`).join('')}</section>
    <section class="brawndo-demo-dashboard" data-theme="${theme}" data-cis-dashboard-concept="true"><div class="cis-dashboard-concept-presentation"><section class="brawndo-demo-program" data-concept="true">${['implemented','partial','not','unassessed'].map(role=>`<i class="is-${role}"></i>`).join('')}</section></div></section>
    <section class="ui-popover cdp-domain-tip cdp-concept-tip cis-dashboard-concept-portal" data-theme="${theme}">${['success','moderate','critical','neutral'].map(role=>`<i class="cis-fill-${role}"></i>`).join('')}</section>
    <section class="brawndo-cis-visual">${['impl','part','not','none'].map(role=>`<i class="s-${role}"></i>`).join('')}</section>`;
  const expected=['#168566','#dcb13e','#d95e7d',theme==='dark'?'#607088':'#d2dae5'];
  for(const selector of ['.gp-statusbar','.portfolio-history-dialog','.brawndo-demo-program','.cis-dashboard-concept-presentation .brawndo-demo-program','.cdp-domain-tip','.brawndo-cis-visual'])
    expect([...fixture.querySelector(selector).children].map(node=>authoredValue(node,'background'))).toEqual(expected);
  expect(new Set(expected).size).toBe(4);
});

test.each([false,true].flatMap(concept=>['light','dark'].map(theme=>[concept,theme])))('current chart flag retains the approved contrasting foreground with concept=%s, theme=%s',(concept,theme)=>{
  document.documentElement.dataset.brawndoPortal=theme;
  fixture.innerHTML=`<section class="brawndo-demo-dashboard" data-theme="${theme}" data-cis-dashboard-concept="${concept}"><div class="${concept?'cis-dashboard-concept-presentation':''}"><section class="brawndo-demo-program" data-concept="${concept}"><svg class="ph-chart"><text class="ph-current-flag-label">73%</text></svg></section></div></section>`;
  const label=fixture.querySelector('.ph-current-flag-label');
  expect(authoredValue(label,'fill')).toMatch(/^#(?:fff|ffffff)$/i);
  expect(authoredValue(label,'--chart-implemented')).toBe('#168566');
  expect(label.textContent).toBe('73%');
});

test('implementation tokens are passive and scoped, preserving native assessment and severity meanings',()=>{
  sheets['SemanticPresentation.css'].walkRules(rule=>{
    expect(rule.selectors).not.toContain(':root');
    expect(rule.selector).not.toMatch(/pill-|cis-tone-|framework-presentation|\.bcis(?:\W|$)/);
    rule.walkDecls(declaration=>expect(declaration.prop).toMatch(/^--implementation-/));
  });
  fixture.innerHTML='<section class="framework-presentation"><span class="cis-pill cis-tone-moderate">Native readiness</span><span class="pill-accepted">Accepted</span></section>';
  expect(authoredValue(fixture.querySelector('.cis-pill'),'--implementation-implemented-fill',['SemanticPresentation.css'])).toBeUndefined();
  expect(fixture.textContent).toBe('Native readinessAccepted');
});

test.each(['light','dark'])('%s overdue Dashboard summary, priority text and Vendor KPI/badge share the existing deadline pair',theme=>{
  fixture.innerHTML=`<section class="brawndo-demo-dashboard" data-theme="${theme}" data-cis-dashboard-concept="true"><section class="bdd-summary"><strong class="bdd-late">1</strong></section><section class="bdd-table-scroll"><table><tbody><tr class="bdd-overdue-row"><td class="bdd-cell-due"><small class="bdd-late">1 day overdue</small></td></tr><tr><td><small class="bdd-today">Due today</small></td></tr></tbody></table></section></section>
    <section class="cv-page" data-theme="${theme}"><div class="cv-kpi has-overdue"><strong>1</strong></div><span class="cv-due cv-overdue">1 day overdue</span></section>`;
  const foreground=theme==='dark'?'#f7a7b7':'#ad2e45',background=theme==='dark'?'#402936':'#fff1f4';
  for(const selector of ['.bdd-summary .bdd-late','.bdd-cell-due .bdd-late','.cv-kpi strong','.cv-due'])
    expect(authoredValue(fixture.querySelector(selector),'color')).toBe(foreground);
  expect(authoredValue(fixture.querySelector('.cv-due'),'background')).toBe(background);
  expect(authoredValue(fixture.querySelector('.bdd-overdue-row'),'--bdd-overdue-bg')).toBe(background);
  expect(authoredValue(fixture.querySelector('.bdd-today'),'color')).toBe(theme==='dark'?'#b9d1ff':'#1459dc');
});

test.each([false,true])('deadline classes preserve queue dates, counts, text and native opening with concept=%s',async concept=>{
  const dueDates=['2026-10-28','2026-10-29','2026-10-30','2026-11-05','2026-11-13','2026-11-28','2026-12-08',null];
  const rows=dueDates.map((due_date,index)=>({key:`tasks:qa-${index}`,id:`qa-${index}`,kind:'tasks',title:`QA native Action ${index}`,type:'Action Item',owner:'Fictional Reviewer',status:'in_progress',due_date}));
  const original=JSON.parse(JSON.stringify(rows));
  const queue={as_of:'2026-10-29',groups:{all:{total:8},pastDue:{total:1},due30:{total:5},unassigned:{total:0}}};
  const onOpen=jest.fn(),root=createRoot(fixture);
  try{
    await act(async()=>root.render(<BrawndoDemoDashboard concept={concept} queue={queue} client={{client_id:'synthetic-new-client',name:'QA newly enrolled client'}} programs={[]} filter="all" onFilter={jest.fn()} onOpen={onOpen} loadDetail={async(key,offset,signal,{limit})=>({items:rows.slice(offset,offset+limit),offset,limit,total:rows.length,has_more:offset+limit<rows.length})}/>));
    const tableRows=[...fixture.querySelectorAll('tbody tr')],byTitle=new Map(tableRows.map(row=>[row.querySelector('.bdd-item').textContent,row]));
    expect(tableRows).toHaveLength(8);
    expect([...fixture.querySelectorAll('.bdd-summary strong')].map(node=>node.textContent)).toEqual(['8','1','5','0']);
    const relative=['1 day overdue','Due today','In 1 day','In 7 days','In 15 days','In 30 days','In 40 days','No known due date'];
    for(let index=0;index<rows.length;index++){
      const row=byTitle.get(rows[index].title),due=row.querySelector('.bdd-cell-due');
      expect(due.querySelector('time').getAttribute('datetime')).toBe(dueDates[index]);
      expect(due.querySelector('small').textContent).toBe(relative[index]);
      expect(row.classList.contains('bdd-overdue-row')).toBe(index===0);
      expect(due.querySelector('small').classList.contains('bdd-late')).toBe(index===0);
      expect(due.querySelector('small').classList.contains('bdd-today')).toBe(index===1);
      expect(due.querySelectorAll('svg')).toHaveLength(index<=1?1:0);
    }
    const nativeRow=byTitle.get(rows[0].title),openButton=nativeRow.querySelector('.bdd-item');
    await act(async()=>openButton.click());
    expect(onOpen).toHaveBeenCalledTimes(1);expect(onOpen).toHaveBeenLastCalledWith(rows[0],openButton);
    await act(async()=>nativeRow.click());
    expect(onOpen).toHaveBeenCalledTimes(2);expect(onOpen).toHaveBeenLastCalledWith(rows[0],openButton);
    expect(rows).toEqual(original);
  }finally{await act(async()=>root.unmount());}
});
