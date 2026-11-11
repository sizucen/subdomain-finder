// One source of truth for the manifest. `vite build --mode firefox` adds the
// Firefox-only keys; every other mode produces the Chromium manifest
// (Chrome, Edge, Opera, Brave, ...).
export function buildManifest(target, version) {
  const icons = {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  };

  const manifest = {
    manifest_version: 3,
    name: 'Subdomain Finder',
    version,
    description:
      'Find subdomains of any domain from certificate transparency logs and see which ones are open.',
    icons,
    action: {
      default_title: 'Subdomain Finder',
      default_popup: 'index.html',
      default_icon: icons,
    },
    // activeTab: pre-fill the domain of the page you are on, only when you open the popup.
    permissions: ['activeTab'],
    // crt.name provides the subdomain list. Open/closed checks need no extra permission.
    host_permissions: ['https://crt.name/*'],
  };

  if (target === 'firefox') {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'subdomain-finder@example.com', // change to your own id before publishing
        strict_min_version: '115.0',
      },
    };
  }

  return manifest;
}
