import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import DashboardAttention from './DashboardAttention';
jest.mock('react-router-dom',()=>({Link:({children,to,...p})=><a href={to} {...p}>{children}</a>}),{virtual:true});

test('attention tiles open their contributing records and CIS gaps deep-link to the derived view',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div'),root=createRoot(container),onShow=jest.fn();
  const posture={totals:{pastDue:4,due30:0,materialFindings:2,significantRisks:1},pastDue:[{key:'x'}],vendorHealth:[{key:'vendorReviewsPast',items:[],total:0},{key:'assurance',items:[{key:'v'}],total:1}]};
  await act(async()=>root.render(<DashboardAttention posture={posture} programs={[{key:'cis-ig1',assessment:{status_counts:{needs_attention:5,in_progress:11}}}]} onShow={onShow}/>));
  const tile=label=>[...container.querySelectorAll('button,a')].find(b=>b.getAttribute('aria-label').startsWith(label));
  expect(tile('Due in 30 days: 0').className).toContain('is-clear');
  await act(async()=>tile('Past due').click());expect(onShow).toHaveBeenCalledWith('Past due',[{key:'x'}],'pastDue');
  await act(async()=>tile('Vendor assurance').click());expect(onShow).toHaveBeenLastCalledWith('Vendor assurance',[{key:'v'}],'assurance');
  expect(tile('CIS safeguards not fully implemented: 16').getAttribute('href')).toBe('/compliance/cis-ig1?view=gaps');
  await act(async()=>root.unmount());
});
