'use client';

import { useLayoutEffect, type RefObject } from 'react';
import {
  scrollOpenedPostUnderHeader,
  threadContentInset,
} from '@/lib/thread-open';

/**
 * A reply opens with its parents above it. The opened post is the anchor:
 * height added above it is scrolled in the same layout pass, before paint,
 * so the post is already under the header when the sheet appears. A later
 * scroll is the reader's.
 */
export function useLandOpenedPost(
  openedPostRef: RefObject<HTMLElement | null>,
  postId: string | null | undefined,
  hasParent: boolean
) {
  useLayoutEffect(() => {
    if (!postId || !hasParent) return;
    const node = openedPostRef.current;
    if (!node) return;
    const scroller = node.closest('.os-app-screen-body');
    if (!(scroller instanceof HTMLElement)) return;

    let readerMoved = false;
    let aligning = false;
    const align = () => {
      if (readerMoved || aligning) return;
      aligning = true;
      try {
        // A short thread has empty viewport below it, so one spacer step
        // never creates scroll room and the opened reply stays under its
        // parent. Grow until the reply meets the header, or the spacer caps.
        for (let pass = 0; pass < 4; pass += 1) {
          scrollOpenedPostUnderHeader(node);
          const goal =
            scroller.getBoundingClientRect().top +
            threadContentInset(scroller, node);
          const deficit = node.getBoundingClientRect().top - goal;
          if (Math.abs(deficit) <= 1) break;
          let spacer = scroller.querySelector<HTMLElement>(
            '[data-thread-land-spacer]'
          );
          const max = Math.max(
            0,
            scroller.scrollHeight - scroller.clientHeight
          );
          const room = max - scroller.scrollTop;
          let content = 0;
          for (const child of scroller.children) {
            if (!(child instanceof HTMLElement) || child === spacer) continue;
            const style = getComputedStyle(child);
            content +=
              child.offsetHeight +
              (Number.parseFloat(style.marginTop) || 0) +
              (Number.parseFloat(style.marginBottom) || 0);
          }
          const unused = Math.max(0, scroller.clientHeight - content);
          const needed = deficit - room + unused;
          if (needed > 1) {
            if (!spacer) {
              spacer = document.createElement('div');
              spacer.setAttribute('data-thread-land-spacer', '');
              spacer.setAttribute('aria-hidden', 'true');
              scroller.appendChild(spacer);
            }
            const height = Number.parseFloat(spacer.style.height) || 0;
            const next = Math.min(window.innerHeight, height + needed);
            if (next <= height + 1) break;
            spacer.style.height = `${Math.ceil(next)}px`;
            continue;
          }
          if (deficit < -1 && spacer) {
            const height = Number.parseFloat(spacer.style.height) || 0;
            const next = Math.max(0, height + deficit);
            spacer.style.height = `${Math.ceil(next)}px`;
            if (next <= 1) spacer.remove();
            continue;
          }
          break;
        }
      } finally {
        aligning = false;
      }
    };
    // The sheet resets scrollTop after this layout pass. Land once that
    // reset has run, still before paint, so the appear shows the reply
    // already under the header.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) align();
    });

    const markReader = () => {
      readerMoved = true;
    };
    scroller.addEventListener('wheel', markReader, { passive: true });
    scroller.addEventListener('touchmove', markReader, { passive: true });
    const context = node.parentElement;
    const observer =
      typeof ResizeObserver === 'undefined' || !context
        ? null
        : new ResizeObserver(() => align());
    if (context) observer?.observe(context);
    return () => {
      cancelled = true;
      observer?.disconnect();
      scroller.removeEventListener('wheel', markReader);
      scroller.removeEventListener('touchmove', markReader);
      scroller.querySelector('[data-thread-land-spacer]')?.remove();
    };
  }, [hasParent, openedPostRef, postId]);
}
