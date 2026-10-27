import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoDemoProgram from './BrawndoDemoProgram';
import BrawndoDemoDashboard from './BrawndoDemoDashboard';
import {frameworkDashboardFixture} from '@/testUtils/frameworkDashboard';
import {frameworkDashboardPrograms} from '@/lib/frameworkDashboard';
import {buildFrameworkDomainProfile} from '@/lib/frameworkDomainProfile';
import {scopeNote} from './PortfolioReports';
import api from '@/lib/api';

const mockNavigate=jest.fn();
jest.mock('react-router-dom',()=>({useNavigate:()=>mockNavigate,Link:({to,children,...props})=><a href={to} {...props}>{children}</a>}));
jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn()},formatError:error=>error.message}));
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);api.get.mockReset();mockNavigate.mockReset();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

function fixtureProgram(fixture){
  const {client,source}=fixture,key=source.framework.key;
  return frameworkDashboardPrograms([{id:client.client_id+':'+key,key,label:source.framework.label,implementation_position:source.implementation_position}],{[key]:source},client.client_id)[0];
}
function history(program){return {client_id:program.client_id,program_key:program.program_key,current:program.current,as_of:'2026-10-26T12:00:00Z',
  snapshots:[{...program.current,snapshot_id:'native-position'}],forecast_snapshots:[],scope_changes:[],forecast_scope_changes:[]};}

test.each(['iso-27001','soc-2'])('%s uses current cards, exact domain/table/hover/history and native status destinations',async framework=>{
  const fixture=frameworkDashboardFixture(framework),program=fixtureProgram(fixture),before=JSON.stringify(fixture.db);
  api.get.mockImplementation(async path=>({data:path==='/risks'?[]:history(program)}));
  await act(async()=>root.render(<BrawndoDemoProgram client={fixture.client} program={program} domainSource={fixture.source} cisDashboardProfile concept/>));
  expect(host.querySelector('.ph-concept-status')).not.toBeNull();
  expect(host.querySelector('.cdp-concept')).not.toBeNull();
  const model=buildFrameworkDomainProfile(fixture.source,{clientId:fixture.client.client_id,frameworkKey:framework});
  const rows=[...host.querySelectorAll('.cdp-table-wrap tbody tr')];
  expect(rows).toHaveLength(model.domains.length);
  expect(host.querySelectorAll('.cdp-concept-axis-label')).toHaveLength(model.domains.length);
  for(const [index,domain] of model.domains.entries()){
    expect([...rows[index].querySelectorAll('td')].map(node=>node.textContent)).toEqual([String(domain.implemented),String(domain.applicable),domain.rate.toFixed(1)+'%']);
  }
  expect(host.querySelector('.ph-breakdown-head').textContent).toContain(program.unit_label);
  expect(host.querySelector('.ph-current-value').textContent).toContain(framework==='soc-2'?'Current readiness':'Current implementation');
  const first=host.querySelector('.cdp-domain-name');
  await act(async()=>first.click());
  const popup=document.querySelector('.cdp-concept-tip');
  expect(popup.textContent).toContain(model.domains[0].name);
  expect(popup.querySelectorAll('dl div')).toHaveLength(4);
  expect([...popup.querySelectorAll('dl dt')].map(node=>node.textContent)).toEqual(framework==='iso-27001'
    ? ['Implemented','Partially Implemented','Not Implemented / Needs Validation','Not Assessed']
    : ['Addressed (Readiness)','Partially Addressed','Needs Remediation / Validation','Not Assessed']);
  expect([...popup.querySelectorAll('dl dd')].map(node=>node.textContent)).toEqual(
    ['addressed','in_progress','needs_attention','not_assessed'].map(key=>String(model.domains[0].counts[key])));
  expect(popup.textContent).not.toContain('safeguard');
  await act(async()=>first.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  for(const [index,status] of ['addressed','in_progress','needs_attention','not_assessed'].entries()){
    await act(async()=>host.querySelectorAll('.ph-breakdown-row')[index].click());
    const target=new URL(mockNavigate.mock.calls.at(-1)[0],'https://local.invalid');
    expect(target.pathname).toBe('/compliance/'+framework);expect(target.searchParams.get('client_id')).toBe(fixture.client.client_id);
    expect(target.searchParams.get('view')).toBe(status);
    expect(target.searchParams.get('dashboard')).toBe(framework==='iso-27001'?'1':null);
  }
  await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='View data').click());
  expect(host.querySelectorAll('#portfolio-history-data tbody tr')).toHaveLength(1);
  expect(api.get.mock.calls.find(([path])=>path==='/portfolio/reporting/history')[1].params).not.toHaveProperty('demo_scenario');
  expect(JSON.stringify(fixture.db)).toBe(before);
});

