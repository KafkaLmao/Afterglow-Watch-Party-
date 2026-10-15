const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** Resolve supported links without fetching arbitrary pages or creating arbitrary embeds. */
export function resolveMediaSource(input) {
  let url;
  try {
    url = new URL(typeof input === 'string' ? input.trim() : '');
  } catch {
    throw new Error('Enter a valid media link.');
  }
  if (url.protocol !== 'https:') throw new Error('Use an HTTPS media link.');
  if (url.username || url.password || url.href.length > 2048)
    throw new Error('Use a media link without embedded login details.');
  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  if (hostname === 'youtu.be' || YOUTUBE_HOSTS.has(hostname)) {
    const id =
      hostname === 'youtu.be'
        ? segments[0]
        : ['shorts', 'embed', 'live', 'v'].includes(segments[0])
          ? segments[1]
          : url.searchParams.get('v');
    if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
      throw new Error(
        'Paste a link to a YouTube video, rather than a channel or playlist.',
      );
    return {
      kind: 'youtube',
      id,
      url: `https://www.youtube.com/watch?v=${id}`,
      label: 'YouTube',
    };
  }
  if (VIMEO_HOSTS.has(hostname)) {
    const index = segments.findIndex((segment) => /^\d+$/.test(segment));
    const id = segments[index];
    if (!id) throw new Error('Paste a link to a Vimeo video.');
    const hash = url.searchParams.get('h') || segments[index + 1] || '';
    if (hash && !/^[a-zA-Z0-9]+$/.test(hash))
      throw new Error('Enter a valid Vimeo video link.');
    return {
      kind: 'vimeo',
      id,
      url: `https://vimeo.com/${id}${hash ? '/' + hash : ''}`,
      embedUrl: `https://player.vimeo.com/video/${id}${hash ? '?h=' + hash : ''}`,
      label: 'Vimeo',
    };
  }
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(url.pathname))
    return { kind: 'audio', url: url.href, label: 'Audio' };
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(url.pathname))
    return { kind: 'video', url: url.href, label: 'Video' };
  throw new Error(
    'Use a YouTube or Vimeo video link, or a direct video/audio file. Streaming-service pages and playlists cannot play in this room.',
  );
}

export function existingMediaSource(url) {
  if (!url) return null;
  try {
    return resolveMediaSource(url);
  } catch {
    return null;
  }
}
