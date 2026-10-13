'use client';

import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

export function useDiscoverMotion() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;

    gsap.registerPlugin(ScrollTrigger);
    const media = gsap.matchMedia(element);
    const revealed = new WeakSet<HTMLElement>();
    let disposed = false;
    let refreshFrame = 0;

    media.add(
      {
        desktop: '(min-width: 800px)',
        mobile: '(max-width: 799px)',
        reduced: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        if (context.conditions?.reduced) return;
        const desktop = context.conditions?.desktop;
        const reveals = new Map<HTMLElement, gsap.core.Tween>();

        function reveal(target: HTMLElement, delay = 0) {
          // Keep visited content stable across responsive/preference changes.
          if (
            revealed.has(target) ||
            target.getBoundingClientRect().bottom <= 0 ||
            target.contains(document.activeElement)
          )
            return;

          const tween = gsap.from(target, {
            y: desktop ? 24 : 12,
            opacity: 0.25,
            duration: desktop ? 0.65 : 0.45,
            delay,
            ease: 'power2.out',
            // Content remains visible until its entrance actually starts.
            immediateRender: false,
            clearProps: 'transform,opacity',
            onStart: () => {
              revealed.add(target);
            },
            scrollTrigger: {
              trigger: target,
              start: 'top 94%',
              once: true,
            },
          });
          reveals.set(target, tween);
        }

        element
          .querySelectorAll<HTMLElement>(
            '.hero-copy > *, .hero-link-preview, .room-strip, ' +
              '.bring-video-copy > *, .video-link-card, .how > .eyebrow, .how > h2',
          )
          .forEach((target) => reveal(target));

        element
          .querySelectorAll<HTMLElement>('.how article')
          .forEach((target, index) =>
            reveal(target, desktop ? index * 0.08 : 0),
          );

        // Only the decorative icon follows scroll; form controls stay still.
        if (desktop) {
          gsap.to('.preview-link-icon', {
            y: -18,
            rotation: -6,
            ease: 'none',
            scrollTrigger: {
              trigger: element.querySelector('.hero-link-preview'),
              start: 'top bottom',
              end: 'bottom top',
              scrub: 0.5,
            },
          });
        }

        const finishFocusedReveal = (event: FocusEvent) => {
          if (!(event.target instanceof Node)) return;
          for (const [target, tween] of reveals) {
            if (target.contains(event.target)) {
              revealed.add(target);
              tween.progress(1);
              tween.scrollTrigger?.kill(false, true);
            }
          }
        };
        element.addEventListener('focusin', finishFocusedReveal);
        return () =>
          element.removeEventListener('focusin', finishFocusedReveal);
      },
    );

    // Re-measure after font loading or form content changes, never per scroll.
    const refresh = () => {
      if (disposed) return;
      cancelAnimationFrame(refreshFrame);
      refreshFrame = requestAnimationFrame(() => ScrollTrigger.refresh());
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(element);
    void document.fonts.ready.then(refresh);

    return () => {
      disposed = true;
      observer.disconnect();
      cancelAnimationFrame(refreshFrame);
      media.revert();
    };
  }, []);

  return root;
}
