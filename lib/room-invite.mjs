/** Accept a room code or a shared HTTP(S) invite without navigating to it. */
export function parseRoomInvite(input) {
  let code = String(input || '').trim();
  if (/^https?:\/\//i.test(code)) {
    try {
      code = new URL(code).searchParams.get('room') || '';
    } catch {
      return null;
    }
  }
  code = code.replace(/\s/g, '').toUpperCase();
  return /^[A-Z2-9]{8}$/.test(code) ? code : null;
}

export function roomInviteUrl(origin, code) {
  const normalized = parseRoomInvite(code);
  if (!normalized)
    throw new Error('Create or join a room before inviting friends.');
  const url = new URL('/', origin);
  url.searchParams.set('room', normalized);
  return url.toString();
}
