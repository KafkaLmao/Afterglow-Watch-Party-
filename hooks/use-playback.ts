'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { RoomSnapshot } from '../lib/room-types';

const SYNC_INTERVAL_MS = 200;
const SEEK_THRESHOLD_SECONDS = 0.25;
const RATE_THRESHOLD_SECONDS = 0.06;
const RATE_CORRECTION = 0.03;

export function usePlayback(
  room: RoomSnapshot,
  clockOffset: RefObject<number>,
  source: string,
) {
  const video = useRef<HTMLVideoElement>(null);
  const [drift, setDrift] = useState(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const latestPlayback = useRef(room.playback);

  useEffect(() => {
    latestPlayback.current = room.playback;
  }, [room.playback]);

  useEffect(() => {
    const timer = setInterval(() => {
      const media = video.current;
      if (!media || media.readyState < 1) return;
      const playback = latestPlayback.current;
      const elapsed = playback.playing
        ? (Date.now() + clockOffset.current - playback.at) / 1000
        : 0;
      const target = Math.min(
        Number.isFinite(media.duration) ? media.duration : 86400,
        Math.max(0, playback.position + elapsed),
      );
      const difference = media.currentTime - target;
      setDrift(Math.abs(difference) * 1000);

      if (Math.abs(difference) > SEEK_THRESHOLD_SECONDS) {
        media.currentTime = target;
        media.playbackRate = 1;
      } else {
        media.playbackRate =
          playback.playing && Math.abs(difference) > RATE_THRESHOLD_SECONDS
            ? 1 + (difference > 0 ? -RATE_CORRECTION : RATE_CORRECTION)
            : 1;
      }
      if (playback.playing && media.paused) {
        void media
          .play()
          .then(() => setBlocked(false))
          .catch(() => setBlocked(true));
      }
      if (!playback.playing && !media.paused) media.pause();
      setProgress(media.currentTime);
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [clockOffset, source]);

  return {
    video,
    drift,
    progress,
    setProgress,
    duration,
    setDuration,
    muted,
    setMuted,
    blocked,
    setBlocked,
  };
}
