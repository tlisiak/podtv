import { formatClock } from '../lib/time.js';

export default function TopBar({ now }) {
  return (
    <div className="topbar">
      <div className="logo">
        <span className="pod">POD</span>
        <span className="tv">VISION</span>
      </div>
      <span className="live-badge">Live</span>
      <div className="topbar-spacer" />
      <div className="clock">{formatClock(now)}</div>
    </div>
  );
}
