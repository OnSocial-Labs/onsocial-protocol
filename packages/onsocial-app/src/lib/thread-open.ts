import { getAppLenis } from '@/lib/app-lenis-registry';

/**
 * A painted thread reloads behind the card. A thread that is not on screen
 * yet may show the skeleton for this load, and stays painted after it.
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

/** Put the opened post at the top of the thread scroller, under the header. */
export function scrollOpenedPostUnderHeader(post: HTMLElement): boolean {
  const scroller = threadScroller(post);
  if (!scroller) return false;
  const top =
    post.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop;
  if (Math.abs(scroller.scrollTop - top) < 1) return true;
  // Lenis owns these overflow roots and overwrites a bare scrollTop write.
  const lenis = getAppLenis(scroller);
  if (lenis) {
    lenis.resize();
    lenis.scrollTo(top, { immediate: true, force: true });
    return true;
  }
  scroller.scrollTop = top;
  return true;
}
