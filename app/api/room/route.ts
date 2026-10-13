import { mutate, RoomError, snapshot } from '../../../lib/room-engine.mjs';
import { createRoom, joinRoom, roomStore } from '../../../lib/room-store';
import type { StoredRoom, VideoSource } from '../../../lib/room-types';

export const dynamic = 'force-dynamic';
const MAX_REQUEST_LENGTH = 8192;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function failureResponse(error: unknown) {
  if (error instanceof RoomError)
    return json({ error: error.message }, error.status);
  console.error('Room request failed:', error);
  return json({ error: 'Could not update the room.' }, 500);
}

function roomCode(value: unknown): string {
  const code = String(value || '')
    .toUpperCase()
    .replace(/\s/g, '');
  if (!/^[A-Z2-9]{8}$/.test(code))
    throw new RoomError('Enter the 8-character room code.');
  return code;
}

function bearerToken(request: Request): string {
  return request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_LENGTH)
    throw new RoomError('Request is too large.', 413);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new RoomError('Invalid request.');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RoomError('Invalid request.');
  }
  return value as Record<string, unknown>;
}

export async function GET(request: Request) {
  try {
    const code = roomCode(new URL(request.url).searchParams.get('code'));
    const row = await roomStore.read(code);
    if (!row) throw new RoomError('Room not found.', 404);
    const room: StoredRoom = JSON.parse(row.state);
    if (!room.members.some((member) => member.token === bearerToken(request))) {
      throw new RoomError('Join this room first.', 401);
    }
    return json(snapshot(room));
  } catch (error) {
    return failureResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin)
      throw new RoomError('Invalid origin.', 403);
    const body = await requestBody(request);
    if (body.type === 'create' || body.type === 'join') {
      const name =
        typeof body.name === 'string' ? body.name.trim().slice(0, 32) : '';
      if (!name) throw new RoomError('Add your name to join.');
      const member = {
        id: crypto.randomUUID(),
        token: crypto.randomUUID() + crypto.randomUUID(),
        name,
      };
      if (body.type === 'join')
        return json(await joinRoom(roomCode(body.code), member));
      const nameOfRoom =
        typeof body.roomName === 'string'
          ? body.roomName.trim().slice(0, 60)
          : '';
      let source: VideoSource | undefined;
      if (body.source !== undefined) {
        if (
          typeof body.source !== 'object' ||
          body.source === null ||
          Array.isArray(body.source)
        )
          throw new RoomError('Enter a valid video URL.');
        const input = body.source as Record<string, unknown>;
        if (
          typeof input.url !== 'string' ||
          input.url.length > 2048 ||
          (input.title !== undefined && typeof input.title !== 'string')
        )
          throw new RoomError('Enter a valid video URL.');
        source = {
          url: input.url.trim(),
          title: typeof input.title === 'string' ? input.title : '',
        };
      }
      return json(
        await createRoom(member, nameOfRoom || 'Friday night club', source),
      );
    }
    const code = roomCode(body.code);
    return json({
      room: await mutate(roomStore, code, body, bearerToken(request)),
    });
  } catch (error) {
    return failureResponse(error);
  }
}
