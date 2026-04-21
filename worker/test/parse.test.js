// Verifies the worker's RSS parser against a realistic NPR-style fixture.
// Run with: node test/parse.test.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseFeed, parseDuration } from '../src/index.js';

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

// ── Unit: duration parsing ─────────────────────────────────────────────────
assert(parseDuration('1:02:34') === 3754, 'parseDuration h:m:s → 3754');
assert(parseDuration('62:34') === 3754, 'parseDuration m:s → 3754');
assert(parseDuration('3754') === 3754, 'parseDuration seconds → 3754');
assert(parseDuration('') === 0, 'parseDuration empty → 0');
assert(parseDuration('not-a-number') === 0, 'parseDuration invalid → 0');
assert(parseDuration('0:00:05') === 5, 'parseDuration 0:00:05 → 5');
assert(parseDuration('754') === 754, 'parseDuration "754" → 754');

// ── Integration: parse a realistic NPR feed ────────────────────────────────
const xml = readFileSync(join(__dirname, 'fixtures', 'npr-sample.xml'), 'utf8');
const parsed = parseFeed(xml);

assert(parsed.feedTitle === 'NPR News Now', `feedTitle = "${parsed.feedTitle}"`);
assert(parsed.feedImage.startsWith('https://media.npr.org/'), `feedImage = ${parsed.feedImage}`);
assert(Array.isArray(parsed.episodes), 'episodes is array');
assert(parsed.episodes.length === 3, `episodes length = ${parsed.episodes.length} (expected 3, capped)`);

const [ep0, ep1, ep2] = parsed.episodes;

assert(ep0.title === 'NPR News: 04-20-2026 4PM EDT', `ep0.title = "${ep0.title}"`);
assert(ep0.audioUrl.startsWith('https://play.podtrac.com/'), 'ep0.audioUrl from enclosure');
assert(ep0.durationSeconds === 298, `ep0.durationSeconds = ${ep0.durationSeconds} (4:58 → 298)`);
assert(ep0.description === 'Five-minute headlines from NPR.', `ep0.description = "${ep0.description}"`);
assert(ep0.pubDate === '2026-04-20T20:00:00.000Z', `ep0.pubDate = ${ep0.pubDate}`);
assert(ep0.image.startsWith('https://media.npr.org/'), 'ep0.image from itunes:image');

assert(ep1.durationSeconds === 3754, `ep1.durationSeconds = ${ep1.durationSeconds} (1:02:34 → 3754)`);
assert(ep1.image.startsWith('https://media.npr.org/'), 'ep1.image falls back to feed image');
assert(!/[<>]/.test(ep1.description), 'ep1.description has no HTML');

assert(ep2.durationSeconds === 754, `ep2.durationSeconds = ${ep2.durationSeconds} (754 seconds)`);

// ── Integration: HTML stripping and 300-char cap ───────────────────────────
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
assert(longParsed.episodes[0].description.length <= 300, `long description truncated to ${longParsed.episodes[0].description.length}`);
assert(!/[<>]/.test(longParsed.episodes[0].description), 'long description has no HTML tags');
assert(longParsed.episodes[0].description.includes('Hello world & goodbye'), 'entities decoded');

// ── Integration: single-item channel (no array) ────────────────────────────
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
assert(single.episodes.length === 1, 'single-item channel parsed as 1 episode');
assert(single.episodes[0].title === 'Only one', 'single-item title');

console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('All assertions passed.');
}
