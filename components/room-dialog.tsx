'use client';
import { useRef, useState } from 'react';
import { ArrowUpRight, Users, Copy, BarChart3, Link } from 'lucide-react';
import { MediaLinkForm } from './media-link-form';
import { errorMessage } from '../lib/display';
import { parseRoomInvite, roomInviteUrl } from '../lib/room-invite.mjs';
import type {
  Modal,
  Session,
  SendAction,
  EntryRequest,
  EntryMode,
  VideoSource,
} from '../lib/room-types';
import { Dialog } from './dialog';
interface RoomDialogProps {
  initialSource?: VideoSource;
  modal: Modal;
  setModal: (modal: Modal | null) => void;
  name: string;
  onNameChange: (name: string) => void;
  session: Session | null;
  isHost: boolean;
  action: SendAction;
  error: string;
  setError: (error: string) => void;
  notify: (message: string) => void;
  enterRoom: (entry: EntryRequest) => Promise<void>;
  leave: () => Promise<void>;
  onClose: () => void;
}
export function RoomDialog({
  initialSource,
  modal,
  setModal,
  name,
  onNameChange,
  session,
  isHost,
  action,
  error,
  setError,
  notify,
  enterRoom,
  leave,
  onClose,
}: RoomDialogProps) {
  const [roomName, setRoomName] = useState('Friday night club');
  const [code, setCode] = useState(() =>
    typeof location === 'undefined'
      ? ''
      : new URLSearchParams(location.search).get('room') || '',
  );
  const [busy, setBusy] = useState(false);
  const inviteInput = useRef<HTMLInputElement>(null);
  const [inviteFeedback, setInviteFeedback] = useState('');
  const inviteUrl =
    session && typeof location !== 'undefined'
      ? roomInviteUrl(location.origin, session.code)
      : '';
  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteFeedback('Link copied. Send it to your friends to join.');
    } catch {
      inviteInput.current?.focus();
      inviteInput.current?.select();
      setInviteFeedback(
        'Copy the selected link, or share the room code below.',
      );
    }
  }
  const [question, setQuestion] = useState('What should we watch next?');
  const [options, setOptions] = useState('');
  async function enter(type: EntryMode) {
    setBusy(true);
    setError('');
    try {
      const roomCode = type === 'join' ? parseRoomInvite(code) : undefined;
      if (type === 'join' && !roomCode) {
        throw new Error(
          'Paste an invite link or enter the 8-character room code.',
        );
      }
      await enterRoom({
        type,
        name,
        code: roomCode || '',
        roomName,
        ...(type === 'create' && initialSource
          ? { source: initialSource }
          : {}),
      });
      onNameChange(name);
      setModal(null);
      notify(
        type === 'create'
          ? 'Your movie night starts here.'
          : 'You’re in. Get comfortable.',
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog label={modal} onClose={onClose}>
      {' '}
      {['create', 'join'].includes(modal) ? (
        <>
          <span className="modal-icon">
            <Users size={25} />
          </span>
          <span className="eyebrow muted">MAKE IT A MOVIE NIGHT</span>
          <h2>
            {modal === 'create'
              ? 'Your couch. Your people.'
              : 'There’s a seat for you.'}
          </h2>
          <p>
            {modal === 'create'
              ? 'A room for every laugh, gasp, and “wait, rewind that.”'
              : 'Enter your name and the invite link or code your host shared.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enter(modal === 'create' ? 'create' : 'join');
            }}
          >
            {modal === 'create' && initialSource && (
              <div className="pending-video">
                <Link size={16} />
                <div>
                  <strong>{initialSource.title || 'Your feature'}</strong>
                  <small>{initialSource.url}</small>
                </div>
              </div>
            )}
            <label>
              Your name
              <input
                autoFocus
                maxLength={32}
                required
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="What should we call you?"
              />
            </label>
            {modal === 'create' ? (
              <label>
                Room name
                <input
                  maxLength={60}
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                />
              </label>
            ) : (
              <label>
                Invite link or room code
                <input
                  maxLength={2048}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste invite link or ABCD2345"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button disabled={busy} className="button primary">
              {busy
                ? 'Getting your room ready…'
                : modal === 'create'
                  ? 'Create your room'
                  : 'Join the party'}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <button
            className="modal-switch"
            onClick={() => setModal(modal === 'create' ? 'join' : 'create')}
          >
            {modal === 'create'
              ? 'Already have an invite? Join a room'
              : 'Hosting tonight? Create a room'}
          </button>
        </>
      ) : modal === 'poll' ? (
        <>
          <h2>A little democracy.</h2>
          <p>Give everyone a say in what’s next.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await action({
                  type: 'poll',
                  question,
                  options: options.split('\n').filter((x) => x.trim()),
                })
              )
                setModal(null);
            }}
          >
            <label>
              Question
              <input
                required
                maxLength={120}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </label>
            <label>
              Choices · one per line
              <textarea
                required
                value={options}
                onChange={(e) => setOptions(e.target.value)}
              />
            </label>
            <button className="button primary">
              Start voting <BarChart3 size={16} />
            </button>
          </form>
        </>
      ) : modal === 'source' ? (
        <>
          <h2>Add your media.</h2>
          <p>
            Paste a YouTube or Vimeo video, or a direct video/audio link.
            Everyone watches the same source.
          </p>
          <MediaLinkForm
            disabled={!isHost}
            onSubmit={async (source) => {
              if (await action({ type: 'source', ...source })) {
                setModal(null);
                return true;
              }
              return false;
            }}
          />
          {!isHost && (
            <small>
              Your host can change the media. Send your link in room chat.
            </small>
          )}
        </>
      ) : modal === 'guide' ? (
        <>
          <h2>A few little details.</h2>
          <p>
            Create a room and share its link or eight-character code. Your host
            controls play, pause, seek, and the film; everyone can chat, react,
            share links in chat, and vote.
          </p>
          <p>
            Tap “I’m ready” before the opening credits. The crown beside a
            friend lets the host hand over control. If the host disconnects for
            25 seconds, an online participant takes over.
          </p>
          <p>
            Returning to the same tab restores your room. If your browser blocks
            autoplay, tap the player once. Your volume and full-screen settings
            are personal.
          </p>
          <button className="button primary" onClick={() => setModal('create')}>
            Let’s make a night of it <ArrowUpRight size={16} />
          </button>
        </>
      ) : modal === 'profile' ? (
        <>
          <h2>Hey, {name || 'movie lover'}.</h2>
          <p>
            Your name is remembered on this device and shown to people in your
            room.
          </p>
          <label>
            Display name
            <input
              value={name}
              maxLength={32}
              onChange={(e) => {
                onNameChange(e.target.value);
              }}
            />
          </label>
          <p>Name changes apply when you join your next room.</p>
          {session && (
            <button className="button secondary" onClick={leave}>
              Leave current room
            </button>
          )}
        </>
      ) : modal === 'credits' ? (
        <>
          <h2>Your links, together.</h2>
          <p>
            Rooms start empty. Add a YouTube or Vimeo video, or a direct HTTPS
            video or audio file. Play, pause, and seek are shared; volume and
            fullscreen stay personal.
          </p>
          <p>
            Private videos, age-restricted content, and videos with embedding
            disabled may not play. Netflix and similar protected streaming pages
            cannot be embedded.
          </p>
          <p>
            Supported file links include MP4, WebM, MOV, MP3, WAV, and OGG.
            Playback depends on the browser and the media provider.
          </p>
        </>
      ) : (
        <>
          <h2>Save a seat.</h2>
          <p>Send this link to your friends. They only need a name to join.</p>
          <label>
            Invite link
            <input
              ref={inviteInput}
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <p>
            Room code: <strong>{session?.code}</strong>
          </p>
          <button
            className="button primary"
            disabled={!inviteUrl}
            onClick={copyInvite}
          >
            <Copy size={16} /> Copy link
          </button>
          {inviteFeedback && <p role="status">{inviteFeedback}</p>}
        </>
      )}
      {error && !['create', 'join'].includes(modal) && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
