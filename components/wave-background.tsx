'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Pause, Play } from 'lucide-react';
import type { WavesEffect } from 'vanta/dist/vanta.waves.min.js';

const waveColor = (dark: boolean) => (dark ? 0x123c64 : 0x729fd0);

export function WaveBackground() {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<WavesEffect | null>(null);
  const [paused, setPaused] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;
    let generation = 0;

    const release = () => {
      const effect = instance.current;
      instance.current = null;
      const renderer = effect?.renderer;
      try {
        effect?.destroy();
      } catch (error) {
        console.warn('Could not fully tear down the wave background.', error);
      } finally {
        // Vanta 0.5.24 removes the canvas but does not dispose its renderer.
        renderer?.dispose();
        renderer?.forceContextLoss();
        element.replaceChildren();
      }
    };

    const sync = async () => {
      const ticket = ++generation;
      release();
      if (disposed || paused || preference.matches) return;
      try {
        const [THREE, { default: waves }] = await Promise.all([
          import('three'),
          import('vanta/dist/vanta.waves.min.js'),
        ]);
        if (disposed || ticket !== generation) return;
        instance.current = waves({
          el: element,
          THREE,
          color: waveColor(document.documentElement.dataset.theme === 'dark'),
          shininess: 22,
          waveHeight: 10,
          waveSpeed: 0.45,
          zoom: 0.9,
          mouseControls: false,
          touchControls: false,
          gyroControls: false,
          minHeight: 1,
          minWidth: 1,
          scale: 2,
          scaleMobile: 3,
        });
        // A failed Vanta initialization can return instead of throwing.
        if (!element.querySelector('canvas')) release();
      } catch (error) {
        if (disposed || ticket !== generation) return;
        release();
        console.warn(
          'Wave background unavailable; using the static gradient.',
          error,
        );
      }
    };

    const observer = new ResizeObserver(() => instance.current?.resize());
    observer.observe(element);
    preference.addEventListener('change', sync);
    void sync();
    return () => {
      disposed = true;
      ++generation;
      preference.removeEventListener('change', sync);
      observer.disconnect();
      release();
    };
  }, [paused]);

  useEffect(() => {
    instance.current?.setOptions({
      color: waveColor(resolvedTheme === 'dark'),
    });
  }, [resolvedTheme]);

  return (
    <>
      <div className="wave-background" aria-hidden="true">
        <div className="wave-canvas" ref={host} />
      </div>
      <button
        type="button"
        className="wave-toggle"
        aria-label={paused ? 'Play background waves' : 'Pause background waves'}
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
        {paused ? 'Play waves' : 'Pause waves'}
      </button>
    </>
  );
}
