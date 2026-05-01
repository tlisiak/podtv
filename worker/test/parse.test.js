// Unit + integration tests for the worker parser and helpers.
// Run with: node test/parse.test.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseFeed,
  parseDuration,
  validateTargetUrl,
  cacheTtlFromUpstream,
} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok  -', msg);
  }
}

// ── parseDuration ─────────────────────────────────────────────
assert(parseDuration('1:02:34') === 3754, 'h:m:s → 3754');
assert(parseDuration('62:34') === 3754, 'm:s → 3754');
assert(parseDuration('3754') === 3754, 'seconds → 3754');
assert(parseDuration('') === 0, 'empty → 0');
assert(parseDuration('not-a-number') === 0, 'invalid → 0');
assert(parseDuration('0:00:05') === 5, '0:00:05 → 5');
assert(parseDuration('PT1H2M3S') === 3723, 'PT1H2M3S → 3723 (1h+2m+3s)');
assert(parseDuration('PT5M') === 300, 'PT5M → 300');
assert(parseDuration('PT45S') === 45, 'PT45S → 45');
assert(parseDuration('pt1h') === 3600, 'lowercase pt1h → 3600');
assert(parseDuration('P1DT1H') === 90000, 'P1DT1H → 90000');

// ── validateTargetUrl ─────────────────────────────────────────
const valid = [
  'https://feeds.npr.org/500005/podcast.xml',
  'http://example.com/feed.xml',
  'https://feeds.simplecast.com/54nAGcIl',
];
for (const u of valid) assert(validateTargetUrl(u).ok === true, `accept ${u}`);

const blocked = [
  ['', 'empty'],
  ['not-a-url', 'invalid'],
  ['file:///etc/passwd', 'file://'],
  ['ftp://example.com/feed', 'ftp scheme'],
  ['http://localhost/feed', 'localhost'],
  ['http://127.0.0.1/feed', '127.0.0.1'],
  ['http://127.1.2.3/feed', '127.x'],
  ['http://169.254.169.254/feed', 'cloud metadata (AWS/GCP)'],
  ['http://metadata.google.internal/feed', 'GCP metadata hostname'],
  ['http://10.0.0.5/feed', '10/8 private'],
  ['http://172.16.0.1/feed', '172.16/12 private'],
  ['http://172.31.255.255/feed', '172.31 edge private'],
  ['http://192.168.1.1/feed', '192.168/16 private'],
  ['http://100.64.0.1/feed', 'CGNAT 100.64/10'],
  ['http://224.0.0.1/feed', 'multicast'],
  ['http://[::1]/feed', 'IPv6 loopback'],
  ['http://[fe80::1]/feed', 'IPv6 link-local'],
  ['http://[fc00::1]/feed', 'IPv6 ULA'],
  ['http://[::ffff:127.0.0.1]/feed', 'IPv4-mapped loopback'],
  ['http://user:pass@example.com/feed', 'userinfo'],
  ['http://printer.local/feed', '.local'],
  ['http://service.internal/feed', '.internal'],
];
for (const [u, label] of blocked) {
  assert(validateTargetUrl(u).ok === false, `reject ${label}: ${u}`);
}

// ── cacheTtlFromUpstream ──────────────────────────────────────
assert(cacheTtlFromUpstream(null, 3600) === 3600, 'no header → fallback');
assert(cacheTtlFromUpstream('max-age=600', 3600) === 600, 'max-age=600 respected');
assert(cacheTtlFromUpstream('MAX-AGE=600', 3600) === 600, 'case-insensitive');
assert(cacheTtlFromUpstream('public, max-age=300', 3600) === 300, 'combined directive');
assert(cacheTtlFromUpstream('no-cache', 3600) === 3600, 'no-cache → fallback');
assert(cacheTtlFromUpstream('no-store, max-age=999', 3600) === 3600, 'no-store wins');
assert(cacheTtlFromUpstream('private, max-age=999', 3600) === 3600, 'private → fallback');
assert(cacheTtlFromUpstream('max-age=99999999', 3600) === 86400, 'capped at 24h');

