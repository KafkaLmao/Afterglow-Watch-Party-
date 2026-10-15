import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnikotoAdapter } from '../lib/anikoto.mjs';
import { resolveMediaSource } from '../lib/media-source.mjs';
import { initial, apply, snapshot } from '../lib/room-engine.mjs';

const episode = 'https://anikototv.to/watch/example-abc12/ep-1';
const directory = 'https://fetch.nexabloom.top/anime/title/episode/';

async function fixture(overrides = {}) {
  const keyText = 'public-test-key!';
  const ivText = 'public-test-iv!!';
  const pad = (text, size) => {
    const bytes = new Uint8Array(size);
    bytes.set(new TextEncoder().encode(text).slice(0, size));
    return bytes;
  };
  const key = await crypto.subtle.importKey(
    'raw',
    pad(keyText, 32),
    'AES-CBC',
    false,
    ['encrypt'],
  );
  const enc = Buffer.from(
    await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: pad(ivText, 16) },
      key,
      new TextEncoder().encode(
        JSON.stringify({ file: overrides.file || directory + 'master.m3u8' }),
      ),
    ),
  ).toString('base64url');
  const responses = new Map([
    [
      episode,
      '<meta property="og:title" content="Watch Example Episode 1 Online - Anikoto"><div data-id="123" id="watch-main">',
    ],
    [
      'https://anikototv.to/ajax/episode/list/123',
      JSON.stringify({
        status: 200,
        result:
          '<a data-num="1" data-ids="episode-key" data-slug="1">Episode 1</a>',
      }),
    ],
    [
      'https://anikototv.to/ajax/server/list?servers=episode-key',
      JSON.stringify({
        status: 200,
        result:
          '<div class="type" data-type="sub"><ul><li data-link-id="server-key">Vidstream-1</li></ul></div>',
      }),
    ],
    [
      'https://anikototv.to/ajax/server?get=server-key',
      JSON.stringify({
        status: 200,
        result: { url: 'https://megaplay.buzz/videojs/stream/s-2/777/sub' },
      }),
    ],
    [
      'https://megaplay.buzz/videojs/stream/s-2/777/sub',
      '<div data-id="42"><script src="https://megaplay.buzz/videojs/lib/e1-player.min.js?v=1">',
    ],
    [
      'https://megaplay.buzz/videojs/stream/getSources?id=42',
      JSON.stringify({
        enc,
        tracks: [
          {
            kind: 'captions',
            file: directory + 'english.vtt',
            label: 'English',
            default: true,
          },
          {
            kind: 'captions',
            file: 'http://127.0.0.1/secret.vtt',
            label: 'Unsafe',
          },
        ],
      }),
    ],
    [
      'https://megaplay.buzz/videojs/lib/e1-player.min.js?v=1',
      `const SOURCE_ENC_KEY="${keyText}",SOURCE_ENC_IV="${ivText}";`,
    ],
    [
      directory + 'master.m3u8',
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nindex.m3u8\n',
    ],
    [
      directory + 'index.m3u8',
      '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="content.key"\n#EXTINF:6,\nhttps://abc12.wintergrove.space/anime/title/episode/seg-00001.html\n',
    ],
    [directory + 'content.key', new Uint8Array(16)],
    [
      'https://abc12.wintergrove.space/anime/title/episode/seg-00001.html',
      new Uint8Array([0x47, 0, 1, 2]),
    ],
    [directory + 'english.vtt', 'WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n'],
  ]);
  const calls = [];
  const adapter = createAnikotoAdapter(async (url, options) => {
    url = String(url);
    calls.push({ url, options });
    if (overrides.fetch) {
      const response = overrides.fetch(url, options);
      if (response) return response;
    }
    assert.ok(responses.has(url), `Unexpected upstream request: ${url}`);
    return new Response(responses.get(url));
  });
  return { adapter, calls, responses };
}

test('Anikoto episode links are canonical, support dub, and reject lookalike hosts and invalid paths', () => {
  const source = resolveMediaSource(
    'https://www.anikototv.to/watch/Example-abc12/ep-1/?audio=dub#player',
  );
  assert.equal(source.kind, 'anikoto');
  assert.equal(source.url, episode + '?audio=dub');
  assert.equal(source.audio, 'dub');
  for (const url of [
    episode.replace('ep-1', 'ep-0'),
    episode + '?audio=bad',
    episode.replace('.to/', '.to.evil.test/'),
    episode.replace('.to/', '.to:8443/'),
    'https://anikototv.to/search',
    'https://anikototv.to/watch/example-abc12',
  ])
    assert.throws(() => resolveMediaSource(url));
});

