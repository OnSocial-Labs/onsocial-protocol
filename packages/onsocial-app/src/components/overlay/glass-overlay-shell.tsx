'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useOverlayClose } from '@/hooks/use-overlay-close';
import { OverlayCloseButton } from '@/components/overlay/overlay-close-button';
import { OverlayHeader } from '@/components/overlay/overlay-header';

interface GlassOverlayShellProps {
  accountId: string;
  title: string;
  description?: string;
  children: ReactNode;
}

export function GlassOverlayShell({
  accountId,
  title,
  description,
  children,
}: GlassOverlayShellProps) {
  const close = useOverlayClose(accountId);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  return (
    <div className="overlay-root" role="presentation">
      <button
        type="button"
        className="overlay-backdrop"
        onClick={close}
        aria-label="Close panel"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
        className="overlay-panel animate-rise-in"
      >
        <OverlayHeader
          title={title}
          description={description}
          actions={
            <OverlayCloseButton onClick={close} ariaLabel={`Close ${title}`} />
          }
        />

        <div className="overlay-body">{children}</div>
      </div>
    </div>
  );
}
