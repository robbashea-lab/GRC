import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'fs';
import {join} from 'path';
import {createHash} from 'crypto';
import Brand,{BrandMark} from './Brand';

test('shared branding uses the exact approved feather without changing navigation or adding scenic decoration',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div'),root=createRoot(container);
  try{
    await act(async()=>root.render(<><Brand/><BrandMark className="bwp-mark"/><BrandMark className="bsb-mark"/></>));
    expect(container.querySelector('.brand-lockup').getAttribute('aria-label')).toBe('GoverNara by Prestige Worldwide');
    expect(container.querySelector('.brand-name').textContent).toBe('GoverNara');
    expect(container.querySelector('.brand-owner').textContent).toBe('BY PRESTIGE WORLDWIDE');
    expect(container.querySelectorAll('.governara-feather')).toHaveLength(3);
    for(const mark of container.querySelectorAll('img')){expect(mark.alt).toBe('');expect(mark.getAttribute('aria-hidden')).toBe('true');expect(mark.getAttribute('draggable')).toBe('false');}
    expect(container.querySelector('button,a')).toBeNull();
    expect(createHash('sha256').update(readFileSync(join(__dirname,'../assets/governara-feather.svg'))).digest('hex')).toBe('95f717f5b69f47e45b5c7ec7458f470eb97a511682f81740aff43ae4a76d8250');
  }finally{await act(async()=>root.unmount());}
});
