'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { getAppLenis } from '@/lib/app-lenis-registry';
import {
  HOME_FEED_PULL_IDLE,
  HOME_FEED_PULL_REFRESH_WAIT_MS,
  homeFeedPullOnRefreshingFlag,
  homeFeedPullScrollTop,
  stepHomeFeedPull,
  type HomeFeedPullInput,
  type HomeFeedPullState,
} from '@/features/home/home-feed-pull-refresh';

export type HomeFeedPullListener = (state: HomeFeedPullState) => void;

function readScrollTop(node: HTMLElement): number {
  return homeFeedPullScrollTop(node.scrollTop, getAppLenis(node)?.scroll ?? 0);
}

/**
 * Touch / pen drag at the top of Home. A mouse drag is left alone so it
 * does not fight text selection or the desktop wheel. Releasing past the
 * trigger calls `onRefresh` (the existing soft head reload).
 */
export function useHomeFeedPullRefresh({
  scrollRootRef,
  refreshing,
  loading,
  loadingMore,
  hasRows,
  onRefresh,
}: {
  scrollRootRef: RefObject<HTMLElement | null>;
  refreshing: boolean;
  loading: boolean;
  loadingMore: boolean;
  hasRows: boolean;
  onRefresh: () => void;
}): { subscribe: (listener: HomeFeedPullListener) => () => void } {
  const stateRef = useRef<HomeFeedPullState>(HOME_FEED_PULL_IDLE);
  const [pullEpoch, setPullEpoch] = useState(0);
  const sawRefreshRef = useRef(false);
  const listenersRef = useRef(new Set<HomeFeedPullListener>());
  const inputRef = useRef<Omit<HomeFeedPullInput, 'scrollTop'>>({
    refreshing,
    loading,
    loadingMore,
    hasRows,
  });
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    inputRef.current = { refreshing, loading, loadingMore, hasRows };
    onRefreshRef.current = onRefresh;
  }, [hasRows, loading, loadingMore, onRefresh, refreshing]);

  const publish = useCallback((next: HomeFeedPullState) => {
    stateRef.current = next;
    for (const listener of listenersRef.current) listener(next);
  }, []);

  const subscribe = useCallback((listener: HomeFeedPullListener) => {
    listenersRef.current.add(listener);
    listener(stateRef.current);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const node = scrollRootRef.current;
    if (!(node instanceof HTMLElement)) return;
    let pointerId: number | null = null;

    const apply = (
      event: Parameters<typeof stepHomeFeedPull>[1]
    ): ReturnType<typeof stepHomeFeedPull> => {
      const step = stepHomeFeedPull(stateRef.current, event);
      if (step.state !== stateRef.current) publish(step.state);
      if (step.refresh) {
        onRefreshRef.current();
        // Re-run the settle effect. The reload flag is still false this turn.
        setPullEpoch((value) => value + 1);
      }
      return step;
    };

    const release = (event: PointerEvent) => {
      if (!node.hasPointerCapture(event.pointerId)) return;
      node.releasePointerCapture(event.pointerId);
    };

    let tracking = false;
    const stopTracking = () => {
      if (!tracking) return;
      tracking = false;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
    const startTracking = () => {
      if (tracking) return;
      tracking = true;
      window.addEventListener('pointermove', onMove, {
        passive: false,
        capture: true,
      });
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
    };

    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || event.button !== 0) return;
      if (pointerId != null) return;
      if (node.closest('[data-feed-session="covered"]')) return;
      const step = apply({
        type: 'down',
        y: event.clientY,
        input: { ...inputRef.current, scrollTop: readScrollTop(node) },
      });
      if (step.state.phase !== 'pending') return;
      pointerId = event.pointerId;
      startTracking();
    };

    function onMove(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      const step = apply({
        type: 'move',
        y: event.clientY,
        scrollTop: readScrollTop(node),
      });
      if (step.state.phase !== 'pulling') release(event);
      if (step.state.phase === 'idle' || step.state.phase === 'refreshing') {
        pointerId = null;
        stopTracking();
        return;
      }
      if (!step.claim || !event.cancelable) return;
      event.preventDefault();
      if (node.hasPointerCapture(event.pointerId)) return;
      try {
        node.setPointerCapture(event.pointerId);
      } catch {
        // The pointer can already be gone. The drag still tracks moves.
      }
    }

    function onUp(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      release(event);
      stopTracking();
      apply({
        type: 'up',
        input: { ...inputRef.current, scrollTop: readScrollTop(node) },
      });
    }

    function onCancel(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      release(event);
      stopTracking();
      apply({ type: 'cancel' });
    }

    node.addEventListener('pointerdown', onDown);
    return () => {
      pointerId = null;
      stopTracking();
      node.removeEventListener('pointerdown', onDown);
    };
  }, [publish, scrollRootRef]);

  useEffect(() => {
    const next = homeFeedPullOnRefreshingFlag(
      stateRef.current,
      refreshing,
      sawRefreshRef.current
    );
    sawRefreshRef.current = next.sawRefresh;
    if (next.state !== stateRef.current) publish(next.state);
    if (!next.armWait) return;
    const timer = window.setTimeout(() => {
      if (stateRef.current.phase !== 'refreshing') return;
      if (sawRefreshRef.current) return;
      sawRefreshRef.current = false;
      publish(HOME_FEED_PULL_IDLE);
    }, HOME_FEED_PULL_REFRESH_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [publish, pullEpoch, refreshing]);

  return { subscribe };
}
