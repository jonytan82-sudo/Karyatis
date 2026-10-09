const API_URL = import.meta.env.VITE_API_URL;
const TOKEN_KEY = 'karyatis_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function call(action, data = {}) {
  if (!API_URL) throw new Error('VITE_API_URL is not set. Add it in Netlify environment variables.');
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: getToken(), ...data }),
    });
  } catch {
    throw new Error('No connection. Check the vessel internet and try again.');
  }
  const json = await res.json();
  if (!json.ok) {
    if (/Session expired|Not logged in|Account inactive/.test(json.error || '')) {
      setToken(null);
      window.dispatchEvent(new Event('karyatis-logout'));
    }
    throw new Error(json.error || 'Request failed');
  }
  return json;
}
