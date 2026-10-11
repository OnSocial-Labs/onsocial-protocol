/**
 * Stable text scroller. The native bar takes no width, so a line does not
 * move when overflow starts or stops. On a fine pointer the thumb is painted
 * over the padding.
 *
 * New text columns add `os-stable-scroll`. The selectors below are the
 * surfaces that already scroll a column of lines.
 */
export const OS_STABLE_SCROLL_SELECTOR = [
  '.os-stable-scroll',
  '.os-app-screen-body',
  '.glass-sheet-body',
  '.os-app-chrome-scroller',
  '.portfolio-page',
  '.gate-scroll',
  '.drop-time-drum-list',
  '.protocol-on-chain-raw',
  '.app-storage-grants-list',
  '.account-editor-form-main',
  '.home-saved-feed-sheet-list',
  '.feed-photo-thread-body',
  '.os-reveal-inner.is-capped',
  '.post-quotes-page-scroll',
  '.post-quotes-screen:not(:has(.post-quotes-pager))',
  '.leaderboard-pager-scroll',
  '.scarce-clip-listen:has(.scarce-clip-listen-footer)',
].join(', ');

/** Scroll position after dragging the overlay thumb by `deltaY` pixels. */
export function overlayThumbDragScroll(
  startScroll: number,
  deltaY: number,
  thumbTravel: number,
  scrollRange: number
): number {
  if (thumbTravel <= 0 || scrollRange <= 0) return Math.max(0, startScroll);
  const next = startScroll + (deltaY * scrollRange) / thumbTravel;
  return Math.max(0, Math.min(scrollRange, next));
}

function applyThumbScroll(scroller: HTMLElement, top: number) {
  const event = new CustomEvent('os-thumb-scroll', {
    detail: top,
    cancelable: true,
  });
  if (scroller.dispatchEvent(event)) scroller.scrollTop = top;
}

/** `right` for a fixed thumb sitting just inside the scroller's right edge. */
export function resolveOverlayScrollThumbRight(
  viewportWidth: number,
  scrollerRight: number,
  inset = 2
): number {
  if (viewportWidth <= 0) return inset;
  return Math.max(0, viewportWidth - scrollerRight + inset);
}

/** Off-screen pager pages must not pin a thumb to the viewport edge. */
export function overlayScrollThumbIsVisible(
  left: number,
  top: number,
  right: number,
  bottom: number,
  viewportWidth: number,
  viewportHeight: number
): boolean {
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1 || viewportWidth <= 0 || viewportHeight <= 0) {
    return false;
  }
  const visibleWidth = Math.min(right, viewportWidth) - Math.max(left, 0);
  const visibleHeight = Math.min(bottom, viewportHeight) - Math.max(top, 0);
  return visibleWidth >= width * 0.6 && visibleHeight >= height * 0.6;
}

export function resolveOverlayScrollThumb(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  offsetTop: number
): { top: number; height: number } | null {
  const overflow = scrollHeight - clientHeight;
  if (overflow <= 1 || clientHeight <= 0 || scrollHeight <= 0) {
    return null;
  }
  const height = Math.min(
    clientHeight,
    Math.max(28, (clientHeight / scrollHeight) * clientHeight)
  );
  const travel = Math.max(0, clientHeight - height);
  const top = offsetTop + (scrollTop / overflow) * travel;
  return { top, height };
}

/** Fine pointer only. Touch sheets keep a native overlay with no rail. */
export function overlayScrollThumbMedia(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
  );
}

const boundScrollers = new WeakMap<HTMLElement, () => void>();
const scrollerThumbs = new WeakMap<HTMLElement, HTMLElement>();

/** A page thumb stays hidden while a drawer or slide covers that scroller. */
export function scrollThumbCoveredByOverlay(
  hasCoveringOverlay: boolean,
  scrollerInsideOverlay: boolean
): boolean {
  return hasCoveringOverlay && !scrollerInsideOverlay;
}

