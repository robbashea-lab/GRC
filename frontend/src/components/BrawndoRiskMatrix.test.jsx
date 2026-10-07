import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BrawndoRiskMatrix,{riskCoordinates} from './BrawndoRiskMatrix';

test('real rating buckets reconcile without turning missing or invalid ratings into zero',async()=>{
  const container=document.createElement('div'),root=createRoot(container),pick=jest.fn();global.IS_REACT_ACT_ENVIRONMENT=true;
  const rows=[{likelihood_score:3,impact_score:5},{likelihood_score:3,impact_score:5},{likelihood_score:null,impact_score:4},{likelihood_score:0,impact_score:4}];
  expect(riskCoordinates(rows[0])).toBe('3:5');expect(riskCoordinates(rows[2])).toBeNull();expect(riskCoordinates(rows[3])).toBeNull();
  try{
    await act(async()=>root.render(<BrawndoRiskMatrix rows={rows} selected={null} onSelect={pick}/>));
    expect(container.querySelectorAll('.bwp-risk-cell')).toHaveLength(25);
    expect(container.textContent).toContain('4 risks in this view · 2 without a complete rating');
    const cell=container.querySelector('[aria-label="Likelihood 3, impact 5, critical: 2 risks"]');
    await act(async()=>cell.click());expect(pick).toHaveBeenCalledWith('3:5');
    await act(async()=>root.render(<BrawndoRiskMatrix rows={rows} selected="3:5" onSelect={pick}/>));
    await act(async()=>container.querySelector('[aria-pressed=true]').click());expect(pick).toHaveBeenLastCalledWith(null);
  }finally{await act(async()=>root.unmount());}
});
