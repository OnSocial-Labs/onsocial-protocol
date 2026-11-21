'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  compensateOpenedPostAboveShift,
  openedPostDocumentTop,
  openedPostPinDeficit,
  scrollOpenedPostUnderHeader,
} from '@/lib/thread-open';

/**
 * After the first land, ancestor hops + quote/media soft-fill still grow
 * above the opened post. Keep correcting for this window so reply threads
 * do not settle “one seat lower” than roots.
 */
export const THREAD_LAND_SEAT_GUARD_MS = [48, 160, 360, 720, 1200] as const;

function landSpacer(scroller: HTMLElement): HTMLElement | null {
  return scroller.querySelector('[data-thread-land-spacer]');
}

function clearLandSpacer(scroller: HTMLElement | null | undefined): void {
  scroller?.querySelector('[data-thread-land-spacer]')?.remove();
}

/** Pin focused post top to the under-header seat; spacer if the thread is short. */
function alignOpenedPost(node: HTMLElement, scroller: HTMLElement): void {
  for (let pass = 0; pass < 4; pass += 1) {
    scrollOpenedPostUnderHeader(node);
    const deficit = openedPostPinDeficit(node, scroller);
    if (Math.abs(deficit) <= 0.5) break;
    let spacer = landSpacer(scroller);
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const room = max - scroller.scrollTop;
    let content = 0;
    for (const child of scroller.children) {
      if (!(child instanceof HTMLElement) || child === spacer) continue;
      const style = getComputedStyle(child);
      content +=
        child.offsetHeight +
        (Number.parseFloat(style.marginTop) || 0) +
        (Number.parseFloat(style.marginBottom) || 0);
    }
    const unused = Math.max(0, scroller.clientHeight - content);
    const needed = deficit - room + unused;
    if (needed > 0.5) {
      if (!spacer) {
        spacer = document.createElement('div');
        spacer.setAttribute('data-thread-land-spacer', '');
        spacer.setAttribute('aria-hidden', 'true');
        scroller.appendChild(spacer);
      }
      const height = Number.parseFloat(spacer.style.height) || 0;
      const next = Math.min(window.innerHeight, height + needed);
      if (next <= height + 0.5) break;
      spacer.style.height = `${Math.ceil(next)}px`;
      continue;
    }
    if (deficit < -0.5 && spacer) {
      const height = Number.parseFloat(spacer.style.height) || 0;
      const next = Math.max(0, height + deficit);
      spacer.style.height = `${Math.ceil(next)}px`;
      if (next <= 0.5) spacer.remove();
      continue;
    }
    break;
  }
}

/**
 * Absorb ancestor soft-fill / extra hops above the opened post.
 * ResizeObserver alone misses some inserts; MutationObserver + a short
 * timed guard re-seat when the chain grows after the first land.
 */
function holdAgainstAboveResize(
  node: HTMLElement,
  scroller: HTMLElement
): () => void {
  let released = false;
  let prevTop = openedPostDocumentTop(node, scroller);
  let raf = 0;
  const timers: number[] = [];

  const correct = () => {
    if (released) return;
    prevTop = compensateOpenedPostAboveShift(node, scroller, prevTop);
    // Delta can lag a multi-card hop; hard re-seat if still off the line.
    if (Math.abs(openedPostPinDeficit(node, scroller)) > 1) {
      alignOpenedPost(node, scroller);
      prevTop = openedPostDocumentTop(node, scroller);
    }
  };

  const schedule = () => {
    if (released || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      observeAbove();
      correct();
    });
  };

  const ro = new ResizeObserver(schedule);
  const moAbove = new MutationObserver(schedule);
  const moParent = new MutationObserver(schedule);

  const observeAbove = () => {
    ro.disconnect();
    moAbove.disconnect();
    const parent = node.parentElement;
    if (!parent) return;
    for (const child of parent.children) {
      if (child === node) break;
      if (child instanceof Element) {
        ro.observe(child);
        // childList only — attribute churn on media soft-fill is too hot and
        // ResizeObserver already covers size changes.
        moAbove.observe(child, { childList: true, subtree: true });
      }
    }
  };

  const parent = node.parentElement;
  if (parent) {
    moParent.observe(parent, { childList: true });
  }
  observeAbove();

  const release = () => {
    if (released) return;
    released = true;
    scroller.removeEventListener('wheel', release);
    scroller.removeEventListener('touchmove', release);
    if (raf) cancelAnimationFrame(raf);
    for (const id of timers) window.clearTimeout(id);
    moAbove.disconnect();
    moParent.disconnect();
    ro.disconnect();
  };

  for (const ms of THREAD_LAND_SEAT_GUARD_MS) {
    timers.push(
      window.setTimeout(() => {
        if (released) return;
        observeAbove();
        correct();
      }, ms)
    );
  }
  // Drop observers after the last guard beat — do not leave MutationObservers
  // on parked trail sheets until the user scrolls.
  const lastGuard =
    THREAD_LAND_SEAT_GUARD_MS[THREAD_LAND_SEAT_GUARD_MS.length - 1] ?? 1200;
  timers.push(window.setTimeout(release, lastGuard + 32));

  scroller.addEventListener('wheel', release, { passive: true });
  scroller.addEventListener('touchmove', release, { passive: true });
  return release;
}

