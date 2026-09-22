import { useEffect, useRef, useState } from 'react';

// Preferences only, never records. The authenticated identity object is the
// lifetime: navigating clients preserves context; a new login cannot inherit it.
const views = new WeakMap();
const empty = () => ({
  search: '',
  mine: false,
  includeArchived: false,
  table: {
    filters: {}
  },
  scroll: 0
});
export function usePortfolioView(user) {
  const scope = JSON.stringify([user.role, [...(user.client_ids || [])].sort()]);
  const stored = views.get(user);
  if (!stored || stored.scope !== scope) views.set(user, {
    scope,
    view: empty()
  });
  const [local, setLocal] = useState(() => ({
    user,
    scope,
    view: views.get(user).view
  }));
  const view = local.user === user && local.scope === scope ? local.view : views.get(user).view;
  const update = patch => {
    const next = {
      ...views.get(user).view,
      ...patch
    };
    views.set(user, {
      scope,
      view: next
    });
    setLocal({
      user,
      scope,
      view: next
    });
  };
  const restoring = useRef(true);
  useEffect(() => {
    const save = () => {
      const entry = views.get(user);
      if (!restoring.current && entry?.scope === scope) entry.view = {
        ...entry.view,
        scroll: window.scrollY
      };
    };
    window.addEventListener('scroll', save, {
      passive: true
    });
    return () => window.removeEventListener('scroll', save);
  }, [user, scope]);
  const restore = () => {
    if (restoring.current) {
      window.scrollTo(0, views.get(user).view.scroll);
      restoring.current = false;
    }
  };
  return [view, update, restore];
}
