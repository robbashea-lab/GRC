import {useEffect, useRef} from 'react';

export const PORTFOLIO_CHANGED = 'grc:portfolio-changed';

// Successful writes refresh mounted views; focus and bounded polling cover other sessions.
export function usePortfolioRefresh(load) {
  const latest = useRef(load);
  latest.current = load;
  useEffect(() => {
    let queued;
    const refresh = () => {
      if (document.hidden || queued != null) return;
      queued = window.setTimeout(() => { queued = null; latest.current(); }, 0);
    };
    window.addEventListener(PORTFOLIO_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => {
      window.clearTimeout(queued);
      window.clearInterval(interval);
      window.removeEventListener(PORTFOLIO_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
}
