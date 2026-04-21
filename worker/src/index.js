import { XMLParser } from 'fast-xml-parser';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

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

    const cacheTtl = parseInt(env?.CACHE_TTL ?? '3600', 10) || 3600;
    const cache = caches.default;
    const cacheKey = new Request(`https://podvision-cache.invalid/rss?url=${encodeURIComponent(target)}`, {
      method: 'GET',
    });

    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      headers.set('X-PodVision-Cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers });
    }

    try {
      const upstream = await fetch(target, {
        cf: { cacheTtl, cacheEverything: true },
        headers: {
          'User-Agent': 'PodVisionBot/1.0 (+https://podvision.fm)',
          Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        },
      });

      if (!upstream.ok) {
        return json({ error: 'Failed to fetch feed', status: upstream.status }, 502);
      }

      const xml = await upstream.text();
      const parsed = parseFeed(xml);

      const response = new Response(JSON.stringify(parsed), {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': `public, max-age=${cacheTtl}`,
          'X-PodVision-Cache': 'MISS',
        },
      });

      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (err) {
      return json({ error: 'Failed to fetch feed', status: 502, detail: String(err?.message || err) }, 502);
    }
  },
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS_HEADERS });
}

function validateTargetUrl(raw) {
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
  const host = u.hostname.toLowerCase();
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blocked.includes(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, error: 'Disallowed host' };
  }
  return { ok: true };
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
  const channel = doc?.rss?.channel ?? doc?.channel ?? {};

  const feedTitle = textOf(channel.title) || '';
  const feedImage =
    channel['itunes:image']?.['@_href'] ||
    channel.image?.url ||
    channel['itunes:image']?.href ||
    '';

  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];
  const episodes = rawItems.slice(0, 3).map((item) => {
    const title = textOf(item.title);
    const audioUrl = item.enclosure?.['@_url'] || item.enclosure?.url || '';
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
  });

  return { feedTitle, feedImage, episodes };
}

function textOf(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if ('#text' in v) return String(v['#text'] ?? '');
    if ('_' in v) return String(v._);
  }
  return '';
}

export function parseDuration(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (!s) return 0;

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
