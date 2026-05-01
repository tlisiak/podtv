import { formatHourMin } from '../lib/time.js';

const PX_PER_MIN = 8;

export default function TimeHeader({ gridStartMs, totalMins = 180, slotMins = 30 }) {
  const slots = [];
  for (let m = 0; m < totalMins; m += slotMins) {
    slots.push(gridStartMs + m * 60_000);
  }
  return (
    <div className="time-header">
      {slots.map((ms) => (
        <div key={ms} className="time-slot" style={{ width: `${slotMins * PX_PER_MIN}px` }}>
          {formatHourMin(ms)}
        </div>
      ))}
    </div>
  );
}
