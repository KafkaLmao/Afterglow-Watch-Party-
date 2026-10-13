'use client';

import { useId, useState } from 'react';
import { ArrowUpRight, Link } from 'lucide-react';
import { resolveMediaSource } from '../lib/media-source.mjs';
import type { VideoSource } from '../lib/room-types';

export function MediaLinkForm({
  onSubmit,
  submitLabel = 'Load media',
  disabled = false,
  className = '',
  initialSource,
}: {
  onSubmit: (source: VideoSource) => Promise<boolean> | boolean;
  submitLabel?: string;
  disabled?: boolean;
  className?: string;
  initialSource?: VideoSource;
}) {
  const id = useId();
  const [url, setUrl] = useState(initialSource?.url || '');
  const [title, setTitle] = useState(initialSource?.title || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={`media-link-form ${className}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || busy) return;
        setError('');
        setBusy(true);
        try {
          const source = resolveMediaSource(url);
          if (!(await onSubmit({ url: source.url, title: title.trim() })))
            setError('Could not load this link. Please try again.');
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Could not load this link.',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={`${id}-url`}>Media link</label>
      <div className="media-url-input">
        <Link size={17} aria-hidden="true" />
        <input
          id={`${id}-url`}
          type="url"
          required
          maxLength={2048}
          placeholder="Paste a YouTube, Vimeo, or media file link"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError('');
          }}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
          aria-invalid={!!error}
          disabled={disabled || busy}
        />
      </div>
      <label htmlFor={`${id}-title`}>
        Title <span>(optional)</span>
      </label>
      <input
        id={`${id}-title`}
        maxLength={80}
        placeholder="What are we watching?"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        disabled={disabled || busy}
      />
      <p id={`${id}-help`} className="video-link-help">
        YouTube · Vimeo · Direct video & audio. Private videos and services that
        block embedding may not play.
      </p>
      {error && (
        <p id={`${id}-error`} className="video-link-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={disabled || busy}>
        {busy ? 'Loading…' : submitLabel}
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}
