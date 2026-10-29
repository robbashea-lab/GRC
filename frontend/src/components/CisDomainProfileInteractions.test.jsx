import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CisDomainProfile from './CisDomainProfile';
import {cisWorkspace} from '@/testUtils/cisExperience';
import {cisSecurityDomainMapping} from '@/lib/brawndoSecurityDomains';
import api from '@/lib/api';

jest.mock('@/lib/api',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn(),patch:jest.fn(),delete:jest.fn()}}));

const SEED=20261029;
const ROUNDS=40;
const LABELS={addressed:'Implemented',in_progress:'Partially implemented',needs_attention:'Not implemented',not_assessed:'Not assessed'};
const INPUTS=new Set(['pointerover','pointerout','focusin','focusout','keydown','click']);

// Same small deterministic generator as the existing lifecycle scenario. It only
// chooses read-only domain triggers; no application timing or browser rate is measured.
function mulberry32(seed){
  return()=>{
    seed|=0;seed=seed+0x6D2B79F5|0;
    let value=Math.imul(seed^seed>>>15,1|seed);
    value=value+Math.imul(value^value>>>7,61|value)^value;
    return((value^value>>>14)>>>0)/4294967296;
  };
}

function fixture(clientId,group,offset,theme){
  const source=cisWorkspace(clientId,group),statuses=Object.keys(LABELS);
  source.assessments.forEach((row,index)=>{row.status=statuses[(index+offset)%statuses.length];});
  source.implementation_position.implemented=source.assessments.filter(row=>row.status==='addressed').length;
  source.implementation_position.counts.forEach(row=>{row.count=source.assessments.filter(record=>record.status===row.key).length;});
  const domains=cisSecurityDomainMapping(group).map(domain=>{
    const members=source.assessments.filter(row=>domain.safeguardIds.includes(row.definition_id));
    const counts=Object.fromEntries(Object.keys(LABELS).map(key=>[key,members.filter(row=>row.status===key).length]));
    return{...domain,counts,implemented:counts.addressed,applicable:members.length,rate:`${(counts.addressed/members.length*100).toFixed(1)}%`};
  });
  return{clientId,group,theme,source,domains,before:JSON.stringify(source)};
}

let host,root,outside,originalMedia,activeListeners,queryCount;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  jest.useFakeTimers();jest.clearAllMocks();
  originalMedia=Object.getOwnPropertyDescriptor(window,'matchMedia');
  activeListeners=new Set();queryCount=0;
  Object.defineProperty(window,'matchMedia',{configurable:true,value:jest.fn(()=>{
    queryCount++;
    return{matches:false,addEventListener:(type,callback)=>{
      expect(type).toBe('change');activeListeners.add(callback);
    },removeEventListener:(type,callback)=>{
      expect(type).toBe('change');expect(activeListeners.delete(callback)).toBe(true);
    }};
  })});
  host=document.createElement('div');outside=document.createElement('button');
  outside.textContent='Outside synthetic domain fixture';
  document.body.append(host,outside);root=createRoot(host);
});
afterEach(async()=>{
  try{
    if(root)await act(async()=>root.unmount());
    await act(async()=>jest.runOnlyPendingTimers());
  }finally{
    host.remove();outside.remove();
    if(originalMedia)Object.defineProperty(window,'matchMedia',originalMedia);
    else delete window.matchMedia;
    jest.useRealTimers();jest.clearAllMocks();
  }
});

test('cleanup diagnostics distinguish async act microtasks from actual pending timers',async()=>{
  await act(async()=>jest.advanceTimersByTime(0));
  expect(jest.getTimerCount()).toBe(1);
  jest.runAllTicks();
  expect(jest.getTimerCount()).toBe(0);
  const fired=jest.fn(),timer=setTimeout(fired,1000);
  jest.runAllTicks();
  expect(jest.getTimerCount()).toBe(1);
  expect(fired).not.toHaveBeenCalled();
  clearTimeout(timer);
});

