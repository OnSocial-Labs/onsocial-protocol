import { adoptAppLenisScroll, getAppLenis } from '@/lib/app-lenis-registry';

export type ThreadLoadState = 'loading' | 'ready' | 'missing' | 'error';

/**
 * The post cover lifts when the root is in hand, or the load has ended
 * without one. Replies do not hold it — they skeleton in their own slot.
 */
export function threadCoverReady(input: {
  loadState: ThreadLoadState;
  hasRoot: boolean;
  /** Present so callers can show it does not gate the cover. */
  repliesResolved?: boolean;
}): boolean {
  if (input.loadState === 'missing' || input.loadState === 'error') return true;
  return input.loadState === 'ready' && input.hasRoot;
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
      scroller.scrollTop +
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
  const top = openedPostPinDeficit(post, scroller) + scroller.scrollTop;
  if (Math.abs(scroller.scrollTop - top) <= 1) return true;
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
    scroller.scrollTop
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
  pinThreadScroll(scroller, scroller.scrollTop + delta);
  return openedPostDocumentTop(post, scroller);
}
