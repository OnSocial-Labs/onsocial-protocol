'use client';

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Mount catch-up chrome on `.os-app-screen-column` (sibling of the scrolling
 * body), same containing block as the header frost layer. Feed children live
 * inside `<main>` — `position: fixed` there cannot sample backdrop under the
 * screen's `isolation: isolate`, so the pill reads as clear glass.
 */
export function HomeFeedCatchUpPortal({ children }: { children: ReactNode }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useLayoutEffect(() => {
    const column = markerRef.current?.closest('.os-app-screen-column') ?? null;
    setHost(column);
  }, []);

  return (
    <>
      <span ref={markerRef} hidden aria-hidden />
      {host ? createPortal(children, host) : null}
    </>
  );
}