// ── parseFeed: RSS 2.0 fixture ────────────────────────────────
const xml = readFileSync(join(__dirname, 'fixtures', 'npr-sample.xml'), 'utf8');
const parsed = parseFeed(xml);

assert(parsed.feedTitle === 'NPR News Now', `feedTitle = "${parsed.feedTitle}"`);
assert(parsed.feedImage.startsWith('https://media.npr.org/'), `feedImage = ${parsed.feedImage}`);
assert(parsed.episodes.length === 3, `capped at 3 episodes (got ${parsed.episodes.length})`);

const [ep0, ep1, ep2] = parsed.episodes;
assert(ep0.title === 'NPR News: 04-20-2026 4PM EDT', `ep0.title`);
assert(ep0.audioUrl.startsWith('https://play.podtrac.com/'), 'ep0.audioUrl');
assert(ep0.durationSeconds === 298, `ep0.durationSeconds = ${ep0.durationSeconds}`);
assert(ep0.description === 'Five-minute headlines from NPR.', 'ep0.description');
assert(ep0.pubDate === '2026-04-20T20:00:00.000Z', 'ep0.pubDate');
assert(ep1.durationSeconds === 3754, 'ep1 (1:02:34) = 3754');
assert(ep2.durationSeconds === 754, 'ep2 (754) = 754');

// ── parseFeed: HTML stripping and description cap ─────────────
const longXml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>T</title>
    <item>
      <title>Long item</title>
      <description><![CDATA[<p>Hello <b>world</b> &amp; goodbye. ${'x'.repeat(400)}</p>]]></description>
      <enclosure url="https://example.com/a.mp3" type="audio/mpeg"/>
      <itunes:duration>00:05</itunes:duration>
      <pubDate>Sun, 20 Apr 2026 20:00:00 -0000</pubDate>
    </item>
  </channel>
</rss>`;
const longParsed = parseFeed(longXml);
assert(longParsed.episodes[0].description.length <= 300, 'long description capped');
assert(!/[<>]/.test(longParsed.episodes[0].description), 'no HTML tags');
assert(longParsed.episodes[0].description.includes('Hello world & goodbye'), 'entities decoded');

// ── parseFeed: multiple enclosures — prefer audio/* ───────────
const multiXml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Multi</title>
    <item>
      <title>t</title>
      <enclosure url="https://example.com/img.jpg" type="image/jpeg"/>
      <enclosure url="https://example.com/audio.mp3" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;
const multi = parseFeed(multiXml);
assert(multi.episodes[0].audioUrl === 'https://example.com/audio.mp3', 'picks audio enclosure over image');

// ── parseFeed: Atom feed ──────────────────────────────────────
const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <title>Atom Show</title>
  <logo>https://example.com/logo.png</logo>
  <entry>
    <title>First Atom Ep</title>
    <summary>An atom entry.</summary>
    <updated>2026-04-20T10:00:00Z</updated>
    <itunes:duration>PT15M</itunes:duration>
    <link rel="enclosure" href="https://example.com/ep1.mp3" type="audio/mpeg"/>
  </entry>
</feed>`;
const atom = parseFeed(atomXml);
assert(atom.feedTitle === 'Atom Show', 'atom: feedTitle');
assert(atom.episodes.length === 1, 'atom: 1 entry parsed');
assert(atom.episodes[0].audioUrl === 'https://example.com/ep1.mp3', 'atom: audioUrl from rel=enclosure');
assert(atom.episodes[0].durationSeconds === 900, 'atom: PT15M = 900');

// ── parseFeed: empty / malformed ──────────────────────────────
const empty = parseFeed('<?xml version="1.0"?><not-rss/>');
assert(Array.isArray(empty.episodes) && empty.episodes.length === 0, 'non-feed XML → empty episodes');

// ── parseFeed: single-item channel (no array) ─────────────────
const singleXml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Single</title>
    <item>
      <title>Only one</title>
      <description>Just one episode</description>
      <enclosure url="https://example.com/only.mp3" type="audio/mpeg"/>
      <itunes:duration>30</itunes:duration>
    </item>
  </channel>