test('native mixed-framework tabs preserve a client-wide Priority work queue and never average positions',async()=>{
  const fixtures=['iso-27001','soc-2'].map(key=>frameworkDashboardFixture(key)),programs=fixtures.map(fixtureProgram),onProgramSelect=jest.fn();
  const queue={as_of:'2026-10-26',groups:Object.fromEntries(['all','pastDue','due30','unassigned'].map(key=>[key,{total:0,items:[]}]))};
  await act(async()=>root.render(<BrawndoDemoDashboard client={fixtures[0].client} queue={queue} programs={[]} concept
    filter="all" onFilter={jest.fn()} onOpen={jest.fn()} loadDetail={async()=>({items:[],total:0,offset:0,limit:25,has_more:false})}
    programOptions={programs} selectedProgram={programs[0]} onProgramSelect={onProgramSelect}><div>Native selected program</div></BrawndoDemoDashboard>));
  const tabs=host.querySelector('[role=tablist][aria-label="Client frameworks"]');
  expect(tabs.querySelectorAll('[role=tab]')).toHaveLength(2);
  await act(async()=>tabs.querySelectorAll('[role=tab]')[1].dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
  expect(onProgramSelect).toHaveBeenCalledWith('soc-2');
  expect(host.querySelector('.bdd-heading p').textContent).toContain('ISO 27001 program');
  expect(host.querySelector('#bdd-work-heading').textContent).toBe('Priority work');
});

test('same-program history rejects changed native SOC scope rather than displaying another category population',async()=>{
  const fixture=frameworkDashboardFixture('soc-2'),program=fixtureProgram(fixture);
  const result=history(program);
  result.current={...result.current,scope:{...result.current.scope,configuration:{categories:['security']}}};
  api.get.mockImplementation(async path=>({data:path==='/risks'?[]:result}));
  await act(async()=>root.render(<BrawndoDemoProgram client={fixture.client} program={program} domainSource={fixture.source} cisDashboardProfile concept/>));
  expect(host.querySelector('.ph-chart-card [role=alert]').textContent).toContain('scope changed');
  expect(host.querySelector('.ph-chart-card svg')).toBeNull();
});

test.each(['iso-27001','soc-2'])('%s rejects a newer same-scope assessment state instead of mixing status/history with old domains',async framework=>{
  const fixture=frameworkDashboardFixture(framework),program=fixtureProgram(fixture),selectedCurrent=program.current;
  fixture.source.assessments[0].status='needs_attention';fixture.refresh();
  const result=history({...program,current:fixture.source.implementation_position});
  expect(result.current.scope_signature).toBe(selectedCurrent.scope_signature);
  expect(result.current.status_signature).not.toBe(selectedCurrent.status_signature);
  const originalSource={...fixture.source,implementation_position:selectedCurrent,assessments:fixture.source.assessments.map((row,index)=>index?row:{...row,status:'addressed'})};
  api.get.mockImplementation(async path=>({data:path==='/risks'?[]:result}));
  await act(async()=>root.render(<BrawndoDemoProgram client={fixture.client} program={program} domainSource={originalSource} cisDashboardProfile concept/>));
  expect(host.querySelector('.ph-chart-card [role=alert]').textContent).toContain('assessment state changed');
  expect(host.querySelector('.ph-chart-card svg')).toBeNull();
  expect(host.querySelector('.ph-current-value p').textContent).toContain(String(selectedCurrent.implemented)+' of');
  expect(host.querySelector('.cdp-table-wrap tbody')).not.toBeNull();
});

test('missing native source identity is reported as unavailable rather than an invented concurrent change',async()=>{
  const fixture=frameworkDashboardFixture('soc-2'),program=fixtureProgram(fixture),result=history(program);
  result.current={...result.current,source_revision:null};
  api.get.mockImplementation(async path=>({data:path==='/risks'?[]:result}));
  await act(async()=>root.render(<BrawndoDemoProgram client={fixture.client} program={program} domainSource={fixture.source} cisDashboardProfile concept/>));
  expect(host.querySelector('.ph-chart-card [role=alert]').textContent).toContain('state identity is unavailable');
  expect(host.querySelector('.ph-chart-card svg')).toBeNull();
});

test('an unavailable native framework card never falls back to a CIS program label',async()=>{
  const queue={as_of:'2026-10-26',groups:Object.fromEntries(['all','pastDue','due30','unassigned'].map(key=>[key,{total:0,items:[]}]))};
  await act(async()=>root.render(<BrawndoDemoDashboard client={{client_id:'synthetic',name:'Synthetic'}} queue={queue} programs={[{key:'iso-27001',label:'ISO 27001'}]}
    filter="all" onFilter={jest.fn()} loadDetail={async()=>({items:[],total:0,offset:0,limit:25,has_more:false})}/>));
  expect(host.querySelector('.bdd-heading p').textContent).toContain('ISO 27001 program');
  expect(host.querySelector('.bdd-heading p').textContent).not.toContain('CIS');
});

test('SOC scope-change explanations retain readiness and validation meanings',()=>{
  const note=scopeNote({before:{denominator:33,implemented:20},after:{denominator:38,implemented:20},membership_known:true,added_ids:['A1.1'],
    status_changes_known:true,status_changes:[{definition_id:'CC1.1',before_status:'needs_attention',after_status:'in_progress'}]},'criteria',true,
    {verb:'addressed',statusLabels:{needs_attention:'Needs Remediation / Validation',in_progress:'Partially Addressed'}});
  expect(note).toContain('Addressed share');expect(note).toContain('The addressed count is unchanged; the applicable denominator changed.');
  expect(note).toContain('Needs Remediation / Validation → Partially Addressed');expect(note).not.toContain('Not Implemented');
});
