import type { resolveMediaSource } from './media-source.mjs';
import { prepareAnikotoMedia, type Caption } from './anikoto-player';

export type MediaSource = ReturnType<typeof resolveMediaSource>;
export interface MediaSample {
  position: number;
  duration: number;
  paused: boolean;
  ended: boolean;
}
export interface MediaController {
  sample(): Promise<MediaSample>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  mute(value: boolean): Promise<void>;
  rate?(value: number): void;
  captions?: Caption[];
  caption?(index: number): void;
  destroy(): void;
}
interface Events {
  error(message: string): void;
  blocked(): void;
  changed(type: 'play' | 'pause' | 'seek', position: number): void;
  ended(position: number): void;
}
interface YouTubePlayer {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, ahead: boolean): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}
interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady(event: { target: YouTubePlayer }): void;
        onStateChange(event: { data: number; target: YouTubePlayer }): void;
        onError(event: { data: number }): void;
        onAutoplayBlocked(): void;
      };
    },
  ) => YouTubePlayer;
}
interface VimeoPlayer {
  ready(): Promise<void>;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  getPaused(): Promise<boolean>;
  getEnded(): Promise<boolean>;
  play(): Promise<void>;
  pause(): Promise<void>;
  setCurrentTime(seconds: number): Promise<number>;
  setMuted(value: boolean): Promise<boolean>;
  destroy(): Promise<void>;
  on(
    event: string,
    handler: (data: { seconds: number; message?: string }) => void,
  ): void;
}
type SdkWindow = Window & {
  YT?: YouTubeApi;
  Vimeo?: { Player: new (iframe: HTMLIFrameElement) => VimeoPlayer };
};
const sdkLoads = new Map<string, Promise<unknown>>();

function loadSdk<T>(url: string, getApi: () => T | undefined): Promise<T> {
  const ready = getApi();
  if (ready) return Promise.resolve(ready);
  const existing = sdkLoads.get(url);
  if (existing) return existing as Promise<T>;
  const promise = new Promise<T>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    const finish = (failure?: Error) => {
      clearInterval(poll);
      clearTimeout(timeout);
      if (failure) {
        script.remove();
        reject(failure);
      } else resolve(getApi()!);
    };
    const poll = setInterval(() => {
      if (getApi()) finish();
    }, 100);
    const timeout = setTimeout(
      () =>
        finish(
          new Error(
            'The media provider did not respond. Check your connection and try again.',
          ),
        ),
      20000,
    );
    script.onerror = () =>
      finish(
        new Error(
          'Could not reach the media provider. Check your connection and try again.',
        ),
      );
    document.head.appendChild(script);
  });
  sdkLoads.set(url, promise);
  void promise.catch(() => sdkLoads.delete(url));
  return promise;
}