test('seed 20261029: 252 safe DOM inputs preserve domain identity, counts, pinning and cleanup',async()=>{
  // Real component, model and Radix popovers. Focus/pointer/key inputs below are
  // synthetic DOM dispatches, not real browser input, native focus traversal or a
  // 1,000-interaction/30-second, sustained-use or responsiveness qualification.
  const profiles=[fixture('synthetic-interaction-a',1,0,'light'),fixture('synthetic-interaction-b',3,2,'dark')];
  const random=mulberry32(SEED),actions=[],contexts=[];
  let current=0,round=0,viewClientId;
  const popup=()=>document.querySelector('.cdp-domain-tip');
  const settle=async()=>{
    // Existing hover-close delay is 160ms. This advances simulated timers only.
    await act(async()=>jest.advanceTimersByTime(200));
    await act(async()=>jest.advanceTimersByTime(0));
  };
  const noWrites=()=>{
    for(const method of ['get','post','put','patch','delete'])expect(api[method]).not.toHaveBeenCalled();
    for(const profile of profiles)expect(JSON.stringify(profile.source)).toBe(profile.before);
  };
  const invariant=()=>{
    expect(document.querySelectorAll('.cdp-domain-tip').length).toBeLessThanOrEqual(1);
    expect(document.querySelectorAll('.cdp-domain-tip[data-state="closed"]')).toHaveLength(0);
    expect(host.querySelectorAll('tbody tr.is-selected').length).toBeLessThanOrEqual(1);
    expect(host.querySelectorAll('.cdp-concept-point.is-selected').length).toBeLessThanOrEqual(1);
    expect(host.querySelectorAll('.cdp-concept-axis-label.is-selected').length).toBeLessThanOrEqual(1);
    expect(activeListeners.size).toBe(1);
    noWrites();
  };
  const closed=()=>{
    expect(popup()).toBeNull();
    expect(host.querySelectorAll('.is-selected')).toHaveLength(0);
    invariant();
  };
  const checkProfile=profile=>{
    expect(host.querySelector('.cdp-concept').dataset.theme).toBe(profile.theme);
    const rows=[...host.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(profile.domains.length);
    expect(host.querySelectorAll('.cdp-concept-point')).toHaveLength(profile.domains.length);
    for(const [index,domain]of profile.domains.entries()){
      expect(rows[index].querySelector('th').textContent).toBe(domain.label);
      expect([...rows[index].querySelectorAll('td')].map(cell=>cell.textContent))
        .toEqual([String(domain.implemented),String(domain.applicable),domain.rate]);
    }
  };
  const opened=(profile,domain)=>{
    invariant();
    const detail=popup();expect(detail).not.toBeNull();
    expect(detail.getAttribute('aria-label')).toBe(`${domain.label} implementation details`);
    expect(detail.dataset.theme).toBe(profile.theme);
    expect(detail.querySelector('h3').textContent).toBe(domain.label);
    expect(detail.querySelector('.cdp-tip-rate strong').textContent).toBe(domain.rate);
    expect(detail.querySelector('.cdp-tip-rate span').textContent).toBe(`${domain.implemented} implemented / ${domain.applicable} applicable`);
    expect([...detail.querySelectorAll('dl div')].map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]))
      .toEqual(Object.entries(LABELS).map(([key,label])=>[label,String(domain.counts[key])]));
    expect([...host.querySelectorAll('tbody tr.is-selected th')].map(node=>node.textContent)).toEqual([domain.label]);
    expect(host.querySelectorAll('.cdp-concept-point.is-selected')).toHaveLength(1);
    expect(host.querySelectorAll('.cdp-concept-axis-label.is-selected')).toHaveLength(1);
  };
  const render=async(profile,clientId=profile.clientId,group=profile.group)=>{
    viewClientId=clientId;
    contexts.push({clientId,group,source:profile.clientId});
    await act(async()=>root.render(<CisDomainProfile source={profile.source} clientId={clientId} implementationGroup={group} concept theme={profile.theme}/>));
    invariant();
  };
  const target=(domainIndex,kind)=>{
    const selector={table:'.cdp-domain-name',point:'.cdp-concept-point',axis:'.cdp-concept-axis-label'}[kind];
    const node=host.querySelectorAll(selector)[domainIndex];
    expect(node).toBeDefined();return node;
  };
  const dispatch=async(node,type,{relatedTarget=null,key}={})=>{
    expect(INPUTS.has(type)).toBe(true);expect(node).not.toBeNull();
    const entry={round,clientId:viewClientId,type,key:key||null,target:node.getAttribute?.('aria-label')||node.textContent?.slice(0,70)||node.nodeName};
    const event=type==='keydown'?new KeyboardEvent(type,{key,bubbles:true,cancelable:true}):type.startsWith('focus')
      ?new FocusEvent(type,{bubbles:true,relatedTarget}):new MouseEvent(type,{bubbles:true,cancelable:true,relatedTarget});
    await act(async()=>{node.dispatchEvent(event);actions.push(entry);});
    invariant();
  };
  const chooseKind=()=>['table','point','axis'][Math.floor(random()*3)];

  try{
    await render(profiles[current]);checkProfile(profiles[current]);closed();
    for(round=0;round<ROUNDS;round++){
      const profile=profiles[current],index=Math.floor(random()*profile.domains.length);
      const otherIndex=(index+1+Math.floor(random()*(profile.domains.length-1)))%profile.domains.length;
      const domain=profile.domains[index],otherDomain=profile.domains[otherIndex];
      const first=target(index,chooseKind()),second=target(otherIndex,chooseKind());
      switch(round%4){
        case 0:{
          await dispatch(first,'pointerover');opened(profile,domain);
          const detail=popup();
          await dispatch(first,'pointerout',{relatedTarget:detail});
          await dispatch(detail,'pointerover',{relatedTarget:first});await settle();opened(profile,domain);
          await dispatch(detail,'pointerout',{relatedTarget:outside});await settle();closed();
          await dispatch(first,'click');opened(profile,domain);
          await dispatch(first,'click');
          await dispatch(first,'pointerout',{relatedTarget:outside});await settle();closed();
          break;
        }
        case 1:
          await dispatch(first,'click');opened(profile,domain);
          await dispatch(first,'pointerout',{relatedTarget:outside});
          await dispatch(second,'pointerover');await settle();opened(profile,domain);
          await dispatch(second,'click');opened(profile,otherDomain);
          await dispatch(second,'click');
          await dispatch(second,'pointerout',{relatedTarget:outside});await settle();closed();
          break;
        case 2:
          await dispatch(first,'focusin');opened(profile,domain);
          await dispatch(first,'keydown',{key:'Escape'});closed();
          await dispatch(first,'focusout',{relatedTarget:outside});await settle();closed();
          await dispatch(second,'focusin');opened(profile,otherDomain);
          await dispatch(second,'keydown',{key:'Escape'});closed();
          await dispatch(second,'focusout',{relatedTarget:outside});await settle();closed();
          break;
        default:{
          await dispatch(first,'click');opened(profile,domain);
          await dispatch(first,'pointerout',{relatedTarget:outside});
          const replacement=profiles[1-current];
          await render(profile,replacement.clientId,replacement.group);
          expect(host.querySelector('[role="status"]').textContent).toContain('unavailable');
          expect(host.querySelectorAll('.cdp-domain-name,.cdp-concept-point,.cdp-concept-axis-label')).toHaveLength(0);
          closed();
          await dispatch(document,'keydown',{key:'Escape'});closed();
          current=1-current;await render(profiles[current]);checkProfile(profiles[current]);closed();
          const nextIndex=index%profiles[current].domains.length,next=target(nextIndex,chooseKind());
          await dispatch(next,'focusin');opened(profiles[current],profiles[current].domains[nextIndex]);
          await dispatch(next,'keydown',{key:'Escape'});closed();
          await dispatch(next,'focusout',{relatedTarget:outside});await settle();closed();
        }
      }
      checkProfile(profiles[current]);
    }
    expect(actions).toHaveLength(ROUNDS*6+ROUNDS/4);
    expect(new Set(actions.map(action=>action.type))).toEqual(INPUTS);
    expect(new Set(actions.map(action=>action.clientId))).toEqual(new Set(profiles.map(profile=>profile.clientId)));
    expect(contexts).toHaveLength(1+ROUNDS/4*2);
    expect(queryCount).toBe(1+ROUNDS/4);

    // The component remains usable after the sequence. Unmount with its native
    // hover timer pending, then require that the portal/listener/work all settle.
    const final=target(0,'table');
    await dispatch(final,'click');opened(profiles[current],profiles[current].domains[0]);
    await dispatch(final,'pointerout',{relatedTarget:outside});
    expect(actions).toHaveLength(252);
    await act(async()=>root.unmount());root=null;
    await settle();
    expect(document.querySelector('.cdp-domain-tip')).toBeNull();
    expect(activeListeners.size).toBe(0);
    // React 19 async act queues a fake microtask after awaiting it. Drain only
    // those jobs; any remaining component timeout/interval must still fail.
    jest.runAllTicks();
    expect(jest.getTimerCount()).toBe(0);
    noWrites();
  }catch(error){
    error.message+=`\nSynthetic DOM seed=${SEED}; completedDispatches=${actions.length}; round=${round}; recent=${JSON.stringify(actions.slice(-12))}; contexts=${JSON.stringify(contexts.slice(-3))}`;
    throw error;
  }
});