</rss>`;
const single = parseFeed(singleXml);
assert(single.episodes.length === 1, 'single-item parsed');

// ── Integration: /rss endpoint end-to-end with mocked fetch ───
await runEndpointTests();

console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('All assertions passed.');
}

async function runEndpointTests() {
  // Minimal Cloudflare Worker shim: provide `caches.default` and a mocked
  // global fetch, then exercise the default export.
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(req) {
        return store.get(req.url) || undefined;
      },
      async put(req, resp) {
        store.set(req.url, resp);
      },
    },
  };
  const ctx = { waitUntil: (p) => p };

  const mod = await import('../src/index.js');
  const worker = mod.default;

  // 1) OPTIONS preflight
  {
    const res = await worker.fetch(
      new Request('https://w.test/rss?url=https%3A%2F%2Fexample.com%2F', { method: 'OPTIONS' }),
      {},
      ctx
    );
    assert(res.status === 204, `OPTIONS → 204 (got ${res.status})`);
    assert(res.headers.get('access-control-allow-origin') === '*', 'OPTIONS has CORS *');
  }

  // 2) Missing url param
  {
    const res = await worker.fetch(new Request('https://w.test/rss'), {}, ctx);
    assert(res.status === 400, `missing url → 400 (got ${res.status})`);
  }

  // 3) SSRF rejection
  {
    const res = await worker.fetch(
      new Request('https://w.test/rss?url=' + encodeURIComponent('http://169.254.169.254/')),
      {},
      ctx
    );
    assert(res.status === 400, `SSRF rejected (got ${res.status})`);
  }

  // 4) Happy path with mocked upstream
  {
    store.clear();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(readFileSync(join(__dirname, 'fixtures', 'npr-sample.xml'), 'utf8'), {
        status: 200,
        headers: { 'content-type': 'application/rss+xml', 'cache-control': 'max-age=600' },
      });
    try {
      const res = await worker.fetch(
        new Request('https://w.test/rss?url=' + encodeURIComponent('https://good.example/feed.xml')),
        {},
        ctx
      );
      assert(res.status === 200, `happy path 200 (got ${res.status})`);
      assert(res.headers.get('x-podvision-cache') === 'MISS', 'first request is MISS');
      assert(
        res.headers.get('cache-control')?.includes('max-age=600'),
        `TTL honored from upstream (got ${res.headers.get('cache-control')})`
      );
      const body = await res.json();
      assert(body.feedTitle === 'NPR News Now', 'end-to-end title matches');

      // Second request should serve from cache.
      const res2 = await worker.fetch(
        new Request('https://w.test/rss?url=' + encodeURIComponent('https://good.example/feed.xml')),
        {},
        ctx
      );
      assert(res2.headers.get('x-podvision-cache') === 'HIT', 'second request is HIT');
    } finally {
      globalThis.fetch = origFetch;
    }
  }

  // 5) Non-XML upstream rejected
  {
    store.clear();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('<html><body>Not found</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    try {
      const res = await worker.fetch(
        new Request('https://w.test/rss?url=' + encodeURIComponent('https://bad.example/404.html')),
        {},
        ctx
      );
      assert(res.status === 502, `HTML upstream → 502 (got ${res.status})`);
      const body = await res.json();
      assert(/non-xml/i.test(body.error), `error mentions non-xml (got "${body.error}")`);
    } finally {
      globalThis.fetch = origFetch;
    }
  }

  // 6) Oversized upstream rejected
  {
    store.clear();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('', {
        status: 200,
        headers: {
          'content-type': 'application/rss+xml',
          'content-length': String(10 * 1024 * 1024),
        },
      });
    try {
      const res = await worker.fetch(
        new Request('https://w.test/rss?url=' + encodeURIComponent('https://big.example/feed.xml')),
        {},
        ctx
      );
      assert(res.status === 502, `oversized → 502 (got ${res.status})`);
    } finally {
      globalThis.fetch = origFetch;
    }
  }
}
