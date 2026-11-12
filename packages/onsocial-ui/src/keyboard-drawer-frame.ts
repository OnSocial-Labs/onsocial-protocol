'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

const MOBILE_MAX_WIDTH_PX = 767;

/**
 * A phone suggestion bar, or the caret chase, moves the viewport by less
 * than a real keyboard. Following those ticks shakes a pinned Done control.
 */
const KEYBOARD_LIFT_SLOP_PX = 64;

export interface KeyboardDrawerMetrics {
  /** Pixels of the layout viewport covered below the visual viewport. */
  lift: number;
  /** Visible viewport height in CSS pixels. */
  height: number;
  isMobile: boolean;
}

const IDLE: KeyboardDrawerMetrics = { lift: 0, height: 0, isMobile: false };

/**
 * Keep the last settled frame while the keyboard is up and the viewport
 * only jitters. Opening and closing still apply on the first real change.
 */
export function settleKeyboardDrawerMetrics(
  current: KeyboardDrawerMetrics,
  next: KeyboardDrawerMetrics
): KeyboardDrawerMetrics {
  if (
    current.lift === next.lift &&
    current.height === next.height &&
    current.isMobile === next.isMobile
  ) {
    return current;
  }
  const keyboardHeld =
    current.isMobile && next.isMobile && current.lift > 0 && next.lift > 0;
  if (
    keyboardHeld &&
    Math.abs(current.lift - next.lift) < KEYBOARD_LIFT_SLOP_PX &&
    Math.abs(current.height - next.height) < KEYBOARD_LIFT_SLOP_PX
  ) {
    return current;
  }
  return next;
}

