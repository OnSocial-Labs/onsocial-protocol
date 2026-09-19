import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

/** Peek — comments + write dock, film still readable. */
export const FEED_THREAD_PEEK = 0.58;
/** Expanded — more thread, film is a top band. */
export const FEED_THREAD_EXPANDED = 0.78;
/**
 * Near-full — YouTube/IG comments. Film stays a mini strip + close.
 * Never 1: the grabber has to pull back down.
 */
export const FEED_THREAD_FULL = 0.9;
/** Drag below this (or a downward flick) dismisses. */
export const FEED_THREAD_DISMISS = 0.38;
const FEED_THREAD_MIN = 0.2;
const FEED_THREAD_MAX = 0.92;
const DRAG_ACTIVATION_PX = 4;
const FLICK_PX_PER_MS = 0.55;

export function clampThreadBand(value: number): number {
  return Math.min(FEED_THREAD_MAX, Math.max(FEED_THREAD_MIN, value));
}

export function snapThreadBand(
  band: number,
  velocity: number
): 'dismiss' | number {
  /* velocity > 0 = finger down = closing */
  if (velocity > FLICK_PX_PER_MS || band < FEED_THREAD_DISMISS) {
    return 'dismiss';
  }
  if (velocity < -FLICK_PX_PER_MS) {
    return band >= FEED_THREAD_EXPANDED ? FEED_THREAD_FULL : FEED_THREAD_EXPANDED;
  }
  const peekMid = (FEED_THREAD_PEEK + FEED_THREAD_EXPANDED) / 2;
  const fullMid = (FEED_THREAD_EXPANDED + FEED_THREAD_FULL) / 2;
  if (band >= fullMid) return FEED_THREAD_FULL;
  if (band >= peekMid) return FEED_THREAD_EXPANDED;
  return FEED_THREAD_PEEK;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useFeedThreadBand(open: boolean, onDismiss: () => void) {
  const [band, setBand] = useState(0);
  const [dragging, setDragging] = useState(false);
  const bandRef = useRef(band);
  bandRef.current = band;
  const dragRef = useRef<{
    startY: number;
    startBand: number;
    lastY: number;
    lastT: number;
    velocity: number;
    faceH: number;
    active: boolean;
  } | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) {
      setBand(0);
      setDragging(false);
      return;
    }
    if (prefersReducedMotion()) {
      setBand(FEED_THREAD_PEEK);
      return;
    }
    setBand(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setBand(FEED_THREAD_PEEK));
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const face = event.currentTarget.closest('.os-media-face-body');
    const faceH = face instanceof HTMLElement ? face.clientHeight : 0;
    if (faceH <= 0) return;
    dragRef.current = {
      startY: event.clientY,
      startBand: bandRef.current,
      lastY: event.clientY,
      lastT: event.timeStamp,
      velocity: 0,
      faceH,
      active: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const state = dragRef.current;
    if (!state) return;
    const deltaY = event.clientY - state.startY;
    if (!state.active && Math.abs(deltaY) < DRAG_ACTIVATION_PX) return;
    if (!state.active) {
      state.active = true;
      setDragging(true);
    }
    const dt = event.timeStamp - state.lastT;
    if (dt > 0) {
      state.velocity = (event.clientY - state.lastY) / dt;
    }
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    /* Finger up grows the drawer; finger down grows the film. */
    setBand(clampThreadBand(state.startBand - deltaY / state.faceH));
  }, []);

  const finishDrag = useCallback(() => {
    const state = dragRef.current;
    dragRef.current = null;
    if (!state) return;
    setDragging(false);
    if (!state.active) return;
    const next = snapThreadBand(bandRef.current, state.velocity);
    if (next === 'dismiss') {
      dismissRef.current();
      return;
    }
    setBand(next);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setBand((prev) => clampThreadBand(prev + 0.08));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setBand((prev) => {
        const next = clampThreadBand(prev - 0.08);
        if (next <= FEED_THREAD_DISMISS) {
          dismissRef.current();
          return prev;
        }
        return next;
      });
    }
  }, []);

  return {
    band,
    dragging,
    gripHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onKeyDown,
    },
  };
}
