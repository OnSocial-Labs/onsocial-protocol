'use client';

import {
  useCallback,
  useLayoutEffect,
  type ReactNode,
  type RefObject,
} from 'react';
import { useOsReveal } from '@onsocial/ui';

/**
 * One body, peeked then opened with the shared post fold (`useOsReveal`).
 * Short copy stays at its own height. Longer copy clips to `closedLines`
 * until `open`, and the lines already on screen do not reflow.
 */
export function OsTextFold({
  open,
  closedLines,
  onOverflow,
  children,
}: {
  open: boolean;
  closedLines: number;
  onOverflow?: (overflows: boolean) => void;
  children: ReactNode;
}) {
  const {
    hostRef,
    clipRef: clipElementRef,
    innerRef: innerElementRef,
    measure,
  } = useOsReveal<HTMLDivElement>();
  const clipRef = clipElementRef as RefObject<HTMLDivElement | null>;
  const innerRef = innerElementRef as RefObject<HTMLDivElement | null>;

  const sync = useCallback(() => {
    const host = hostRef.current;
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!host || !clip || !inner) return;

    const text =
      inner.firstElementChild instanceof HTMLElement
        ? inner.firstElementChild
        : inner;
    const style = getComputedStyle(text);
    let lineHeight = Number.parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      lineHeight = Number.parseFloat(style.fontSize) * 1.5;
    }
    const peekPx = Math.ceil(lineHeight * closedLines);
    measure({ closedPx: peekPx });
    const overflows = inner.scrollHeight > peekPx + 1;
    if (!overflows) {
      host.style.setProperty('--os-reveal-closed', 'auto');
      host.style.setProperty('--os-reveal-open', 'auto');
    }
    onOverflow?.(overflows);
  }, [clipRef, closedLines, hostRef, innerRef, measure, onOverflow]);

  useLayoutEffect(() => {
    sync();
    const inner = innerRef.current;
    if (!inner) return;
    const observer = new ResizeObserver(() => sync());
    observer.observe(inner);
    return () => observer.disconnect();
  }, [innerRef, sync]);

  return (
    <div ref={hostRef} className={`os-reveal${open ? ' is-open' : ''}`}>
      <div ref={clipRef} className="os-reveal-clip">
        <div ref={innerRef} className="os-reveal-inner">
          {children}
        </div>
      </div>
    </div>
  );
}
