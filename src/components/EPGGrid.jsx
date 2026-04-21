import TimeHeader from './TimeHeader.jsx';
import ChannelRow from './ChannelRow.jsx';
import { CHANNELS } from '../lib/channels.js';

export default function EPGGrid({ nowMs, selectedId, onSelect, onScheduleChange }) {
  return (
    <div className="epg-scroll">
      <div className="epg-inner">
        <div className="epg-corner">PODVISION</div>
        <TimeHeader nowMs={nowMs} />
        <div className="now-line" />
        {CHANNELS.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            nowMs={nowMs}
            selected={selectedId === channel.id}
            onSelect={onSelect}
            onScheduleChange={onScheduleChange}
          />
        ))}
      </div>
    </div>
  );
}
