import { useEffect, useMemo, useState, type CSSProperties } from 'react';

const MOBILE_MAX_WIDTH_PX = 767;

export interface KeyboardDrawerMetrics {
  /** Pixels of the layout viewport covered below the visual viewport. */
  lift: number;
  /** Visible viewport height in CSS pixels. */
  height: number;
  isMobile: boolean;
}

const IDLE: KeyboardDrawerMetrics = { lift: 0, height: 0, isMobile: false };

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
    marginBottom: `calc(${metrics.lift}px - env(safe-area-inset-bottom, 0px))`,
  };
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
      setMetrics((current) => {
        const next = readKeyboardDrawerMetrics();
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
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
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
