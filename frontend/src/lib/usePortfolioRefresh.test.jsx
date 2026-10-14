import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {PORTFOLIO_CHANGED, usePortfolioRefresh} from './usePortfolioRefresh';

test('mounted views coalesce successful write notifications and refresh visible cross-session state',()=>{
  jest.useFakeTimers();global.IS_REACT_ACT_ENVIRONMENT=true;
  const load=jest.fn(),host=document.createElement('div'),root=createRoot(host);
  const hidden=jest.spyOn(document,'hidden','get').mockReturnValue(false);
  function Probe(){usePortfolioRefresh(load);return null;}
  try {
    act(()=>root.render(<Probe/>));
    act(()=>{window.dispatchEvent(new Event(PORTFOLIO_CHANGED));window.dispatchEvent(new Event(PORTFOLIO_CHANGED));jest.advanceTimersByTime(1);});
    expect(load).toHaveBeenCalledTimes(1);
    act(()=>{jest.advanceTimersByTime(60000);});
    expect(load).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(true);
    act(()=>{window.dispatchEvent(new Event('focus'));jest.advanceTimersByTime(1);});
    expect(load).toHaveBeenCalledTimes(2);
    hidden.mockReturnValue(false);
    act(()=>{document.dispatchEvent(new Event('visibilitychange'));jest.advanceTimersByTime(1);});
    expect(load).toHaveBeenCalledTimes(3);
  } finally {act(()=>root.unmount());hidden.mockRestore();jest.useRealTimers();}
});
