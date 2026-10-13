import { roomDatabase } from './room-database';
import {
  activeMembers,
  apply,
  initial,
  RoomError,
  snapshot,
} from './room-engine.mjs';
import type {
  EntryResponse,
  RoomStore,
  StoredMember,
  StoredRoom,
  VideoSource,
} from './room-types';

const MAX_ACTIVE_MEMBERS = 30;
const STALE_MEMBER_AGE_MS = 60 * 60 * 1000;
const WRITE_ATTEMPTS = 20;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const roomStore: RoomStore = roomDatabase;

type NewMember = Pick<StoredMember, 'id' | 'name' | 'token'>;

function entryResponse(room: StoredRoom, member: NewMember): EntryResponse {
  return {
    room: snapshot(room),
    session: { id: member.id, token: member.token, code: room.code },
  };
}

export async function createRoom(
  member: NewMember,
  name: string,
  source?: VideoSource,
): Promise<EntryResponse> {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const code = [...bytes]
    .map((byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length])
    .join('');
  const room = initial(code, member, name);
  if (source)
    apply(
      room,
      { type: 'source', id: crypto.randomUUID(), ...source },
      member.token,
    );
  await roomDatabase.insert(room);
  return entryResponse(room, member);
}

export async function joinRoom(
  code: string,
  member: NewMember,
): Promise<EntryResponse> {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await roomStore.read(code);
    if (!row)
      throw new RoomError('That room was not found. Check the code.', 404);
    const room: StoredRoom = JSON.parse(row.state);
    const now = Date.now();
    if (activeMembers(room, now).length >= MAX_ACTIVE_MEMBERS) {
      throw new RoomError('This room is full.', 409);
    }
    room.members = room.members.filter(
      (member) => now - member.seen < STALE_MEMBER_AGE_MS,
    );
    room.members.push({ ...member, seen: now, ready: false });
    room.revision++;
    if (
      !room.host ||
      !activeMembers(room, now).some((member) => member.id === room.host)
    ) {
      room.host = member.id;
    }
    if (await roomStore.cas(code, row.revision, room))
      return entryResponse(room, member);
  }
  throw new RoomError('The room is busy. Try again.', 409);
}