export async function createMediaController(
  source: MediaSource,
  container: HTMLElement,
  media: HTMLMediaElement | null,
  events: Events,
  signal: AbortSignal,
  refresh = false,
): Promise<MediaController> {
  if (media) {
    const anikoto =
      source.kind === 'anikoto'
        ? await prepareAnikotoMedia(
            source.url,
            media,
            signal,
            events.error,
            refresh,
          )
        : undefined;
    media.addEventListener('ended', () => events.ended(media.duration), {
      signal,
    });
    media.addEventListener(
      'error',
      () =>
        events.error(
          'This media file could not play. Check that the link points to a playable file.',
        ),
      { signal },
    );
    return {
      captions: anikoto?.captions,
      caption: anikoto?.caption,
      sample: async () => ({
        position: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        paused: media.paused,
        ended: media.ended,
      }),
      play: async () => {
        await media.play();
      },
      pause: async () => {
        media.pause();
      },
      seek: async (seconds) => {
        if (media.readyState >= 1) media.currentTime = seconds;
      },
      mute: async (value) => {
        media.muted = value;
      },
      rate: (value) => {
        media.playbackRate = value;
      },
      destroy: () => {
        if (anikoto) anikoto.destroy();
        else media.pause();
      },
    };
  }
  const globals = window as SdkWindow;
  let commandedUntil = 0;
  const markCommand = () => {
    commandedUntil = Date.now() + 1200;
  };
  if (source.kind === 'youtube') {
    const api = await loadSdk('https://www.youtube.com/iframe_api', () =>
      globals.YT?.Player ? globals.YT : undefined,
    );
    signal.throwIfAborted();
    const element = document.createElement('div');
    container.appendChild(element);
    let player: YouTubePlayer | undefined;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              'YouTube did not load. Try another link or check your connection.',
            ),
          ),
        20000,
      );
      const fail = (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      };
      signal.addEventListener(
        'abort',
        () => {
          player?.destroy();
          fail(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
      player = new api.Player(element, {
        width: '100%',
        height: '100%',
        videoId: source.id!,
        playerVars: {
          playsinline: 1,
          autoplay: 0,
          controls: 1,
          rel: 0,
          origin: location.origin,
        },
        events: {
          onReady: () => {
            clearTimeout(timeout);
            resolve();
          },
          onStateChange: ({ data, target }) => {
            if (signal.aborted) return;
            if (data === 0) events.ended(target.getDuration());
            if (Date.now() < commandedUntil) return;
            if (data === 1) events.changed('play', target.getCurrentTime());
            if (data === 2) events.changed('pause', target.getCurrentTime());
          },
          onAutoplayBlocked: () => {
            if (!signal.aborted) events.blocked();
          },
          onError: ({ data }) => {
            const message =
              data === 101 || data === 150
                ? 'The owner has disabled embedding for this YouTube video. Try another link.'
                : data === 100
                  ? 'This YouTube video is private, unavailable, or has been removed.'
                  : data === 153
                    ? 'YouTube could not verify this player. Open the site in your browser and try again.'
                    : 'YouTube could not play this video. Try another link.';
            events.error(message);
            fail(new Error(message));
          },
        },
      });
    }).catch((error) => {
      player?.destroy();
      throw error;
    });
    const yt = player!;
    return {
      sample: async () => ({
        position: yt.getCurrentTime() || 0,
        duration: yt.getDuration() || 0,
        paused: yt.getPlayerState() !== 1,
        ended: yt.getPlayerState() === 0,
      }),
      play: async () => {
        markCommand();
        yt.playVideo();
      },
      pause: async () => {
        markCommand();
        yt.pauseVideo();
      },
      seek: async (seconds) => {
        markCommand();
        yt.seekTo(seconds, true);
      },
      mute: async (value) => {
        if (value) yt.mute();
        else yt.unMute();
      },
      destroy: () => {
        yt.destroy();
      },
    };
  }
  const api = await loadSdk(
    'https://player.vimeo.com/api/player.js',
    () => globals.Vimeo,
  );
  signal.throwIfAborted();
  const iframe = document.createElement('iframe');
  const embedUrl = new URL(source.embedUrl!);
  embedUrl.searchParams.set('autoplay', '0');
  embedUrl.searchParams.set('playsinline', '1');
  iframe.src = embedUrl.href;
  iframe.title = 'Vimeo shared media';
  iframe.allow = 'autoplay; fullscreen; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  container.appendChild(iframe);
  const vimeo = new api!.Player(iframe);
  signal.addEventListener(
    'abort',
    () => {
      void vimeo.destroy().catch(() => {});
    },
    { once: true },
  );
  const ready = vimeo.ready();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(
            'Vimeo did not load. Check your connection or try another link.',
          ),
        ),
      20000,
    );
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
    void ready.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  }).catch((error) => {
    void vimeo.destroy().catch(() => {});
    throw error;
  });
  vimeo.on('error', () =>
    events.error(
      'Vimeo could not play this video. Check its embedding permissions or try another link.',
    ),
  );
  vimeo.on('ended', (data) => events.ended(data.seconds));
  for (const type of ['play', 'pause', 'seeked'] as const)
    vimeo.on(type, (data) => {
      if (!signal.aborted && Date.now() >= commandedUntil)
        events.changed(type === 'seeked' ? 'seek' : type, data.seconds);
    });
  return {
    sample: async () => {
      const [position, duration, paused, ended] = await Promise.all([
        vimeo.getCurrentTime(),
        vimeo.getDuration(),
        vimeo.getPaused(),
        vimeo.getEnded(),
      ]);
      return { position, duration, paused, ended };
    },
    play: async () => {
      markCommand();
      await vimeo.play();
    },
    pause: async () => {
      markCommand();
      await vimeo.pause();
    },
    seek: async (seconds) => {
      markCommand();
      await vimeo.setCurrentTime(seconds);
    },
    mute: async (value) => {
      await vimeo.setMuted(value);
    },
    destroy: () => {
      void vimeo.destroy().catch(() => {});
    },
  };
}