/** Outer shells hide their bar when an inner list is the one that scrolls. */
export function scrollThumbYieldsToInner(
  hasOverflowingInner: boolean
): boolean {
  return hasOverflowingInner;
}

function topCoveringOverlay(doc: Document): HTMLElement | null {
  const nodes = doc.querySelectorAll<HTMLElement>(
    '.glass-sheet-root.is-visible:not(.post-thread-sheet-parked), [data-os-slide-over="true"]:not(.is-closing)'
  );
  let top: HTMLElement | null = null;
  let topZ = Number.NEGATIVE_INFINITY;
  nodes.forEach((el) => {
    if (getComputedStyle(el).visibility === 'hidden') return;
    const z = Number.parseFloat(el.style.zIndex || getComputedStyle(el).zIndex);
    const zValue = Number.isFinite(z) ? z : 0;
    if (zValue >= topZ) {
      topZ = zValue;
      top = el;
    }
  });
  return top;
}

function hasOverflowingInnerScroller(scroller: HTMLElement): boolean {
  const nodes = scroller.querySelectorAll(OS_STABLE_SCROLL_SELECTOR);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!(node instanceof HTMLElement) || node === scroller) continue;
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
    if (node.scrollHeight - node.clientHeight <= 1) continue;
    const rect = node.getBoundingClientRect();
    const viewport = node.ownerDocument.documentElement;
    if (
      overlayScrollThumbIsVisible(
        rect.left,
        rect.top,
        rect.right,
        rect.bottom,
        viewport.clientWidth,
        viewport.clientHeight
      )
    ) {
      return true;
    }
  }
  return false;
}

function hideOverlayScrollThumb(thumb: HTMLElement) {
  thumb.classList.remove('is-overflow');
  thumb.style.height = '0px';
}

/** Page bars stay off buried feeds and parked threads. */
function scrollerThumbSurface(
  scroller: HTMLElement
): 'buried' | 'overlay' | 'page' {
  if (
    scroller.closest('.post-thread-sheet-parked, [data-feed-session="covered"]')
  ) {
    return 'buried';
  }
  const host = scroller.closest(
    '.glass-sheet-root.is-visible, [data-os-slide-over="true"]'
  );
  if (
    host instanceof HTMLElement &&
    !host.classList.contains('is-closing') &&
    !host.classList.contains('post-thread-sheet-parked')
  ) {
    return 'overlay';
  }
  return 'page';
}

function placeOverlayScrollThumb(scroller: HTMLElement, thumb: HTMLElement) {
  thumb.style.left = 'auto';
  thumb.style.transform = 'none';
  const surface = scrollerThumbSurface(scroller);
  thumb.dataset.osThumbFor = surface;
  if (surface === 'buried') {
    hideOverlayScrollThumb(thumb);
    return;
  }
  const overlay = topCoveringOverlay(scroller.ownerDocument);
  if (
    scrollThumbCoveredByOverlay(
      overlay != null,
      overlay ? overlay.contains(scroller) : false
    )
  ) {
    hideOverlayScrollThumb(thumb);
    return;
  }
  const overflowY = getComputedStyle(scroller).overflowY;
  if (
    scroller.closest('.glass-sheet-panel--enter') ||
    (overflowY !== 'auto' && overflowY !== 'scroll')
  ) {
    hideOverlayScrollThumb(thumb);
    return;
  }
  const rect = scroller.getBoundingClientRect();
  const viewport = scroller.ownerDocument.documentElement;
  if (
    rect.width < 1 ||
    rect.height < 1 ||
    !overlayScrollThumbIsVisible(
      rect.left,
      rect.top,
      rect.right,
      rect.bottom,
      viewport.clientWidth,
      viewport.clientHeight
    )
  ) {
    hideOverlayScrollThumb(thumb);
    return;
  }
  const local = resolveOverlayScrollThumb(
    scroller.scrollTop,
    scroller.scrollHeight,
    scroller.clientHeight,
    rect.top
  );
  if (!local) {
    hideOverlayScrollThumb(thumb);
    return;
  }
  if (scrollThumbYieldsToInner(hasOverflowingInnerScroller(scroller))) {
    hideOverlayScrollThumb(thumb);
    return;
  }
  const sheet = scroller.closest('.glass-sheet-root');
  const sheetZ = sheet
    ? Number.parseInt(getComputedStyle(sheet).zIndex, 10)
    : 0;
  const viewportWidth = scroller.ownerDocument.documentElement.clientWidth;
  thumb.style.zIndex = String(
    Number.isFinite(sheetZ) && sheetZ > 0 ? sheetZ + 1 : 4
  );
  thumb.classList.add('is-overflow');
  thumb.style.top = `${local.top}px`;
  thumb.style.right = `${resolveOverlayScrollThumbRight(viewportWidth, rect.right)}px`;
  thumb.style.height = `${local.height}px`;
}

