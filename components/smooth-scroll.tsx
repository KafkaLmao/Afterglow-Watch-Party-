'use client';

import { useEffect, type ReactNode } from 'react';
import { ReactLenis, useLenis } from 'lenis/react';
import type { LenisOptions } from 'lenis';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

const options: LenisOptions = {
  autoRaf: false,
  lerp: 0.1,
  smoothWheel: true,
  syncTouch: false,
  respectReducedMotion: true,
  anchors: { offset: -110 },
  stopInertiaOnNavigate: true,
};

function ScrollClock() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;
    gsap.registerPlugin(ScrollTrigger);
    const unsubscribe = lenis.on('scroll', ScrollTrigger.update);
    const tick = (seconds: number) => lenis.raf(seconds * 1000);
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      unsubscribe();
    };
  }, [lenis]);

  return null;
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={options}>
      <ScrollClock />
      {children}
    </ReactLenis>
  );
}
