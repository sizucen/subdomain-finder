// Letters/digits/hyphens/underscores per label, and a TLD that starts with a letter
// (so bare IP addresses such as 10.0.0.10 are rejected).
export const HOST_RE =
  /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z][a-z0-9-]{1,62}$/;

// Common second-level labels under two-letter country TLDs (com.tr, co.uk, ...).
// This is a heuristic, not the full Public Suffix List. The input stays editable.
const SECOND_LEVEL = new Set([
  'co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'mil', 'nom',
  'biz', 'info', 'name', 'web', 'gen', 'av', 'dr', 'k12', 'bel', 'pol', 'tsk', 'kep', 'tel',
]);

/** "https://www.Example.com/path" -> "www.example.com". Returns null when invalid. */
export function normalizeDomain(input) {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/\.$/, '');
    return HOST_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** "blog.shop.example.com.tr" -> "example.com.tr" */
export function guessApex(hostname) {
  const host = normalizeDomain(hostname);
  if (!host) return null;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-take).join('.');
}
