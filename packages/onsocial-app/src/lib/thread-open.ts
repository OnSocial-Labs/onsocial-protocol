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

function parsedPad(value: string): number {
  const pad = Number.parseFloat(value);
  return Number.isFinite(pad) ? pad : 0;
}

/**
 * Header clearance plus the page pad under it. A root post sits below that
 * pad; landing on the header edge alone leaves a reply a step higher.
 */
export function threadContentInset(
  scroller: HTMLElement,
  post: HTMLElement
): number {
  if (typeof getComputedStyle !== 'function') return 0;
  const pad = parsedPad(getComputedStyle(scroller).paddingTop);
  const page =
    typeof post.closest === 'function'
      ? post.closest('.os-app-chrome-page')
      : null;
  if (!(page instanceof HTMLElement)) return pad;
  return pad + parsedPad(getComputedStyle(page).paddingTop);
}

/**
 * Stick the scroller to `top` before paint. A bare `scrollTop` write is
 * invisible to Lenis, and a `scrollTo` of the position it already holds
 * leaves the in-flight animation running, so the next frame drifts.
 */
function pinThreadScroll(scroller: HTMLElement, top: number): void {
  scroller.scrollTop = top;
  const lenis = getAppLenis(scroller);
  if (!lenis) return;
  lenis.resize();
  const landed = scroller.scrollTop;
  if (lenis.scroll === landed) {
    lenis.scrollTo(landed > 0 ? landed - 1 : landed + 1, {
      immediate: true,
      force: true,
    });
  }
  lenis.scrollTo(landed, { immediate: true, force: true });
}

/** Put the opened post at the top of the thread scroller, under the header. */
export function scrollOpenedPostUnderHeader(post: HTMLElement): boolean {
  const scroller = threadScroller(post);
  if (!scroller) return false;
  const top =
    post.getBoundingClientRect().top -
    (scroller.getBoundingClientRect().top + threadContentInset(scroller, post)) +
    scroller.scrollTop;
  if (Math.abs(scroller.scrollTop - top) < 1) return true;
  pinThreadScroll(scroller, top);
  return true;
}
