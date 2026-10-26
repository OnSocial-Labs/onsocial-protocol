import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

/** Peek — comments + write dock, film still readable. */
export const FEED_THREAD_PEEK = 0.58;
/** Pull this far below peek and the jacket is fully back. */
export const FEED_THREAD_JACKET_SPAN = 0.18;

export function threadJacketT(open: boolean, band: number): number {
  if (!open || band < 0.05 || band >= FEED_THREAD_PEEK) return 0;
  return Math.min(1, (FEED_THREAD_PEEK - band) / FEED_THREAD_JACKET_SPAN);
}
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
    return band >= FEED_THREAD_EXPANDED
      ? FEED_THREAD_FULL
      : FEED_THREAD_EXPANDED;
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
  const dragRef = useRef<{
    startY: number;
    startBand: number;
    lastY: number;
    lastT: number;
    velocity: number;
    faceH: number;
    active: boolean;
  } | null>(null);
  /*
   * During a pointer drag the band is written straight to the DOM (no React
   * render per frame). `varHost` is the element React writes the band vars
   * to — the reader pane or the media-face body; `slideEl` carries the
   * jacket class for media-face consumers. Survives `dragRef` teardown so
   * the post-snap effect can stamp the committed state back on.
   */
  const hostRef = useRef<{
    varHost: HTMLElement;
    slideEl: HTMLElement | null;
    jacket: boolean;
  } | null>(null);
  const dismissRef = useRef(onDismiss);
  /*
   * Bumped on every snap so the stamp effect commits even when the snap
   * lands on the pre-drag value (setBand alone would bail out, stranding
   * the last imperative frame).
   */
  const [snapTick, setSnapTick] = useState(0);

  useLayoutEffect(() => {
    bandRef.current = band;
    const host = hostRef.current;
    if (!host) return;
    hostRef.current = null;
    host.varHost.style.setProperty(
      '--feed-thread-band',
      `${(band * 100).toFixed(1)}%`
    );
    if (host.jacket) {
      const t = threadJacketT(true, band);
      host.varHost.style.setProperty('--feed-jacket-t', t.toFixed(3));
      host.slideEl?.classList.toggle(
        'feed-photo-slide--thread-jacket',
        t > 0.4
      );
    }
  }, [band, snapTick]);

  useLayoutEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset band when drawer closes
      setBand(0);
      setDragging(false);
      return;
    }
    if (prefersReducedMotion()) {
      // Snap open without motion.
      setBand(FEED_THREAD_PEEK);
      return;
    }
    // Paint closed, then ease to peek.
    setBand(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setBand(FEED_THREAD_PEEK));
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const face =
      event.currentTarget.closest('.os-media-face-body') ??
      event.currentTarget.closest('.os-app-screen-column');
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
      const varHost =
        event.currentTarget.closest('.feed-face-thread-pane') ??
        event.currentTarget.closest('.os-media-face-body');
      if (varHost instanceof HTMLElement) {
        const slideEl = event.currentTarget.closest(
          '.feed-photo-slide--thread'
        );
        hostRef.current = {
          varHost,
          slideEl: slideEl instanceof HTMLElement ? slideEl : null,
          jacket: varHost.style.getPropertyValue('--feed-jacket-t') !== '',
        };
        /* Cut transitions this same frame — waiting on the React commit
         * would ease the first drag delta. React re-adds the class when
         * the `dragging` state lands and owns removal on release. */
        (hostRef.current.slideEl ?? varHost).classList.add(
          'is-thread-dragging'
        );
      }
      setDragging(true);
    }
    const dt = event.timeStamp - state.lastT;
    if (dt > 0) {
      state.velocity = (event.clientY - state.lastY) / dt;
    }
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    /* Finger up grows the drawer; finger down grows the film. */
    const next = clampThreadBand(state.startBand - deltaY / state.faceH);
    bandRef.current = next;
    const host = hostRef.current;
    if (host) {
      host.varHost.style.setProperty(
        '--feed-thread-band',
        `${(next * 100).toFixed(1)}%`
      );
      if (host.jacket) {
        const t = threadJacketT(true, next);
        host.varHost.style.setProperty('--feed-jacket-t', t.toFixed(3));
        host.slideEl?.classList.toggle(
          'feed-photo-slide--thread-jacket',
          t > 0.4
        );
      }
    } else {
      setBand(next);
    }
  }, []);

  const finishDrag = useCallback(() => {
    const state = dragRef.current;
    dragRef.current = null;
    if (!state) return;
    setDragging(false);
    if (!state.active) return;
    const next = snapThreadBand(bandRef.current, state.velocity);
    if (next === 'dismiss') {
      /* Unmount / style teardown clears the imperative writes with it. */
      hostRef.current = null;
      dismissRef.current();
      return;
    }
    /* The [band, snapTick] effect stamps the snapped value post-commit, so
     * the eased transition runs from the exact frame the finger left. */
    setBand(next);
    setSnapTick((tick) => tick + 1);
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
