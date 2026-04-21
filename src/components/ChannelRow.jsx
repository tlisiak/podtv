import { useEffect, useMemo } from 'react';
import { useChannelLoader } from '../hooks/useChannelLoader.js';
import { buildSchedule, getVisibleBlocks } from '../lib/schedule.js';
import EpisodeBlock from './EpisodeBlock.jsx';

export default function ChannelRow({ channel, nowMs, selected, onSelect, onScheduleChange }) {
  const { state, loadedShows, error } = useChannelLoader(channel);

  const schedule = useMemo(
    () => (state === 'ok' ? buildSchedule(loadedShows) : null),
    [state, loadedShows]
  );

  useEffect(() => {
    if (schedule) onScheduleChange?.(channel.id, schedule);
  }, [schedule, channel.id, onScheduleChange]);

  const blocks = schedule ? getVisibleBlocks(schedule, { nowMs }) : [];

  const statusClass = state === 'ok' ? 'ok' : state === 'loading' ? 'load' : 'err';
  const statusLabel = state === 'ok' ? 'SIG' : state === 'loading' ? '...' : 'ERR';

  return (
    <div className={`channel-row ${selected ? 'selected' : ''}`} data-channel-id={channel.id}>
      <div
        className="channel-cell"
        onClick={() => onSelect?.(channel.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(channel.id);
          }
        }}
      >
        <div className="channel-num">CH {channel.ch}</div>
        <div className="channel-name">{channel.name}</div>
        <div className="channel-label">{channel.label}</div>
        <div className={`channel-status ${statusClass}`} title={error || ''}>
          {statusLabel}
        </div>
      </div>
      <div className="guide-strip">
        {state === 'ok' ? (
          blocks.map((block, i) => (
            <EpisodeBlock
              key={`${channel.id}-${i}-${block.startMs}`}
              block={block}
              nowMs={nowMs}
              color={channel.color}
              onClick={() => onSelect?.(channel.id)}
            />
          ))
        ) : (
          <div className="row-empty">
            {state === 'loading' ? 'Tuning in…' : 'Signal lost'}
          </div>
        )}
      </div>
    </div>
  );
}
