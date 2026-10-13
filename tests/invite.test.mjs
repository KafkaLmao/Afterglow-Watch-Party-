import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoomInvite, roomInviteUrl } from '../lib/room-invite.mjs';

test('invite links and typed codes resolve to the same room', () => {
  for (const input of [
    'ABCD2345',
    ' abcd 2345 ',
    'https://afterglowparty.vercel.app/?room=abcd2345',
    'http://localhost:5173/?room=ABCD2345&ref=friend#join',
  ])
    assert.equal(parseRoomInvite(input), 'ABCD2345');
});

test('invalid invitations cannot become a room request', () => {
  for (const input of [
    undefined,
    '',
    'undefined',
    'ABCD1234',
    'ABCD23456',
    'https://afterglowparty.vercel.app/',
    'https://[invalid/?room=ABCD2345',
    'javascript:alert(1)',
    'https://example.com/?room=ABCD2345/extra',
  ]) {
    assert.equal(parseRoomInvite(input), null);
  }
});

test('generated invites contain the normalized code and no session credentials', () => {
  assert.equal(
    roomInviteUrl('https://afterglowparty.vercel.app', 'abcd2345'),
    'https://afterglowparty.vercel.app/?room=ABCD2345',
  );
  assert.throws(() =>
    roomInviteUrl('https://afterglowparty.vercel.app', undefined),
  );
});
