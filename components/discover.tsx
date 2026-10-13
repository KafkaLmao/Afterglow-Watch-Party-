'use client';
import { ArrowUpRight, ArrowRight, Link, Users } from 'lucide-react';
import type {
  RoomSnapshot,
  Session,
  SendAction,
  Tab,
  Modal,
  VideoSource,
} from '../lib/room-types';
import { VideoLinkForm } from './video-link-form';
import { useDiscoverMotion } from '../hooks/use-discover-motion';
import { useLenis } from 'lenis/react';
import { WaveBackground } from './wave-background';
interface DiscoverProps {
  room: RoomSnapshot | null;
  session: Session | null;
  setTab: (tab: Tab) => void;
  setModal: (modal: Modal) => void;
  action: SendAction;
  notify: (message: string) => void;
  copyInvite: () => Promise<void>;
  createWithVideo: (source: VideoSource) => void;
}
export function Discover({
  room,
  session,
  setTab,
  setModal,
  action,
  notify,
  copyInvite,
  createWithVideo,
}: DiscoverProps) {
  const isHost = room?.host === session?.id;
  const motionRoot = useDiscoverMotion();
  const lenis = useLenis();

  function goToVideo() {
    const target = document.getElementById('bring-video-title');
    if (!target) return;
    const focus = () => target.focus({ preventScroll: true });
    if (lenis) {
      lenis.scrollTo(target, { offset: -110, onComplete: focus });
    } else {
      target.scrollIntoView({ behavior: 'instant', block: 'center' });
      focus();
    }
  }

  return (
    <div className="discover page" ref={motionRoot}>
      <section className="hero hero-with-waves">
        <WaveBackground />
        <div className="hero-copy">
          <span className="eyebrow">
            <span /> A GOOD NIGHT STARTS HERE
          </span>
          <h1>
            Good movies.
            <br />
            Better <em>company.</em>
          </h1>
          <p>
            Different couches. Same goosebumps.
            <br />
            Bring a video, gather your people, and press play together.
          </p>
          <div className="hero-actions">
            <button
              className="button primary"
              onClick={() => (session ? setTab('room') : setModal('create'))}
            >
              {session ? 'Back to your room' : 'Start a watch party'}
              <ArrowUpRight size={18} />
            </button>
            <button className="text-button" onClick={() => setModal('join')}>
              Join a room <ArrowRight size={17} />
            </button>
          </div>
          <div className="hero-foot">
            <div className="mini-icons">
              <span>🍿</span>
              <span>🎬</span>
              <span>✨</span>
            </div>
            <small>Make a little room for movie night.</small>
          </div>
        </div>
        <div className="hero-link-preview">
          <span className="preview-live">
            <span /> YOUR NEXT WATCH PARTY
          </span>
          <div className="preview-link-icon">
            <Link size={40} />
          </div>
          <h2>
            One link.
            <br />
            Everyone together.
          </h2>
          <p>YouTube, Vimeo, or your own media.</p>
          <button className="button primary" onClick={goToVideo}>
            Bring your link <ArrowUpRight size={17} />
          </button>
          <div className="preview-provider-tags">
            <span>YouTube</span>
            <span>Vimeo</span>
            <span>Video & audio</span>
          </div>
        </div>
      </section>
      <section className="room-strip">
        <div className="strip-icon">
          <Users size={24} />
        </div>
        <div>
          <strong>
            {session ? room?.name : 'Your people are one link away.'}
          </strong>
          <p>
            {session
              ? `${room?.members.length || 1} in the room · Code ${session.code}`
              : 'Create a room, send an invite, and let the opening credits roll.'}
          </p>
        </div>
        <button
          className="text-button"
          onClick={() => (session ? copyInvite() : setModal('join'))}
        >
          {session ? 'Copy invitation' : 'Have a room code?'}
          <ArrowUpRight size={18} />
        </button>
      </section>
      <VideoLinkForm
        session={session}
        isHost={isHost}
        action={action}
        createWithVideo={createWithVideo}
        onLoaded={() => {
          notify('Your video is ready. Invite your people and press play.');
          setTab('room');
        }}
      />
      <section className="how">
        <span className="eyebrow muted">LESS PLANNING. MORE POPCORN.</span>
        <h2>Movie night, without the distance.</h2>
        <div>
          {[
            {
              n: '01',
              title: 'Make your room',
              text: 'A cozy corner of the internet, just for your people.',
            },
            {
              n: '02',
              title: 'Bring your video',
              text: 'Paste a video link and make it the feature of your night.',
            },
            {
              n: '03',
              title: 'Feel it together',
              text: 'Every pause, laugh, and plot twist. In sync.',
            },
          ].map((x) => (
            <article key={x.n}>
              <span>{x.n}</span>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
