'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { movies, type MovieId } from '../lib/catalog';

const PREFERENCES_CHANGED = 'afterglow-preferences-changed';

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener(PREFERENCES_CHANGED, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(PREFERENCES_CHANGED, listener);
  };
}

function useStoredPreference(key: string) {
  const read = useCallback(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }, [key]);
  const value = useSyncExternalStore(subscribe, read, () => null);
  const write = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
        window.dispatchEvent(new Event(PREFERENCES_CHANGED));
      } catch {
        // Preferences are optional when browser storage is unavailable.
      }
    },
    [key],
  );
  return [value, write] as const;
}

export function useDisplayName() {
  const [value, setName] = useStoredPreference('afterglow-name');
  return { name: value || '', setName };
}

export function useSavedFilms() {
  const [value, write] = useStoredPreference('afterglow-saved');
  const saved = useMemo<MovieId[]>(() => {
    try {
      const parsed: unknown = JSON.parse(value || '[]');
      if (!Array.isArray(parsed)) return [];
      return movies
        .filter((movie) => parsed.includes(movie.id))
        .map((movie) => movie.id);
    } catch {
      return [];
    }
  }, [value]);
  const toggle = (id: MovieId) => {
    const next = saved.includes(id)
      ? saved.filter((movie) => movie !== id)
      : [...saved, id];
    write(JSON.stringify(next));
  };
  return { saved, toggle };
}
