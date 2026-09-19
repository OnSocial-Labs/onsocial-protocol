'use client';

import { useCallback, useRef, type RefObject } from 'react';

/**
 * Measured-height reveal (Radix Accordion / framer-motion technique).
 *
 * Writes two px custom properties on the host so CSS can animate `height`
 * between exact values — the ease maps 1:1 to visible motion (no 0fr
 * dead-zone). Pair with `os-reveal.css`:
 *
 *   .os-reveal        → host (gets --os-reveal-closed / --os-reveal-open)
 *   .os-reveal-clip   → animating box (height: var closed → open)
 *   .os-reveal-inner  → measured content
 *
 * `measure()` reads the inner content and sets both vars. Call it before
 * toggling open, and again whenever content / viewport can change.
 */
export type OsRevealMeasureOptions = {
  /** Closed height in px. When omitted, uses `closedLines × line-height`. */
  closedPx?: number;
  /** Closed height as a number of text lines (default 2). */
  closedLines?: number;
  /** Max open height in px — taller content scrolls (set on inner). */
  maxOpenPx?: number;
};

export function useOsReveal<T extends HTMLElement>() {
  const hostRef = useRef<T>(null);
  const clipRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLElement>(null);

  const measure = useCallback((options: OsRevealMeasureOptions = {}) => {
    const host = hostRef.current;
    const clip = clipRef.current;
    const inner = innerRef.current;
    if (!host || !clip || !inner) return;

    const { closedPx, closedLines = 2, maxOpenPx } = options;

    let closed = closedPx;
    if (closed == null) {
      const cs = getComputedStyle(clip);
      let lineHeight = parseFloat(cs.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        lineHeight = parseFloat(cs.fontSize) * 1.5;
      }
      closed = Math.ceil(lineHeight * closedLines);
    }

    const full = Math.ceil(inner.scrollHeight);
    const open =
      maxOpenPx != null ? Math.max(closed, Math.min(full, maxOpenPx)) : full;

    host.style.setProperty('--os-reveal-closed', `${closed}px`);
    host.style.setProperty('--os-reveal-open', `${open}px`);
  }, []);

  return { hostRef, clipRef, innerRef, measure } as const;
}

export type OsRevealRefs<T extends HTMLElement> = {
  hostRef: RefObject<T | null>;
  clipRef: RefObject<HTMLElement | null>;
  innerRef: RefObject<HTMLElement | null>;
  measure: (options?: OsRevealMeasureOptions) => void;
};
