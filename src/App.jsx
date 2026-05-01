import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import EPGGrid from './components/EPGGrid.jsx';
import NowPlaying from './components/NowPlaying.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { CHANNELS } from './lib/channels.js';
import { getOnAir } from './lib/schedule.js';
import { useClock } from './hooks/useClock.js';
import { useAudioPlayer } from './hooks/useAudioPlayer.js';
import { roundDownToMinutes } from './lib/time.js';
import './App.css';

const BEFORE_MINS = 30;

export default function App() {
  const now = useClock(1000);
  const nowMs = now.getTime();

  // Grid anchor is stable for ~1 minute, so rendering doesn't jitter.
  const gridStartMs = useMemo(
    () => roundDownToMinutes(nowMs - BEFORE_MINS * 60_000, 1),
    [Math.floor(nowMs / 60_000)] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [selectedId, setSelectedId] = useState(CHANNELS[0].id);
  const [schedules, setSchedules] = useState({});
  const lastTunedRef = useRef({ channelId: null, audioUrl: null });
  const hasGestureRef = useRef(false);

  const player = useAudioPlayer();
  const { tuneIn, toggle, seekRelative } = player;

  const onScheduleChange = useCallback((channelId, schedule) => {
    setSchedules((prev) => {
      if (prev[channelId] === schedule) return prev;
      return { ...prev, [channelId]: schedule };
    });
  }, []);

  const selectedChannel = CHANNELS.find((c) => c.id === selectedId);
  const selectedSchedule = schedules[selectedId];
  const onAir = useMemo(
    () => getOnAir(selectedSchedule, nowMs),
    [selectedSchedule, nowMs]
  );

  // Tune in whenever the selected channel's on-air audio URL changes.
  useEffect(() => {
    const entry = onAir?.onAirEntry;
    if (!entry?.episode?.audioUrl) return;
    const audioUrl = entry.episode.audioUrl;
    const last = lastTunedRef.current;
    if (last.channelId === selectedId && last.audioUrl === audioUrl) return;
    lastTunedRef.current = { channelId: selectedId, audioUrl };
    tuneIn(audioUrl, onAir.offsetSecs, hasGestureRef.current);
  }, [selectedId, onAir, tuneIn]);

  const scrollRowIntoView = useCallback((id) => {
    const el = document.querySelector(`[data-channel-id="${id}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    function onKey(e) {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedId((id) => {
          const i = CHANNELS.findIndex((c) => c.id === id);
          const next = CHANNELS[Math.min(CHANNELS.length - 1, i + 1)].id;
          scrollRowIntoView(next);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedId((id) => {
          const i = CHANNELS.findIndex((c) => c.id === id);
          const next = CHANNELS[Math.max(0, i - 1)].id;
          scrollRowIntoView(next);
          return next;
        });
      } else if (e.key === ' ') {
        e.preventDefault();
        hasGestureRef.current = true;
        toggle();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-30);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekRelative(30);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekRelative, scrollRowIntoView]);

  // Record first user gesture so autoplay can succeed afterward.
  useEffect(() => {
    function onGesture() {
      hasGestureRef.current = true;
      const a = player.audioRef?.current;
      if (a && a.src && a.paused) a.play().catch(() => {});
    }
    window.addEventListener('pointerdown', onGesture, { once: true });
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [player.audioRef]);

  const handleSelect = useCallback(
    (id) => {
      hasGestureRef.current = true;
      setSelectedId(id);
      scrollRowIntoView(id);
    },
    [scrollRowIntoView]
  );

  return (
    <div className="app">
      <TopBar now={now} />
      <ErrorBoundary>
        <EPGGrid
          nowMs={nowMs}
          gridStartMs={gridStartMs}
          selectedId={selectedId}
          onSelect={handleSelect}
          onScheduleChange={onScheduleChange}
        />
      </ErrorBoundary>
      <NowPlaying
        channel={selectedChannel}
        onAir={onAir}
        player={player}
      />
    </div>
  );
}
