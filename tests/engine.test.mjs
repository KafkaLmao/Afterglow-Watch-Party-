import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initial,
  apply,
  snapshot,
  positionAt,
  mutate,
} from '../lib/room-engine.mjs';
const member = (id) => ({ id, token: `secret-${id}`, name: id });
const seed = () => {
  const room = initial('ABCD2345', member('host'), 'Test room', 1000);
  room.playback.movie = 'custom';
  room.playback.url = 'https://example.com/test.mp4';
  return room;
};
const a = (type, extra = {}) => ({ type, id: crypto.randomUUID(), ...extra });
test('play, seek, pause and late join use anchored server time', () => {
  const s = seed();
  apply(s, a('play', { position: 10 }), 'secret-host', 2000);
  assert.equal(positionAt(s.playback, 7000), 15);
  apply(s, a('seek', { position: 80 }), 'secret-host', 7000);
  assert.equal(positionAt(s.playback, 9000), 82);
  apply(s, a('pause', { position: 82 }), 'secret-host', 9000);
  assert.equal(positionAt(s.playback, 19000), 82);
  assert.equal(snapshot(s, 19000).playback.position, 82);
});
test('sessions are secret, host controls enforced, host transfers and leave hands over', () => {
  const s = seed();
  s.members.push({ ...member('guest'), seen: 1000 });
  assert.ok(!JSON.stringify(snapshot(s, 1000)).includes('secret-'));
  assert.throws(
    () => apply(s, a('play', { position: 0 }), 'secret-guest', 1000),
    /host/,
  );
  apply(s, a('transfer', { member: 'guest' }), 'secret-host', 1000);
  assert.equal(s.host, 'guest');
  apply(s, a('leave'), 'secret-guest', 1000);
  assert.equal(s.host, 'host');
});
test('host disconnection fails over; reconnect restores membership but does not reclaim host', () => {
  const s = seed();
  s.members.push({ ...member('guest'), seen: 1000 });
  apply(s, a('heartbeat'), 'secret-guest', 27000);
  assert.equal(s.host, 'guest');
  assert.equal(snapshot(s, 27000).members.length, 1);
  apply(s, a('heartbeat'), 'secret-host', 28000);
  assert.equal(s.host, 'guest');
  assert.equal(snapshot(s, 28000).members.length, 2);
});
test('retries are idempotent; chat escaped by rendering and votes replace', () => {
  const s = seed();
  const msg = a('chat', { text: '<script>alert(1)</script>' });
  apply(s, msg, 'secret-host', 1000);
  assert.equal(apply(s, msg, 'secret-host', 1000), false);
  assert.equal(s.messages.length, 1);
  apply(
    s,
    a('poll', { question: 'Next?', options: ['A', 'B'] }),
    'secret-host',
    1000,
  );
  apply(s, a('vote', { option: 0 }), 'secret-host', 1000);
  apply(s, a('vote', { option: 1 }), 'secret-host', 1000);
  assert.deepEqual(s.poll.votes, { host: 1 });
  apply(s, a('closePoll'), 'secret-host', 1000);
  assert.throws(
    () => apply(s, a('vote', { option: 0 }), 'secret-host', 1000),
    /ended/,
  );
});
test('ten simultaneous actions survive CAS contention without lost updates', async () => {
  const s = seed();
  for (let i = 0; i < 10; i++)
    s.members.push({ ...member('g' + i), seen: 1000 });
  let row = { state: JSON.stringify(s), revision: 0 };
  const store = {
    async read() {
      return { ...row };
    },
    async cas(code, rev, next) {
      await new Promise((r) => setTimeout(r, 1));
      if (row.revision !== rev) return false;
      row = { state: JSON.stringify(next), revision: next.revision };
      return true;
    },
  };
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      mutate(
        store,
        s.code,
        a('chat', { text: 'Message ' + i }),
        'secret-g' + i,
        2000,
      ),
    ),
  );
  assert.equal(JSON.parse(row.state).messages.length, 10);
  assert.equal(row.revision, 10);
});
test('invalid requests cannot change playback or source', () => {
  const s = seed();
  assert.throws(
    () => apply(s, a('seek', { position: NaN }), 'secret-host', 1000),
    /Invalid/,
  );
  assert.throws(
    () =>
      apply(
        s,
        a('source', { url: 'javascript:alert(1)' }),
        'secret-host',
        1000,
      ),
    /HTTPS/,
  );
  assert.throws(
    () => apply(s, a('chat', { text: 'hello' }), 'bad-token', 1000),
    /expired/,
  );
  assert.throws(
    () => apply(s, a('select', { movie: 'unknown' }), 'secret-host', 1000),
    /Unknown/,
  );
});
