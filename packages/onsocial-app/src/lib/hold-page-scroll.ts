'use client';

/**
 * Focusing a field lower on a full page must scroll that page's body only.
 * The browser otherwise scrolls the window and every ancestor, which
 * pushes the screen header above the visible viewport.
 */
export interface PageScrollSnap {
  nodes: Array<{ node: HTMLElement; top: number; left: number }>;
  x: number;
  y: number;
}

export function rememberPageScrollOutside(
  field: HTMLElement,
  scroller: HTMLElement | null
): PageScrollSnap {
  const nodes: PageScrollSnap['nodes'] = [];
  let node: HTMLElement | null = field.parentElement;
  while (node) {
    if (node !== scroller) {
      nodes.push({ node, top: node.scrollTop, left: node.scrollLeft });
    }
    node = node.parentElement;
  }
  return {
    nodes,
    x: window.scrollX,
    y: window.scrollY,
  };
}

export function restorePageScroll(snap: PageScrollSnap | null) {
  if (!snap || typeof window === 'undefined') return;
  for (const item of snap.nodes) {
    if (item.node.scrollTop !== item.top) item.node.scrollTop = item.top;
    if (item.node.scrollLeft !== item.left) item.node.scrollLeft = item.left;
  }
  if (window.scrollX !== snap.x || window.scrollY !== snap.y) {
    window.scrollTo(snap.x, snap.y);
  }
}

/** iOS scrolls again while the keyboard animates. Put the page back each time. */
export function keepPageScrollOutside(snap: PageScrollSnap | null) {
  const restore = () => restorePageScroll(snap);
  restore();
  window.requestAnimationFrame(restore);
  window.setTimeout(restore, 50);
  window.setTimeout(restore, 320);
}
