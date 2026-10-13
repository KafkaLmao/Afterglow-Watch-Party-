import { neon } from '@neondatabase/serverless';
import { RoomError } from './room-engine.mjs';
import { createPostgresRoomDatabase } from './postgres-room-database.mjs';
import type { RoomDatabase } from './room-types';

let database: RoomDatabase | undefined;

function getDatabase(): RoomDatabase {
  if (database) return database;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new RoomError(
      'Room storage is unavailable. Please try again later.',
      503,
    );
  }
  const sql = neon(url);
  database = createPostgresRoomDatabase((text, parameters) =>
    sql.query(text, parameters),
  );
  return database;
}

// Resolve credentials only when a request uses storage, never during build.
export const roomDatabase: RoomDatabase = {
  read: (code) => getDatabase().read(code),
  insert: (room) => getDatabase().insert(room),
  cas: (code, revision, room) => getDatabase().cas(code, revision, room),
};
