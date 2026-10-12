import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {CIS_TONE,CisStatusPill,CisStatusBar,implementationTone} from './CisStatus';
import {operatorStatuses} from '@/lib/frameworkOperator';

test.each(['cis-ig1','soc-2','iso-27001','unsupported-framework'])('%s implementation tones preserve framework-specific meaning and labels',async framework=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div'),root=createRoot(host);
  const statuses=['addressed','in_progress','needs_attention','not_assessed','not_applicable'];
  try{
    await act(async()=>root.render(<>{statuses.map(status=><CisStatusPill key={status} status={status} framework={framework}/>)}</>));
    const pills=[...host.querySelectorAll('.cis-pill')];
    expect(pills.map(pill=>pill.textContent)).toEqual(statuses.map(status=>operatorStatuses(framework)[status]));
    expect(pills[2].className).toContain(framework==='cis-ig1'?'cis-tone-critical':'cis-tone-moderate');
    expect(pills[1].className).toContain('cis-tone-moderate');
    expect(pills[0].className).toContain('cis-tone-success');
    expect(pills[3].className).toContain('cis-tone-neutral');
    expect(pills[4].className).toContain('cis-tone-neutral');
    expect(CIS_TONE.needs_attention).toBe('moderate');
    expect(implementationTone('unknown',framework)).toBe('neutral');
  }finally{await act(async()=>root.unmount());}
});

test.each(['cis-ig1','soc-2','iso-27001'])('%s status bars change paint only and retain supplied proportions',async framework=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div'),root=createRoot(host);
  const counts={addressed:2,in_progress:1,needs_attention:1,not_assessed:0,not_applicable:0};
  try{
    await act(async()=>root.render(<CisStatusBar counts={counts} framework={framework}/>));
    const bars=[...host.querySelectorAll('.cis-bar > span')];
    expect(bars.map(bar=>bar.style.width)).toEqual(['50%','25%','25%']);
    expect(bars[2].className).toBe(framework==='cis-ig1'?'cis-fill-critical':'cis-fill-moderate');
    expect(counts).toEqual({addressed:2,in_progress:1,needs_attention:1,not_assessed:0,not_applicable:0});
  }finally{await act(async()=>root.unmount());}
});

test('the existing default CIS pill uses the same failing tone as explicit CIS',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const host=document.createElement('div'),root=createRoot(host);
  try{
    await act(async()=>root.render(<CisStatusPill status="needs_attention"/>));
    expect(host.querySelector('.cis-pill').className).toContain('cis-tone-critical');
    expect(host.textContent).toBe('Not Implemented');
  }finally{await act(async()=>root.unmount());}
});
