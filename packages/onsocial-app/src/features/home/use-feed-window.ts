'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  FEED_WINDOW_ESTIMATE_PX,
  FEED_WINDOW_MIN_COUNT,
  FEED_WINDOW_OVERSCAN_PX,
  FeedWindowSizeCache,
  buildFeedWindowOffsets,
  feedWindowRangeForScroll,
  feedWindowRangeWithPinned,
  translateFeedWindowRange,
  type FeedWindowRange,
} from '@/features/home/feed-window';
import {
  captureVisibleFeedAnchor,
  restoreFeedAnchor,
  type FeedScrollAnchor,
} from '@/features/home/home-feed-scroll-anchor';

/**
 * Nearest scrollable ancestor. The list never owns its scroller (home screen
 * body, profile drawer, …), so windowing detects it — and stays off when no
 * scroller exists rather than guessing at the document.
 */
export function findFeedWindowScrollRoot(
  host: HTMLElement | null
): HTMLElement | null {
  let node = host?.parentElement ?? null;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

export type UseFeedWindowOptions = {
  /** Block keys in render order — the window translates across mutations. */
  keys: readonly string[];
  /** List root element, used to detect the scroll container. */
  hostRef: RefObject<HTMLElement | null>;
  /** Shared cache (session persistence); an internal one is used otherwise. */
  sizeCache?: FeedWindowSizeCache;
  /** Force this key's row to render even outside the window. */
  pinnedKey?: string | null;
  enabled?: boolean;
  estimate?: number;
  overscan?: number;
  minCount?: number;
};

export type UseFeedWindowResult = {
  /** False before mount, under `minCount`, or without a scroll root. */
  windowed: boolean;
  start: number;
  end: number;
  topSpacer: number;
  bottomSpacer: number;
  /** Stable per-key callback ref registering a row for measurement. */
  registerRow: (key: string) => (el: HTMLElement | null) => void;
};

/**
 * Windows a keyed feed list: renders only the rows near the viewport plus
 * spacers standing in for the rest. First render always paints everything
 * (SSR/hydration parity); the window engages after mount once the scroll
 * root and first measurements land.
 *
 * Scroll stability: a height change above the viewport is captured as a
 * feed anchor before the re-render and restored before paint, so media
 * finishing loading never shifts what the reader is looking at.
 */
export function useFeedWindow({
  keys,
  hostRef,
  sizeCache,
  pinnedKey = null,
  enabled = true,
  estimate = FEED_WINDOW_ESTIMATE_PX,
  overscan = FEED_WINDOW_OVERSCAN_PX,
  minCount = FEED_WINDOW_MIN_COUNT,
}: UseFeedWindowOptions): UseFeedWindowResult {
  const internalCacheRef = useRef<FeedWindowSizeCache | null>(null);
  if (internalCacheRef.current == null) {
    internalCacheRef.current = new FeedWindowSizeCache();
  }
  const cache = sizeCache ?? internalCacheRef.current;

  const [offsetsVersion, setOffsetsVersion] = useState(0);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [rangeState, setRangeState] = useState<
    | (FeedWindowRange & {
        keys: readonly string[];
      })
    | null
  >(null);

  const offsets = useMemo(
    () =>
      buildFeedWindowOffsets(
        keys.length,
        (index) => cache.get(keys[index]!) ?? estimate
      ),
    // offsetsVersion invalidates after a measurement lands in the cache
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keys, offsetsVersion, estimate, cache]
  );
  const offsetsRef = useRef(offsets);
  useLayoutEffect(() => {
    offsetsRef.current = offsets;
  });

  const keysRef = useRef(keys);
  useLayoutEffect(() => {
    keysRef.current = keys;
  });

  const rootRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    rootRef.current = root;
  });

  const overscanRef = useRef(overscan);
  useLayoutEffect(() => {
    overscanRef.current = overscan;
  });

  const syncRange = useCallback(() => {
    const node = rootRef.current;
    if (!node) return;
    const next = feedWindowRangeForScroll({
      offsets: offsetsRef.current.offsets,
      scrollTop: node.scrollTop,
      viewportHeight: node.clientHeight,
      overscan: overscanRef.current,
    });
    setRangeState((prev) =>
      prev &&
      prev.keys === keysRef.current &&
      prev.start === next.start &&
      prev.end === next.end
        ? prev
        : { ...next, keys: keysRef.current }
    );
  }, []);

  // Scroll root detection — every commit, cheap ancestor walk. State bail-out
  // keeps this free once settled; the host node can change without hostRef
  // changing identity, so a deps array would miss it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const detected = findFeedWindowScrollRoot(hostRef.current);
    setRoot((prev) => (prev === detected ? prev : detected));
  });

  // Scroll + viewport-resize drive the range, rAF-coalesced.
  useEffect(() => {
    if (!root) return undefined;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        syncRange();
      });
    };
    root.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    syncRange();
    return () => {
      root.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [root, syncRange]);

  const rowKeyByEl = useRef(new Map<Element, string>());
  const rowCallbacks = useRef(
    new Map<string, (el: HTMLElement | null) => void>()
  );
  const rowObserverRef = useRef<ResizeObserver | null>(null);
  const pendingMeasureAnchorRef = useRef<FeedScrollAnchor | null>(null);

  // Row measurement. Observes from first render (pre-windowing) so the cache
  // is warm by the time the window engages.
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = rowKeyByEl.current.get(entry.target);
        if (!key) continue;
        const borderBox = Array.isArray(entry.borderBoxSize)
          ? entry.borderBoxSize[0]
          : undefined;
        const px = borderBox ? borderBox.blockSize : entry.contentRect.height;
        if (cache.set(key, px)) changed = true;
      }
      if (changed) {
        // Heights in the DOM already moved; remember where the reader is so
        // the spacer correction below can hold that row in place.
        pendingMeasureAnchorRef.current ??= captureVisibleFeedAnchor(
          rootRef.current
        );
        setOffsetsVersion((version) => version + 1);
      }
    });
    rowObserverRef.current = observer;
    for (const el of rowKeyByEl.current.keys()) observer.observe(el);
    return () => {
      rowObserverRef.current = null;
      observer.disconnect();
    };
  }, [cache]);

  // After a measurement-driven re-render, put the anchored row back at its
  // viewport offset, then re-derive the range from the fresh offsets.
  useLayoutEffect(() => {
    if (offsetsVersion === 0) return;
    const pending = pendingMeasureAnchorRef.current;
    pendingMeasureAnchorRef.current = null;
    if (pending) restoreFeedAnchor(rootRef.current, pending);
    syncRange();
  }, [offsetsVersion, syncRange]);

  // List mutations (append / prepend / re-rank / filter) shift offsets —
  // re-derive the range before paint from the untouched scroll position.
  useLayoutEffect(() => {
    syncRange();
  }, [keys, syncRange]);

  const registerRow = useCallback((key: string) => {
    let callback = rowCallbacks.current.get(key);
    if (!callback) {
      callback = (el: HTMLElement | null) => {
        const els = rowKeyByEl.current;
        if (el) {
          els.set(el, key);
          rowObserverRef.current?.observe(el);
        } else {
          for (const [node, nodeKey] of els) {
            if (nodeKey === key) {
              rowObserverRef.current?.unobserve(node);
              els.delete(node);
              break;
            }
          }
        }
      };
      rowCallbacks.current.set(key, callback);
    }
    return callback;
  }, []);

  // The stored range keys lag one render behind a list mutation; translate
  // so the same rows stay mounted until the pre-paint resync lands.
  const baseRange =
    rangeState == null
      ? null
      : rangeState.keys === keys
        ? rangeState
        : translateFeedWindowRange(rangeState, rangeState.keys, keys);

  const windowed =
    enabled && root != null && baseRange != null && keys.length >= minCount;

  const pinnedIndex = pinnedKey != null ? keys.indexOf(pinnedKey) : -1;
  const slice =
    windowed && baseRange
      ? feedWindowRangeWithPinned(baseRange, pinnedIndex)
      : { start: 0, end: keys.length };

  return {
    windowed,
    start: slice.start,
    end: slice.end,
    topSpacer: windowed ? offsets.offsets[slice.start]! : 0,
    bottomSpacer: windowed ? offsets.total - offsets.offsets[slice.end]! : 0,
    registerRow,
  };
}
