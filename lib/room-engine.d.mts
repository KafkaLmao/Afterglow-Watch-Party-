import type {
  RoomSnapshot,
  RoomStore,
  StoredMember,
  StoredRoom,
  Playback,
} from './room-types';

export class RoomError extends Error {
  status: number;
  constructor(message: string, status?: number);
}
export function activeMembers(room: StoredRoom, now?: number): StoredMember[];
export function positionAt(playback: Playback, now: number): number;
export function snapshot(room: StoredRoom, now?: number): RoomSnapshot;
export function initial(
  code: string,
  member: Pick<StoredMember, 'id' | 'name' | 'token'>,
  name: string,
  now?: number,
): StoredRoom;
export function apply(
  room: StoredRoom,
  action: Record<string, unknown>,
  token: string,
  now?: number,
): boolean;
export function mutate(
  store: RoomStore,
  code: string,
  action: Record<string, unknown>,
  token: string,
  now?: number,
): Promise<RoomSnapshot>;
