import { useEffect, useState } from 'react';

const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787';

async function fetchFeed(rssUrl) {
  const url = `${WORKER_URL}/rss?url=${encodeURIComponent(rssUrl)}`;
  const res = await fetch(url);
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
    let cancelled = false;

    setState('loading');
    setError(null);

    Promise.allSettled(channel.shows.map((show) => fetchFeed(show.rss).then((feed) => ({ show, feed }))))
      .then((results) => {
        if (cancelled) return;
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
        if (cancelled) return;
        setError(String(e?.message || e));
        setState('err');
      });

    return () => {
      cancelled = true;
    };
  }, [channel?.id]);

  return { state, loadedShows, error };
}
