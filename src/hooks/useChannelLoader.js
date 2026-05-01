import { useEffect, useState } from 'react';

const ENV_WORKER_URL = import.meta.env.VITE_WORKER_URL;

if (import.meta.env.PROD && !ENV_WORKER_URL) {
  throw new Error(
    'VITE_WORKER_URL must be set at build time. Set it to the deployed Cloudflare Worker URL (e.g. https://podvision-rss-proxy.example.workers.dev).'
  );
}

const WORKER_URL = ENV_WORKER_URL || 'http://localhost:8787';

async function fetchFeed(rssUrl, signal) {
  const url = `${WORKER_URL}/rss?url=${encodeURIComponent(rssUrl)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Worker ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
  return body;
}

/**
 * Loads the latest episode per show for a channel.
 * Returns { state: 'loading' | 'ok' | 'err', loadedShows: [{show, episode}], error }
 */
export function useChannelLoader(channel) {
  const [state, setState] = useState('loading');
  const [loadedShows, setLoadedShows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!channel) return;
    const ctrl = new AbortController();

    setState('loading');
    setError(null);

    Promise.allSettled(
      channel.shows.map((show) =>
        fetchFeed(show.rss, ctrl.signal).then((feed) => ({ show, feed }))
      )
    )
      .then((results) => {
        if (ctrl.signal.aborted) return;
        const loaded = [];
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.feed.episodes?.[0]) {
            loaded.push({ show: r.value.show, episode: r.value.feed.episodes[0] });
          }
        }
        if (loaded.length === 0) {
          setState('err');
          setError('No episodes loaded');
          setLoadedShows([]);
          return;
        }
        setLoadedShows(loaded);
        setState('ok');
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(String(e?.message || e));
        setState('err');
      });

    return () => ctrl.abort();
  }, [channel?.id]);

  return { state, loadedShows, error };
}
