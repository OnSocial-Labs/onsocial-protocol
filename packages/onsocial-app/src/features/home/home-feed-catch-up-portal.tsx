'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Mount catch-up chrome on `.os-app-screen-column` (sibling of the scrolling
 * body), same containing block as the header frost layer. Feed children live
 * inside `<main>` — a fixed chip there cannot sample backdrop under the
 * screen's `isolation: isolate`, so the pill reads as clear glass.
 */
export function HomeFeedCatchUpPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);

  const markerRef = useCallback((node: HTMLSpanElement | null) => {
    setHost(node?.closest('.os-app-screen-column') ?? null);
  }, []);

  return (
    <>
      <span ref={markerRef} hidden aria-hidden />
      {host ? createPortal(children, host) : null}
    </>
  );
}
