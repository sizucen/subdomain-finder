// Results are kept for 24 hours so reopening the popup never needs a new request.
// localStorage is persistent on extension pages and needs no extra permission.
const KEY = 'sf:cache:v1';
const LAST_KEY = 'sf:last-domain';
const MAX_DOMAINS = 25;
export const TTL_MS = 24 * 60 * 60 * 1000;

// One char per host, aligned with `hosts`: s = open (https), h = open (http), x = closed, - = unchecked.
const TO_CODE = { open: { https: 's', http: 'h' }, closed: 'x' };

function readAll() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeAll(all) {
  const now = Date.now();
  const entries = Object.entries(all)
    .filter(([, v]) => v && now - v.ts < TTL_MS)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, MAX_DOMAINS);
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    try {
      // Storage full: keep only the newest few.
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 3))));
    } catch {
      /* caching is best effort */
    }
  }
}

/** Returns { hosts, results, ts } if a fresh entry exists, otherwise null. */
export function loadCache(apex) {
  const entry = readAll()[apex];
  if (!entry || !Array.isArray(entry.hosts) || typeof entry.r !== 'string') return null;
  if (Date.now() - entry.ts >= TTL_MS) return null;

  const results = {};
  entry.hosts.forEach((host, i) => {
    const code = entry.r[i];
    if (code === 'x') results[host] = { state: 'closed', scheme: null };
    else if (code === 's') results[host] = { state: 'open', scheme: 'https' };
    else if (code === 'h') results[host] = { state: 'open', scheme: 'http' };
  });
  return { hosts: entry.hosts, results, ts: entry.ts };
}

/** Saves the list and whatever has been checked so far. Returns the save timestamp. */
export function saveCache(apex, hosts, results) {
  const r = hosts
    .map((host) => {
      const v = results[host];
      if (v?.state === 'open') return TO_CODE.open[v.scheme] ?? 's';
      if (v?.state === 'closed') return TO_CODE.closed;
      return '-';
    })
    .join('');
  const ts = Date.now();
  const all = readAll();
  all[apex] = { ts, hosts, r };
  writeAll(all);
  return ts;
}

export function getLastDomain() {
  try {
    return localStorage.getItem(LAST_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastDomain(domain) {
  try {
    localStorage.setItem(LAST_KEY, domain);
  } catch {
    /* ignore */
  }
}

function span(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

export const ago = (ts) => (Date.now() - ts < 60000 ? 'just now' : `${span(Date.now() - ts)} ago`);
export const expiresIn = (ts) => span(ts + TTL_MS - Date.now());
