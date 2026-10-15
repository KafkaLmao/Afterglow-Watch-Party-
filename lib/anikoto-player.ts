export interface Caption {
  label: string;
  file: string;
  default: boolean;
}

export async function loadAnikotoEpisode(
  url: string,
  signal?: AbortSignal,
  refresh = false,
) {
  const params = new URLSearchParams({ url });
  if (refresh) params.set('refresh', '1');
  const response = await fetch(`/api/media/anikoto?${params}`, { signal });
  const data = (await response.json()) as {
    error?: string;
    url: string;
    title: string;
    stream: string;
    tracks: Caption[];
  };
  if (!response.ok)
    throw new Error(data.error || 'Anikoto could not load this episode.');
  return data as {
    url: string;
    title: string;
    stream: string;
    tracks: Caption[];
  };
}

export async function prepareAnikotoMedia(
  url: string,
  media: HTMLMediaElement,
  signal: AbortSignal,
  onError: (message: string) => void,
  refresh = false,
) {
  const episode = await loadAnikotoEpisode(url, signal, refresh);
  signal.throwIfAborted();
  const tracks: HTMLTrackElement[] = [];
  let engine: import('hls.js').default | undefined;
  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', cleanup);
    engine?.destroy();
    media.pause();
    media.removeAttribute('src');
    media.load();
    tracks.forEach((track) => track.remove());
  };
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    const Hls = (await import('hls.js')).default;
    signal.throwIfAborted();
    if (
      !media.canPlayType('application/vnd.apple.mpegurl') &&
      !Hls.isSupported()
    )
      throw new Error(
        'This browser cannot play Anikoto streams. Try a current Chrome, Firefox, or Safari.',
      );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          finish(new Error('Anikoto took too long to load. Retry the player.')),
        30000,
      );
      let loaded = false;
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        media.removeEventListener('loadedmetadata', ready);
        media.removeEventListener('error', fail);
        signal.removeEventListener('abort', cancelled);
        if (error) reject(error);
        else {
          loaded = true;
          resolve();
        }
      };
      const ready = () => finish();
      const fail = () =>
        finish(
          new Error(
            'The Anikoto stream could not play. Retry or try another episode.',
          ),
        );
      const cancelled = () =>
        finish(new DOMException('Player closed.', 'AbortError'));
      media.addEventListener('loadedmetadata', ready, { once: true });
      media.addEventListener('error', fail, { once: true });
      signal.addEventListener('abort', cancelled, { once: true });
      if (media.canPlayType('application/vnd.apple.mpegurl')) {
        media.src = episode.stream;
      } else {
        engine = new Hls({
          capLevelToPlayerSize: true,
          startLevel: 0,
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
          backBufferLength: 15,
        });
        engine.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal || signal.aborted) return;
          const message =
            'The Anikoto stream stopped responding. Retry the player or try another episode.';
          if (loaded) onError(message);
          else finish(new Error(message));
        });
        engine.loadSource(episode.stream);
        engine.attachMedia(media);
      }
    });
    signal.throwIfAborted();
    episode.tracks.forEach((caption) => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = caption.label;
      track.src = caption.file;
      track.default = caption.default;
      media.appendChild(track);
      tracks.push(track);
    });
    return {
      captions: episode.tracks,
      caption(index: number) {
        tracks.forEach((track, i) => {
          track.track.mode = i === index ? 'showing' : 'disabled';
        });
      },
      destroy: cleanup,
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
