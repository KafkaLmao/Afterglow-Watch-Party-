'use client';
import { useMemo, type RefObject } from 'react';
import {
  Plus,
  Link,
  Users,
  ChevronLeft,
  Crown,
  CheckCircle2,
} from 'lucide-react';
import type {
  RoomSnapshot,
  Session,
  SendAction,
  Tab,
  Modal,
} from '../lib/room-types';
import { REACTION_EMOJIS } from '../lib/room-types';
import { initialLetter } from '../lib/display';
import { existingMediaSource } from '../lib/media-source.mjs';
import { MediaPlayer } from './media-player';
import { MediaLinkForm } from './media-link-form';
import { SocialPanel } from './social-panel';
interface WatchRoomProps {
  room: RoomSnapshot;
  session: Session;
  online: boolean;
  roundTripMs: number;
  clockOffset: RefObject<number>;
  setTab: (tab: Tab) => void;
  setModal: (modal: Modal) => void;
  action: SendAction;
  leave: () => Promise<void>;
}
export function WatchRoom({
  room,
  session,
  online,
  roundTripMs,
  clockOffset,
  setTab,
  setModal,
  action,
  leave,
}: WatchRoomProps) {
  const isHost = room.host === session.id;
  const source = useMemo(
    () => existingMediaSource(room.playback.url),
    [room.playback.url],
  );
  async function loadSource(next: { url: string; title: string }) {
    return action({ type: 'source', ...next });
  }
  return (
    <div className="page room-page">
      <div className="room-title">
        <div>
          <button className="back" onClick={() => setTab('discover')}>
            <ChevronLeft size={15} /> Discover
          </button>
          <h1>
            {room.name}
            <span className="live-pill">
              <span /> {online ? 'LIVE ROOM' : 'RECONNECTING'}
            </span>
          </h1>
          <p>
            <Users size={14} /> {room.members.length} together <span>·</span>{' '}
            {session.code} <span>·</span>{' '}
            {isHost
              ? 'You’re hosting'
              : 'Hosted by ' +
                (room.members.find((m) => m.id === room.host)?.name ||
                  'your group')}
          </p>
        </div>
        <div>
          <button
            className="button secondary"
            onClick={() => setModal('source')}
          >
            <Link size={16} /> Add a link
          </button>
          <button className="button primary" onClick={() => setModal('invite')}>
            <Plus size={16} /> Invite friends
          </button>
        </div>
      </div>
      <div className="room-layout">
        <div className="room-main">
          {source ? (
            <MediaPlayer
              key={source.url}
              source={source}
              playback={room.playback}
              isHost={isHost}
              online={online}
              clockOffset={clockOffset}
              action={action}
            />
          ) : (
            <section
              className="empty-player"
              aria-labelledby="empty-player-title"
            >
              <span className="empty-player-icon">
                <Link size={28} />
              </span>
              <span className="eyebrow muted">NOTHING PLAYING YET</span>
              <h2 id="empty-player-title">Your room. Your link.</h2>
              <p>
                {isHost
                  ? 'Paste something you want to watch. Everyone joins the same playback.'
                  : 'Your host can add a link to start watching together.'}
              </p>
              {isHost ? (
                <MediaLinkForm
                  className="room-source-form"
                  disabled={!online}
                  onSubmit={loadSource}
                  submitLabel="Load in this room"
                />
              ) : (
                <span className="waiting-for-host">
                  Waiting for the host to add media
                </span>
              )}
            </section>
          )}
          {source && isHost && (
            <section className="room-source-panel">
              <h3>Change the media</h3>
              <MediaLinkForm
                className="room-source-form"
                disabled={!online}
                onSubmit={loadSource}
                submitLabel="Replace media"
              />
            </section>
          )}
          <div className="now-playing">
            <div>
              <span className="eyebrow muted">NOW PLAYING</span>
              <h2>
                {source
                  ? room.playback.title || 'Your shared media'
                  : 'Ready when you are'}
              </h2>
              <p>
                {source
                  ? source.label + ' · Shared playback'
                  : 'Add a link to start the night.'}
              </p>
            </div>
            <div className="reactions">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  aria-label={`React ${e}`}
                  onClick={() => action({ type: 'reaction', emoji: e })}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <section className="people-panel">
            <div className="panel-heading">
              <h3>
                On the couch <span>{room.members.length}</span>
              </h3>
              <button
                className="text-button"
                onClick={() =>
                  action({
                    type: 'ready',
                    value: !room.members.find((m) => m.id === session.id)
                      ?.ready,
                  })
                }
              >
                <CheckCircle2 size={16} />
                {room.members.find((m) => m.id === session.id)?.ready
                  ? 'Ready to roll'
                  : 'I’m ready'}
              </button>
            </div>
            <div className="people">
              {room.members.map((m, i: number) => (
                <div className="person" key={m.id}>
                  <span className={`avatar color-${i % 4}`}>
                    {initialLetter(m.name)}
                    {m.ready && <b>✓</b>}
                  </span>
                  <div>
                    <strong>
                      {m.name}
                      {m.id === session.id ? ' (you)' : ''}
                    </strong>
                    <small>
                      {m.id === room.host
                        ? '♛ Host'
                        : m.ready
                          ? 'Ready'
                          : 'Getting comfortable'}
                    </small>
                  </div>
                  {isHost && m.id !== session.id && (
                    <button
                      title={`Make ${m.name} host`}
                      aria-label={`Make ${m.name} host`}
                      onClick={() => action({ type: 'transfer', member: m.id })}
                    >
                      <Crown size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
          <details className="diagnostics">
            <summary>
              Connection details · {online ? 'Connected' : 'Reconnecting'}
            </summary>
            <p>
              Round trip: {roundTripMs} ms · Room revision: {room.revision}.
              Play, pause, and seek follow the host. Each device controls its
              own volume.
            </p>
            <button className="text-button danger" onClick={leave}>
              Leave room
            </button>
          </details>
        </div>
        <SocialPanel
          room={room}
          session={session}
          online={online}
          isHost={isHost}
          action={action}
          setModal={setModal}
        />
      </div>
    </div>
  );
}
