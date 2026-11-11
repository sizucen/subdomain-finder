import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSubdomains } from './lib/crt.js';
import { probeHost, runPool } from './lib/probe.js';
import { getActiveTabHostname } from './lib/browser.js';
import { guessApex, normalizeDomain } from './lib/domain.js';
import { ago, expiresIn, getLastDomain, loadCache, saveCache, setLastDomain } from './lib/cache.js';
import { REPO_URL } from './config.js';
import {
  CheckIcon, ClockIcon, CopyIcon, ExternalIcon, GithubIcon,
  GlobeIcon, Radar, SearchIcon, StopIcon,
} from './icons.jsx';

const CONCURRENCY = 12;
const LABELS = { open: 'Open', closed: 'Closed', checking: 'Checking', queued: 'Queued', idle: 'Unchecked' };

export default function App() {
  const [domain, setDomain] = useState('');
  const [loadedFor, setLoadedFor] = useState('');
  const [hosts, setHosts] = useState([]);
  const [results, setResults] = useState({});
  const [phase, setPhase] = useState('idle'); // idle | fetching | checking | done | stopped
  const [cachedAt, setCachedAt] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);

  function applyCache(apex, hit) {
    const checked = hit.hosts.filter((h) => hit.results[h]).length;
    setLoadedFor(apex);
    setHosts(hit.hosts);
    setResults(hit.results);
    setCachedAt(hit.ts);
    setError('');
    setPhase(checked === 0 ? 'idle' : checked === hit.hosts.length ? 'done' : 'stopped');
  }

  // On open: pick the domain of the current tab (or the last one used) and
  // restore its saved results. Nothing is requested here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tabHost = await getActiveTabHostname();
      const apex = (tabHost && guessApex(tabHost)) || getLastDomain();
      if (cancelled || !apex) return;
      setDomain(apex);
      const hit = loadCache(apex);
      if (hit) applyCache(apex, hit);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = phase === 'fetching' || phase === 'checking';
  const total = hosts.length;
  const typed = normalizeDomain(domain);
  const isLoaded = total > 0 && typed === loadedFor;

  const counts = useMemo(() => {
    let open = 0;
    let closed = 0;
    for (const h of hosts) {
      const s = results[h]?.state;
      if (s === 'open') open++;
      else if (s === 'closed') closed++;
    }
    return { open, closed, done: open + closed };
  }, [hosts, results]);

  const visible = useMemo(
    () => hosts.filter((h) => filter === 'all' || (results[h]?.state ?? 'idle') === filter),
    [hosts, results, filter],
  );

  async function start({ refresh = false } = {}) {
    const apex = normalizeDomain(domain);
    if (!apex) {
      setError('Enter a valid domain, for example example.com.');
      return;
    }
    setDomain(apex);
    setError('');
    setFilter('all');
    setLastDomain(apex);

    // A fresh cache entry for another domain is shown instantly, no requests.
    if (!refresh && apex !== loadedFor) {
      const hit = loadCache(apex);
      if (hit) {
        applyCache(apex, hit);
        return;
      }
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const live = {};

    try {
      let list = hosts;
      if (refresh || apex !== loadedFor) {
        setPhase('fetching');
        setLoadedFor('');
        setHosts([]);
        setResults({});
        setCachedAt(null);
        list = await fetchSubdomains(apex, ctrl.signal);
        if (!list.length) {
          setError(`No subdomains found for ${apex}.`);
          setPhase('idle');
          return;
        }
        setLoadedFor(apex);
        setHosts(list);
        setCachedAt(saveCache(apex, list, {}));
      }

      setPhase('checking');
      setResults(Object.fromEntries(list.map((h) => [h, { state: 'queued' }])));

      await runPool(
        list,
        async (host) => {
          setResults((r) => ({ ...r, [host]: { state: 'checking' } }));
          const outcome = await probeHost(host, ctrl.signal);
          if (outcome) live[host] = outcome;
          setResults((r) => {
            const next = { ...r };
            if (outcome) next[host] = outcome;
            else delete next[host];
            return next;
          });
        },
        CONCURRENCY,
        ctrl.signal,
      );

      setResults({ ...live });
      setCachedAt(saveCache(apex, list, live));
      setPhase(ctrl.signal.aborted ? 'stopped' : 'done');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setError(err?.message || 'Something went wrong. Check your connection and try again.');
      }
      setPhase('idle');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(visible.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy to the clipboard.');
    }
  }

  const pct = (n) => `${total ? (n / total) * 100 : 0}%`;
  const pending = total - counts.done;

  let meta = null;
  if (phase === 'fetching') meta = { text: `Searching certificate logs for ${domain}…` };
  else if (phase === 'checking') meta = { text: `Checking ${counts.done} of ${total}…` };
  else if (phase === 'stopped') meta = { text: `Stopped at ${counts.done} of ${total}.` };
  else if (cachedAt && total > 0)
    meta = { text: `Checked ${ago(cachedAt)} · saved for ${expiresIn(cachedAt)} more` };

  return (
    <main className="app">
      <header className="brand">
        <img src="icons/icon-48.png" alt="" width="32" height="32" />
        <div>
          <h1>Subdomain Finder</h1>
          <p>See which subdomains are alive.</p>
        </div>
        <a className="icon-btn" href={REPO_URL} target="_blank" rel="noreferrer noopener" aria-label="View source on GitHub" title="GitHub">
          <GithubIcon />
        </a>
      </header>

      <section className="card controls">
        <form
          className="bar"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) start({ refresh: isLoaded });
          }}
        >
          <label className="input">
            <GlobeIcon />
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              aria-label="Domain"
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
              disabled={busy}
            />
          </label>
          <button
            type="button"
            className={`cta${busy ? ' stop' : ''}`}
            onClick={() => (busy ? abortRef.current?.abort() : start({ refresh: isLoaded }))}
          >
            {busy ? <StopIcon /> : <SearchIcon />}
            {busy ? 'Stop' : isLoaded ? 'Check again' : 'Check'}
          </button>
        </form>

        {meta ? (
          <div className="meta" aria-live="polite">
            <span>{busy ? null : <ClockIcon />}{meta.text}</span>
          </div>
        ) : null}

        {error ? <p className="error" role="alert">{error}</p> : null}
      </section>

      {total > 0 ? (
        <section className="card results">
          <div
            className="meter"
            role="img"
            aria-label={`${counts.open} open, ${counts.closed} closed, ${pending} unchecked`}
          >
            <i className="m-open" style={{ width: pct(counts.open) }} />
            <i className="m-closed" style={{ width: pct(counts.closed) }} />
          </div>

          <div className="toolbar">
            <div className="seg" role="group" aria-label="Filter by status">
              {[
                ['all', 'All', total],
                ['open', 'Open', counts.open],
                ['closed', 'Closed', counts.closed],
              ].map(([key, label, n]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {label} <em>{n}</em>
                </button>
              ))}
            </div>
            <button type="button" className="chip" onClick={copy} disabled={!visible.length}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <ul className="list">
            {visible.length === 0 ? (
              <li className="none">Nothing to show for this filter yet.</li>
            ) : (
              visible.map((host) => {
                const r = results[host] ?? { state: 'idle' };
                return (
                  <li key={host}>
                    <a
                      className="row"
                      href={`${r.scheme ?? 'https'}://${host}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={`Open ${host}`}
                    >
                      <span className={`badge ${r.state}`} title={LABELS[r.state]}><i /><span className="sr">{LABELS[r.state]}</span></span>
                      <span className="host">{host}</span>
                      {r.scheme ? <span className="scheme">{r.scheme}</span> : null}
                      <ExternalIcon className="ext" width="14" height="14" />
                    </a>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      ) : phase === 'fetching' || !error ? (
        <section className="empty">
          <Radar scanning={phase === 'fetching'} />
          <p>
            {phase === 'fetching'
              ? 'Looking for certificates…'
              : 'Enter a domain and press Check. Results are saved for 24 hours, so reopening this popup sends nothing.'}
          </p>
        </section>
      ) : null}
    </main>
  );
}
