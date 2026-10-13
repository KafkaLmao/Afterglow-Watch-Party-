const PRESENCE_TIMEOUT_MS = 25_000;
const MAX_PLAYBACK_SECONDS = 86_400;
import { resolveMediaSource } from './media-source.mjs';
const MAX_MESSAGES = 100;
const REACTION_LIFETIME_MS = 5000;
const MAX_REACTIONS = 30;
const MAX_RECORDED_ACTIONS = 256;
const WRITE_ATTEMPTS = 20;

export class RoomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const activeMembers = (room, now = Date.now()) =>
  room.members.filter((member) => now - member.seen < PRESENCE_TIMEOUT_MS);
export const positionAt = (playback, now) =>
  Math.max(
    0,
    playback.position + (playback.playing ? (now - playback.at) / 1000 : 0),
  );
export function snapshot(room, now = Date.now()) {
  const publicRoom = { ...room };
  delete publicRoom.applied;
  delete publicRoom.queue;
  // Older rooms contained an automatic catalog film. Never serve that fallback.
  if (!room.playback.url)
    publicRoom.playback = {
      movie: null,
      url: null,
      title: null,
      playing: false,
      position: 0,
      at: room.playback.at,
    };
  return {
    ...publicRoom,
    members: activeMembers(room, now).map(({ id, name, seen, ready }) => ({
      id,
      name,
      seen,
      ready,
    })),
    serverTime: now,
  };
}
export function initial(code, member, name, now = Date.now()) {
  return {
    code,
    name,
    host: member.id,
    revision: 0,
    playback: {
      movie: null,
      url: null,
      title: null,
      playing: false,
      position: 0,
      at: now,
    },
    members: [{ ...member, seen: now, ready: false }],
    messages: [],
    reactions: [],
    poll: null,
    applied: [],
    created: now,
  };
}
const trimmedString = (value, limit) =>
  typeof value === 'string' && value.trim()
    ? value.trim().slice(0, limit)
    : null;
export function apply(room, action, token, now = Date.now()) {
  const member = room.members.find((member) => member.token === token);
  if (!member)
    throw new RoomError('Your room session has expired. Join again.', 401);
  if (!action.id || typeof action.id !== 'string' || action.id.length > 80)
    throw new RoomError('An action ID is required.');
  // A retried request must not advance the revision or repeat its side effects.
  if (room.applied.includes(action.id)) return false;
  member.seen = now;
  const active = activeMembers(room, now);
  if (!active.some((entry) => entry.id === room.host))
    room.host = active[0]?.id || member.id;
  const host = () => {
    if (room.host !== member.id)
      throw new RoomError('Only the host can do that.', 403);
  };
  switch (action.type) {
    case 'heartbeat':
      break;
    case 'ready':
      member.ready = !!action.value;
      break;
    case 'play':
    case 'pause':
    case 'seek':
      host();
      if (
        !Number.isFinite(action.position) ||
        action.position < 0 ||
        action.position > MAX_PLAYBACK_SECONDS
      )
        throw new RoomError('Invalid playback position.');
      if (!room.playback.url)
        throw new RoomError('Add a media link before starting playback.');
      room.playback.position = action.position;
      room.playback.at = now;
      if (action.type !== 'seek')
        room.playback.playing = action.type === 'play';
      break;
    case 'source': {
      host();
      let source;
      try {
        source = resolveMediaSource(action.url);
      } catch (error) {
        throw new RoomError(error.message);
      }
      room.playback = {
        movie: 'custom',
        url: source.url,
        title:
          trimmedString(action.title, 80) ||
          `Shared ${source.label.toLowerCase()}`,
        playing: false,
        position: 0,
        at: now,
      };
      room.members.forEach((entry) => (entry.ready = false));
      break;
    }
    case 'chat': {
      const text = trimmedString(action.text, 500);
      if (!text) throw new RoomError('Write a message first.');
      room.messages.push({
        id: action.id,
        member: member.id,
        name: member.name,
        text,
        at: now,
      });
      room.messages = room.messages.slice(-MAX_MESSAGES);
      break;
    }
    case 'reaction':
      if (!['🔥', '❤️', '😂', '👏', '😮', '🍿'].includes(action.emoji))
        throw new RoomError('Unknown reaction.');
      room.reactions.push({
        id: action.id,
        name: member.name,
        emoji: action.emoji,
        at: now,
      });
      room.reactions = room.reactions
        .filter((entry) => now - entry.at < REACTION_LIFETIME_MS)
        .slice(-MAX_REACTIONS);
      break;
    case 'poll':
      host();
      if (
        !trimmedString(action.question, 120) ||
        !Array.isArray(action.options) ||
        action.options.length < 2 ||
        action.options.length > 4 ||
        action.options.some((entry) => !trimmedString(entry, 60))
      )
        throw new RoomError('Add a question and 2–4 choices.');
      room.poll = {
        id: action.id,
        question: trimmedString(action.question, 120),
        options: action.options.map((entry) => trimmedString(entry, 60)),
        votes: {},
        closed: false,
      };
      break;
    case 'vote':
      if (!room.poll || room.poll.closed)
        throw new RoomError('Voting has ended.');
      if (
        !Number.isInteger(action.option) ||
        action.option < 0 ||
        action.option >= room.poll.options.length
      )
        throw new RoomError('Choose a valid option.');
      room.poll.votes[member.id] = action.option;
      break;
    case 'closePoll':
      host();
      if (room.poll) room.poll.closed = true;
      break;
    case 'transfer':
      host();
      if (!active.some((entry) => entry.id === action.member))
        throw new RoomError('That person is offline.');
      room.host = action.member;
      break;
    case 'leave':
      room.members = room.members.filter((entry) => entry.id !== member.id);
      if (room.host === member.id)
        room.host =
          active.filter((entry) => entry.id !== member.id)[0]?.id || null;
      break;
    default:
      throw new RoomError('Unknown action.');
  }
  room.applied = [...room.applied, action.id].slice(-MAX_RECORDED_ACTIONS);
  room.revision++;
  return true;
}
export async function mutate(store, code, action, token, now = Date.now()) {
  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
    const row = await store.read(code);
    if (!row)
      throw new RoomError('That room was not found. Check the code.', 404);
    const room = JSON.parse(row.state);
    if (!apply(room, action, token, now)) return snapshot(room, now);
    // A failed compare-and-swap means another writer committed; reload and reapply.
    if (await store.cas(code, row.revision, room)) return snapshot(room, now);
  }
  throw new RoomError('The room is busy. Please try again.', 409);
}
