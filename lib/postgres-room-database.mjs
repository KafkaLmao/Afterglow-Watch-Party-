// Single-statement compare-and-swap keeps concurrent serverless writers safe.
export function createPostgresRoomDatabase(query) {
  return {
    async read(code) {
      const rows = await query(
        'SELECT state, revision FROM rooms WHERE code = $1',
        [code],
      );
      return rows[0] ?? null;
    },
    async insert(room) {
      await query(
        'INSERT INTO rooms (code, revision, state, updated) VALUES ($1, $2, $3, $4)',
        [room.code, room.revision, JSON.stringify(room), Date.now()],
      );
    },
    async cas(code, revision, room) {
      const rows = await query(
        'UPDATE rooms SET state = $1, revision = $2, updated = $3 WHERE code = $4 AND revision = $5 RETURNING code',
        [JSON.stringify(room), room.revision, Date.now(), code, revision],
      );
      return rows.length === 1;
    },
  };
}
