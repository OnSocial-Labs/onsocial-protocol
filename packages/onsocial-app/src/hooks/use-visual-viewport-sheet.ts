'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/** One lift token for every layout-pinned bar (write dock, messages, create). */
export const OS_KEYBOARD_LIFT_VAR = '--os-keyboard-lift';

/** Raw keyboard overlap. Drawers use the same pixels via `keyboardSheetMargin`. */
export function keyboardLiftCssVars(
  open: boolean,
  liftPx: number
): CSSProperties {
  return {
    [OS_KEYBOARD_LIFT_VAR]: open
      ? `${Math.max(0, Math.round(liftPx))}px`
      : '0px',
  } as CSSProperties;
}

const MOBILE_MAX_WIDTH_PX = 767;

export interface VisualViewportSheetMetrics {
  /** Pixels of layout viewport covered below the visual viewport (keyboard). */
  lift: number;
  /** Visible viewport height in CSS pixels. */
  height: number;
  isMobile: boolean;
}

const IDLE: VisualViewportSheetMetrics = {
  lift: 0,
  height: 0,
  isMobile: false,
};

function readMetrics(): VisualViewportSheetMetrics {
  if (typeof window === 'undefined') return IDLE;

  const isMobile = window.matchMedia(
    `(max-width: ${MOBILE_MAX_WIDTH_PX}px)`
  ).matches;
  const viewport = window.visualViewport;
  if (!isMobile || !viewport) {
    return {
      lift: 0,
      height: isMobile ? window.innerHeight : 0,
      isMobile,
    };
  }

  const lift = Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  );
  return {
    lift,
    height: Math.round(viewport.height),
    isMobile: true,
  };
}

/**
 * Tracks visualViewport so bottom sheets can shrink/lift above the mobile
 * keyboard (iOS often leaves layout `dvh` unchanged).
 */
export function useVisualViewportSheetMetrics(
  active: boolean
): VisualViewportSheetMetrics {
  const [metrics, setMetrics] = useState<VisualViewportSheetMetrics>(IDLE);

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      return;
    }

    const sync = () => {
      setMetrics((current) => {
        const next = readMetrics();
        if (
          current.lift === next.lift &&
          current.height === next.height &&
          current.isMobile === next.isMobile
        ) {
          return current;
        }
        return next;
      });
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    // Defer initial read so we don't sync setState in the effect body.
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return active ? metrics : IDLE;
}
