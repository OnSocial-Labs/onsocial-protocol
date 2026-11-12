'use client';

import type { FocusEvent, PointerEvent } from 'react';

/**
 * A short hug drawer is already on screen. Focusing a field must not scroll
 * the phone or the sheet — the browser reveals the caret and the drawer jumps.
 */
function rememberDrawerScroll(field: HTMLElement) {
  const pinned: Array<{ node: HTMLElement; top: number; left: number }> = [];
  let node: HTMLElement | null = field.parentElement;
  while (node) {
    pinned.push({ node, top: node.scrollTop, left: node.scrollLeft });
    node = node.parentElement;
  }
  return { pinned, x: window.scrollX, y: window.scrollY };
}

function restoreDrawerScroll(
  snap: ReturnType<typeof rememberDrawerScroll> | null
) {
  if (!snap) return;
  for (const item of snap.pinned) {
    if (item.node.scrollTop !== item.top) item.node.scrollTop = item.top;
    if (item.node.scrollLeft !== item.left) item.node.scrollLeft = item.left;
  }
  if (window.scrollX !== snap.x || window.scrollY !== snap.y) {
    window.scrollTo(snap.x, snap.y);
  }
}

let drawerScrollSnap: ReturnType<typeof rememberDrawerScroll> | null = null;
let releaseDrawerHold: (() => void) | null = null;

export function holdDrawerStill(event: FocusEvent<HTMLInputElement>) {
  releaseDrawerHold?.();
  const field = event.currentTarget;
  const snap = drawerScrollSnap ?? rememberDrawerScroll(field);
  drawerScrollSnap = null;
  const restore = () => restoreDrawerScroll(snap);
  restore();
  const onScroll = () => {
    if (document.activeElement !== field) return;
    restore();
  };
  window.addEventListener('scroll', onScroll, true);
  const frame = window.requestAnimationFrame(restore);
  const timers = [
    window.setTimeout(restore, 50),
    window.setTimeout(restore, 320),
  ];
  const release = () => {
    window.cancelAnimationFrame(frame);
    for (const timer of timers) window.clearTimeout(timer);
    window.removeEventListener('scroll', onScroll, true);
    field.removeEventListener('blur', release);
    if (releaseDrawerHold === release) releaseDrawerHold = null;
  };
  releaseDrawerHold = release;
  field.addEventListener('blur', release);
}

export function focusFieldStill(event: PointerEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (document.activeElement === input) return;
  drawerScrollSnap = rememberDrawerScroll(input);
  if (event.pointerType !== 'mouse') return;
  event.preventDefault();
  input.focus({ preventScroll: true });
}
