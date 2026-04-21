import { useCallback, useEffect, useRef, useState } from 'react';
import TopBar from './components/TopBar.jsx';
import EPGGrid from './components/EPGGrid.jsx';
import NowPlaying from './components/NowPlaying.jsx';
import { CHANNELS } from './lib/channels.js';
import { useClock } from './hooks/useClock.js';
import { useAudioPlayer } from './hooks/useAudioPlayer.js';
import './App.css';

export default function App() {
  const now = useClock(1000);
  const nowMs = now.getTime();

  const [selectedId, setSelectedId] = useState(CHANNELS[0].id);
  const [schedules, setSchedules] = useState({});
  const lastTunedRef = useRef({ channelId: null, audioUrl: null });
  const hasGestureRef = useRef(false);

  const player = useAudioPlayer();

  const onScheduleChange = useCallback((channelId, schedule) => {
    setSchedules((prev) => ({ ...prev, [channelId]: schedule }));
  }, []);

  const selectedChannel = CHANNELS.find((c) => c.id === selectedId);
  const selectedSchedule = schedules[selectedId];

  // Tune in whenever the selected channel's on-air episode changes.
  useEffect(() => {
    const onAir = selectedSchedule?.onAirEntry;
    if (!onAir?.episode?.audioUrl) return;
    const audioUrl = onAir.episode.audioUrl;
    const last = lastTunedRef.current;
    if (last.channelId === selectedId && last.audioUrl === audioUrl) return;
    lastTunedRef.current = { channelId: selectedId, audioUrl };

    const offsetSecs = Math.max(0, Math.floor(Date.now() / 1000) - onAir.startSecs);
    player.tuneIn(audioUrl, offsetSecs, hasGestureRef.current);
  }, [selectedId, selectedSchedule, player]);

  // Keyboard nav: ↑/↓ change channel, Space toggles play, ←/→ seek.
  useEffect(() => {
    function onKey(e) {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedId((id) => {
          const i = CHANNELS.findIndex((c) => c.id === id);
          return CHANNELS[Math.min(CHANNELS.length - 1, i + 1)].id;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedId((id) => {
          const i = CHANNELS.findIndex((c) => c.id === id);
          return CHANNELS[Math.max(0, i - 1)].id;
        });
      } else if (e.key === ' ') {
        e.preventDefault();
        hasGestureRef.current = true;
        player.toggle();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        player.seekRelative(-30);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        player.seekRelative(30);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player]);

  // Record any user gesture so autoplay is allowed after the first interaction.
  useEffect(() => {
    function onGesture() {
      hasGestureRef.current = true;
      // Try to resume / play if we already have a src queued.
      if (player.audio && player.audio.src && player.audio.paused) {
        player.audio.play().catch(() => {});
      }
    }
    window.addEventListener('pointerdown', onGesture, { once: true });
    return () => window.removeEventListener('pointerdown', onGesture);
  }, [player]);

  const handleSelect = useCallback((id) => {
    hasGestureRef.current = true;
    setSelectedId(id);
  }, []);

  return (
    <div className="app">
      <TopBar now={now} />
      <EPGGrid
        nowMs={nowMs}
        selectedId={selectedId}
        onSelect={handleSelect}
        onScheduleChange={onScheduleChange}
      />
      <NowPlaying
        channel={selectedChannel}
        schedule={selectedSchedule}
        player={player}
      />
    </div>
  );
}
