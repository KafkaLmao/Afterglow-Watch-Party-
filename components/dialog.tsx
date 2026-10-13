'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLenis } from 'lenis/react';

interface DialogProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ label, onClose, children }: DialogProps) {
  const dialog = useRef<HTMLElement>(null);
  const lenis = useLenis();
  useEffect(() => {
    lenis?.stop();
    return () => lenis?.start();
  }, [lenis]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    if (!element) return;
    const controls = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]',
        ),
      );
    (
      controls().find((control) => control.tagName === 'INPUT') || controls()[0]
    )?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = controls();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose, label]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="modal"
        data-lenis-prevent
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="close-modal"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}
