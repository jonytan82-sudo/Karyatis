const API_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = 'karyatis_token'; // kept so existing crew stay logged in
const VESSEL_KEY = 'cjm_vessel';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* private mode */ } },
};

export const getToken = () => store.get(TOKEN_KEY);
export const setToken = (t) => store.set(TOKEN_KEY, t);

let currentVessel = store.get(VESSEL_KEY) || '';
export const getVessel = () => currentVessel;
export const setVessel = (id) => { currentVessel = id || ''; store.set(VESSEL_KEY, currentVessel); };

export async function call(action, data = {}) {
  if (!API_URL) throw new Error('VITE_API_URL is not set. Add it in Netlify environment variables.');
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), vesselId: currentVessel, ...data }),
    });
  } catch {
    throw new Error('No connection. Check your internet and try again.');
  }
  let json;
  try { json = await res.json(); } catch { throw new Error('The server sent an unexpected reply. Check the Google Script deployment.'); }
  if (!json.ok) {
    if (/Session expired|Not logged in|Account inactive/.test(json.error || '')) {
      setToken(null);
      window.dispatchEvent(new Event('cjm-logout'));
    }
    throw new Error(json.error || 'Request failed');
  }
  return json;
}

/** Setup links come back relative when APP_URL isn't set in the script. */
export const fullLink = (link) => (link && link.charAt(0) === '/' ? window.location.origin + link : link);
