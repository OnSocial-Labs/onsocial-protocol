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

/** Avatar (stable seat); falls back to the post wrapper. */
export function threadPinFace(post: HTMLElement): HTMLElement {
  if (typeof post.querySelector !== 'function') return post;
  const face =
    post.querySelector('.post-card-avatar') ??
    post.querySelector('.post-card-avatar-link');
  if (
    face &&
    typeof face === 'object' &&
    typeof (face as HTMLElement).getBoundingClientRect === 'function'
  ) {
    return face as HTMLElement;
  }
  return post;
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

/** Card pad above the avatar — same token on every detail post. */
function threadFacePad(post: HTMLElement, face: HTMLElement): number {
  if (face === post) return 0;
  if (
    typeof face.closest !== 'function' ||
    typeof getComputedStyle !== 'function'
  ) {
    return Math.max(
      0,
      face.getBoundingClientRect().top - post.getBoundingClientRect().top
    );
  }
  const card = face.closest('.post-card');
  if (
    card &&
    typeof card === 'object' &&
    typeof getComputedStyle === 'function'
  ) {
    return parsedPad(getComputedStyle(card as HTMLElement).paddingTop);
  }
  return Math.max(
    0,
    face.getBoundingClientRect().top - post.getBoundingClientRect().top
  );
}

/** Pin scroll + Lenis (stop → resize → immediate scrollTo → start). */
export function pinThreadScroll(scroller: HTMLElement, top: number): void {
  scroller.scrollTop = top;
  if (!getAppLenis(scroller)) return;
  adoptAppLenisScroll(scroller);
}

/** How far the avatar sits below (positive) or above the shared face seat. */
export function openedPostPinDeficit(
  post: HTMLElement,
  scroller: HTMLElement
): number {
  const face = threadPinFace(post);
  const goal =
    scroller.getBoundingClientRect().top +
    threadContentInset(scroller, post) +
    threadFacePad(post, face);
  return face.getBoundingClientRect().top - goal;
}

/** Put the opened post's avatar on the shared under-header seat. */
export function scrollOpenedPostUnderHeader(post: HTMLElement): boolean {
  const scroller = threadScroller(post);
  if (!scroller) return false;
  const top = openedPostPinDeficit(post, scroller) + scroller.scrollTop;
  if (Math.abs(scroller.scrollTop - top) <= 1) return true;
  pinThreadScroll(scroller, top);
  return true;
}

/** Document Y of the avatar inside the thread scroller. */
export function openedPostDocumentTop(
  post: HTMLElement,
  scroller: HTMLElement
): number {
  const face = threadPinFace(post);
  return (
    face.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop
  );
}

/** Keep avatar still when content above grows — delta scroll, not re-pin. */
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
