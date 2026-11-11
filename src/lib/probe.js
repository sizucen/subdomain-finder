const TIMEOUT_MS = 6000;

/**
 * Sends a no-cors GET. We cannot read the response, but we do not need to:
 * if fetch() resolves, a server answered (any status code). If it rejects,
 * DNS, the connection, or TLS failed. This needs no host permissions.
 */
async function answers(url, signal) {
  const ctrl = new AbortController();
  const forward = () => ctrl.abort();
  signal?.addEventListener('abort', forward);
  const timer = setTimeout(forward, TIMEOUT_MS);
  try {
    await fetch(url, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal: ctrl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forward);
    ctrl.abort(); // drop the response body, we never read it
  }
}

/** Resolves to { state: 'open' | 'closed', scheme }, or null if cancelled. */
export async function probeHost(host, signal) {
  if (await answers(`https://${host}/`, signal)) return { state: 'open', scheme: 'https' };
  if (signal?.aborted) return null;
  if (await answers(`http://${host}/`, signal)) return { state: 'open', scheme: 'http' };
  if (signal?.aborted) return null;
  return { state: 'closed', scheme: null };
}

/** Runs worker(item) over items with at most `limit` in flight. */
export async function runPool(items, worker, limit, signal) {
  let next = 0;
  const lane = async () => {
    while (next < items.length && !signal?.aborted) {
      await worker(items[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}
