/**
 * Build a cycle-relative schedule from the latest episode of each show.
 * Entries expose `startInCycle` / `endInCycle` in seconds within the loop;
 * absolute "what's on air right now" is derived live with `getOnAir`.
 */
export function buildSchedule(loadedShows) {
  const episodes = loadedShows
    .filter((s) => s.episode && s.episode.durationSeconds > 0 && s.episode.audioUrl)
    .map(({ show, episode }) => ({ ...episode, show }));

  if (episodes.length === 0) return null;

  const entries = [];
  let offset = 0;
  for (const ep of episodes) {
    entries.push({
      episode: ep,
      startInCycle: offset,
      endInCycle: offset + ep.durationSeconds,
    });
    offset += ep.durationSeconds;
  }
  const totalDur = offset;
  if (totalDur === 0) return null;

  return { entries, totalDur };
}

/** Positive-modulo, so negative clocks don't produce negative positions. */
function mod(a, n) {
  return ((a % n) + n) % n;
}

/**
 * Given a schedule and a wall-clock `nowMs`, return what's currently playing,
 * what's next, and how many seconds we are into the on-air episode.
 */
export function getOnAir(schedule, nowMs = Date.now()) {
  if (!schedule) return null;
  const { entries, totalDur } = schedule;
  const nowSecs = Math.floor(nowMs / 1000);
  const posInCycle = mod(nowSecs, totalDur);

  let idx = entries.findIndex(
    (e) => e.startInCycle <= posInCycle && posInCycle < e.endInCycle
  );
  if (idx < 0) idx = 0;

  const onAir = entries[idx];
  const next = entries[(idx + 1) % entries.length];
  const rawOffset = posInCycle - onAir.startInCycle;
  const maxOffset = Math.max(0, onAir.episode.durationSeconds - 1);
  const offsetSecs = Math.max(0, Math.min(maxOffset, rawOffset));

  return { onAirEntry: onAir, nextEntry: next, offsetSecs };
}

/**
 * Return all episode blocks that overlap the visible guide window.
 * Blocks carry absolute `startMs` / `endMs` so rendering is straightforward.
 */
export function getVisibleBlocks(schedule, { nowMs, beforeMins = 30, totalMins = 180 }) {
  if (!schedule) return [];
  const { entries, totalDur } = schedule;
  const durMs = totalDur * 1000;
  const nowSecs = Math.floor(nowMs / 1000);
  const posInCycle = mod(nowSecs, totalDur);
  const currentCycleStartMs = (nowSecs - posInCycle) * 1000;

  const winStart = nowMs - beforeMins * 60_000;
  const winEnd = nowMs + (totalMins - beforeMins) * 60_000;
  const cycleCount = Math.ceil((totalMins * 60_000) / durMs) + 2;
  const blocks = [];

  for (let c = -1; c <= cycleCount; c++) {
    const cycleBaseMs = currentCycleStartMs + c * durMs;
    for (const e of entries) {
      const startMs = cycleBaseMs + e.startInCycle * 1000;
      const endMs = cycleBaseMs + e.endInCycle * 1000;
      if (endMs > winStart && startMs < winEnd) {
        blocks.push({
          episode: e.episode,
          startMs,
          endMs,
          isCurrent: startMs <= nowMs && nowMs < endMs,
          isPast: endMs <= nowMs,
        });
      }
    }
  }
  return blocks;
}
