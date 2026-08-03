'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/**
 * Auto-dismiss countdown that pauses while the pointer is over the toast
 * (hover on desktop, press-and-hold on touch) and while focus is inside.
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
  pauseProps: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
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
  const [paused, setPaused] = useState(false);
  const hoverPause = useRef(false);
  const touchPause = useRef(false);
  const focusPause = useRef(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const syncPaused = useCallback(() => {
    setPaused(hoverPause.current || touchPause.current || focusPause.current);
  }, []);

  const paint = useCallback((ratio: number) => {
    const node = barRef.current;
    if (node) node.style.transform = `scaleX(${ratio})`;
  }, []);

  useEffect(() => {
    if (!active || durationMs <= 0) {
      remainingRef.current = 0;
      totalRef.current = 0;
      paint(0);
    } else {
      remainingRef.current = durationMs;
      totalRef.current = durationMs;
      paint(1);
    }
    hoverPause.current = false;
    touchPause.current = false;
    focusPause.current = false;
    // Reset pause UI when the toast session changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session reset, not derived sync
    setPaused(false);
  }, [active, durationMs, paint]);

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

  const pauseProps = {
    onPointerEnter: () => {
      hoverPause.current = true;
      syncPaused();
    },
    onPointerLeave: () => {
      hoverPause.current = false;
      touchPause.current = false;
      syncPaused();
    },
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
  };

  return { paused, barRef, pauseProps };
}
