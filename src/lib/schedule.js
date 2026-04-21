/**
 * Given loaded episodes from all shows in a channel,
 * build a schedule and find what's currently "on air."
 */
export function buildSchedule(loadedShows) {
  const episodes = loadedShows
    .filter((s) => s.episode && s.episode.durationSeconds > 0 && s.episode.audioUrl)
    .map(({ show, episode }) => ({ ...episode, show }));

  if (episodes.length === 0) return null;

  const totalDur = episodes.reduce((sum, ep) => sum + ep.durationSeconds, 0);
  if (totalDur === 0) return null;

  const nowSecs = Math.floor(Date.now() / 1000);
  const posInCycle = nowSecs % totalDur;
  const cycleStart = nowSecs - posInCycle;

  const entries = [];
  let offset = 0;
  for (const ep of episodes) {
    entries.push({
      episode: ep,
      startSecs: cycleStart + offset,
      endSecs: cycleStart + offset + ep.durationSeconds,
    });
    offset += ep.durationSeconds;
  }

  const onAirEntry = entries.find((e) => e.startSecs <= nowSecs && nowSecs < e.endSecs);
  const onAirIdx = onAirEntry ? entries.indexOf(onAirEntry) : 0;
  const nextEntry = entries[(onAirIdx + 1) % entries.length];

  return { entries, totalDur, onAirEntry, nextEntry };
}

/**
 * Return all episode blocks that overlap the visible guide window.
 */
export function getVisibleBlocks(schedule, { nowMs, beforeMins = 30, totalMins = 180 }) {
  if (!schedule) return [];
  const { entries, totalDur } = schedule;
  const durMs = totalDur * 1000;
  const winStart = nowMs - beforeMins * 60_000;
  const winEnd = nowMs + (totalMins - beforeMins) * 60_000;
  const cycleCount = Math.ceil((totalMins * 60_000) / durMs) + 2;
  const blocks = [];

  for (let c = -1; c <= cycleCount; c++) {
    for (const e of entries) {
      const startMs = e.startSecs * 1000 + c * durMs;
      const endMs = e.endSecs * 1000 + c * durMs;
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
