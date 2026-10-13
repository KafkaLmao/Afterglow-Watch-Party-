import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = process.argv[2] || 'http://127.0.0.1:5173';
async function call(session, body) {
  const r = await fetch(
    base + '/api/room' + (body ? '' : '?code=' + session.code),
    {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: 'Bearer ' + session.token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10000),
    },
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
const created = await call(null, {
    type: 'create',
    name: 'Benchmark host',
    roomName: '10-client benchmark',
  }),
  host = created.session,
  clients = [host];
for (let i = 1; i < 10; i++)
  clients.push(
    (await call(null, { type: 'join', name: 'Client ' + i, code: host.code }))
      .session,
  );
assert.equal((await call(host)).members.length, 10);
const send = (s, type, extra = {}) =>
  call(s, { code: s.code, id: crypto.randomUUID(), type, ...extra });
await Promise.all(
  clients.map((s, i) => send(s, 'chat', { text: 'Concurrent message ' + i })),
);
let state = await call(host);
assert.equal(state.messages.length, 10);
await send(host, 'poll', {
  question: 'What next?',
  options: ['Sintel', 'Bunny'],
});
await Promise.all(clients.map((s, i) => send(s, 'vote', { option: i % 2 })));
state = await call(host);
assert.equal(Object.keys(state.poll.votes).length, 10);
let running = true,
  revision = state.revision,
  sample = null;
const latencies = [],
  roundtrips = [];
const pollers = clients.map(async (s) => {
  while (running) {
    const started = performance.now();
    const current = await call(s);
    roundtrips.push(performance.now() - started);
    if (
      sample &&
      current.revision >= sample.revision &&
      !sample.seen.has(s.id)
    ) {
      sample.seen.add(s.id);
      latencies.push(performance.now() - sample.started);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
});
for (let i = 0; i < 30; i++) {
  const start = performance.now();
  sample = { started: start, revision: revision + 1, seen: new Set() };
  const d = await send(host, i % 2 ? 'pause' : 'play', { position: i });
  revision = d.room.revision;
  sample.revision = revision;
  const limit = Date.now() + 10000;
  while (sample.seen.size < 10 && Date.now() < limit)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(sample.seen.size, 10);
  await new Promise((r) => setTimeout(r, 20));
}
running = false;
await Promise.all(pollers);
await send(host, 'seek', { position: 123 });
const late = await call(null, {
  type: 'join',
  name: 'Late joiner',
  code: host.code,
});
assert.equal(late.room.playback.position, 123);
assert.equal(late.room.playback.playing, false);
const duplicate = {
  code: host.code,
  id: crypto.randomUUID(),
  type: 'chat',
  text: 'Retry once',
};
await call(host, duplicate);
await call(host, duplicate);
assert.equal(
  (await call(host)).messages.filter((x) => x.text === 'Retry once').length,
  1,
);
await send(host, 'transfer', { member: clients[1].id });
assert.equal((await call(host)).host, clients[1].id);
let rejected = false;
try {
  await send(host, 'play', { position: 0 });
} catch {
  rejected = true;
}
assert.ok(rejected);
await send(clients[1], 'transfer', { member: host.id });
const percentile = (a, p) =>
  [...a].sort((a, b) => a - b)[Math.ceil(a.length * p) - 1];
const report = {
  date: new Date().toISOString(),
  environment:
    'Windows, Wrangler local Worker + local D1, 127.0.0.1 loopback; 10 independent HTTP sessions polling after each response with 100 ms delay',
  controls: 30,
  observations: latencies.length,
  propagationMs: {
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    max: Math.max(...latencies),
  },
  roundTripMs: {
    p50: percentile(roundtrips, 0.5),
    p95: percentile(roundtrips, 0.95),
  },
  integrationChecks: [
    '10 concurrent sessions',
    '10 concurrent chats retained',
    '10 simultaneous votes retained',
    'late join playback snapshot',
    'idempotent retry',
    'host transfer',
    'former host control rejected',
  ],
  limits:
    'Loopback benchmark is not a physical LAN test. This measures server state observed by HTTP clients, not browser media event latency or rendered playback drift. Browser media drift must be separately measured on real devices.',
};
await fs.writeFile(
  'tests/benchmark-results.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
