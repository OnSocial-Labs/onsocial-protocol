'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';
import {
  isOverlayPostLayerLocation,
  readThreadFocusReplyId,
  THREAD_FOCUS_REPLY_QUERY,
} from '@/lib/post-routes';

const HIGHLIGHT_MS = 2600;
const SCROLL_RETRY_MS = 120;
const SCROLL_MAX_ATTEMPTS = 24;

export function useThreadFocusReply(
  ready: boolean,
  replyPresenceKey: string,
  options?: { onFocusReply?: () => void }
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const pendingPostIdRef = useRef<string | null>(null);
  /* State mirror of the ref — readers (reply windowing) re-render to pin
   * the target row while the focus retry loop looks for it. */
  const [pendingPostId, setPendingPostId] = useState<string | null>(null);
  const clearedQueryRef = useRef(false);
  const onFocusReplyRef = useRef(options?.onFocusReply);
  useEffect(() => {
    onFocusReplyRef.current = options?.onFocusReply;
  });

  const stripFocusQuery = useCallback(() => {
    if (clearedQueryRef.current) return;
    const locationHref =
      typeof window === 'undefined'
        ? ''
        : `${window.location.pathname}${window.location.search}`;
    const overlay = isOverlayPostLayerLocation(pathname, locationHref);
    const source = overlay
      ? new URLSearchParams(window.location.search)
      : searchParams;
    const replyId = readThreadFocusReplyId(source);
    if (!replyId) return;
    clearedQueryRef.current = true;
    pendingPostIdRef.current = replyId;
    setPendingPostId(replyId);
    onFocusReplyRef.current?.();
    const next = new URLSearchParams(source.toString());
    next.delete(THREAD_FOCUS_REPLY_QUERY);
    const qs = next.toString();
    if (overlay) {
      const url = qs
        ? `${window.location.pathname}?${qs}`
        : window.location.pathname;
      History.prototype.replaceState.call(
        window.history,
        window.history.state,
        '',
        url
      );
      return;
    }
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL strip mirrors the pending focus target into state so windowing can pin its row
    stripFocusQuery();
  }, [stripFocusQuery]);

  const requestFocus = useCallback(
    (post: Pick<PostRow, 'accountId' | 'postId'>) => {
      const id = post.postId.trim();
      if (!id) return;
      pendingPostIdRef.current = id;
      setPendingPostId(id);
      // New target — drop any prior pulse so the find effect can run again.
      setHighlightKey(null);
      onFocusReplyRef.current?.();
    },
    []
  );

  const isHighlighted = useCallback(
    (post: PostRow) => highlightKey !== null && highlightKey === postKey(post),
    [highlightKey]
  );

  // Find + scroll. Retries when the reply list remounts (deep-link / confirm).
  // Once highlighting, leave the pulse alone — reconcile must not tear it down.
  useEffect(() => {
    if (!pendingPostId || !ready || highlightKey) return;

    let attempts = 0;
    let retryTimer: number | undefined;
    let cancelled = false;

    const tryFocus = () => {
      if (cancelled) return;
      const targetId = pendingPostIdRef.current;
      if (!targetId) return;
      const node = document.querySelector<HTMLElement>(
        `[data-thread-focus-reply="${CSS.escape(targetId)}"]`
      );
      if (!node) {
        attempts += 1;
        if (attempts < SCROLL_MAX_ATTEMPTS) {
          retryTimer = window.setTimeout(tryFocus, SCROLL_RETRY_MS);
        } else {
          pendingPostIdRef.current = null;
          setPendingPostId(null);
        }
        return;
      }

      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const key = node.dataset.threadFocusKey?.trim() || null;
      if (key) setHighlightKey(key);
      else {
        pendingPostIdRef.current = null;
        setPendingPostId(null);
      }
    };

    tryFocus();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [ready, replyPresenceKey, pendingPostId, highlightKey]);

  // Pulse lifetime — independent of replyPresenceKey / reconcile churn.
  useEffect(() => {
    if (!highlightKey) return;
    const timer = window.setTimeout(() => {
      setHighlightKey(null);
      pendingPostIdRef.current = null;
      setPendingPostId(null);
    }, HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightKey]);

  return { requestFocus, isHighlighted, pendingPostId };
}
