import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import DashboardAttention from './DashboardAttention';
import {dashboardPosture} from '@/lib/dashboardPosture';
import {vendorMatches} from '@/lib/brawndoVendors';
jest.mock('react-router-dom',()=>({Link:({children,to,...p})=><a href={to} {...p}>{children}</a>}),{virtual:true});

test('attention tiles open their contributing records; each tracked program deep-links its gaps',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div'),root=createRoot(container),onShow=jest.fn();
  const posture={totals:{pastDue:4,due30:0,materialFindings:2,significantRisks:1},pastDue:[{key:'x'}],vendorHealth:[{key:'vendorReviewsPast',items:[],total:0},{key:'assurance',items:[{key:'v'}],total:1}]};
  await act(async()=>root.render(<DashboardAttention posture={posture} programs={[{key:'cis-ig1',label:'CIS IG1',to:'/compliance/cis-ig1',trackingAvailable:true,assessment:{status_counts:{needs_attention:5,in_progress:11}}},{key:'iso-27001',label:'ISO/IEC 27001',to:'/compliance/iso-27001',trackingAvailable:true,assessment:{status_counts:{needs_attention:4,in_progress:19}}},{key:'cmmc',label:'CMMC',to:'/compliance/cmmc',trackingAvailable:false}]} onShow={onShow}/>));
  const tile=label=>[...container.querySelectorAll('button,a')].find(b=>b.getAttribute('aria-label').startsWith(label));
  expect(tile('Due in 30 days: 0').className).toContain('is-clear');
  await act(async()=>tile('Past due').click());expect(onShow).toHaveBeenCalledWith('Past due',[{key:'x'}],'pastDue');
  expect(tile('Vendor assurance').getAttribute('href')).toBe('/vendors?view=assurance_attention');expect(tile('Significant risks').getAttribute('href')).toBe('/risks?view=significant');
  expect(tile('CIS IG1 safeguards with gaps: 16').getAttribute('href')).toBe('/compliance/cis-ig1?view=gaps');
  expect(tile('ISO/IEC 27001 requirements with gaps: 23').getAttribute('href')).toBe('/compliance/iso-27001?view=gaps');
  // A program without assessment tracking gets no gap tile.
  expect(tile('CMMC')).toBeUndefined();
  await act(async()=>root.unmount());
});
test('the assurance tile links to the same vendors counted by Dashboard attention, rather than follow-up dates',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const today=new Date('2026-09-30T12:00:00Z');
  const vendors=[
    {vendor_id:'missing',name:'Missing required report',status:'active',assurance_required:true,assurance_records:[{type:'SOC 2',required:true}]},
    {vendor_id:'refresh',name:'Refresh within the assurance window',status:'active',assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:['report'],received_at:'2026-09-01',refresh_due:'2026-11-15'}]},
    {vendor_id:'follow-up',name:'Optional follow-up only',status:'active',assurance_required:false,assurance_records:[{type:'SOC 2',next_follow_up:'2026-10-15'}]},
    {vendor_id:'current',name:'Current required report',status:'active',assurance_required:true,assurance_records:[{type:'SOC 2',required:true,evidence_ids:['report'],received_at:'2026-09-01',refresh_due:'2027-01-01'}]},
  ];
  const posture=dashboardPosture({activeRecords:{vendors,reviews:[],tasks:[],findings:[],risks:[]},obligations:[],attention:[]},{today});
  const counted=posture.vendorHealth.find(g=>g.key==='assurance').items.map(v=>v.id);
  expect(counted).toEqual(['missing','refresh']);
  const container=document.createElement('div'),root=createRoot(container);
  try {
    await act(async()=>root.render(<DashboardAttention posture={posture} onShow={jest.fn()}/>));
    const tile=[...container.querySelectorAll('a')].find(a=>a.getAttribute('aria-label').startsWith('Vendor assurance:'));
    expect(tile.getAttribute('aria-label')).toBe('Vendor assurance: 2. Open register');
    const view=new URL(tile.getAttribute('href'),'https://example.test').searchParams.get('view');
    expect(vendors.filter(v=>vendorMatches(v,view,today)).map(v=>v.vendor_id)).toEqual(counted);
  } finally {
    await act(async()=>root.unmount());
  }
});
test('past-due vendor Reviews open the matching past-due register view, not the 90-day view',async()=>{
  global.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div'),root=createRoot(container);
  const posture={totals:{pastDue:1,due30:0,materialFindings:0,significantRisks:0},vendorHealth:[{key:'vendorReviewsPast',items:[{key:'r'}],total:1},{key:'assurance',items:[],total:0}]};
  await act(async()=>root.render(<DashboardAttention posture={posture} programs={[]} onShow={jest.fn()}/>));
  const tile=[...container.querySelectorAll('a')].find(b=>b.getAttribute('aria-label').startsWith('Vendor reviews past due'));
  expect(tile.getAttribute('href')).toBe('/vendors?view=review_overdue');
  await act(async()=>root.unmount());
});
