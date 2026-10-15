// Server-only adapter. Never import this module into a client component.
import { resolveMediaSource } from './media-source.mjs';

const SITE = 'https://anikototv.to';
const PLAYER = 'https://megaplay.buzz';
const MAX_TEXT = 2 * 1024 * 1024;
const TTL = 60 * 1000;
const CACHE_LIMIT = 64;
export class AnikotoError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    result[match[1]] = (match[2] ?? match[3])
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  return result;
}

function checkedUrl(input, hosts) {
  const url = new URL(input);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !hosts(url.hostname)
  )
    throw new AnikotoError('Anikoto returned an unsupported media host.');
  return url;
}

function mediaHost(host) {
  return ['ncdn.imgnex.top', 'fetch.nexabloom.top'].includes(host);
}

function subtitleHost(host) {
  return mediaHost(host) || host.endsWith('.broforgotsave.online');
}

function segmentHost(host) {
  return mediaHost(host) || /^[a-z0-9]+\.wintergrove\.space$/.test(host);
}

async function limitedText(response, limit = MAX_TEXT) {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new AnikotoError('The media provider returned too much data.');
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new AnikotoError('The media provider returned an empty response.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AnikotoError('The media provider returned too much data.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

/** All network destinations are fixed provider hosts or validated media paths. */
export function createAnikotoAdapter(fetcher = fetch) {
  const cache = new Map();
  const pending = new Map();
  let playerConfig;

  async function upstream(url, referer, headers = {}, signal) {
    const timeout = AbortSignal.timeout(15000);
    const response = await fetcher(url, {
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: referer, ...headers },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AnikotoError(
        'The Anikoto media server is unavailable. Try again or choose another episode.',
      );
    }
    return response;
  }

  async function text(url, referer, ajax = false) {
    const response = await upstream(
      url,
      referer,
      ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {},
    );
    return limitedText(response);
  }

  async function ajax(path, referer) {
    const value = JSON.parse(await text(SITE + path, referer, true));
    if (value.status !== 200 || !value.result)
      throw new AnikotoError(
        'Anikoto could not load this episode. Try again later.',
      );
    return value.result;
  }

  async function resolveUncached(source) {
    const html = await text(source.url, SITE + '/');
    const watch = [...html.matchAll(/<[^>]+>/g)]
      .map(([tag]) => attributes(tag))
      .find((tag) => tag.id === 'watch-main');
    if (!watch || !/^\d+$/.test(watch['data-id'] || ''))
      throw new AnikotoError('This Anikoto episode could not be found.', 404);
    const episodes = await ajax(
      `/ajax/episode/list/${watch['data-id']}`,
      source.url,
    );
    const episode = [...episodes.matchAll(/<a\s[^>]*>/g)]
      .map(([tag]) => attributes(tag))
      .find(
        (tag) =>
          tag['data-slug'] === source.episode ||
          tag['data-num'] === source.episode,
      );
    if (!episode?.['data-ids'])
      throw new AnikotoError('This episode is not available on Anikoto.', 404);
    const servers = await ajax(
      `/ajax/server/list?servers=${encodeURIComponent(episode['data-ids'])}`,
      source.url,
    );
    const group = [
      ...servers.matchAll(
        /<div\b[^>]*data-type=["'](sub|dub)["'][^>]*>([\s\S]*?)<\/ul>/g,
      ),
    ].find((match) => match[1] === source.audio)?.[2];
    if (!group)
      throw new AnikotoError(
        `This episode has no ${source.audio === 'dub' ? 'dubbed' : 'subtitled'} version.`,
        404,
      );
    const entries = [...group.matchAll(/<li\b([^>]*)>([^<]*)<\/li>/g)].map(
      (match) => ({ ...attributes(match[1]), name: match[2] }),
    );
    // The Vidstream-1 player publishes the source metadata and caption tracks.
    const server = entries.find((entry) =>
      /^Vidstream-1$/i.test(entry.name.trim()),
    );
    if (!server?.['data-link-id'])
      throw new AnikotoError('This episode has no compatible Anikoto player.');
    const result = await ajax(
      `/ajax/server?get=${encodeURIComponent(server['data-link-id'])}`,
      source.url,
    );
    const embed = checkedUrl(result.url, (host) => host === 'megaplay.buzz');
    if (!/^\/videojs\/stream\/s-2\/\d+\/(sub|dub)$/.test(embed.pathname))
      throw new AnikotoError('The Anikoto player format has changed.');
    const embedHtml = await text(embed.href, SITE + '/');
    const playerId = embedHtml.match(/data-id=["'](\d+)["']/)?.[1];
    if (!playerId)
      throw new AnikotoError(
        'The Anikoto media server could not find this episode.',
        404,
      );
    const data = JSON.parse(
      await text(
        `${PLAYER}/videojs/stream/getSources?id=${playerId}`,
        embed.href,
      ),
    );
    let file = data.sources?.[0]?.file || data.sources?.file;
    if (data.enc) {
      if (!playerConfig || playerConfig.until < Date.now()) {
        const script = [...embedHtml.matchAll(/<script\b[^>]*>/g)]
          .map(([tag]) => attributes(tag).src)
          .find((src) =>
            src?.startsWith(`${PLAYER}/videojs/lib/e1-player.min.js?`),
          );
        if (!script)
          throw new AnikotoError('The Anikoto player format has changed.');
        const js = await text(script, embed.href);
        const key = js.match(/SOURCE_ENC_KEY="([^"]+)"/)?.[1];
        const iv = js.match(/SOURCE_ENC_IV="([^"]+)"/)?.[1];
        if (!key || !iv)
          throw new AnikotoError('The Anikoto player format has changed.');
        playerConfig = { key, iv, until: Date.now() + TTL };
      }
      // Decode the URL metadata exactly as the provider's public player does.
      // No video decryption, DRM keys, credentials or CDN tokens are involved.
      const pad = (value, length) => {
        const bytes = new Uint8Array(length);
        bytes.set(new TextEncoder().encode(value).slice(0, length));
        return bytes;
      };
      const key = await crypto.subtle.importKey(
        'raw',
        pad(playerConfig.key, 32),
        'AES-CBC',
        false,
        ['decrypt'],
      );
      const bytes = Uint8Array.from(
        atob(data.enc.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0),
      );
      const decoded = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: pad(playerConfig.iv, 16) },
        key,
        bytes,
      );
      file = JSON.parse(new TextDecoder().decode(decoded)).file;
    }
    const stream = checkedUrl(file, mediaHost);
    if (!stream.pathname.endsWith('.m3u8'))
      throw new AnikotoError('Anikoto returned an unsupported stream.');
    const tracks = (Array.isArray(data.tracks) ? data.tracks : [])
      .filter(
        (track) => track.kind === 'captions' && typeof track.file === 'string',
      )
      .slice(0, 40)
      .flatMap((track) => {
        try {
          const url = checkedUrl(track.file, subtitleHost);
          if (!url.pathname.endsWith('.vtt')) return [];
          return [
            {
              file: url.href,
              label: String(track.label || 'Subtitles').slice(0, 60),
              default: !!track.default,
            },
          ];
        } catch {
          return [];
        }
      });
    const title =
      html
        .match(/<meta\s+property="og:title"\s+content="([^"]+)"/)?.[1]
        ?.replace(/^Watch /, '')
        .replace(/ Online.*$/, '')
        .replace(/&amp;/g, '&') || `Episode ${source.episode}`;
    return {
      url: source.url,
      stream: stream.href,
      tracks,
      title,
      until: Date.now() + TTL,
    };
  }

  async function resolve(input, refresh = false) {
    let source;
    try {
      source = resolveMediaSource(input);
    } catch (error) {
      throw new AnikotoError(error.message, 400);
    }
    if (source.kind !== 'anikoto')
      throw new AnikotoError('Enter an Anikoto episode link.', 400);
    if (refresh) cache.delete(source.url);
    const saved = cache.get(source.url);
    if (saved?.until > Date.now()) return saved;
    if (pending.has(source.url)) return pending.get(source.url);
    if (pending.size >= CACHE_LIMIT)
      throw new AnikotoError(
        'The media resolver is busy. Try again shortly.',
        503,
      );
    const request = resolveUncached(source)
      .then((result) => {
        cache.delete(source.url);
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(source.url, result);
        return result;
      })
      .finally(() => pending.delete(source.url));
    pending.set(source.url, request);
    return request;
  }

  function relayUrl(source, path, track) {
    const params = new URLSearchParams({ url: source });
    if (track !== undefined) params.set('track', String(track));
    else params.set('path', path);
    return `/api/media/anikoto/stream?${params}`;
  }

  async function describe(input, refresh = false) {
    const result = await resolve(input, refresh);
    return {
      url: result.url,
      title: result.title,
      stream: relayUrl(result.url, ''),
      tracks: result.tracks.map((track, index) => ({
        ...track,
        file: relayUrl(result.url, '', index),
      })),
    };
  }

  async function relay(input, path = '', trackIndex, range, signal) {
    if (path.length > 2048 || /[\\\x00-\x20]/.test(path))
      throw new AnikotoError('Invalid media path.', 400);
    const result = await resolve(input);
    const base = new URL(result.stream);
    const directory = new URL('.', base);
    let target;
    if (trackIndex !== undefined) {
      if (
        !/^\d{1,2}$/.test(String(trackIndex)) ||
        !result.tracks[Number(trackIndex)]
      )
        throw new AnikotoError('Subtitle track not found.', 404);
      target = new URL(result.tracks[Number(trackIndex)].file);
    } else {
      target = path ? new URL(path, directory) : base;
      checkedUrl(target.href, segmentHost);
      if (
        !target.pathname.startsWith(directory.pathname) ||
        target.pathname.includes('%') ||
        !/\.(m3u8|ts|m4s|mp4|aac|key|jpg|html|js|css|txt|png|webp|ico)$/i.test(
          target.pathname,
        )
      )
        throw new AnikotoError('Invalid media path.', 400);
    }
    if (range && !/^bytes=\d+-\d*$/.test(range))
      throw new AnikotoError('Invalid byte range.', 416);
    const response = await upstream(
      target.href,
      PLAYER + '/',
      range ? { Range: range } : {},
      signal,
    );
    if (trackIndex !== undefined) {
      const body = await limitedText(response);
      if (!body.trimStart().startsWith('WEBVTT'))
        throw new AnikotoError('The subtitle track is unavailable.');
      return new Response(body, {
        headers: {
          'Content-Type': 'text/vtt; charset=utf-8',
          'Cache-Control': 'private, max-age=300',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (target.pathname.endsWith('.m3u8')) {
      const playlist = await limitedText(response);
      if (!playlist.trimStart().startsWith('#EXTM3U'))
        throw new AnikotoError('The Anikoto stream is unavailable.');
      const rewrite = (uri) => {
        const child = new URL(uri, target);
        checkedUrl(child.href, segmentHost);
        if (!child.pathname.startsWith(directory.pathname))
          throw new AnikotoError(
            'The media provider returned an unsupported playlist.',
          );
        return relayUrl(result.url, child.href);
      };
      const body = playlist
        .split('\n')
        .map((line) => {
          if (!line.trim()) return line;
          if (line.startsWith('#'))
            return line.replace(
              /URI="([^"]+)"/g,
              (_, uri) => `URI="${rewrite(uri)}"`,
            );
          return rewrite(line.trim());
        })
        .join('\n');
      return new Response(body, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
        },
      });
    }
    // Some provider segments use .html/.js/image extensions. Always serve them
    // as binary media, never as executable same-origin documents or scripts.
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    });
    for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  }
  return { resolve, describe, relay };
}

export const anikoto = createAnikotoAdapter();

export function anikotoFailure(error) {
  return Response.json(
    {
      error:
        error instanceof AnikotoError
          ? error.message
          : 'Anikoto could not load this episode. Retry the player or try another link.',
    },
    {
      status: error instanceof AnikotoError ? error.status : 502,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
