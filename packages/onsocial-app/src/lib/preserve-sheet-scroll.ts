/**
 * Media pickers / remounts can shove the sheet or window scroll.
 * Snap back to the pre-change position after React paints.
 */
export function preserveSheetScroll(
  rootSelector: string,
  run: () => void
): void {
  if (typeof document === 'undefined') {
    run();
    return;
  }
  const scroller = document.querySelector<HTMLElement>(rootSelector);
  const top = scroller?.scrollTop ?? 0;
  const left = scroller?.scrollLeft ?? 0;
  const x = window.scrollX;
  const y = window.scrollY;
  run();
  const restore = () => {
    if (scroller) {
      if (scroller.scrollTop !== top) scroller.scrollTop = top;
      if (scroller.scrollLeft !== left) scroller.scrollLeft = left;
    }
    if (window.scrollX !== x || window.scrollY !== y) {
      window.scrollTo(x, y);
    }
  };
  restore();
  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 50);
  window.setTimeout(restore, 320);
}
