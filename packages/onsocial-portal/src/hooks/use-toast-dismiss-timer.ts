'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/** Re-check hover after entrance motion settles under a stationary cursor. */
const HOVER_REVALIDATE_MS = 220;

/**
 * Auto-dismiss countdown that pauses while the pointer is over the toast
 * (hover on desktop, press-and-hold on touch), while focus is inside, and
 * while the document is hidden (e.g. Nearblocks opened in another tab).
 * Drives the dismiss hairline via `barRef` (scaleX 1 → 0) without per-frame React renders.
 */
export function useToastDismissTimer({
  active,
  durationMs,
  onDone,
}: {
  active: boolean;
  durationMs: number;
  onDone: () => void;
}): {
  paused: boolean;
  barRef: RefObject<HTMLDivElement | null>;
  /** Attach to the toast host that receives `pauseProps`. */
  hostRef: RefObject<HTMLDivElement | null>;
  pauseProps: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onPointerDown: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onPointerCancel: () => void;
    onFocusCapture: () => void;
    onBlurCapture: (event: FocusEvent) => void;
  };
} {
  const onDoneRef = useRef(onDone);
  const remainingRef = useRef(durationMs);
  const totalRef = useRef(durationMs);
  const barRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const hoverPause = useRef(false);
  const touchPause = useRef(false);
  const focusPause = useRef(false);
  const hiddenPause = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const syncPaused = useCallback(() => {
    setPaused(
      hoverPause.current ||
        touchPause.current ||
        focusPause.current ||
        hiddenPause.current
    );
  }, []);

  const paint = useCallback((ratio: number) => {
    const node = barRef.current;
    if (node) node.style.transform = `scaleX(${ratio})`;
  }, []);

  const applyHoverFromDom = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // Prefer :hover — true when the pointer sits on the toast even if
    // pointerenter never fired (toast slid in under a stationary cursor).
    const hovering = host.matches(':hover');
    hoverPause.current = hovering;
    if (!hovering) touchPause.current = false;
    const stillFocused = Boolean(
      document.activeElement instanceof Node &&
        host.contains(document.activeElement)
    );
    focusPause.current = stillFocused;
    hiddenPause.current = document.hidden;
    syncPaused();
  }, [syncPaused]);

  useEffect(() => {
    if (!active || durationMs <= 0) {
      remainingRef.current = 0;
      totalRef.current = 0;
      paint(0);
      hoverPause.current = false;
      touchPause.current = false;
      focusPause.current = false;
      hiddenPause.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session reset
      syncPaused();
      return;
    }

    remainingRef.current = durationMs;
    totalRef.current = durationMs;
    paint(1);

    applyHoverFromDom();
    const host = hostRef.current;
    const onAnimationEnd = () => applyHoverFromDom();
    host?.addEventListener('animationend', onAnimationEnd);
    const timer = window.setTimeout(applyHoverFromDom, HOVER_REVALIDATE_MS);

    const onVisibility = () => {
      if (document.hidden) {
        hiddenPause.current = true;
        syncPaused();
        return;
      }
      // Nearblocks (and other _blank links) leave focus on the toast control.
      // That kept dismiss frozen until a click — clear it when the tab returns.
      hiddenPause.current = false;
      const host = hostRef.current;
      const active = document.activeElement;
      if (host && active instanceof HTMLElement && host.contains(active)) {
        active.blur();
      }
      focusPause.current = false;
      applyHoverFromDom();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      host?.removeEventListener('animationend', onAnimationEnd);
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, durationMs, paint, syncPaused, applyHoverFromDom]);

  useEffect(() => {
    if (!active || durationMs <= 0 || paused) return;

    let frame = 0;
    const startedAt = performance.now();
    const remainingAtStart = remainingRef.current;

    const tick = (now: number) => {
      const left = Math.max(0, remainingAtStart - (now - startedAt));
      remainingRef.current = left;
      const total = totalRef.current;
      paint(total > 0 ? left / total : 0);
      if (left <= 0) {
        onDoneRef.current();
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active, durationMs, paused, paint]);

  const pauseHover = useCallback(() => {
    hoverPause.current = true;
    syncPaused();
  }, [syncPaused]);

  const resumeHover = useCallback(() => {
    hoverPause.current = false;
    touchPause.current = false;
    syncPaused();
  }, [syncPaused]);

  const pauseProps = useMemo(
    () => ({
      onPointerEnter: pauseHover,
      onPointerLeave: resumeHover,
      onMouseEnter: pauseHover,
      onMouseLeave: resumeHover,
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          touchPause.current = true;
          syncPaused();
        }
      },
      onPointerUp: (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          touchPause.current = false;
          syncPaused();
        }
      },
      onPointerCancel: () => {
        touchPause.current = false;
        syncPaused();
      },
      onFocusCapture: () => {
        focusPause.current = true;
        syncPaused();
      },
      onBlurCapture: (event: FocusEvent) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        focusPause.current = false;
        syncPaused();
      },
    }),
    [pauseHover, resumeHover, syncPaused]
  );

  return { paused, barRef, hostRef, pauseProps };
}
