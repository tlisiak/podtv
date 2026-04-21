import { useEffect, useRef, useState } from 'react';

export function useAudioPlayer() {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'auto';
  }

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setCurrentTime(a.currentTime || 0);
    const onMeta = () => setDuration(a.duration || 0);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('durationchange', onMeta);
    return () => {
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('durationchange', onMeta);
    };
  }, []);

  /**
   * Tune in: set src and seek to the current position within the on-air episode.
   * offsetSecs = (now - episode.startSecs) — how far into the episode we are.
   */
  function tuneIn(audioUrl, offsetSecs, autoplay = true) {
    const a = audioRef.current;
    if (!a) return;
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
          a.play().catch(() => {
            /* user gesture required — caller handles */
          });
        }
      } catch {
        /* ignore */
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
  }

  function toggle() {
    const a = audioRef.current;
    if (!a || !a.src) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function seekRelative(deltaSecs) {
    const a = audioRef.current;
    if (!a || !a.src) return;
    const t = (a.currentTime || 0) + deltaSecs;
    a.currentTime = Math.max(0, t);
  }

  return { audio: audioRef.current, isPlaying, currentTime, duration, tuneIn, toggle, seekRelative };
}
