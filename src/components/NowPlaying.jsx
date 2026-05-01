import { useState } from 'react';
import PlatformLinks from './PlatformLinks.jsx';
import { formatDuration } from '../lib/time.js';

export default function NowPlaying({ channel, onAir, player }) {
  const [artBroken, setArtBroken] = useState(false);

  if (!channel) {
    return (
      <div className="now-playing">
        <div className="np-ch">--</div>
        <div className="np-art np-art-empty" aria-hidden="true" />
        <div className="np-meta">
          <div className="np-channel-line">Select a channel to tune in</div>
        </div>
      </div>
    );
  }

  const airingEp = onAir?.onAirEntry?.episode;
  const nextEp = onAir?.nextEntry?.episode;
  const show = airingEp?.show;

  const cur = player?.currentTime || 0;
  const dur = player?.duration || airingEp?.durationSeconds || 0;
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const showArt = airingEp?.image && !artBroken;

  return (
    <div className="now-playing">
      <div className="np-ch" aria-label={`Channel ${channel.ch}`}>
        {channel.ch}
      </div>
      {showArt ? (
        <img
          className="np-art"
          src={airingEp.image}
          alt=""
          onError={() => setArtBroken(true)}
        />
      ) : (
        <div className="np-art np-art-empty" aria-hidden="true">
          {channel.name?.slice(0, 2)}
        </div>
      )}

      <div className="np-meta">
        <div className="np-channel-line">
          {channel.name} · {channel.label}
        </div>
        <div className="np-show">{show?.name || '—'}</div>
        <div className="np-title">{airingEp?.title || 'Loading…'}</div>
        {player?.error ? (
          <div className="np-error" role="alert">
            {player.error}
          </div>
        ) : (
          <div className="np-next">{nextEp ? `Next: ${nextEp.show?.name}` : ''}</div>
        )}
        <div className="np-progress" aria-hidden="true">
          <div className="np-bar">
            <div className="np-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="np-time">
            {formatDuration(cur)} / {formatDuration(dur)}
          </div>
        </div>
      </div>

      <div className="np-controls">
        <button
          className="btn"
          onClick={() => player?.seekRelative(-30)}
          aria-label="Back 30 seconds"
        >
          «30
        </button>
        <button
          className="btn play"
          onClick={() => player?.toggle()}
          aria-label={player?.isPlaying ? 'Pause' : 'Play'}
        >
          {player?.isPlaying ? '⏸' : '▶'}
        </button>
        <button
          className="btn"
          onClick={() => player?.seekRelative(30)}
          aria-label="Forward 30 seconds"
        >
          30»
        </button>
      </div>

      <PlatformLinks show={show} />
    </div>
  );
}
