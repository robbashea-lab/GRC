import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import fs from 'fs';
import path from 'path';
import ClientIdentityMark, {demoClientLogoSource} from './ClientIdentityMark';
import {ClientMark} from './EnhancedPortfolioShared';

let mockAuth, mockOrg, root, container;
jest.mock('@/context/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('@/context/OrgContext',()=>({useOrg:()=>mockOrg}));
jest.mock('@/lib/api',()=>({PREVIEW_MODE:true}));

const ids=['demo_brawndo','demo_initech','demo_krusty_krab','demo_dunder','demo_prestige'];
const names=['Brawndo','Initech','The Krusty Krab','Dunder Mifflin','Prestige Worldwide'];
const clients=ids.map((client_id,index)=>({client_id,name:names[index],environment:'Demo'}));
const context=client=>({client,trustedDemo:true,workspaceMode:'demo',user:{user_id:'demo_operator',role:'platform_admin',workspace_mode:'demo'},clients});

beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  mockAuth={workspaceMode:'demo',user:{user_id:'demo_operator',role:'platform_admin',workspace_mode:'demo'}};
  mockOrg={clients};
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test.each(clients)('the authorized $client_id mark is shared by Portfolio and client context without changing the avatar wrapper',async client=>{
  await act(async()=>root.render(<><ClientMark client={client}/><span className="bsb-client-mark" aria-hidden="true"><ClientIdentityMark client={client}/></span></>));
  expect(container.querySelector('.ep-avatar').getAttribute('aria-hidden')).toBe('true');
  const portfolio=container.querySelector('.ep-avatar'), selector=container.querySelector('.bsb-client-mark');
  if(client.client_id==='demo_brawndo'){
    expect(portfolio.querySelector('path').getAttribute('d')).toBe('M23.5 5 11 22.5h8.2L15.8 35 29 16.6h-8.4L23.5 5z');
    expect(selector.querySelector('path').outerHTML).toBe(portfolio.querySelector('path').outerHTML);
    expect(portfolio.querySelector('svg').getAttribute('viewBox')).toBe('0 0 40 40');
  }else{
    expect(selector.querySelector('img').getAttribute('src')).toBe(portfolio.querySelector('img').getAttribute('src'));
    expect(selector.querySelector('img').getAttribute('alt')).toBe('');
    expect(selector.querySelector('img').style.objectFit).toBe('contain');
  }
});

test.each([
  ['untrusted adapter',{trustedDemo:false}],['standard mode',{workspaceMode:'standard'}],
  ['standard user',{user:{user_id:'operator',role:'platform_admin',workspace_mode:'standard'}}],
  ['no authenticated identity',{user:null}],['outside authorized cohort',{clients:[]}],
  ['loading identity',{loading:true}],['failed identity',{error:'unavailable'}],
  ['genuine customer',{client:{client_id:'demo_initech',name:'Initech',environment:'Production'}}],
  ['name lookalike',{client:{client_id:'genuine-customer',name:'Initech',environment:'Demo'}}],
  ['prototype key',{client:{client_id:'constructor',name:'Initech',environment:'Demo'},clients:[{client_id:'constructor',environment:'Demo'}]}],
])('%s cannot receive a fictional entertainment logo',(_label,change)=>{
  expect(demoClientLogoSource({...context(clients[1]),...change})).toBeNull();
});

test('a failed local image falls back to the existing initial; a later client can load its own image',async()=>{
  await act(async()=>root.render(<ClientIdentityMark client={clients[1]}/>));
  await act(async()=>container.querySelector('img').dispatchEvent(new Event('error')));
  expect(container.querySelector('img')).toBeNull();expect(container.textContent).toBe('I');
  await act(async()=>root.render(<ClientIdentityMark client={clients[2]}/>));
  expect(container.querySelector('img').getAttribute('src')).toBe('/client-logos/krusty-krab.svg');
  mockAuth={workspaceMode:'standard',user:{user_id:'operator',workspace_mode:'standard',role:'platform_admin'}};
  await act(async()=>root.render(<ClientIdentityMark client={clients[2]}/>));
  expect(container.querySelector('img')).toBeNull();expect(container.textContent).toBe('T');
});

test('blank identity preserves each native caller fallback',async()=>{
  await act(async()=>root.render(<ClientIdentityMark client={null} fallback="•"/>));expect(container.textContent).toBe('•');
  await act(async()=>root.render(<ClientIdentityMark client={null}/>));expect(container.textContent).toBe('—');
});

test.each(clients.slice(1))('local $client_id SVG has no active content or external resource dependency',client=>{
  const source=demoClientLogoSource(context(client));
  const xml=fs.readFileSync(path.join(__dirname,'../../public',source),'utf8');
  const svg=new DOMParser().parseFromString(xml,'image/svg+xml');
  expect(svg.querySelector('parsererror')).toBeNull();
  expect(svg.documentElement.getAttribute('viewBox')).toBe('0 0 120 120');
  for(const node of svg.querySelectorAll('*')){
    expect(['svg','rect','g','path','text','circle']).toContain(node.localName);
    for(const attr of node.attributes){
      expect(attr.name).not.toMatch(/^on|^(?:.*:)?href$|^src$|^style$/i);
      if(attr.name!=='xmlns')expect(attr.value).not.toMatch(/https?:|url\(|javascript:/i);
    }
  }
});
