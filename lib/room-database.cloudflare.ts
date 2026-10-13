import { env } from 'cloudflare:workers';
import { RoomError } from './room-engine.mjs';
import type { RoomDatabase } from './room-types';

function database() {
  if (!env.DB) throw new RoomError('Room storage is unavailable.', 503);
  return env.DB;
}

export const roomDatabase: RoomDatabase = {
  read: (code) =>
    database()
      .prepare('SELECT state, revision FROM rooms WHERE code = ?')
      .bind(code)
      .first<{ state: string; revision: number }>(),
  insert: async (room) => {
    await database()
      .prepare(
        'INSERT INTO rooms (code, revision, state, updated) VALUES (?, ?, ?, ?)',
      )
      .bind(room.code, room.revision, JSON.stringify(room), Date.now())
      .run();
  },
  cas: async (code, revision, room) => {
    const result = await database()
      .prepare(
        'UPDATE rooms SET state = ?, revision = ?, updated = ? WHERE code = ? AND revision = ?',
      )
      .bind(JSON.stringify(room), room.revision, Date.now(), code, revision)
      .run();
    return result.meta.changes === 1;
  },
};
