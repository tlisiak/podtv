import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Manages a single <audio> element. Returns memoized actions plus reactive
 * state. `tuneIn` seeks to an offset once the media is ready; `error` surfaces
 * failures so the UI can show them instead of swallowing them.
 */
export function useAudioPlayer() {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const a = new Audio();
    a.preload = 'auto';
    audioRef.current = a;

    const onPlay = () => {
      setIsPlaying(true);
      setError(null);
    };
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(a.currentTime || 0);
    const onMeta = () => setDuration(a.duration || 0);
    const onError = () => {
      const code = a.error?.code;
      const map = {
        1: 'Playback aborted',
        2: 'Network error — try again',
        3: 'Audio decode error',
        4: 'Audio source not supported',
      };
      setError(map[code] || 'Audio error');
      setIsPlaying(false);
    };

    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    a.addEventListener('error', onError);

    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
      a.removeEventListener('error', onError);
      a.pause();
      a.src = '';
      audioRef.current = null;
    };
  }, []);

  const tuneIn = useCallback((audioUrl, offsetSecs, autoplay = true) => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    setError(null);
    if (a.src !== audioUrl) {
      a.src = audioUrl;
      a.load();
    }

    const seekAndPlay = () => {
      try {
        if (Number.isFinite(offsetSecs) && offsetSecs > 0) {
          a.currentTime = offsetSecs;
        }
        if (autoplay) {
          a.play().catch((e) => {
            if (e?.name !== 'NotAllowedError') setError(String(e?.message || e));
          });
        }
      } catch {
        /* ignore transient seek errors; audio element will emit 'error' if fatal */
      }
    };

    if (a.readyState >= 2) {
      seekAndPlay();
    } else {
      const once = () => {
        a.removeEventListener('canplay', once);
        seekAndPlay();
      };
      a.addEventListener('canplay', once, { once: true });
    }
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) {
      a.play().catch((e) => {
        if (e?.name !== 'NotAllowedError') setError(String(e?.message || e));
      });
    } else {
      a.pause();
    }
  }, []);

  const seekRelative = useCallback((deltaSecs) => {
    const a = audioRef.current;
    if (!a || !a.src) return;
    const t = (a.currentTime || 0) + deltaSecs;
    a.currentTime = Math.max(0, t);
  }, []);

  const actions = useMemo(() => ({ tuneIn, toggle, seekRelative }), [tuneIn, toggle, seekRelative]);

  return {
    ...actions,
    audioRef,
    isPlaying,
    currentTime,
    duration,
    error,
  };
}
