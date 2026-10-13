import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMediaSource } from '../lib/media-source.mjs';
import { mediaSyncPlan } from '../lib/media-sync.mjs';
import { initial, apply, snapshot } from '../lib/room-engine.mjs';

test('new and legacy starter rooms are empty without a user media link', () => {
  const room = initial(
    'ABCD2345',
    { id: 'host', token: 'secret', name: 'Host' },
    'Empty room',
    1000,
  );
  assert.equal(room.playback.url, null);
  assert.equal(room.playback.movie, null);
  assert.throws(
    () =>
      apply(room, { type: 'play', position: 0, id: 'play' }, 'secret', 1000),
    /Add a media link/,
  );
  room.playback = {
    movie: 'sintel',
    url: null,
    playing: true,
    title: null,
    position: 12,
    at: 1000,
  };
  room.queue = ['bunny'];
  const publicRoom = snapshot(room, 1000);
  assert.equal(publicRoom.playback.movie, null);
  assert.equal(publicRoom.playback.playing, false);
  assert.equal(publicRoom.playback.position, 0);
  assert.equal('queue' in publicRoom, false);
});

test('YouTube share, watch, Shorts, live and embed URLs use the same safe video ID', () => {
  for (const link of [
    'https://youtu.be/M7lc1UVf-VE?si=test',
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&list=playlist',
    'https://m.youtube.com/shorts/M7lc1UVf-VE',
    'https://youtube.com/live/M7lc1UVf-VE',
    'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE',
  ]) {
    const source = resolveMediaSource(link);
    assert.equal(source.kind, 'youtube');
    assert.equal(source.id, 'M7lc1UVf-VE');
    assert.equal(source.url, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  }
});

test('Vimeo privacy hashes and direct signed video/audio links are preserved', () => {
  const privateVimeo = resolveMediaSource(
    'https://player.vimeo.com/video/76979871?h=abc123',
  );
  assert.equal(
    privateVimeo.embedUrl,
    'https://player.vimeo.com/video/76979871?h=abc123',
  );
  assert.equal(privateVimeo.url, 'https://vimeo.com/76979871/abc123');
  assert.equal(
    resolveMediaSource('https://vimeo.com/76979871/abc123').embedUrl,
    privateVimeo.embedUrl,
  );
  assert.equal(
    resolveMediaSource('https://example.com/movie.MP4?signature=abc').url,
    'https://example.com/movie.MP4?signature=abc',
  );
  assert.equal(
    resolveMediaSource('https://example.com/song.mp3').kind,
    'audio',
  );
});

test('unsupported pages, unsafe URLs and malformed provider links are rejected', () => {
  for (const link of [
    'javascript:alert(1)',
    'http://example.com/file.mp4',
    'https://user:password@example.com/file.mp4',
    'https://youtube.com/playlist?list=abc',
    'https://youtu.be/invalid',
    'https://www.netflix.com/watch/123',
    'https://example.com/web-page',
    'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE',
  ])
    assert.throws(() => resolveMediaSource(link));
});

test('a host media link resets playback and readiness and is shared without a catalog fallback', () => {
  const room = initial(
    'ABCD2345',
    { id: 'host', token: 'secret', name: 'Host' },
    'Our room',
    1000,
  );
  room.members.push({
    id: 'guest',
    token: 'guest-secret',
    name: 'Guest',
    ready: true,
    seen: 1000,
  });
  const action = {
    type: 'source',
    url: 'https://youtu.be/M7lc1UVf-VE',
    title: 'Our choice',
    id: 'source',
  };
  assert.throws(
    () => apply(room, action, 'guest-secret', 1000),
    /Only the host/,
  );
  apply(room, action, 'secret', 1000);
  assert.equal(
    room.playback.url,
    'https://www.youtube.com/watch?v=M7lc1UVf-VE',
  );
  assert.equal(room.playback.title, 'Our choice');
  assert.equal(room.playback.playing, false);
  assert.equal(room.playback.position, 0);
  assert.equal(room.members[1].ready, false);
  const savedPlayback = { ...room.playback };
  assert.throws(() =>
    apply(
      room,
      { ...action, id: 'bad', url: 'https://netflix.com/watch/1' },
      'secret',
      1000,
    ),
  );
  assert.deepEqual(room.playback, savedPlayback);
  assert.throws(
    () =>
      apply(
        room,
        { type: 'select', movie: 'sintel', id: 'old-select' },
        'secret',
        1000,
      ),
    /Unknown action/,
  );
});

test('shared media synchronization catches up late joins and respects pause and end states', () => {
  const playback = { position: 10, at: 1000, playing: true };
  const sample = { position: 0, duration: 60, paused: true };
  const plan = mediaSyncPlan(playback, sample, 6000, true);
  assert.equal(plan.target, 15);
  assert.equal(plan.seek, true);
  assert.equal(plan.play, true);
  assert.equal(plan.rate, 1);
  assert.equal(
    mediaSyncPlan(
      { ...playback, playing: false },
      { ...sample, paused: false },
      6000,
    ).pause,
    true,
  );
  assert.equal(
    mediaSyncPlan(
      playback,
      { ...sample, position: 60, ended: true },
      100000,
      true,
    ).play,
    false,
  );
  assert.equal(
    mediaSyncPlan(playback, { ...sample, position: 15.1, paused: false }, 6000)
      .rate,
    0.97,
  );
});
