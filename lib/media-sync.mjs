export function mediaSyncPlan(playback, sample, serverNow, embedded = false) {
  const elapsed = playback.playing
    ? Math.max(0, serverNow - playback.at) / 1000
    : 0;
  const target = Math.min(
    sample.duration > 0 ? sample.duration : 86400,
    Math.max(0, playback.position + elapsed),
  );
  const difference = sample.position - target;
  const finished = sample.duration > 0 && target >= sample.duration - 0.1;
  return {
    target,
    drift: Math.abs(difference) * 1000,
    seek: Math.abs(difference) > (embedded ? 1.5 : 0.25),
    play: playback.playing && sample.paused && !finished,
    pause: !playback.playing && !sample.paused,
    rate:
      !embedded && playback.playing && Math.abs(difference) > 0.06
        ? 1 + (difference > 0 ? -0.03 : 0.03)
        : 1,
  };
}
