export function initialLetter(name: string): string {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...graphemes.segment(name)][0]?.segment.toUpperCase() || '✦';
}

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Connection interrupted.';
}
