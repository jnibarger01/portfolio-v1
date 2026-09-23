export const APP_BASE = globalThis.JACE_BASE_PATH || '/';

export function appPath(path) {
  return APP_BASE + String(path).replace(/^\/+/, '');
}

export function routePath(path = '') {
  if (staticPages()) return APP_BASE + (path ? `?route=${encodeURIComponent(String(path).replace(/^\/+/, ''))}` : '');
  return APP_BASE + String(path).replace(/^\/+/, '');
}

export function appRoute() {
  if (staticPages()) return `/${new URLSearchParams(location.search).get('route') || ''}`;
  if (!location.pathname.startsWith(APP_BASE)) return location.pathname;
  return `/${location.pathname.slice(APP_BASE.length)}`;
}

const readLocal = (key) => {
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
};
const writeLocal = (key, rows) => localStorage.setItem(key, JSON.stringify(rows));
const staticPages = () => globalThis.JACE_STATIC_PAGES === true;

export async function loadProjects() {
  const response = await fetch(appPath(staticPages() ? 'data/projects.json' : 'api/projects'));
  if (!response.ok) throw new Error('Project catalog unavailable');
  return response.json();
}

export async function loadWhispers() {
  if (staticPages()) return readLocal('jace-drive-whispers');
  const response = await fetch(appPath('api/whispers'));
  if (!response.ok) throw new Error('Visitor radio unavailable');
  return response.json();
}

export async function saveWhisper({ name, message, x, z }) {
  if (!staticPages()) {
    const response = await fetch(appPath('api/whispers'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, message, x, z })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Transmission failed');
    return data;
  }

  const cleanMessage = String(message || '').trim().slice(0, 60).replace(/[<>]/g, '');
  if (!cleanMessage) throw new Error('Message is required.');
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 200 || Math.abs(z) > 200) throw new Error('A valid world position is required.');
  const row = {
    id: crypto.randomUUID(), name: String(name || 'Visitor').trim().slice(0, 20).replace(/[<>]/g, '') || 'Visitor',
    message: cleanMessage, x: +x.toFixed(1), z: +z.toFixed(1), createdAt: new Date().toISOString()
  };
  writeLocal('jace-drive-whispers', [...readLocal('jace-drive-whispers'), row].slice(-30));
  return row;
}

export async function loadCircuit() {
  if (staticPages()) return readLocal('jace-drive-laps').sort((a, b) => a.ms - b.ms).slice(0, 10);
  const response = await fetch(appPath('api/circuit'));
  if (!response.ok) throw new Error('Circuit leaderboard unavailable');
  return response.json();
}

export async function saveCircuit(name, ms) {
  if (!staticPages()) {
    const response = await fetch(appPath('api/circuit'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, ms: Math.round(ms) })
    });
    if (!response.ok) throw new Error('Lap could not be saved');
    return response.json();
  }
  const time = Math.round(ms);
  if (!Number.isInteger(time) || time < 1000 || time > 600000) throw new Error('Lap time must be between 1 and 600 seconds.');
  const row = { id: crypto.randomUUID(), name: String(name || 'Anonymous driver').trim().slice(0, 20).replace(/[<>]/g, '') || 'Anonymous driver', ms: time, createdAt: new Date().toISOString() };
  writeLocal('jace-drive-laps', [...readLocal('jace-drive-laps'), row].sort((a, b) => a.ms - b.ms).slice(0, 10));
  return row;
}
