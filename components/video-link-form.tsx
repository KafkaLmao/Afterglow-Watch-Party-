'use client';

import { Link, Play, Users } from 'lucide-react';
import { MediaLinkForm } from './media-link-form';
import type { Session, SendAction, VideoSource } from '../lib/room-types';

export function VideoLinkForm({
  session,
  isHost,
  action,
  createWithVideo,
  onLoaded,
}: {
  session: Session | null;
  isHost: boolean;
  action: SendAction;
  createWithVideo: (source: VideoSource) => void;
  onLoaded: () => void;
}) {
  const canLoad = !session || isHost;

  return (
    <section className="bring-video" aria-labelledby="bring-video-title">
      <div className="bring-video-copy">
        <span className="eyebrow muted">YOUR LINK. YOUR MOVIE NIGHT.</span>
        <h2 id="bring-video-title" tabIndex={-1}>
          Bring the video.
          <br />
          <span>We’ll bring you together.</span>
        </h2>
        <p>
          A favorite film, a little nostalgia, or something nobody’s seen. Drop
          your link and give it the big-night treatment.
        </p>
        <div className="link-steps">
          <span>
            <Link size={15} /> Paste a link
          </span>
          <span>
            <Users size={15} /> Gather your people
          </span>
          <span>
            <Play size={15} /> Watch in sync
          </span>
        </div>
      </div>
      <div className="video-link-card">
        <div className="link-card-heading">
          <span className="link-card-icon">
            <Link size={21} />
          </span>
          <div>
            <strong>Your media, together</strong>
            <small>Paste a link. Press play.</small>
          </div>
        </div>
        <MediaLinkForm
          disabled={!canLoad}
          submitLabel={
            session ? 'Load media in your room' : 'Create a room with this link'
          }
          onSubmit={async (source) => {
            if (!session) {
              createWithVideo(source);
              return true;
            }
            if (await action({ type: 'source', ...source })) {
              onLoaded();
              return true;
            }
            return false;
          }}
        />
        {!canLoad && (
          <p className="video-link-help">
            Your host controls playback. Send your link in room chat.
          </p>
        )}
      </div>
    </section>
  );
}
