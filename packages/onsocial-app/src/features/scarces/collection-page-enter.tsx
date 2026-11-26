'use client';

import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type AnimationEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { readMotionAppearMs } from '@/lib/os-motion-appear';

/** Cover, title/meta, mint card, then activity/tracks. */
export const DROP_ENTER_BLOCK_COUNT = 4;

/** 60ms sits in the 50–80ms stagger window. */
export const DROP_ENTER_DELAY_STEP_MS = 60;

export type SeatPhase = 'hold' | 'leave' | 'off';

/**
 * First paint already has a real drop: route seed, view cache, or the
 * now-playing session. Same order as the panel's `useState` initializer.
 */
export function readDropFirstPaint<T>(opts: {
  initial: T | null;
  cached: T | null;
  nowPlayingSeed: T | null;
}): T | null {
  if (opts.initial) return opts.initial;
  if (opts.cached) return opts.cached;
  return opts.nowPlayingSeed;
}

export function dropEnterDelayMs(
  index: number,
  stepMs = DROP_ENTER_DELAY_STEP_MS
): number {
  const slot = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return slot * stepMs;
}

/**
 * Four-block rise only for a cold first paint. A seed, cache, or
 * now-playing open (`openedWithContent`) stays opaque — soft-nav remount
 * must not fade Collectibles / Show pass. A rise that already played
 * stays opaque. Refresh and wallet hydration are not inputs.
 */
export function dropEnterShouldPlay(opts: {
  reducedMotion: boolean;
  openedWithContent: boolean;
  ready: boolean;
  played?: boolean;
}): boolean {
  if (
    opts.reducedMotion ||
    opts.openedWithContent ||
    opts.played ||
    !opts.ready
  ) {
    return false;
  }
  return true;
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
  const [settled, setSettled] = useState(!play);
  const playing = play && !settled;
  useLayoutEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setSettled(true),
      dropEnterDelayMs(index) + readMotionAppearMs()
    );
    return () => window.clearTimeout(timer);
  }, [playing, index]);

  const style: CSSProperties | undefined = playing
    ? ({
        ['--drop-enter-delay' as string]: `${dropEnterDelayMs(index)}ms`,
      } as CSSProperties)
    : undefined;
  const enterClass = [
    'collection-drop-enter',
    className ?? '',
    playing ? 'is-play' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={enterClass}
      style={style}
      data-drop-enter={playing ? 'stagger' : 'instant'}
      data-drop-rose={play ? '' : undefined}
      onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        setSettled(true);
      }}
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
