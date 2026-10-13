import type { RoomDatabase } from './room-types';

export function createPostgresRoomDatabase(
  query: (
    sql: string,
    parameters: unknown[],
  ) => Promise<Record<string, unknown>[]>,
): RoomDatabase;
