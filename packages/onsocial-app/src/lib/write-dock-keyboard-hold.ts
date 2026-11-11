import { getAppLenis } from '@/lib/app-lenis-registry';

/** Ignore subpixel noise. A real dock move is larger than this. */
const DOCK_RISE_SLOP_PX = 0.5;

/** Same end-pin the message thread already uses. */
export const WRITE_DOCK_END_PIN_PX = 96;

export function dockRisePx(beforeTop: number, afterTop: number): number {
  const rise = beforeTop - afterTop;
  return Math.abs(rise) < DOCK_RISE_SLOP_PX ? 0 : rise;
}

export function isScrolledToEnd(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  slop = WRITE_DOCK_END_PIN_PX
): boolean {
  return scrollHeight - scrollTop - clientHeight < slop;
}

/** Clamp a rise onto the scroller. Negative rise settles back down. */
export function nextScrollerTop(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  rise: number
): number {
  if (Math.abs(rise) < DOCK_RISE_SLOP_PX) return scrollTop;
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.min(max, Math.max(0, scrollTop + rise));
}

function adoptLenis(root: HTMLElement) {
  const smooth = getAppLenis(root);
  if (!smooth) return;
  smooth.resize();
  const top = root.scrollTop;
  // An in-flight glide would put the old target back on the next frame.
  if (smooth.scroll === top) {
    smooth.scrollTo(top > 0 ? top - 1 : top + 1, {
      immediate: true,
      force: true,
    });
  }
  smooth.scrollTo(top, { immediate: true, force: true });
}

/**
 * The feed under the launcher. Messages pins itself to the latest line,
 * so it is not this scroller.
 */
export function feedScrollerForDock(dock: HTMLElement): HTMLElement | null {
  const screen = dock.closest('.os-app-screen');
  if (!screen || screen.querySelector('.messages-panel')) return null;
  const sheet = document.querySelector(
    '.glass-sheet-root[data-sheet-top="true"][data-keep-dock="true"]:not(.post-thread-sheet-parked)'
  );
  const scope = sheet ?? screen;
  const candidates = scope.querySelectorAll(
    '.glass-sheet-body, .os-app-screen-body'
  );
  for (const node of candidates) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

export function messagesThreadBody(dock: HTMLElement): HTMLElement | null {
  const screen = dock.closest('.os-app-screen');
  if (!screen?.querySelector('.messages-panel')) return null;
  const body = screen.querySelector(
    ':scope > .os-app-screen-column > .os-app-screen-body'
  );
  return body instanceof HTMLElement ? body : null;
}

/** Land a scroller and cancel a glide that would put the old target back. */
export function holdScrollerAt(root: HTMLElement, top: number) {
  const max = Math.max(0, root.scrollHeight - root.clientHeight);
  const next = Math.min(max, Math.max(0, top));
  if (root.scrollTop !== next) root.scrollTop = next;
  adoptLenis(root);
}

/** Move the feed by the same pixels the launcher just moved. */
export function shiftFeedForDock(dock: HTMLElement, rise: number) {
  const scroller = feedScrollerForDock(dock);
  if (!scroller) return;
  holdScrollerAt(
    scroller,
    nextScrollerTop(
      scroller.scrollTop,
      scroller.scrollHeight,
      scroller.clientHeight,
      rise
    )
  );
}

/** Keep the latest message against the launcher when the thread was already there. */
export function pinMessagesToLatest(body: HTMLElement) {
  holdScrollerAt(body, body.scrollHeight - body.clientHeight);
}