export function syncOverlayScrollThumb(scroller: HTMLElement) {
  const thumb = scrollerThumbs.get(scroller);
  if (!thumb) return;
  placeOverlayScrollThumb(scroller, thumb);
}

/** Paint one thumb for a text scroller. No-op when that scroller is already bound. */
export function bindOverlayScrollThumb(scroller: HTMLElement): () => void {
  const existing = boundScrollers.get(scroller);
  if (existing) return existing;

  const host = scroller.ownerDocument.body;
  const thumb = scroller.ownerDocument.createElement('div');
  thumb.className = 'os-stable-scroll-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  host.appendChild(thumb);
  scrollerThumbs.set(scroller, thumb);
  const nestedHost = scroller.parentElement?.closest(
    '.glass-sheet-body, .os-app-screen-body, .os-app-chrome-scroller, .portfolio-page, .gate-scroll'
  );
  if (nestedHost && nestedHost !== scroller) {
    scroller.setAttribute('data-lenis-prevent-wheel', '');
  }

  let frame = 0;
  let scrollingTimer = 0;

  const sync = () => {
    frame = 0;
    placeOverlayScrollThumb(scroller, thumb);
  };
  const schedule = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(sync);
  };
  const onScroll = () => {
    thumb.classList.add('is-active');
    window.clearTimeout(scrollingTimer);
    scrollingTimer = window.setTimeout(() => {
      thumb.classList.remove('is-active');
    }, 700);
    schedule();
  };
  const onEnter = () => {
    thumb.classList.add('is-hot');
    schedule();
  };
  const onLeave = () => thumb.classList.remove('is-hot');

  const ro = new ResizeObserver(schedule);
  const observe = () => {
    ro.observe(scroller);
    const children = scroller.children;
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child instanceof HTMLElement) ro.observe(child);
    }
  };
  observe();
  const mo = new MutationObserver(() => {
    observe();
    schedule();
  });
  mo.observe(scroller, { childList: true });
  const panel = scroller.closest('.glass-sheet-panel');
  const panelObserver = panel ? new MutationObserver(schedule) : null;
  if (panel) {
    panelObserver?.observe(panel, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
  scroller.addEventListener('scroll', onScroll, { passive: true });
  scroller.addEventListener('pointerenter', onEnter);
  scroller.addEventListener('pointerleave', onLeave);

  let drag: {
    pointerId: number;
    startY: number;
    startScroll: number;
    travel: number;
    range: number;
  } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const range = scroller.scrollHeight - scroller.clientHeight;
    const travel = scroller.clientHeight - thumb.offsetHeight;
    if (range <= 0 || travel <= 0) return;
    drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScroll: scroller.scrollTop,
      travel,
      range,
    };
    thumb.classList.add('is-dragging');
    thumb.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    applyThumbScroll(
      scroller,
      overlayThumbDragScroll(
        drag.startScroll,
        event.clientY - drag.startY,
        drag.travel,
        drag.range
      )
    );
  };
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    thumb.classList.remove('is-dragging');
    if (thumb.hasPointerCapture(event.pointerId)) {
      thumb.releasePointerCapture(event.pointerId);
    }
  };
  thumb.addEventListener('pointerdown', onPointerDown);
  thumb.addEventListener('pointermove', onPointerMove);
  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);
  schedule();

  const stop = () => {
    if (boundScrollers.get(scroller) !== stop) return;
    boundScrollers.delete(scroller);
    scrollerThumbs.delete(scroller);
    if (frame !== 0) window.cancelAnimationFrame(frame);
    window.clearTimeout(scrollingTimer);
    ro.disconnect();
    mo.disconnect();
    panelObserver?.disconnect();
    scroller.removeEventListener('scroll', onScroll);
    scroller.removeEventListener('pointerenter', onEnter);
    scroller.removeEventListener('pointerleave', onLeave);
    thumb.removeEventListener('pointerdown', onPointerDown);
    thumb.removeEventListener('pointermove', onPointerMove);
    thumb.removeEventListener('pointerup', endDrag);
    thumb.removeEventListener('pointercancel', endDrag);
    thumb.remove();
  };
  boundScrollers.set(scroller, stop);
  return stop;
}

