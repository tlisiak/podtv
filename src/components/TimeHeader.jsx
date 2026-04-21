import { formatHourMin } from '../lib/time.js';
import { roundDownToMinutes } from '../lib/time.js';

const PX_PER_MIN = 8;

export default function TimeHeader({ nowMs, beforeMins = 30, totalMins = 180 }) {
  const gridStart = roundDownToMinutes(nowMs - beforeMins * 60_000, 30);
  const slots = [];
  for (let m = 0; m < totalMins; m += 30) {
    slots.push(gridStart + m * 60_000);
  }
  return (
    <div className="time-header">
      {slots.map((ms) => (
        <div key={ms} className="time-slot">
          {formatHourMin(ms)}
        </div>
      ))}
    </div>
  );
}
