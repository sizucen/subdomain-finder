import { HOST_RE } from './domain.js';

const ENDPOINT = 'https://crt.name/v1/search';

/** crt.name returns plain text, one hostname per line. */
export function parseHosts(text, apex) {
  const hosts = new Set();
  for (const line of text.split(/\r?\n/)) {
    const host = line.trim().toLowerCase();
    if (!host || host.startsWith('*')) continue; // skip wildcard certificates
    if (!HOST_RE.test(host)) continue;
    if (host !== apex && !host.endsWith(`.${apex}`)) continue;
    hosts.add(host);
  }
  return [...hosts].sort((a, b) =>
    a === apex ? -1 : b === apex ? 1 : a.localeCompare(b),
  );
}

export async function fetchSubdomains(apex, signal) {
  const res = await fetch(`${ENDPOINT}?apex=${encodeURIComponent(apex)}`, {
    signal,
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`crt.name responded with status ${res.status}.`);
  return parseHosts(await res.text(), apex);
}
