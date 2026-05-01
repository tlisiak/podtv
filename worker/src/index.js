import { XMLParser } from 'fast-xml-parser';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024; // 5 MB cap on feed bodies
const DEFAULT_CACHE_TTL = 3600;
const NEGATIVE_CACHE_TTL = 60;
const MAX_CACHE_TTL = 24 * 3600;
const ALLOWED_CONTENT_TYPES = [
  'application/rss+xml',
  'application/xml',
  'application/atom+xml',
  'text/xml',
];

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ ok: true, service: 'podvision-rss-proxy' });
    }

    if (url.pathname !== '/rss') {
      return json({ error: 'Not found' }, 404);
    }

    const target = url.searchParams.get('url');
    const validation = validateTargetUrl(target);
    if (!validation.ok) return json({ error: validation.error }, 400);

    const defaultTtl = clampTtl(parseInt(env?.CACHE_TTL ?? String(DEFAULT_CACHE_TTL), 10));
    const cache = caches.default;
    const cacheKey = new Request(
      `https://podvision-cache.invalid/rss?url=${encodeURIComponent(target)}`,
      { method: 'GET' }
    );

    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      headers.set('X-PodVision-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    try {
      const upstream = await fetch(target, {
        cf: { cacheTtl: defaultTtl, cacheEverything: true },
        headers: {
          'User-Agent': 'PodVisionBot/1.0 (+https://podvision.fm)',
          Accept: 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, application/atom+xml;q=0.8, */*;q=0.1',
        },
        redirect: 'follow',
      });

      if (!upstream.ok) {
        return cachedErrorResponse(ctx, cache, cacheKey, {
          error: 'Upstream fetch failed',
          status: upstream.status,
        });
      }

      // Reject non-XML responses (e.g. soft-404 HTML landing pages).
      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      if (ct && !ALLOWED_CONTENT_TYPES.some((t) => ct.includes(t))) {
        return cachedErrorResponse(ctx, cache, cacheKey, {
          error: 'Upstream returned non-XML content',
          contentType: ct.split(';')[0] || null,
        });
      }

      // Size-bounded read.
      const declared = parseInt(upstream.headers.get('content-length') || '', 10);
      if (Number.isFinite(declared) && declared > MAX_UPSTREAM_BYTES) {
        return cachedErrorResponse(ctx, cache, cacheKey, {
          error: 'Upstream feed too large',
        });
      }
      const xml = await readBoundedText(upstream.body, MAX_UPSTREAM_BYTES);
      if (xml == null) {
        return cachedErrorResponse(ctx, cache, cacheKey, {
          error: 'Upstream feed too large',
        });
      }

      let parsed;
      try {
        parsed = parseFeed(xml);
      } catch {
        return cachedErrorResponse(ctx, cache, cacheKey, { error: 'Could not parse feed' });
      }

      // Respect upstream Cache-Control max-age when present, else default.
      const ttl = cacheTtlFromUpstream(upstream.headers.get('cache-control'), defaultTtl);

      const body = JSON.stringify(parsed);
      const response = new Response(body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': `public, max-age=${ttl}`,
          'X-PodVision-Cache': 'MISS',
        },
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch {
      // Swallow internal errors — do not leak stack traces to clients.
      return cachedErrorResponse(ctx, cache, cacheKey, { error: 'Upstream fetch failed' });
    }
  },
};

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

/** Negative cache a short error response so we don't hammer a broken upstream. */
function cachedErrorResponse(ctx, cache, cacheKey, body) {
  const payload = JSON.stringify(body);
  const response = new Response(payload, {
    status: 502,
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': `public, max-age=${NEGATIVE_CACHE_TTL}`,
      'X-PodVision-Cache': 'MISS',
    },
  });
  try {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  } catch {
    /* ignore — negative caching is best-effort */
  }
  return response;
}

function clampTtl(n) {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CACHE_TTL;
  return Math.min(n, MAX_CACHE_TTL);
}

export function cacheTtlFromUpstream(header, fallback) {
  if (!header) return fallback;
  const lower = header.toLowerCase();
  if (lower.includes('no-store') || lower.includes('no-cache') || lower.includes('private')) {
    return fallback;
  }
  const m = lower.match(/max-age\s*=\s*(\d+)/);
  if (!m) return fallback;
  const n = parseInt(m[1], 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_CACHE_TTL);
}

async function readBoundedText(stream, max) {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        try { reader.cancel(); } catch { /* ignore */ }
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

export function validateTargetUrl(raw) {
  if (!raw) return { ok: false, error: 'Missing required "url" parameter' };
  let u;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'URL must use http or https' };
  }
  if (u.username || u.password) {
    return { ok: false, error: 'URL must not contain userinfo' };
  }

  let host = u.hostname.toLowerCase();
  // Strip IPv6 brackets so literal checks see the raw address.
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);

  if (isBlockedHostname(host)) return { ok: false, error: 'Disallowed host' };
  if (isBlockedIp(host)) return { ok: false, error: 'Disallowed host' };

  return { ok: true };
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

function isBlockedHostname(host) {
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  return false;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isBlockedIp(host) {
  const m = host.match(IPV4_RE);
  if (m) {
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 0) return true;
    if (a === 10) return true;                               // 10.0.0.0/8
    if (a === 127) return true;                              // loopback
    if (a === 169 && b === 254) return true;                 // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;        // 172.16.0.0/12
    if (a === 192 && b === 168) return true;                 // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;       // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true;                               // multicast + reserved
    return false;
  }
  if (host.includes(':')) {
    const lower = host.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
    if (lower.startsWith('fe80')) return true;                         // link-local
    if (lower.startsWith('ff')) return true;                           // multicast
    // IPv4-mapped IPv6: ::ffff:a.b.c.d or its hex-normalized form ::ffff:xxxx:yyyy.
    // No legitimate feed needs this, so reject outright.
    if (lower.startsWith('::ffff:')) return true;
  }
  return false;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
});

export function parseFeed(xml) {
  const doc = xmlParser.parse(xml);

  // RSS 2.0 / RDF
  const rssChannel = doc?.rss?.channel ?? doc?.channel ?? doc?.['rdf:RDF']?.channel;
  if (rssChannel || doc?.['rdf:RDF']?.item) {
    return parseRssChannel(rssChannel || {}, doc);
  }

  // Atom
  if (doc?.feed) {
    return parseAtomFeed(doc.feed);
  }

  return { feedTitle: '', feedImage: '', episodes: [] };
}

function parseRssChannel(channel, doc) {
  const feedTitle = textOf(channel.title) || '';
  const feedImage =
    channel['itunes:image']?.['@_href'] ||
    channel.image?.url ||
    channel['itunes:image']?.href ||
    '';

  let rawItems = channel.item;
  // RDF feeds have items as siblings of channel.
  if (!rawItems && doc?.['rdf:RDF']?.item) rawItems = doc['rdf:RDF'].item;

  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const episodes = items.slice(0, 3).map((item) => rssItemToEpisode(item, feedImage));

  return { feedTitle, feedImage, episodes };
}

function rssItemToEpisode(item, feedImage) {
  const title = textOf(item.title);
  const enclosures = Array.isArray(item.enclosure) ? item.enclosure : item.enclosure ? [item.enclosure] : [];
  const audio = enclosures.find((e) => {
    const type = (e?.['@_type'] || e?.type || '').toLowerCase();
    return !type || type.startsWith('audio/');
  }) || enclosures[0];
  const audioUrl =
    audio?.['@_url'] ||
    audio?.url ||
    item['media:content']?.['@_url'] ||
    item['media:content']?.url ||
    '';

  const durationSeconds = parseDuration(
    textOf(item['itunes:duration']) || textOf(item.duration) || ''
  );

  const description = stripHtml(
    textOf(item['itunes:summary']) ||
      textOf(item.description) ||
      textOf(item['content:encoded']) ||
      ''
  ).slice(0, 300);

  const pubDate = normalizeDate(textOf(item.pubDate));

  const image =
    item['itunes:image']?.['@_href'] ||
    item['itunes:image']?.href ||
    feedImage ||
    '';

  return { title, audioUrl, durationSeconds, description, pubDate, image };
}

function parseAtomFeed(feed) {
  const feedTitle = textOf(feed.title);
  const feedImage = textOf(feed.logo) || textOf(feed.icon) || '';
  const rawEntries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  const episodes = rawEntries.slice(0, 3).map((entry) => {
    const title = textOf(entry.title);
    const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
    const enclosureLink = links.find(
      (l) => (l?.['@_rel'] || l?.rel) === 'enclosure'
    );
    const audioUrl = enclosureLink?.['@_href'] || enclosureLink?.href || '';
    const description = stripHtml(textOf(entry.summary) || textOf(entry.content) || '').slice(0, 300);
    const pubDate = normalizeDate(textOf(entry.updated) || textOf(entry.published));
    const durationSeconds = parseDuration(textOf(entry['itunes:duration']) || '');
    const image = entry['media:thumbnail']?.['@_url'] || feedImage || '';
    return { title, audioUrl, durationSeconds, description, pubDate, image };
  });
  return { feedTitle, feedImage, episodes };
}

function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    if ('#text' in v) return String(v['#text'] ?? '');
    if ('_' in v) return String(v._);
  }
  return '';
}

const ISO_DURATION_RE = /^P(?:[0-9.]+Y)?(?:[0-9.]+M)?(?:([0-9.]+)D)?(?:T(?:([0-9.]+)H)?(?:([0-9.]+)M)?(?:([0-9.]+)S)?)?$/i;

export function parseDuration(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (!s) return 0;

  // ISO-8601: PT1H2M3S, P1DT1H, etc.
  if (/^p/i.test(s)) {
    const m = s.match(ISO_DURATION_RE);
    if (m) {
      const d = parseFloat(m[1] || '0');
      const h = parseFloat(m[2] || '0');
      const min = parseFloat(m[3] || '0');
      const sec = parseFloat(m[4] || '0');
      return Math.round(d * 86400 + h * 3600 + min * 60 + sec);
    }
    return 0;
  }

  if (/^\d+$/.test(s)) return parseInt(s, 10);

  if (s.includes(':')) {
    const parts = s.split(':').map((p) => parseInt(p, 10));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 3) {
      const [h, m, sec] = parts;
      return h * 3600 + m * 60 + sec;
    }
    if (parts.length === 2) {
      const [m, sec] = parts;
      return m * 60 + sec;
    }
    if (parts.length === 1) return parts[0];
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}
