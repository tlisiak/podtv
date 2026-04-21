import PlatformLinks from './PlatformLinks.jsx';
import { formatDuration } from '../lib/time.js';

export default function NowPlaying({ channel, schedule, player }) {
  if (!channel) {
    return (
      <div className="now-playing">
        <div className="np-ch">--</div>
        <div className="np-art" />
        <div className="np-meta">
          <div className="np-channel-line">Select a channel to tune in</div>
        </div>
      </div>
    );
  }

  const onAir = schedule?.onAirEntry?.episode;
  const next = schedule?.nextEntry?.episode;
  const show = onAir?.show;

  const cur = player?.currentTime || 0;
  const dur = player?.duration || onAir?.durationSeconds || 0;
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <div className="now-playing">
      <div className="np-ch">{channel.ch}</div>
      {onAir?.image ? (
        <img className="np-art" src={onAir.image} alt="" />
      ) : (
        <div className="np-art" />
      )}

      <div className="np-meta">
        <div className="np-channel-line">
          {channel.name} · {channel.label}
        </div>
        <div className="np-show">{show?.name || '—'}</div>
        <div className="np-title">{onAir?.title || 'Loading…'}</div>
        <div className="np-next">{next ? `Next: ${next.show?.name}` : ''}</div>
        <div className="np-progress">
          <div className="np-bar">
            <div className="np-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="np-time">
            {formatDuration(cur)} / {formatDuration(dur)}
          </div>
        </div>
      </div>

      <div className="np-controls">
        <button className="btn" onClick={() => player?.seekRelative(-30)} aria-label="Back 30 seconds">
          «30
        </button>
        <button className="btn play" onClick={() => player?.toggle()} aria-label="Play / pause">
          {player?.isPlaying ? '⏸' : '▶'}
        </button>
        <button className="btn" onClick={() => player?.seekRelative(30)} aria-label="Forward 30 seconds">
          30»
        </button>
      </div>

      <PlatformLinks show={show} />
    </div>
  );
}
