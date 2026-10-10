// Hash URLs work on GitHub Pages and localhost without server rewrite rules.
window.LMS = window.LMS || {};
(() => {
  const pages = new Set(['dashboard', 'students', 'seats', 'payments', 'accounts', 'dues', 'attendance', 'activity', 'alerts', 'settings']);
  const eventName = 'lms-route-change';
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  LMS.readRoute = () => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    const separator = raw.indexOf('?');
    const path = (separator < 0 ? raw : raw.slice(0, separator)).replace(/\/$/, '');
    return { page: pages.has(path) ? path : 'dashboard', params: new URLSearchParams(separator < 0 ? '' : raw.slice(separator + 1)) };
  };
  LMS.pageUrl = (page, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return '#/' + (pages.has(page) ? page : 'dashboard') + (query ? '?' + query : '');
  };
  const write = (page, params, replace = false) => {
    const hash = LMS.pageUrl(page, params);
    if (window.location.hash === hash) return;
    window.history[replace ? 'replaceState' : 'pushState'](null, '', hash);
    window.dispatchEvent(new Event(eventName));
  };
  LMS.navigatePage = (page, params = {}) => write(page, params);
  LMS.useRoute = () => {
    const [route, setRoute] = useState(LMS.readRoute);
    useEffect(() => {
      const sync = () => {
        const next = LMS.readRoute();
        const canonical = LMS.pageUrl(next.page, next.params);
        if (window.location.hash !== canonical) window.history.replaceState(null, '', canonical);
        setRoute(next);
      };
      window.addEventListener('hashchange', sync);
      window.addEventListener('popstate', sync);
      window.addEventListener(eventName, sync);
      sync();
      return () => {
        window.removeEventListener('hashchange', sync);
        window.removeEventListener('popstate', sync);
        window.removeEventListener(eventName, sync);
      };
    }, []);
    return route;
  };
  LMS.useRouteParam = (name, fallback, allowed) => {
    const route = LMS.useRoute(), saved = route.params.get(name);
    const value = saved !== null && (!allowed || allowed.includes(saved)) ? saved : fallback;
    return [value, next => {
      const current = LMS.readRoute();
      const resolved = typeof next === 'function' ? next(value) : next;
      if (resolved === null || resolved === undefined || resolved === '') current.params.delete(name);
      else current.params.set(name, String(resolved));
      write(current.page, current.params);
    }];
  };
})();
