'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type PropsWithChildren,
  type ReactNode,
} from 'react';

/**
 * One slot for the home list. The element type does not change when the
 * skeleton gives way to posts. While the list fades in, the skeleton stays
 * underneath so the slot is never the empty page color. A hard load includes
 * that cover in the HTML; reduced motion drops it without waiting.
 */
export function HomeFeedReveal({
  showSkeleton,
  skeleton,
  children,
}: PropsWithChildren<{
  showSkeleton: boolean;
  skeleton: ReactNode;
}>) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [prevSkeleton, setPrevSkeleton] = useState(showSkeleton);
  const [holdCover, setHoldCover] = useState(!showSkeleton);
  if (showSkeleton !== prevSkeleton) {
    setPrevSkeleton(showSkeleton);
    if (!showSkeleton) setHoldCover(true);
  }

  const dropCover = () => setHoldCover(false);

  useLayoutEffect(() => {
    if (showSkeleton || !holdCover) return;
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (reduce) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion drops the cover before paint; it must not sit on the list
      dropCover();
      return;
    }
    const finished = bodyRef.current
      ?.getAnimations?.()
      .some((animation) => animation.playState === 'finished');
    if (finished) dropCover();
  }, [holdCover, showSkeleton]);

  useEffect(() => {
    if (showSkeleton || !holdCover) return;
    const body = bodyRef.current;
    if (!body) return;
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--os-motion-appear')
      .trim();
    const ms = raw.endsWith('ms')
      ? Number.parseFloat(raw)
      : raw.endsWith('s')
        ? Number.parseFloat(raw) * 1000
        : 280;
    const timer = window.setTimeout(dropCover, Number.isFinite(ms) ? ms : 280);
    return () => window.clearTimeout(timer);
  }, [holdCover, showSkeleton]);

  const onAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.animationName !== 'glass-sheet-appear') return;
    dropCover();
  };

  const showCover = showSkeleton || holdCover;

  return (
    <div className="home-feed-reveal">
      {showSkeleton ? null : (
        <div
          ref={bodyRef}
          className="home-feed-reveal-body"
          onAnimationEnd={onAnimationEnd}
        >
          {children}
        </div>
      )}
      {showCover ? (
        <div
          className={
            showSkeleton
              ? 'home-feed-reveal-cover'
              : 'home-feed-reveal-cover is-under'
          }
          aria-hidden={showSkeleton ? undefined : true}
        >
          {skeleton}
        </div>
      ) : null}
    </div>
  );
}
