import {useEffect, useRef} from 'react';

export const PORTFOLIO_CHANGED = 'grc:portfolio-changed';

// Successful writes refresh mounted views; focus and bounded polling cover other sessions.
export function usePortfolioRefresh(load, onPortfolioChanged) {
  const latest = useRef({load, onPortfolioChanged});
  latest.current = {load, onPortfolioChanged};
  useEffect(() => {
    let queued, portfolioOnly = false;
    const refresh = event => {
      if (document.hidden) return;
      const portfolio = event?.type === PORTFOLIO_CHANGED;
      if (queued != null) { if (!portfolio) portfolioOnly = false; return; }
      portfolioOnly = portfolio;
      queued = window.setTimeout(() => {
        queued = null;
        const callback = portfolioOnly && latest.current.onPortfolioChanged || latest.current.load;
        callback();
      }, 0);
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
