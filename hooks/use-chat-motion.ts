'use client';

import { useLayoutEffect, useRef } from 'react';

export function useChatMotion(roomCode: string) {
  const list = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panel = list.current;
    if (!panel) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const entrances = new Set<Animation>();
    let frame: number | null = null;
    let following = true;
    const atBottom = () =>
      panel.scrollHeight - panel.clientHeight - panel.scrollTop < 48;
    const cancelScroll = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const scrollToLatest = () => {
      cancelScroll();
      const from = panel.scrollTop;
      const target = Math.max(0, panel.scrollHeight - panel.clientHeight);
      if (reducedMotion.matches || Math.abs(target - from) < 1) {
        panel.scrollTop = target;
        return;
      }
      const started = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / 240);
        // Retarget from the current position when messages arrive in a burst.
        const eased = 1 - Math.pow(1 - progress, 3);
        panel.scrollTop = from + (target - from) * eased;
        frame = progress < 1 ? requestAnimationFrame(tick) : null;
      };
      frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      // Programmatic intermediate positions must not disable following.
      if (frame === null) following = atBottom();
    };
    const interrupt = () => {
      cancelScroll();
      following = atBottom();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' ',
        ].includes(event.key)
      ) {
        interrupt();
      }
    };
    const onMotionChange = () => {
      if (!reducedMotion.matches) return;
      cancelScroll();
      entrances.forEach((animation) => animation.cancel());
      entrances.clear();
      if (following) panel.scrollTop = panel.scrollHeight;
    };

    // Restored history is positioned immediately, without replaying entrances.
    panel.scrollTop = panel.scrollHeight;
    const observer = new MutationObserver((changes) => {
      const added = changes
        .flatMap((change) => Array.from(change.addedNodes))
        .filter(
          (node): node is HTMLElement =>
            node instanceof HTMLElement &&
            node.classList.contains('chat-message'),
        );
      if (!added.length) return;
      if (following) {
        if (!reducedMotion.matches) {
          // A reconnect can append many messages; only animate the newest few.
          added.slice(-4).forEach((node) => {
            const animation = node.animate(
              [
                { opacity: 0, transform: 'translateY(8px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
              { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
            );
            entrances.add(animation);
            animation.onfinish = () => entrances.delete(animation);
          });
        }
        scrollToLatest();
      }
    });
    // Observe actual additions, including after the history reaches its cap.
    observer.observe(panel, { childList: true });
    panel.addEventListener('scroll', onScroll, { passive: true });
    panel.addEventListener('wheel', interrupt, { passive: true });
    panel.addEventListener('touchstart', interrupt, { passive: true });
    panel.addEventListener('pointerdown', interrupt, { passive: true });
    panel.addEventListener('keydown', onKeyDown);
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect();
      cancelScroll();
      entrances.forEach((animation) => animation.cancel());
      panel.removeEventListener('scroll', onScroll);
      panel.removeEventListener('wheel', interrupt);
      panel.removeEventListener('touchstart', interrupt);
      panel.removeEventListener('pointerdown', interrupt);
      panel.removeEventListener('keydown', onKeyDown);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, [roomCode]);

  return list;
}