test('room snapshots retain the stable episode URL for reloads and late joins', () => {
  const room = initial(
    'ABCD2345',
    { id: 'host', token: 'secret', name: 'Host' },
    'Anime night',
  );
  apply(
    room,
    { type: 'source', id: 'source', url: episode, title: 'Example' },
    'secret',
  );
  apply(room, { type: 'play', id: 'play', position: 120 }, 'secret');
  assert.equal(snapshot(room).playback.url, episode);
  assert.equal(snapshot(room).playback.playing, true);
});

test('resolver decodes public player metadata, filters unsafe subtitles, caches and deduplicates source lookup', async () => {
  const { adapter, calls } = await fixture();
  const [a, b] = await Promise.all([
    adapter.describe(episode),
    adapter.describe(episode),
  ]);
  assert.deepEqual(a, b);
  assert.equal(a.title, 'Example Episode 1');
  assert.equal(a.tracks.length, 1);
  assert.equal(a.tracks[0].label, 'English');
  assert.ok(a.stream.startsWith('/api/media/anikoto/stream?'));
  assert.ok(a.tracks[0].file.includes('track=0'));
  const count = calls.length;
  await adapter.describe(episode);
  assert.equal(calls.length, count);
  for (const { options } of calls) assert.equal(options.redirect, 'manual');
  assert.equal(calls[1].options.headers['X-Requested-With'], 'XMLHttpRequest');
});

test('relay rewrites playlists and key URIs, streams binary segments, forwards ranges, and serves captions', async () => {
  const { adapter, calls } = await fixture();
  const master = await (await adapter.relay(episode)).text();
  const path = new URL(
    master.split('\n').find((line) => line.startsWith('/api')),
    'https://test.local',
  ).searchParams.get('path');
  const playlist = await (await adapter.relay(episode, path)).text();
  assert.ok(playlist.includes('URI="/api/media/anikoto/stream?'));
  const segment = new URL(
    playlist.split('\n').find((line) => line.startsWith('/api')),
    'https://test.local',
  ).searchParams.get('path');
  const binary = await adapter.relay(episode, segment, undefined, 'bytes=0-3');
  assert.deepEqual(
    [...new Uint8Array(await binary.arrayBuffer())],
    [0x47, 0, 1, 2],
  );
  assert.equal(binary.headers.get('content-type'), 'application/octet-stream');
  assert.equal(binary.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(calls.at(-1).options.headers.Range, 'bytes=0-3');
  assert.equal(calls.at(-1).options.headers.Referer, 'https://megaplay.buzz/');
  const caption = await adapter.relay(episode, '', '0');
  assert.ok(caption.headers.get('content-type').startsWith('text/vtt'));
  assert.ok((await caption.text()).startsWith('WEBVTT'));
});

test('relay refuses arbitrary hosts, credentials, traversal, byte-range injection and unsupported subtitle indexes before fetching', async () => {
  const { adapter, calls } = await fixture();
  await adapter.describe(episode);
  const count = calls.length;
  for (const path of [
    'https://127.0.0.1/private.ts',
    'https://fetch.nexabloom.top.evil.test/anime/title/episode/a.ts',
    'https://user:pass@fetch.nexabloom.top/anime/title/episode/a.ts',
    'http://fetch.nexabloom.top/anime/title/episode/a.ts',
    '../other.ts',
    '%252e%252e/other.ts',
    '//169.254.169.254/latest.ts',
    'https://fetch.nexabloom.top:8443/anime/title/episode/a.ts',
    'bad\\path.ts',
  ])
    await assert.rejects(adapter.relay(episode, path));
  await assert.rejects(adapter.relay(episode, '', '99'));
  await assert.rejects(adapter.relay(episode, '', undefined, 'bytes=0-2,4-5'));
  assert.equal(calls.length, count);
});

test('untrusted resolved hosts, redirects, oversized metadata and upstream errors fail closed', async () => {
  const badHost = await fixture({ file: 'https://127.0.0.1/video.m3u8' });
  await assert.rejects(
    badHost.adapter.describe(episode),
    /unsupported media host/,
  );
  const redirect = await fixture({
    fetch: () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1' },
      }),
  });
  await assert.rejects(redirect.adapter.describe(episode), /unavailable/);
  assert.equal(redirect.calls.length, 1);
  const oversized = await fixture({
    fetch: () =>
      new Response('too large', {
        headers: { 'Content-Length': String(3 * 1024 * 1024) },
      }),
  });
  await assert.rejects(oversized.adapter.describe(episode), /too much data/);
  const error = await fixture({
    fetch: () => new Response('down', { status: 503 }),
  });
  await assert.rejects(error.adapter.describe(episode), /unavailable/);
  const unsupported = await fixture();
  await assert.rejects(
    unsupported.adapter.describe('https://youtube.com/watch?v=M7lc1UVf-VE'),
    /Anikoto episode/,
  );
  assert.equal(unsupported.calls.length, 0);
});
