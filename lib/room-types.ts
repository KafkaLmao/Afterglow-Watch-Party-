export interface Session {
  code: string;
  id: string;
  token: string;
}

export interface Member {
  id: string;
  name: string;
  seen: number;
  ready: boolean;
}

export interface StoredMember extends Member {
  token: string;
}

export interface Playback {
  movie: 'custom' | null;
  url: string | null;
  title: string | null;
  playing: boolean;
  position: number;
  at: number;
}

export interface ChatMessage {
  id: string;
  member: string;
  name: string;
  text: string;
  at: number;
}

export const REACTION_EMOJIS = ['🔥', '❤️', '😂', '👏', '😮', '🍿'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface Reaction {
  id: string;
  name: string;
  emoji: ReactionEmoji;
  at: number;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  closed: boolean;
}

interface Room {
  code: string;
  name: string;
  host: string | null;
  revision: number;
  playback: Playback;
  messages: ChatMessage[];
  reactions: Reaction[];
  poll: Poll | null;
  created: number;
}

export interface StoredRoom extends Room {
  members: StoredMember[];
  applied: string[];
}

export interface RoomSnapshot extends Room {
  members: Member[];
  serverTime: number;
}

export type RoomAction =
  | { type: 'heartbeat' | 'leave' | 'closePoll' }
  | { type: 'ready'; value: boolean }
  | { type: 'play' | 'pause' | 'seek'; position: number }
  | { type: 'source'; url: string; title: string }
  | { type: 'chat'; text: string }
  | { type: 'reaction'; emoji: ReactionEmoji }
  | { type: 'poll'; question: string; options: string[] }
  | { type: 'vote'; option: number }
  | { type: 'transfer'; member: string };

export type ActionRequest = RoomAction & { id: string; code: string };
export type EntryMode = 'create' | 'join';
export interface VideoSource {
  url: string;
  title: string;
}
export interface EntryRequest {
  type: EntryMode;
  name: string;
  code: string;
  roomName: string;
  source?: VideoSource;
}

export interface EntryResponse {
  room: RoomSnapshot;
  session: Session;
}

export interface RoomStore {
  read(code: string): Promise<{ state: string; revision: number } | null>;
  cas(code: string, revision: number, room: StoredRoom): Promise<boolean>;
}

export type Tab = 'discover' | 'room';
export type Modal =
  | EntryMode
  | 'poll'
  | 'source'
  | 'guide'
  | 'profile'
  | 'credits'
  | 'invite';

export type SendAction = (
  action: RoomAction,
  quiet?: boolean,
) => Promise<boolean>;
