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
      const nextSeat = keyboardSeatPx({
        lift: settled.lift,
        rootBottom: rect ? rect.bottom : null,
        rootHeight: rect ? rect.height : 0,
        visualBottom: viewport ? viewport.offsetTop + viewport.height : 0,
      });
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
    // Resize is the keyboard. Scroll is the browser chasing the caret, and
    // following it moves the drawer, which makes the caret chase again.
    viewport?.addEventListener('resize', sync);
    window.addEventListener('resize', sync);
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active, rootRef]);

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
