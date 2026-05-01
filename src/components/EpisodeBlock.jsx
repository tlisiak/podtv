const PX_PER_MIN = 8;
const GUIDE_W = 180 * PX_PER_MIN;

export default function EpisodeBlock({ block, gridStartMs, color, onClick }) {
  const minutesFromGridStart = (block.startMs - gridStartMs) / 60_000;
  const rawLeft = minutesFromGridStart * PX_PER_MIN;
  const rawRight = rawLeft + ((block.endMs - block.startMs) / 60_000) * PX_PER_MIN;
  const left = Math.max(rawLeft, 0);
  const width = Math.min(rawRight, GUIDE_W) - left;

  if (width < 8) return null;

  const state = block.isCurrent ? 'current' : block.isPast ? 'past' : 'future';

  return (
    <button
      type="button"
      className={`episode-block ${state}`}
      style={{
        left: `${left}px`,
        width: `${width}px`,
        background: color || 'var(--blue-dim)',
      }}
      onClick={onClick}
      title={`${block.episode.show?.name}: ${block.episode.title}`}
    >
      <div className="episode-show">{block.episode.show?.name}</div>
      <div className="episode-title">{block.episode.title}</div>
    </button>
  );
}
