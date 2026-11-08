import { useEffect, useRef } from 'react';

/**
 * Fetch a screen's data again when something was saved anywhere in the app ('cjm-changed'), or when the app comes back
 * on screen ('cjm-refresh'). load() may return false to skip (for example while a form has unsaved typing).
 */
export function useLiveReload(load) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    let timer;
    const again = () => { clearTimeout(timer); timer = setTimeout(() => { try { ref.current(); } catch { /* the screen shows its own errors */ } }, 700); };
    window.addEventListener('cjm-changed', again);
    window.addEventListener('cjm-refresh', again);
    return () => { clearTimeout(timer); window.removeEventListener('cjm-changed', again); window.removeEventListener('cjm-refresh', again); };
  }, []);
}
