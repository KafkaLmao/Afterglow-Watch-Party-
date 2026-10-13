'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../lib/display';
import type {
  ActionRequest,
  EntryRequest,
  EntryResponse,
  RoomSnapshot,
  SendAction,
  Session,
} from '../lib/room-types';

const SESSION_KEY = 'afterglow-session';
const POLL_INTERVAL_MS = 100;
const OFFLINE_POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 8000;
const OFFLINE_THRESHOLD_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;
const ACTION_ATTEMPTS = 3;

export function useRoom(onConnected: () => void) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(true);
  const [roundTripMs, setRoundTripMs] = useState(0);
  const [error, setError] = useState('');
  const roomRef = useRef<RoomSnapshot | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const clockOffset = useRef(0);
  const bestRoundTrip = useRef(Infinity);
  const lastSeen = useRef(0);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionGeneration = useRef(0);

  const acceptSnapshot = useCallback(
    (snapshot: RoomSnapshot, started: number) => {
      const elapsed = Date.now() - started;
      setRoundTripMs(elapsed);
      if (elapsed < bestRoundTrip.current) {
        bestRoundTrip.current = elapsed;
        clockOffset.current = snapshot.serverTime - (started + elapsed / 2);
      }
      lastSeen.current = Date.now();
      setOnline(true);
      if (!roomRef.current || snapshot.revision >= roomRef.current.revision) {
        roomRef.current = snapshot;
        setRoom(snapshot);
      }
    },
    [],
  );

  const request = useCallback(
    async <T extends RoomSnapshot | EntryResponse | { room: RoomSnapshot }>(
      body?: EntryRequest | ActionRequest,
    ): Promise<T> => {
      const currentSession = sessionRef.current;
      const generation = connectionGeneration.current;
      const started = Date.now();
      const response = await fetch(
        body ? '/api/room' : `/api/room?code=${currentSession?.code}`,
        {
          method: body ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(currentSession
              ? { Authorization: `Bearer ${currentSession.token}` }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        const failure: { error?: string } = await response.json();
        throw new Error(failure.error || 'Connection interrupted.');
      }
      const data: T = await response.json();
      // An outstanding poll from a previous room must not overwrite a new session.
      if (
        generation === connectionGeneration.current &&
        body?.type !== 'create' &&
        body?.type !== 'join'
      ) {
        acceptSnapshot('room' in data ? data.room : data, started);
      }
      return data;
    },
    [acceptSnapshot],
  );

  const action: SendAction = useCallback(
    async (body, quiet = false) => {
      const currentSession = sessionRef.current;
      if (!currentSession) return false;
      // Keep the same ID across retries so the server applies the action once.
      const generation = connectionGeneration.current;
      const payload: ActionRequest = {
        ...body,
        id: crypto.randomUUID(),
        code: currentSession.code,
      };
      for (let attempt = 0; attempt < ACTION_ATTEMPTS; attempt++) {
        if (generation !== connectionGeneration.current) return false;
        try {
          await request(payload);
          return true;
        } catch (failure) {
          if (attempt === ACTION_ATTEMPTS - 1) {
            if (!quiet) {
              setError(errorMessage(failure));
              if (errorTimer.current) clearTimeout(errorTimer.current);
              errorTimer.current = setTimeout(() => setError(''), 6000);
            }
            return false;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, 150 * (attempt + 1)),
          );
        }
      }
      return false;
    },
    [request],
  );

  useEffect(() => {
    let cancelled = false;
    const generation = connectionGeneration.current;
    const restore = async () => {
      try {
        const stored: unknown = JSON.parse(
          sessionStorage.getItem(SESSION_KEY) || 'null',
        );
        if (!isSession(stored)) return;
        const inviteCode = new URLSearchParams(location.search).get('room');
        if (inviteCode && inviteCode !== stored.code) return;
        sessionRef.current = stored;
        await request();
        if (cancelled || generation !== connectionGeneration.current) return;
        setSession(stored);
        onConnected();
        void action({ type: 'heartbeat' }, true);
      } catch {
        if (cancelled || generation !== connectionGeneration.current) return;
        sessionStorage.removeItem(SESSION_KEY);
        sessionRef.current = null;
        roomRef.current = null;
        setSession(null);
        setRoom(null);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
  }, [request, action, onConnected]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = POLL_INTERVAL_MS;
      try {
        await request();
      } catch {
        if (Date.now() - lastSeen.current > OFFLINE_THRESHOLD_MS) {
          setOnline(false);
          delay = OFFLINE_POLL_INTERVAL_MS;
        }
      }
      if (!stopped) timer = setTimeout(poll, delay);
    };
    void poll();
    const heartbeat = setInterval(() => {
      void action({ type: 'heartbeat' }, true);
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
    };
  }, [session, request, action]);

  useEffect(
    () => () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
    },
    [],
  );

  const enterRoom = useCallback(
    async (details: EntryRequest) => {
      const started = Date.now();
      const data = await request<EntryResponse>(details);
      connectionGeneration.current++;
      roomRef.current = null;
      bestRoundTrip.current = Infinity;
      acceptSnapshot(data.room, started);
      sessionRef.current = data.session;
      setSession(data.session);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
      history.replaceState({}, '', `?room=${data.session.code}`);
      onConnected();
    },
    [request, acceptSnapshot, onConnected],
  );

  const leave = useCallback(async () => {
    if (!(await action({ type: 'leave' }))) return false;
    connectionGeneration.current++;
    sessionStorage.removeItem(SESSION_KEY);
    history.replaceState({}, '', '/');
    sessionRef.current = null;
    roomRef.current = null;
    setSession(null);
    setRoom(null);
    return true;
  }, [action]);

  return {
    room,
    session,
    online,
    roundTripMs,
    clockOffset,
    error,
    setError,
    action,
    enterRoom,
    leave,
  };
}

function isSession(value: unknown): value is Session {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'token' in value &&
    typeof value.token === 'string'
  );
}
