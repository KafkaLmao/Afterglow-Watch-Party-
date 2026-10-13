'use client';
import { useState } from 'react';
import { useChatMotion } from '../hooks/use-chat-motion';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  MessageCircle,
  BarChart3,
} from 'lucide-react';
import { initialLetter } from '../lib/display';
import type {
  RoomSnapshot,
  Session,
  SendAction,
  Modal,
} from '../lib/room-types';
interface SocialPanelProps {
  room: RoomSnapshot;
  session: Session;
  online: boolean;
  isHost: boolean;
  action: SendAction;
  setModal: (modal: Modal) => void;
}
export function SocialPanel({
  room,
  session,
  online,
  isHost,
  action,
  setModal,
}: SocialPanelProps) {
  const poll = room.poll;
  const [message, setMessage] = useState('');
  const chatList = useChatMotion(room.code);
  return (
    <aside className="social-panel">
      <div className="panel-heading">
        <h3>
          <MessageCircle size={17} /> The side conversation
        </h3>
        <span className="online-dot" />
      </div>
      <div
        className="chat-list"
        ref={chatList}
        role="log"
        aria-label="Room messages"
        aria-relevant="additions"
        tabIndex={0}
        data-lenis-prevent
      >
        {room.messages.length ? (
          room.messages.map((m) => (
            <div
              className={`chat-message ${m.member === session.id ? 'own' : ''}`}
              key={m.id}
            >
              <span className="chat-initial">{initialLetter(m.name)}</span>
              <div>
                <strong>
                  {m.name}
                  <small>
                    {new Date(m.at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </small>
                </strong>
                <p>{m.text}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="chat-welcome">
            <span>🍿</span>
            <h3>
              The best part?
              <br />
              The running commentary.
            </h3>
            <p>
              Say hello. Share a theory.
              <br />
              Try to keep the spoilers to yourself.
            </p>
          </div>
        )}
      </div>
      <form
        className="chat-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await action({ type: 'chat', text: message })) setMessage('');
        }}
      >
        <input
          aria-label="Chat message"
          maxLength={500}
          placeholder="Say something…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button disabled={!message.trim() || !online} aria-label="Send message">
          <ArrowUpRight size={20} />
        </button>
      </form>
      <div className="poll-panel">
        <div className="panel-heading">
          <h3>
            <BarChart3 size={16} /> The group decides
          </h3>
          {isHost && (
            <button aria-label="Create poll" onClick={() => setModal('poll')}>
              <Plus size={18} />
            </button>
          )}
        </div>
        {poll ? (
          <>
            <strong>{poll.question}</strong>
            <div className="poll-options">
              {poll.options.map((o: string, i: number) => {
                const n = Object.values(poll.votes).filter(
                    (x) => x === i,
                  ).length,
                  total = Object.keys(poll.votes).length;
                return (
                  <button
                    key={i}
                    disabled={poll.closed}
                    className={poll.votes[session.id] === i ? 'voted' : ''}
                    onClick={() => action({ type: 'vote', option: i })}
                  >
                    <span
                      className="poll-fill"
                      style={{ width: `${total ? (n / total) * 100 : 0}%` }}
                    />
                    <span>{o}</span>
                    <b>
                      {n}
                      {poll.votes[session.id] === i ? ' ✓' : ''}
                    </b>
                  </button>
                );
              })}
            </div>
            <small>
              {Object.keys(poll.votes).length} votes ·{' '}
              {poll.closed ? 'Voting closed' : 'One person, one vote'}
            </small>
            {isHost && !poll.closed && (
              <button
                className="text-button"
                onClick={() => action({ type: 'closePoll' })}
              >
                Close voting
              </button>
            )}
          </>
        ) : (
          <div className="poll-empty">
            <p>
              Can’t agree on the next film?
              <br />
              Let your people pick.
            </p>
            {isHost && (
              <button className="text-button" onClick={() => setModal('poll')}>
                Start a quick poll <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="room-reminder">
        <span>✦</span> Somewhere, someone’s smiling
        <br />
        at the same scene as you.
      </div>
    </aside>
  );
}
