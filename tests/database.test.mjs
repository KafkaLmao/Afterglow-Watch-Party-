import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createPostgresRoomDatabase } from '../lib/postgres-room-database.mjs';
import { initial, mutate } from '../lib/room-engine.mjs';

// Execute the adapter's portable SQL against a real in-memory SQL engine.
// These contract tests do not replace a live Neon connectivity test.
function fixture(t) {
  const database = new DatabaseSync(':memory:');
  database.exec(
    readFileSync(new URL('../db/postgres.sql', import.meta.url), 'utf8'),
  );
  t.after(() => database.close());
  const query = async (sql, parameters) =>
    database
      .prepare(sql)
      .all(
        Object.fromEntries(
          parameters.map((value, index) => [`$${index + 1}`, value]),
        ),
      );
  const host = { id: 'host', name: "Sam's room", token: 'private-session' };
  const room = initial('ABCDEFGH', host, 'Test room');
  return { query, host, room, store: createPostgresRoomDatabase(query) };
}

test('independent adapters share persisted rooms and bind untrusted values', async (t) => {
  const { store, query, room } = fixture(t);
  room.name = "Movie night'); DROP TABLE rooms; --";
  await store.insert(room);
  const other = createPostgresRoomDatabase(query);
  assert.equal(JSON.parse((await other.read(room.code)).state).name, room.name);
  assert.equal(await other.read("' OR 1=1 --"), null);
  await assert.rejects(store.insert(room));
});

test('stale compare-and-swap cannot overwrite a newer room revision', async (t) => {
  const { store, room } = fixture(t);
  await store.insert(room);
  assert.equal(
    await store.cas(room.code, 0, { ...room, revision: 1, name: 'New' }),
    true,
  );
  assert.equal(
    await store.cas(room.code, 0, { ...room, revision: 1, name: 'Stale' }),
    false,
  );
  assert.equal(JSON.parse((await store.read(room.code)).state).name, 'New');
});

test('concurrent actions through separate database adapters retain every message', async (t) => {
  const { store, query, room, host } = fixture(t);
  await store.insert(room);
  await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      mutate(
        createPostgresRoomDatabase(query),
        room.code,
        { type: 'chat', id: `chat-${index}`, text: `Message ${index}` },
        host.token,
      ),
    ),
  );
  const stored = JSON.parse((await store.read(room.code)).state);
  assert.equal(stored.revision, 10);
  assert.equal(new Set(stored.messages.map((message) => message.id)).size, 10);
});
