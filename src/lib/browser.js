// `browser` (Firefox, promise based) or `chrome` (Chromium; MV3 returns promises too).
const api = globalThis.browser ?? globalThis.chrome;

/** Hostname of the active tab, or null (non-web pages, dev server, no permission). */
export async function getActiveTabHostname() {
  try {
    if (!api?.tabs?.query) return null;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const url = new URL(tab.url);
    return /^https?:$/.test(url.protocol) ? url.hostname : null;
  } catch {
    return null;
  }
}
