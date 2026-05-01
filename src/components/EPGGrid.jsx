import TimeHeader from './TimeHeader.jsx';
import ChannelRow from './ChannelRow.jsx';
import { CHANNELS } from '../lib/channels.js';

const PX_PER_MIN = 8;

export default function EPGGrid({ nowMs, gridStartMs, selectedId, onSelect, onScheduleChange }) {
  const nowLeftPx = ((nowMs - gridStartMs) / 60_000) * PX_PER_MIN;

  return (
    <div className="epg-scroll" role="grid" aria-label="Podcast program guide">
      <div className="epg-inner">
        <div className="epg-corner">PODVISION</div>
        <TimeHeader gridStartMs={gridStartMs} />
        <div
          className="now-line"
          style={{ left: `calc(var(--channel-col-w) + ${nowLeftPx}px)` }}
          aria-hidden="true"
        />
        {CHANNELS.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            nowMs={nowMs}
            gridStartMs={gridStartMs}
            selected={selectedId === channel.id}
            onSelect={onSelect}
            onScheduleChange={onScheduleChange}
          />
        ))}
      </div>
    </div>
  );
}
