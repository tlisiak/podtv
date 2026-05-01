// Run with: node src/lib/schedule.test.js
import { buildSchedule, getOnAir, getVisibleBlocks } from './schedule.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok  -', msg);
  }
}

const shows = [
  { show: { name: 'A' }, episode: { audioUrl: 'a.mp3', durationSeconds: 100, title: 'A1' } },
  { show: { name: 'B' }, episode: { audioUrl: 'b.mp3', durationSeconds: 200, title: 'B1' } },
  { show: { name: 'C' }, episode: { audioUrl: 'c.mp3', durationSeconds: 300, title: 'C1' } },
];
const schedule = buildSchedule(shows);
assert(schedule.totalDur === 600, 'totalDur = 100+200+300 = 600');
assert(schedule.entries.length === 3, '3 entries');
assert(schedule.entries[0].startInCycle === 0 && schedule.entries[0].endInCycle === 100, 'A spans 0..100');
assert(schedule.entries[1].startInCycle === 100 && schedule.entries[1].endInCycle === 300, 'B spans 100..300');
assert(schedule.entries[2].startInCycle === 300 && schedule.entries[2].endInCycle === 600, 'C spans 300..600');

// Walk a pretend wall-clock across episode boundaries in the SAME cycle.
// Pick a base whose seconds-value is a multiple of 600 so posInCycle(base) === 0.
const base = 600 * 1000 * 1000; // 600,000,000 ms → 600,000 s → posInCycle = 0
const a1 = getOnAir(schedule, base + 50 * 1000);
assert(a1.onAirEntry.episode.audioUrl === 'a.mp3' && a1.offsetSecs === 50, 'mid-A at t+50 → a.mp3, offset 50');

const a2 = getOnAir(schedule, base + 150 * 1000);
assert(a2.onAirEntry.episode.audioUrl === 'b.mp3' && a2.offsetSecs === 50, 'mid-B at t+150 → b.mp3, offset 50 (episode rotated)');

const a3 = getOnAir(schedule, base + 450 * 1000);
assert(a3.onAirEntry.episode.audioUrl === 'c.mp3' && a3.offsetSecs === 150, 'mid-C at t+450 → c.mp3, offset 150');

// Wrap into the next cycle.
const a4 = getOnAir(schedule, base + 600 * 1000);
assert(a4.onAirEntry.episode.audioUrl === 'a.mp3' && a4.offsetSecs === 0, 'cycle wrap at t+600 → a.mp3, offset 0');

const a5 = getOnAir(schedule, base + 625 * 1000);
assert(a5.onAirEntry.episode.audioUrl === 'a.mp3' && a5.offsetSecs === 25, 'mid-A next cycle at t+625 → offset 25');

// Next-up pointer.
assert(a1.nextEntry.episode.audioUrl === 'b.mp3', 'A → next is B');
assert(a3.nextEntry.episode.audioUrl === 'a.mp3', 'C → next wraps to A');

// Offset clamp: if caller passes a nowMs right at episode end, offset stays within [0, duration-1].
const edge = getOnAir(schedule, base + 99 * 1000 + 999);
assert(edge.onAirEntry.episode.audioUrl === 'a.mp3' && edge.offsetSecs <= 99, 'offset clamped below duration');

// Negative clock doesn't blow up.
const neg = getOnAir(schedule, -5000);
assert(neg && neg.onAirEntry, 'negative nowMs returns a valid entry (mod wraps)');

// Visible blocks around a wall clock — must include blocks across the cycle boundary.
const blocks = getVisibleBlocks(schedule, { nowMs: base + 550 * 1000, beforeMins: 30, totalMins: 180 });
assert(blocks.length > 0, 'visible blocks non-empty');
assert(blocks.some((b) => b.isCurrent), 'exactly one current block visible');
assert(blocks.filter((b) => b.isCurrent).length === 1, 'only one block is current');
const current = blocks.find((b) => b.isCurrent);
assert(current.episode.audioUrl === 'c.mp3', 'current block at t+550 is C');

// Build with no valid shows.
assert(buildSchedule([]) === null, 'empty → null');
assert(buildSchedule([{ show: {}, episode: { audioUrl: '', durationSeconds: 0 } }]) === null, 'no duration → null');

console.log('');
if (failed > 0) {
  console.error(`${failed} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('All schedule assertions passed.');
}
