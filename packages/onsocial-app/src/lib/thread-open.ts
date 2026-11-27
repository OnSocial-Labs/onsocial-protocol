import {
  adoptAppLenisScroll,
  getAppLenis,
  readAppScrollTop,
} from '@/lib/app-lenis-registry';

export type ThreadLoadState = 'loading' | 'ready' | 'missing' | 'error';

/**
 * Cover lifts when the root is ready (or the load ended without a root).
 *
 * Permalink / SSR opens still wait for the first reply page so OP + directs
 * paint together. A feed-row open already showed the OP on the list — lift
 * with that seed. Directs that were coalesced under the OP on the list must
 * be seeded too (`feedVisibleThreadSeedReplies`); only unseen directs soft-fill.
 */
export function threadCoverReady(input: {
  loadState: ThreadLoadState;
  hasRoot: boolean;
  /** False while the first reply page is still in flight. */
  repliesResolved?: boolean;
  /** Feed-row seed — OP is already on screen. */
  rootFromFeed?: boolean;
}): boolean {
  if (input.loadState === 'missing' || input.loadState === 'error') return true;
  if (!(input.loadState === 'ready' && input.hasRoot)) return false;
  if (input.rootFromFeed) return true;
  return input.repliesResolved !== false;
}

/**
 * The replies/quotes control stays in the row either way, so the seat does
 * not move. Reveal uses the shared appear; hold keeps the box and hides it.
 */
export function threadControlPresenceClass(visible: boolean): string {
  return visible ? 'thread-controls-reveal' : 'thread-controls-hold';
}

/**
 * A painted thread reloads behind the card. A thread that is not on screen
 * yet stays covered until its root is in hand. Replies fill in underneath.
 */
export function planThreadLoad(
  paintedKey: string | null,
  key: string
): { background: boolean; paintedKey: string } {
  return {
    background: paintedKey === key,
    paintedKey: key,
  };
}

function threadScroller(post: HTMLElement): HTMLElement | null {
  const node: unknown = post.closest('.os-app-screen-body');
  if (!node || typeof node !== 'object') return null;
  const scroller = node as HTMLElement;
  if (typeof scroller.scrollTop !== 'number') return null;
  if (typeof scroller.getBoundingClientRect !== 'function') return null;
  return scroller;
}

function parsedPad(value: string): number {
  const pad = Number.parseFloat(value);
  return Number.isFinite(pad) ? pad : 0;
}

/** Content origin at scroll 0 (chrome + page pad). */
export function threadContentInset(
  scroller: HTMLElement,
  post: HTMLElement
): number {
  if (typeof getComputedStyle !== 'function') {
    return 0;
  }
  const page =
    typeof post.closest === 'function'
      ? post.closest('.os-app-chrome-page')
      : null;
  if (
    page &&
    typeof page === 'object' &&
    typeof (page as HTMLElement).getBoundingClientRect === 'function'
  ) {
    const box = page as HTMLElement;
    return (
      box.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      readAppScrollTop(scroller) +
      parsedPad(getComputedStyle(box).paddingTop)
    );
  }
  return parsedPad(getComputedStyle(scroller).paddingTop);
}

/** Pin scroll + Lenis (stop → resize → immediate scrollTo → start). */
export function pinThreadScroll(scroller: HTMLElement, top: number): void {
  scroller.scrollTop = top;
  if (!getAppLenis(scroller)) return;
  adoptAppLenisScroll(scroller);
}

/**
 * How far the focused post top sits below (positive) or above the under-header
 * seat. Landmark is the post block — same optical top for root, reply, repost.
 */
export function openedPostPinDeficit(
  post: HTMLElement,
  scroller: HTMLElement
): number {
  const goal =
    scroller.getBoundingClientRect().top + threadContentInset(scroller, post);
  return post.getBoundingClientRect().top - goal;
}

/** Put the opened post's top on the shared under-header seat. */
export function scrollOpenedPostUnderHeader(post: HTMLElement): boolean {
  const scroller = threadScroller(post);
  if (!scroller) return false;
  const liveTop = readAppScrollTop(scroller);
  const top = openedPostPinDeficit(post, scroller) + liveTop;
  if (Math.abs(liveTop - top) <= 1) return true;
  pinThreadScroll(scroller, top);
  return true;
}

/** Document Y of the focused post top inside the thread scroller. */
export function openedPostDocumentTop(
  post: HTMLElement,
  scroller: HTMLElement
): number {
  return (
    post.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    readAppScrollTop(scroller)
  );
}

/** Keep the focused post still when content above grows — delta scroll, not re-pin. */
export function compensateOpenedPostAboveShift(
  post: HTMLElement,
  scroller: HTMLElement,
  previousDocumentTop: number
): number {
  const next = openedPostDocumentTop(post, scroller);
  const delta = next - previousDocumentTop;
  if (Math.abs(delta) < 0.5) return next;
  pinThreadScroll(scroller, readAppScrollTop(scroller) + delta);
  return openedPostDocumentTop(post, scroller);
}
