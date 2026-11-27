import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import postcss from 'postcss';
import OmniCharacter from './OmniCharacter';

jest.mock('@/assets/nara-owl.webp',()=>'/test/nara-owl.webp');
jest.mock('@/assets/nara-avatar.webp',()=>'/test/nara-avatar.webp');

let container,root;
beforeEach(()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});

test.each([false,true])('approved=%s retains every state, the existing footprint and decorative pointer contract',async approved=>{
  for(const state of ['idle','helpful','thinking','gap','verification','complete','applied','minimized']){
    await act(async()=>root.render(<OmniCharacter state={state} approved={approved} trackPointer/>));
    const svg=container.querySelector('svg');
    expect(svg.classList.contains('omni-character')).toBe(true);
    expect(svg.classList.contains('omni-'+state)).toBe(true);
    expect(svg.classList.contains('omni-approved')).toBe(approved);
    expect(svg.getAttribute('viewBox')).toBe(approved?'0 0 284 260':'0 0 80 80');
    expect(svg.getAttribute('aria-hidden')).toBe('true');expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.style.width).toBe('');expect(svg.style.height).toBe('');
    const full=svg.querySelector('.omni-nara-full'),avatar=svg.querySelector('.omni-nara-avatar');
    expect(full.getAttribute('href')).toBe('/test/nara-owl.webp');expect(avatar.getAttribute('href')).toBe('/test/nara-avatar.webp');
    for(const image of [full,avatar]){
      expect(image.getAttribute('width')).toBe(approved?'284':'80');expect(image.getAttribute('height')).toBe(approved?'260':'80');
      expect(image.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');expect(image.getAttribute('pointer-events')).toBe('none');
    }
    expect(svg.querySelector('defs,circle,ellipse,filter,clipPath,.omni-eye-attention,.omni-eyes,.omni-approved-eyes,.omni-ring-base,.omni-segments')).toBeNull();
    const original=svg.innerHTML;
    await act(async()=>svg.dispatchEvent(new MouseEvent('pointermove',{clientX:900,clientY:900,bubbles:true})));
    await act(async()=>svg.dispatchEvent(new MouseEvent('pointerleave',{bubbles:true})));
    expect(svg.innerHTML).toBe(original);
    await act(async()=>root.render(<OmniCharacter state={state} approved={approved} trackPointer={false}/>));
    expect(svg.innerHTML).toBe(original);
    const marker=svg.querySelector('text');
    expect(Boolean(marker)).toBe(state==='verification');
    if(marker){expect(marker.textContent).toBe('?');expect(marker.getAttribute('x')).toBe(approved?'238':'61');expect(marker.getAttribute('y')).toBe(approved?'45':'24');}
    expect(svg.querySelectorAll('path')).toHaveLength(!approved&&['complete','applied'].includes(state)?1:0);
  }
});

test('artwork remains inside the existing interactive wrapper and never absorbs its click',async()=>{
  const click=jest.fn();
  await act(async()=>root.render(<button type="button" aria-label="Existing Omni launcher" onClick={click}><OmniCharacter approved/></button>));
  await act(async()=>container.querySelector('svg').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(click).toHaveBeenCalledTimes(1);
  expect(container.querySelector('button').getAttribute('aria-label')).toBe('Existing Omni launcher');
  expect(container.querySelector('svg').hasAttribute('tabindex')).toBe(false);
});

test.each([
  ['nara-avatar.webp',22624,256,256,'a606dd5b97d043916b828c4fe95b0a79bd87f08381d117ab68ae047cebab3ea0'],
  ['nara-owl.webp',58436,487,594,'fe5cf0ca7b7dea66a4e19a6ab81e8e792d593150712bf5fca528ebd6871727f3'],
])('%s is the exact alpha-bearing approved WebP, without recutting or re-encoding', (name,length,width,height,hash)=>{
  const bytes=readFileSync(join(__dirname,'../assets',name));
  expect(bytes.length).toBe(length);expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
  expect(bytes.toString('ascii',0,4)).toBe('RIFF');expect(bytes.toString('ascii',8,12)).toBe('WEBP');expect(bytes.toString('ascii',12,16)).toBe('VP8X');
  expect(bytes[20]&0x10).toBe(0x10);
  expect(bytes.readUIntLE(24,3)+1).toBe(width);expect(bytes.readUIntLE(27,3)+1).toBe(height);
});

test('only the existing header context selects the compact avatar; no layout or motion is introduced',()=>{
  const css=postcss.parse(readFileSync(join(__dirname,'OmniCharacter.css'),'utf8'));
  expect(css.nodes).toHaveLength(3);
  css.walkRules(rule=>{
    expect(rule.selector).toMatch(/\.omni-character\.omni-nara \.omni-nara-(?:avatar|full)$/);
    expect(rule.nodes).toHaveLength(1);expect(rule.nodes[0].prop).toBe('display');
  });
  expect(css.nodes[0].selector).toBe('.omni-character.omni-nara .omni-nara-avatar');expect(css.nodes[0].nodes[0].value).toBe('none');
  expect(css.nodes[1].selector).toBe('.omni-panel-header .omni-character.omni-nara .omni-nara-full');expect(css.nodes[1].nodes[0].value).toBe('none');
  expect(css.nodes[2].selector).toBe('.omni-panel-header .omni-character.omni-nara .omni-nara-avatar');expect(css.nodes[2].nodes[0].value).toBe('block');
});
