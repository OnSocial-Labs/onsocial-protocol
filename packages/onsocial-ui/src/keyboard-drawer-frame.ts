'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

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
 * One drawer frame for every phone keyboard.
 * The bottom sits on the keys. The top may rest lower when the drawer is
 * short, and stops at the screen edge when it is tall. It does not climb
 * past that edge.
 */
export function keyboardDrawerFrameStyle(
  metrics: KeyboardDrawerMetrics,
  maxHeightPx = 736
): CSSProperties | undefined {
  if (!metrics.isMobile || metrics.height <= 0 || metrics.lift <= 0) {
    return undefined;
  }
  const cap = Math.min(metrics.height, maxHeightPx);
  return {
    maxHeight: `${cap}px`,
    marginBottom: keyboardSheetMargin(metrics.lift),
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

/** Tracks the keyboard while `active` (the drawer is open). */
export function useKeyboardDrawerFrame(active: boolean): {
  style: CSSProperties | undefined;
  keyboardOpen: boolean;
} {
  const [metrics, setMetrics] = useState<KeyboardDrawerMetrics>(IDLE);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const sync = () => {
      setMetrics((current) =>
        settleKeyboardDrawerMetrics(current, readKeyboardDrawerMetrics())
      );
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
  }, [active]);

  const live = active ? metrics : IDLE;
  const style = useMemo(() => keyboardDrawerFrameStyle(live), [live]);
  return {
    style,
    keyboardOpen: live.isMobile && live.lift > 0,
  };
}