/** Land once → appear. Hold soft-fill; never re-pin on chevron back. */
function useLandOpenedPost(
  openedPostRef: RefObject<HTMLElement | null>,
  postId: string | null | undefined,
  onSettled?: () => void,
  pinKey = '',
  armed = true,
  parked = false,
  /** Soft-fill re-pin window. Off for deep-link focus so scroll is not undone. */
  seatGuard = true
): { releaseSeatGuard: () => void } {
  const onSettledRef = useRef(onSettled);
  useEffect(() => {
    onSettledRef.current = onSettled;
  });
  const settledOnceRef = useRef(false);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const releaseHoldRef = useRef<(() => void) | null>(null);
  const seatGuardRef = useRef(seatGuard);
  useEffect(() => {
    seatGuardRef.current = seatGuard;
  });
  const releaseSeatGuard = () => {
    releaseHoldRef.current?.();
    releaseHoldRef.current = null;
  };

  useLayoutEffect(() => {
    settledOnceRef.current = false;
    releaseHoldRef.current?.();
    releaseHoldRef.current = null;
    clearLandSpacer(scrollerRef.current);
    clearLandSpacer(
      openedPostRef.current?.closest(
        '.os-app-screen-body'
      ) as HTMLElement | null
    );
    scrollerRef.current = null;
  }, [openedPostRef, postId]);

  // Parked trail sheets must not keep land observers — release immediately.
  useLayoutEffect(() => {
    if (!parked) return;
    releaseHoldRef.current?.();
    releaseHoldRef.current = null;
  }, [parked]);

  useLayoutEffect(() => {
    if (!postId || !armed || parked) return;
    if (settledOnceRef.current) return;

    let cancelled = false;
    let raf = 0;
    let waits = 0;

    const tryAlign = () => {
      if (cancelled || settledOnceRef.current) return;
      const node = openedPostRef.current;
      const root = node?.closest('.os-app-screen-body');
      if (!(node instanceof HTMLElement) || !(root instanceof HTMLElement)) {
        // Band / hug embeds have no page scroller — never spin forever.
        waits += 1;
        if (waits > 45) {
          settledOnceRef.current = true;
          onSettledRef.current?.();
          return;
        }
        raf = requestAnimationFrame(tryAlign);
        return;
      }
      scrollerRef.current = root;
      alignOpenedPost(node, root);
      // Soft-fill often commits the frame after first land — re-seat hidden.
      raf = requestAnimationFrame(() => {
        if (cancelled || settledOnceRef.current) return;
        alignOpenedPost(node, root);
        releaseHoldRef.current?.();
        if (seatGuardRef.current) {
          releaseHoldRef.current = holdAgainstAboveResize(node, root);
        }
        settledOnceRef.current = true;
        onSettledRef.current?.();
      });
    };

    tryAlign();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      releaseHoldRef.current?.();
      releaseHoldRef.current = null;
    };
  }, [armed, openedPostRef, parked, pinKey, postId]);

  useLayoutEffect(() => {
    return () => {
      releaseHoldRef.current?.();
      releaseHoldRef.current = null;
      clearLandSpacer(scrollerRef.current);
    };
  }, []);

  return { releaseSeatGuard };
}

/**
 * Same seat for roots and replies on the Post page / trail.
 * `landSeat: false` for media-band / hug embeds (no under-header pin).
 * The pin runs on its own. It does not hold the cover.
 * `tailReady` holds paint until the first reply page is ready so OP + directs
 * land in one frame (rail never joins after appear).
 */
export function useThreadLandAppear({
  openedPostRef,
  postId,
  hasParent,
  ancestorsReady = true,
  loadReady,
  hasRoot,
  tailReady = true,
  pinKey = '',
  parked = false,
  landSeat = true,
  seatGuard = true,
  onThreadPainted,
}: {
  openedPostRef: RefObject<HTMLElement | null>;
  postId: string | null | undefined;
  hasParent: boolean;
  ancestorsReady?: boolean;
  loadReady: boolean;
  hasRoot: boolean;
  /** First reply page ready — pair with `threadCoverReady`. */
  tailReady?: boolean;
  pinKey?: string;
  parked?: boolean;
  landSeat?: boolean;
  /**
   * Soft-fill re-pin after land. Deep-link focus releases this before
   * scroll so the OP pin does not undo `scrollIntoView`.
   */
  seatGuard?: boolean;
  onThreadPainted?: () => void;
}): { landSettled: boolean; releaseSeatGuard: () => void } {
  // Pin as soon as the seat exists. Ancestor soft-fill grows above and is
  // absorbed by holdAgainstAboveResize — waiting on the full chain delayed
  // reply-permalink land for every sequential parent hop.
  const armed = landSeat && (!hasParent || ancestorsReady);
  const [landSettled, setLandSettled] = useState(!landSeat);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset land gate when the opened post changes
    setLandSettled(!landSeat);
  }, [landSeat, postId]);

  const { releaseSeatGuard } = useLandOpenedPost(
    openedPostRef,
    postId,
    () => setLandSettled(true),
    pinKey,
    armed,
    parked,
    seatGuard
  );

  useLayoutEffect(() => {
    if (parked || !loadReady || !hasRoot || !tailReady) return;
    onThreadPainted?.();
  }, [hasRoot, loadReady, onThreadPainted, parked, tailReady]);

  return { landSettled, releaseSeatGuard };
}
