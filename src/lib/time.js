export function formatClock(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** Format epoch ms as "H:MM" or "H:MM AM/PM". */
export function formatHourMin(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Format seconds as "M:SS" or "H:MM:SS". */
export function formatDuration(totalSecs) {
  if (!Number.isFinite(totalSecs) || totalSecs < 0) return '0:00';
  const s = Math.floor(totalSecs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}

/** Round an epoch ms down to the nearest `minutes` boundary. */
export function roundDownToMinutes(ms, minutes) {
  const step = minutes * 60_000;
  return Math.floor(ms / step) * step;
}
