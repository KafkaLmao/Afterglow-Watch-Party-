'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Music2,
  ExternalLink,
} from 'lucide-react';
import {
  createMediaController,
  type MediaController,
  type MediaSource,
} from '../lib/media-controller';
import { mediaSyncPlan } from '../lib/media-sync.mjs';
import type { Playback, SendAction } from '../lib/room-types';
import { formatTime } from '../lib/display';

export function MediaPlayer({
  source,
  playback,
  isHost,
  online,
  clockOffset,
  action,
}: {
  source: MediaSource;
  playback: Playback;
  isHost: boolean;
  online: boolean;
  clockOffset: RefObject<number>;
  action: SendAction;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const media = useRef<HTMLVideoElement>(null);
  const controller = useRef<MediaController | null>(null);
  const latest = useRef({ playback, isHost, online, action });
  const blockedRef = useRef(false);
  const errorRef = useRef(false);
  const holdSyncUntil = useRef(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [captions, setCaptions] = useState<{ label: string }[]>([]);
  const [caption, setCaption] = useState(-1);
  const embedded = source.kind === 'youtube' || source.kind === 'vimeo';

  useEffect(() => {
    latest.current = { playback, isHost, online, action };
  }, [playback, isHost, online, action]);
  useEffect(() => {
    const abort = new AbortController();
    const container = surface.current!;
    let sampling = false;
    let lastSeek = 0;
    let lastPlay = 0;
    errorRef.current = false;
    blockedRef.current = false;
    const fail = (message: string) => {
      if (!abort.signal.aborted) {
        errorRef.current = true;
        setError(message);
      }
    };
    const autoplayBlocked = () => {
      if (!abort.signal.aborted) {
        blockedRef.current = true;
        setBlocked(true);
      }
    };
    void createMediaController(
      source,
      container,
      media.current,
      {
        error: fail,
        blocked: autoplayBlocked,
        changed: (type, position) => {
          const current = latest.current;
          if (!current.isHost || !current.online || abort.signal.aborted)
            return;
          const desired =
            current.playback.position +
            (current.playback.playing
              ? Math.max(
                  0,
                  Date.now() + clockOffset.current - current.playback.at,
                ) / 1000
              : 0);
          const sameState =
            type === 'play'
              ? current.playback.playing
              : type === 'pause'
                ? !current.playback.playing
                : false;
          if (sameState && Math.abs(desired - position) < 2) return;
          holdSyncUntil.current = Date.now() + 1500;
          void current.action({ type, position });
        },
        ended: (position) => {
          if (
            !abort.signal.aborted &&
            latest.current.isHost &&
            latest.current.online
          )
            void latest.current.action({ type: 'pause', position });
        },
      },
      abort.signal,
      retry > 0,
    )
      .then((result) => {
        if (abort.signal.aborted) {
          result.destroy();
          return;
        }
        controller.current = result;
        setCaptions(result.captions || []);
        const selected =
          result.captions?.findIndex((track) => track.default) ?? -1;
        result.caption?.(selected);
        setCaption(selected);
        setReady(true);
      })
      .catch((failure) => {
        if (!abort.signal.aborted)
          fail(
            failure instanceof Error
              ? failure.message
              : 'Could not load the player.',
          );
      });
    const interval = setInterval(
      async () => {
        const player = controller.current;
        if (!player || sampling || errorRef.current) return;
        sampling = true;
        try {
          const sample = await player.sample();
          if (abort.signal.aborted) return;
          setProgress(sample.position);
          setDuration(sample.duration);
          if (!latest.current.online || Date.now() < holdSyncUntil.current)
            return;
          const plan = mediaSyncPlan(
            latest.current.playback,
            sample,
            Date.now() + clockOffset.current,
            embedded,
          );
          if (plan.seek && (!embedded || Date.now() - lastSeek > 2000)) {
            lastSeek = Date.now();
            await player.seek(plan.target);
          }
          player.rate?.(plan.seek ? 1 : plan.rate);
          if (plan.pause) await player.pause();
          if (
            plan.play &&
            !blockedRef.current &&
            Date.now() - lastPlay > 2000
          ) {
            lastPlay = Date.now();
            try {
              await player.play();
            } catch {
              autoplayBlocked();
            }
          }
          if (!sample.paused && blockedRef.current) {
            blockedRef.current = false;
            setBlocked(false);
          }
        } catch {
          fail(
            'The player stopped responding. Retry the player or load another link.',
          );
        } finally {
          sampling = false;
        }
      },
      embedded ? 500 : 200,
    );
    return () => {
      clearInterval(interval);
      const player = controller.current;
      controller.current = null;
      abort.abort();
      if (!embedded) player?.destroy();
      container.replaceChildren();
    };
  }, [source, clockOffset, embedded, retry]);

  async function togglePlayback() {
    const player = controller.current;
    if (!player || !isHost || !online) return;
    holdSyncUntil.current = Date.now() + 1500;
    blockedRef.current = false;
    setBlocked(false);
    try {
      if (playback.playing) await player.pause();
      else await player.play();
      const sample = await player.sample();
      await action({
        type: playback.playing ? 'pause' : 'play',
        position: sample.position,
      });
    } catch {
      blockedRef.current = true;
      setBlocked(true);
    }
  }
  async function commitSeek() {
    if (seekDraft === null) return;
    const position = seekDraft;
    setSeekDraft(null);
    holdSyncUntil.current = Date.now() + 1500;
    await action({ type: 'seek', position });
  }
  const disabled = !ready || !isHost || !online || !!error;
  return (
    <div className="shared-player" ref={shell}>
      <div className="media-surface">
        <div className="provider-surface" ref={surface} />
        {!embedded && (
          <video
            ref={media}
            src={source.kind === 'anikoto' ? undefined : source.url}
            playsInline
            preload="metadata"
            className={source.kind === 'audio' ? 'audio-media' : ''}
          />
        )}
        {source.kind === 'audio' && (
          <div className="audio-art">
            <Music2 size={52} />
            <span>{playback.title || 'Shared audio'}</span>
          </div>
        )}
        {!ready && !error && (
          <div className="media-loading" role="status">
            Loading {source.label} player…
          </div>
        )}
        {blocked && !error && (
          <button
            className="enable-audio"
            onClick={async () => {
              blockedRef.current = false;
              try {
                await controller.current?.play();
                setBlocked(false);
                if (isHost && !playback.playing)
                  await action({ type: 'play', position: progress });
              } catch {
                blockedRef.current = true;
              }
            }}
          >
            Tap to enable playback on this device
          </button>
        )}
      </div>
      {!embedded && (
        <div className="shared-controls">
          <input
            type="range"
            aria-label="Seek shared media"
            min={0}
            max={duration || 1}
            step={0.1}
            value={Math.min(seekDraft ?? progress, duration || 1)}
            disabled={disabled || !duration}
            onChange={(event) => setSeekDraft(Number(event.target.value))}
            onPointerUp={() => void commitSeek()}
            onKeyUp={() => void commitSeek()}
          />
          <div>
            <button
              disabled={disabled}
              aria-label={playback.playing ? 'Pause together' : 'Play together'}
              onClick={() => void togglePlayback()}
            >
              {playback.playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <button
              disabled={!ready || !!error}
              aria-label={muted ? 'Unmute' : 'Mute'}
              onClick={async () => {
                try {
                  await controller.current?.mute(!muted);
                  setMuted(!muted);
                } catch {
                  setError(
                    'Could not change audio. Use the provider’s volume control.',
                  );
                }
              }}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <span>
              {formatTime(progress)} <i>/ {formatTime(duration)}</i>
            </span>
            <span className="provider-label">
              {source.label} · {isHost ? 'Host controls' : 'Following host'}
            </span>
            {captions.length > 0 && (
              <select
                className="caption-select"
                aria-label="Subtitles"
                value={caption}
                disabled={!ready || !!error}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  controller.current?.caption?.(index);
                  setCaption(index);
                }}
              >
                <option value={-1}>Subtitles off</option>
                {captions.map((track, index) => (
                  <option key={index} value={index}>
                    {track.label}
                  </option>
                ))}
              </select>
            )}
            <button
              aria-label="Full screen"
              onClick={() => {
                void shell.current?.requestFullscreen().catch(() => {});
              }}
            >
              <Maximize size={18} />
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="media-error" role="alert">
          <p>{error}</p>
          <div>
            <button
              onClick={() => {
                setError('');
                setReady(false);
                setRetry((value) => value + 1);
              }}
            >
              Retry player
            </button>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              Open original <ExternalLink size={13} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
