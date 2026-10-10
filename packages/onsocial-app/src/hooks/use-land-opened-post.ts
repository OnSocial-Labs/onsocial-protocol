'use client';

import { useLayoutEffect, type RefObject } from 'react';
import { scrollOpenedPostUnderHeader } from '@/lib/thread-open';

/**
 * A reply opens with its parents above it. Land on the post that was opened,
 * and keep it there while those parents finish laying out. A later scroll is
 * the reader's.
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
    const align = () => {
      if (readerMoved) return;
      scrollOpenedPostUnderHeader(node);
      // A short thread pins to the bottom before the opened post reaches the
      // header. A spacer gives that last step room, then the scroll lands.
      const inset = Number.parseFloat(getComputedStyle(scroller).paddingTop) || 0;
      const goal = scroller.getBoundingClientRect().top + inset;
      const deficit = node.getBoundingClientRect().top - goal;
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const room = max - scroller.scrollTop;
      const needed = deficit - room;
      let spacer = scroller.querySelector<HTMLElement>(
        '[data-thread-land-spacer]'
      );
      if (needed > 1) {
        if (!spacer) {
          spacer = document.createElement('div');
          spacer.setAttribute('data-thread-land-spacer', '');
          spacer.setAttribute('aria-hidden', 'true');
          scroller.appendChild(spacer);
        }
        const height = Number.parseFloat(spacer.style.height) || 0;
        const next = Math.min(window.innerHeight, height + needed);
        if (next > height + 1) {
          spacer.style.height = `${Math.ceil(next)}px`;
          scrollOpenedPostUnderHeader(node);
        }
        return;
      }
      if (deficit < -1 && spacer) {
        const height = Number.parseFloat(spacer.style.height) || 0;
        const next = Math.max(0, height + deficit);
        spacer.style.height = `${Math.ceil(next)}px`;
        if (next <= 1) spacer.remove();
        scrollOpenedPostUnderHeader(node);
      }
    };
    align();

    // Parents and media finish after the first paint. Keep the opened post
    // under the header until the reader actually scrolls.
    let frames = 0;
    let follow = 0;
    const pump = () => {
      follow = 0;
      if (readerMoved || frames >= 12) return;
      frames += 1;
      align();
      follow = requestAnimationFrame(pump);
    };
    follow = requestAnimationFrame(pump);

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
      if (follow !== 0) cancelAnimationFrame(follow);
      observer?.disconnect();
      scroller.removeEventListener('wheel', markReader);
      scroller.removeEventListener('touchmove', markReader);
      scroller.querySelector('[data-thread-land-spacer]')?.remove();
    };
  }, [hasParent, openedPostRef, postId]);
}