function readKeyboardDrawerMetrics(): KeyboardDrawerMetrics {
  if (typeof window === 'undefined') return IDLE;
  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`
  ).matches;
  const viewport = window.visualViewport;
  if (!isMobile || !viewport) {
    return { lift: 0, height: isMobile ? window.innerHeight : 0, isMobile };
  }
  const lift = Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  );
  return { lift, height: Math.round(viewport.height), isMobile: true };
}

/**
 * How far a sheet's box still hangs below the visible viewport.
 * A `100dvh` phone card shrinks with the keyboard, so the sheet is already
 * on the keys and the seat is 0. A card that stays full height still runs
 * under the keys, and the seat is that overlap. Never more than `lift`.
 */
export function keyboardSeatPx(input: {
  lift: number;
  /** Null until the sheet root is in the document. */
  rootBottom: number | null;
  rootHeight: number;
  /** Visible bottom, in the same coordinates as `rootBottom`. */
  visualBottom: number;
}): number {
  if (input.lift <= 0) return 0;
  if (input.rootBottom == null || input.rootHeight < 1) return input.lift;
  const gap = Math.round(input.rootBottom - input.visualBottom);
  return Math.max(0, Math.min(input.lift, gap));
}

/**
 * One drawer frame for every phone keyboard.
 * The bottom sits on the keys. The top may rest lower when the drawer is
 * short, and stops at the screen edge when it is tall. It does not climb
 * past that edge. `seatPx` is the measured overlap; omit it to use `lift`.
 */
export function keyboardDrawerFrameStyle(
  metrics: KeyboardDrawerMetrics,
  maxHeightPx = 736,
  seatPx?: number
): CSSProperties | undefined {
  if (!metrics.isMobile || metrics.height <= 0 || metrics.lift <= 0) {
    return undefined;
  }
  const cap = Math.min(metrics.height, maxHeightPx);
  const seat =
    seatPx == null
      ? metrics.lift
      : Math.max(0, Math.min(metrics.lift, Math.round(seatPx)));
  return {
    maxHeight: `${cap}px`,
    marginBottom: keyboardSheetMargin(seat),
  };
}

/**
 * Page sheets stay full bleed. Only the action's lift variable changes,
 * and only by the overlap that is still under the keys.
 */
export function pageKeyboardLiftStyle(
  metrics: KeyboardDrawerMetrics,
  seatPx: number
): CSSProperties | undefined {
  if (!metrics.isMobile || metrics.lift <= 0) return undefined;
  const seat = Math.max(0, Math.min(metrics.lift, Math.round(seatPx)));
  return {
    ['--os-keyboard-lift' as string]: `${seat}px`,
  };
}

/**
 * Raw keyboard overlap, in pixels. The sheet root drops its home-indicator
 * padding while this is set (`.glass-sheet-panel.is-keyboard-open`), so the
 * drawer bottom lands on the keys. Layout-pinned bars use the same overlap
 * as `--os-keyboard-lift`.
 */
export function keyboardSheetMargin(liftPx: number): string {
  return `${liftPx}px`;
}

/**
 * Seat that puts the drawer panel on the keys.
 * `appliedSeat` is the margin already on the panel. The error is how far
 * that panel still misses the visible bottom, in the same coordinates.
 * A card that already ended on the keys stays at 0. A double lift shrinks
 * back to the keys instead of keeping the full overlap.
 */
export function correctedKeyboardSeat(input: {
  lift: number;
  appliedSeat: number;
  panelBottom: number | null;
  visibleBottom: number;
  fallbackSeat: number;
}): number {
  if (input.lift <= 0) return 0;
  if (input.panelBottom == null) {
    return Math.max(0, Math.min(input.lift, Math.round(input.fallbackSeat)));
  }
  const error = Math.round(input.panelBottom - input.visibleBottom);
  if (Math.abs(error) < 2) {
    return Math.max(0, Math.min(input.lift, Math.round(input.appliedSeat)));
  }
  return Math.max(
    0,
    Math.min(input.lift, Math.round(input.appliedSeat + error))
  );
}

export type KeyboardDrawerFrameMode = 'drawer' | 'page';

/** Tracks the keyboard while `active` (the sheet is open). */
export function useKeyboardDrawerFrame(
  active: boolean,
  rootRef?: { readonly current: HTMLElement | null },
  mode: KeyboardDrawerFrameMode = 'drawer'
): {
  style: CSSProperties | undefined;
  keyboardOpen: boolean;
} {
  const frameRef = useRef({ metrics: IDLE, seat: 0 });
  const [frame, setFrame] = useState(frameRef.current);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const sync = () => {
      const raw = readKeyboardDrawerMetrics();
      const settled = settleKeyboardDrawerMetrics(
        frameRef.current.metrics,
        raw
      );
      const root = rootRef?.current ?? null;
      const viewport = window.visualViewport;
      const rect = root?.getBoundingClientRect();
      const visibleBottom = viewport ? viewport.offsetTop + viewport.height : 0;
      const rootSeat = keyboardSeatPx({
        lift: settled.lift,
        rootBottom: rect ? rect.bottom : null,
        rootHeight: rect ? rect.height : 0,
        visualBottom: visibleBottom,
      });
      // Pages stay full height, so the root overlap is the footer lift.
      // Drawers move with margin: correct from the panel's real bottom so a
      // second lift (card already on the keys, or the browser scrolling the
      // visual viewport) does not leave Done floating.
      const panel =
        mode === 'drawer'
          ? (root?.querySelector<HTMLElement>(':scope > .glass-sheet-panel') ??
            null)
          : null;
      const nextSeat =
        mode === 'drawer'
          ? correctedKeyboardSeat({
              lift: settled.lift,
              appliedSeat: frameRef.current.seat,
              panelBottom: panel ? panel.getBoundingClientRect().bottom : null,
              visibleBottom,
              fallbackSeat: rootSeat,
            })
          : rootSeat;
      if (
        settled === frameRef.current.metrics &&
        nextSeat === frameRef.current.seat
      ) {
        return;
      }
      const next = { metrics: settled, seat: nextSeat };
      frameRef.current = next;
      setFrame(next);
    };
    const viewport = window.visualViewport;
    // Resize is the keyboard. Scroll is the browser sliding the visual
    // viewport to chase the caret — the panel has to follow or Done floats.
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active, frame.seat, mode, rootRef]);

  const live = active ? frame.metrics : IDLE;
  const liveSeat = active ? frame.seat : 0;
  const style = useMemo(
    () =>
      mode === 'page'
        ? pageKeyboardLiftStyle(live, liveSeat)
        : keyboardDrawerFrameStyle(live, 736, liveSeat),
    [live, liveSeat, mode]
  );
  return {
    style,
    keyboardOpen: live.isMobile && live.lift > 0,
  };
}
