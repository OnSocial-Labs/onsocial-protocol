'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

/** At the top — chrome stays loud so the social row is visible on arrival. */
export const ARTICLE_READ_TOP_PX = 0.015;
/** Near the end — tools return without a second social row. */
export const ARTICLE_READ_END_PX = 0.92;
const QUIET_DOWN_PX = 28;
const WAKE_UP_PX = 20;
const ACCUM_MAX = 48;

export function articleReadProgress(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const room = Math.max(0, scrollHeight - clientHeight);
  if (room <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / room));
}

export function nextArticleChromeQuiet({
  accum,
  deltaY,
  progress,
  quiet,
}: {
  accum: number;
  deltaY: number;
  progress: number;
  quiet: boolean;
}): { accum: number; quiet: boolean } {
  if (progress <= ARTICLE_READ_TOP_PX || progress >= ARTICLE_READ_END_PX) {
    return { accum: 0, quiet: false };
  }
  const next = Math.max(-ACCUM_MAX, Math.min(ACCUM_MAX, accum + deltaY));
  if (next > QUIET_DOWN_PX) return { accum: 0, quiet: true };
  if (next < -WAKE_UP_PX) return { accum: 0, quiet: false };
  return { accum: next, quiet };
}

export function articlePageScrollable(
  scrollHeight: number,
  clientHeight: number
): boolean {
  return scrollHeight - clientHeight > 8;
}

/** Tools sit with the jacket: on at rest, off while reading, back on wake. */
export function articleWakeFooterVisible(quiet: boolean): boolean {
  return !quiet;
}

export function isArticleChromeTapTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return false;
  }
  return !target.closest(
    'a, button, input, textarea, select, label, [role="button"], [role="link"]'
  );
}

/** Dismissing the write dock is a tap on the page — do not fold chrome with it. */
export const ARTICLE_CHROME_TAP_SUPPRESS_MS = 400;

export function shouldIgnoreArticleChromeTap(
  holdLoud: boolean,
  now: number,
  suppressUntil: number
): boolean {
  return holdLoud || now < suppressUntil;
}

/**
 * Article document chrome — fold header on scroll down, wake on scroll up
 * or tap, 0–1 reading progress. Same hide/show muscle as home dock + book
 * jacket quiet. Title never enters the jacket.
 *
 * `holdLoud` — reply write dock is up. Stay loud, ignore page taps; after
 * it closes, ignore the dismiss tap so the icon row comes back.
 */
export function useArticleReadChrome(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  holdLoud = false
): {
  chromeQuiet: boolean;
  progress: number;
  wakeFooter: boolean;
  onChromeTap: () => void;
  revealChrome: () => void;
} {
  const [chromeQuiet, setChromeQuiet] = useState(false);
  const [progress, setProgress] = useState(0);
  const accumRef = useRef(0);
  const lastTopRef = useRef(0);
  const holdLoudRef = useRef(holdLoud);
  const suppressTapUntilRef = useRef(0);

  const syncFromRoot = useCallback((root: HTMLElement, fromResize = false) => {
    const next = articleReadProgress(
      root.scrollTop,
      root.scrollHeight,
      root.clientHeight
    );
    const deltaY = root.scrollTop - lastTopRef.current;
    lastTopRef.current = root.scrollTop;
    setProgress(next);
    if (fromResize || holdLoudRef.current) {
      if (holdLoudRef.current) {
        accumRef.current = 0;
        setChromeQuiet(false);
      }
      return;
    }
    setChromeQuiet((quiet) => {
      const result = nextArticleChromeQuiet({
        accum: accumRef.current,
        deltaY,
        progress: next,
        quiet,
      });
      accumRef.current = result.accum;
      return result.quiet;
    });
  }, []);

  const onChromeTap = useCallback(() => {
    accumRef.current = 0;
    setChromeQuiet((quiet) => !quiet);
  }, []);

  const revealChrome = useCallback(() => {
    accumRef.current = 0;
    setChromeQuiet(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setChromeQuiet(false);
      setProgress(0);
      accumRef.current = 0;
      lastTopRef.current = 0;
      return;
    }

    let cancelled = false;
    let attached: HTMLElement | null = null;
    let attachedRo: ResizeObserver | null = null;
    let frame = 0;

    const onScroll = () => {
      if (attached) syncFromRoot(attached);
    };

    const onClick = (event: MouseEvent) => {
      if (
        shouldIgnoreArticleChromeTap(
          holdLoudRef.current,
          performance.now(),
          suppressTapUntilRef.current
        )
      ) {
        return;
      }
      if (!isArticleChromeTapTarget(event.target)) return;
      if (window.getSelection()?.toString().trim()) return;
      onChromeTap();
    };

    const bind = (root: HTMLElement) => {
      attached = root;
      lastTopRef.current = root.scrollTop;
      syncFromRoot(root);
      root.addEventListener('scroll', onScroll, { passive: true });
      root.addEventListener('click', onClick);
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => syncFromRoot(root, true));
        ro.observe(root);
        for (const child of root.children) ro.observe(child);
        attachedRo = ro;
      }
    };

    const waitForRoot = () => {
      if (cancelled) return;
      const root = scrollRootRef.current;
      if (!root) {
        frame = window.requestAnimationFrame(waitForRoot);
        return;
      }
      bind(root);
    };

    waitForRoot();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      attached?.removeEventListener('scroll', onScroll);
      attached?.removeEventListener('click', onClick);
      attachedRo?.disconnect();
    };
  }, [enabled, onChromeTap, scrollRootRef, syncFromRoot]);

  useEffect(() => {
    holdLoudRef.current = holdLoud;
    if (!enabled) return;
    revealChrome();
    if (!holdLoud) {
      suppressTapUntilRef.current =
        performance.now() + ARTICLE_CHROME_TAP_SUPPRESS_MS;
    }
  }, [enabled, holdLoud, revealChrome]);

  return {
    chromeQuiet,
    progress,
    wakeFooter: articleWakeFooterVisible(chromeQuiet),
    onChromeTap,
    revealChrome,
  };
}