function isStableScroller(node: HTMLElement): boolean {
  return node.matches(OS_STABLE_SCROLL_SELECTOR);
}

/** Watch the document and keep a thumb on every stable text scroller. */
export function startOsStableScroll(doc: Document = document): () => void {
  if (!overlayScrollThumbMedia()) return () => {};

  let frame = 0;
  const scheduleAll = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      doc.querySelectorAll(OS_STABLE_SCROLL_SELECTOR).forEach((node) => {
        if (node instanceof HTMLElement) syncOverlayScrollThumb(node);
      });
    });
  };

  const bind = (scroller: HTMLElement) => {
    scroller.classList.add('os-stable-scroll');
    bindOverlayScrollThumb(scroller);
  };

  const scan = (root: ParentNode) => {
    if (root instanceof HTMLElement && isStableScroller(root)) bind(root);
    const found = root.querySelectorAll?.(OS_STABLE_SCROLL_SELECTOR);
    if (!found) return;
    for (let index = 0; index < found.length; index += 1) {
      const node = found[index];
      if (node instanceof HTMLElement) bind(node);
    }
  };

  const release = (root: ParentNode) => {
    if (root instanceof HTMLElement) boundScrollers.get(root)?.();
    const found = root.querySelectorAll?.('.os-stable-scroll');
    if (!found) return;
    for (let index = 0; index < found.length; index += 1) {
      const node = found[index];
      if (node instanceof HTMLElement) boundScrollers.get(node)?.();
    }
  };

  scan(doc);
  const mo = new MutationObserver((records) => {
    let refresh = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target;
        if (
          target instanceof HTMLElement &&
          (target.classList.contains('glass-sheet-root') ||
            target.hasAttribute('data-os-slide-over'))
        ) {
          refresh = true;
        }
        continue;
      }
      refresh = true;
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scan(node);
      });
      record.removedNodes.forEach((node) => {
        if (node instanceof HTMLElement) release(node);
      });
    }
    if (refresh) scheduleAll();
  });
  mo.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  doc.addEventListener('scroll', scheduleAll, true);
  window.addEventListener('resize', scheduleAll);

  return () => {
    mo.disconnect();
    doc.removeEventListener('scroll', scheduleAll, true);
    window.removeEventListener('resize', scheduleAll);
    if (frame !== 0) window.cancelAnimationFrame(frame);
    doc.querySelectorAll('.os-stable-scroll').forEach((node) => {
      if (node instanceof HTMLElement) boundScrollers.get(node)?.();
    });
  };
}
