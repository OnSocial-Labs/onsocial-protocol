'use client';

import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';

/** Cover, title/meta, mint card, then activity/tracks. */
export const DROP_ENTER_BLOCK_COUNT = 4;

/** 60ms sits in the 50–80ms stagger window. */
export const DROP_ENTER_DELAY_STEP_MS = 60;

export const DROP_ENTER_RISE_PX = 8;

const MOTION_APPEAR_FALLBACK_MS = 280;

export type DropEnterMode = 'instant' | 'stagger';

export type SeatPhase = 'hold' | 'leave' | 'off';

/**
 * Seeded hot opens and reduced motion paint opaque.
 * A cold first paint staggers once.
 */
export function dropEnterMode(opts: {
  seededHotOpen: boolean;
  reducedMotion: boolean;
}): DropEnterMode {
  if (opts.seededHotOpen || opts.reducedMotion) return 'instant';
  return 'stagger';
}

export function dropEnterDelayMs(
  index: number,
  stepMs = DROP_ENTER_DELAY_STEP_MS
): number {
  const slot = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return slot * stepMs;
}

/**
 * Play the rise only for a cold, motion-ok paint that has not already
 * entered. `played` is the seeded/hot visit — refreshes and wallet
 * hydration are not inputs, so they cannot restart it.
 */
export function dropEnterShouldPlay(opts: {
  mode: DropEnterMode;
  played: boolean;
  ready: boolean;
}): boolean {
  return opts.mode === 'stagger' && opts.ready && !opts.played;
}

export function dropEnterPlayback(opts: {
  seededHotOpen: boolean;
  reducedMotion: boolean;
  ready: boolean;
}): 'stagger' | 'instant' {
  return dropEnterShouldPlay({
    mode: dropEnterMode(opts),
    played: opts.seededHotOpen,
    ready: opts.ready,
  })
    ? 'stagger'
    : 'instant';
}

/**
 * One-way skeleton → content. A later pending (refresh) stays `off`
 * so the cover does not replay.
 */
export function nextSeatPhase(opts: {
  phase: SeatPhase;
  pending: boolean;
  reducedMotion: boolean;
  startedPending: boolean;
}): SeatPhase {
  if (!opts.startedPending || opts.phase === 'off' || opts.phase === 'leave') {
    return opts.phase === 'leave' && opts.startedPending ? 'leave' : 'off';
  }
  if (opts.pending) return 'hold';
  return opts.reducedMotion ? 'off' : 'leave';
}

/** `--os-motion-appear`, 280ms when the token is missing. */
export function readMotionAppearMs(): number {
  if (typeof window === 'undefined') return MOTION_APPEAR_FALLBACK_MS;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--os-motion-appear')
    .trim();
  if (raw.endsWith('ms')) {
    const ms = Number.parseFloat(raw);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  if (raw.endsWith('s')) {
    const seconds = Number.parseFloat(raw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  return MOTION_APPEAR_FALLBACK_MS;
}

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useDropReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  );
}

export function CollectionDropEnter({
  play,
  index,
  className,
  children,
}: {
  play: boolean;
  index: number;
  className?: string;
  children?: ReactNode;
}) {
  const style: CSSProperties | undefined = play
    ? ({
        ['--drop-enter-delay' as string]: `${dropEnterDelayMs(index)}ms`,
      } as CSSProperties)
    : undefined;
  const enterClass = [
    'collection-drop-enter',
    className ?? '',
    play ? 'is-play' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={enterClass}
      style={style}
      data-drop-enter={play ? 'stagger' : 'instant'}
    >
      {children}
    </div>
  );
}

/**
 * Tracks / activity skeleton leaves with the route skeleton fade
 * (`.os-route-skeleton.is-done`). Mounting already settled skips it.
 * A later pending paints the skeleton again without replaying the fade.
 */
export function CollectionSeatSettle({
  pending,
  skeleton,
  children,
}: {
  pending: boolean;
  skeleton: ReactNode;
  children?: ReactNode;
}) {
  const reducedMotion = useDropReducedMotion();
  const [startedPending] = useState(pending);
  const [phase, setPhase] = useState<SeatPhase>(pending ? 'hold' : 'off');
  const [pendingSnap, setPendingSnap] = useState(pending);
  if (pending !== pendingSnap) {
    setPendingSnap(pending);
    const next = nextSeatPhase({
      phase,
      pending,
      reducedMotion,
      startedPending,
    });
    if (next !== phase) setPhase(next);
  }

  useLayoutEffect(() => {
    if (phase !== 'leave') return;
    const timer = window.setTimeout(
      () => setPhase('off'),
      readMotionAppearMs()
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!startedPending || phase === 'off') {
    return pending ? skeleton : children;
  }
  if (phase === 'hold') return skeleton;

  return (
    <div className="collection-seat-settle">
      {children}
      <div className="os-route-skeleton is-done" aria-hidden>
        {skeleton}
      </div>
    </div>
  );
}
