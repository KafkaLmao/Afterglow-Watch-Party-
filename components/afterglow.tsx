'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ArrowUpRight, Check, X, Film } from 'lucide-react';
import ThemeSwitch from '../app/appearance';
import { initialLetter } from '../lib/display';
import type { Tab, Modal, VideoSource } from '../lib/room-types';
import { useRoom } from '../hooks/use-room';
import { useDisplayName } from '../hooks/use-preferences';
import { Discover } from './discover';
import { WatchRoom } from './watch-room';
import { RoomDialog } from './room-dialog';
import { useLenis } from 'lenis/react';
const subscribeToInvite = () => () => {};
const readInvite = () => new URLSearchParams(location.search).get('room');

export function Afterglow() {
  const [tab, setTab] = useState<Tab>('discover');
  const lenis = useLenis();
  useEffect(() => {
    // Tab navigation replaces page content without a browser navigation event.
    lenis?.resize();
    lenis?.scrollTo(window.scrollY, { immediate: true });
  }, [tab, lenis]);
  const [selectedModal, selectModal] = useState<Modal | null>(null);
  const [pendingSource, setPendingSource] = useState<VideoSource | undefined>();
  const [inviteDismissed, setInviteDismissed] = useState(false);
  const inviteCode = useSyncExternalStore(
    subscribeToInvite,
    readInvite,
    () => null,
  );
  const setModal = useCallback((next: Modal | null) => {
    if (next !== 'create') setPendingSource(undefined);
    selectModal(next);
    setInviteDismissed(true);
  }, []);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { name, setName } = useDisplayName();
  const handleConnected = useCallback(() => {
    setTab('room');
    setModal(null);
  }, [setModal]);
  const {
    room,
    session,
    online,
    roundTripMs,
    clockOffset,
    error,
    setError,
    action,
    enterRoom,
    leave: leaveRoom,
  } = useRoom(handleConnected);
  const modal =
    selectedModal ||
    (inviteCode && !session && !inviteDismissed ? 'join' : null);
  const isHost = !!session && room?.host === session.id;
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);
  const closeDialog = useCallback(() => {
    setModal(null);
    setError('');
  }, [setError, setModal]);
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        location.origin + '/?room=' + session?.code,
      );
      notify('Invite link copied.');
    } catch {
      setModal('invite');
    }
  }
  async function leave() {
    if (await leaveRoom()) {
      setTab('discover');
      setModal(null);
      notify('You left the room.');
    }
  }
  return (
    <main>
      {' '}
      <header className="topbar">
        <button className="brand" onClick={() => setTab('discover')}>
          <span className="brand-icon">
            <Film size={19} />
          </span>
          afterglow<span className="brand-dot">.</span>
        </button>
        <nav>
          <button
            className={tab === 'discover' ? 'active' : ''}
            onClick={() => setTab('discover')}
          >
            Discover
          </button>
          <button
            className={tab === 'room' ? 'active' : ''}
            onClick={() => (session ? setTab('room') : setModal('create'))}
          >
            Watch room{session && <span className="nav-dot" />}
          </button>
          <button onClick={() => setModal('guide')}>The little details</button>
        </nav>
        <div className="nav-right">
          <ThemeSwitch />
          <span className="nav-note">MOVIE NIGHT, REIMAGINED</span>
          <button
            className="avatar"
            onClick={() => setModal('profile')}
            aria-label="Your profile"
          >
            {name ? initialLetter(name) : 'Y'}
          </button>
        </div>
      </header>
      {tab === 'discover' ? (
        <Discover
          room={room}
          session={session}
          setTab={setTab}
          setModal={setModal}
          action={action}
          notify={notify}
          copyInvite={copyInvite}
          createWithVideo={(source) => {
            setPendingSource(source);
            setModal('create');
          }}
        />
      ) : room && session ? (
        <WatchRoom
          room={room}
          session={session}
          online={online}
          roundTripMs={roundTripMs}
          clockOffset={clockOffset}
          setTab={setTab}
          setModal={setModal}
          action={action}
          copyInvite={copyInvite}
          leave={leave}
        />
      ) : (
        <div className="empty">Connecting to your room…</div>
      )}
      <footer>
        <span className="brand">
          afterglow<span className="brand-dot">.</span>
        </span>
        <p>For the nights you’ll talk about tomorrow.</p>
        <button onClick={() => setModal('credits')}>
          Supported media <ArrowUpRight size={13} />
        </button>
      </footer>
      {modal && (
        <RoomDialog
          initialSource={pendingSource}
          modal={modal}
          setModal={setModal}
          name={name}
          onNameChange={setName}
          session={session}
          isHost={isHost}
          action={action}
          error={error}
          setError={setError}
          notify={notify}
          enterRoom={enterRoom}
          leave={leave}
          copyInvite={copyInvite}
          onClose={closeDialog}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {error && !modal && (
        <div className="toast error" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}
