'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { postKey } from '@/lib/post-display';
import { readThreadFocusReplyId, THREAD_FOCUS_REPLY_QUERY } from '@/lib/post-routes';

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
  const clearedQueryRef = useRef(false);
  const onFocusReplyRef = useRef(options?.onFocusReply);
  useEffect(() => {
    onFocusReplyRef.current = options?.onFocusReply;
  });

  const stripFocusQuery = useCallback(() => {
    if (clearedQueryRef.current) return;
    const replyId = readThreadFocusReplyId(searchParams);
    if (!replyId) return;
    clearedQueryRef.current = true;
    pendingPostIdRef.current = replyId;
    onFocusReplyRef.current?.();
    const next = new URLSearchParams(searchParams.toString());
    next.delete(THREAD_FOCUS_REPLY_QUERY);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    stripFocusQuery();
  }, [stripFocusQuery]);

  const requestFocus = useCallback((post: Pick<PostRow, 'accountId' | 'postId'>) => {
    const id = post.postId.trim();
    if (!id) return;
    pendingPostIdRef.current = id;
    onFocusReplyRef.current?.();
  }, []);

  const isHighlighted = useCallback(
    (post: PostRow) => highlightKey !== null && highlightKey === postKey(post),
    [highlightKey]
  );

  useEffect(() => {
    const targetId = pendingPostIdRef.current;
    if (!targetId || !ready) return;

    let attempts = 0;
    let highlightTimer: number | undefined;

    const tryFocus = () => {
      const node = document.querySelector<HTMLElement>(
        `[data-thread-focus-reply="${CSS.escape(targetId)}"]`
      );
      if (!node) {
        attempts += 1;
        if (attempts < SCROLL_MAX_ATTEMPTS) {
          window.setTimeout(tryFocus, SCROLL_RETRY_MS);
        }
        return;
      }

      pendingPostIdRef.current = null;
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const key = node.dataset.threadFocusKey?.trim() || null;
      if (key) {
        setHighlightKey(key);
        highlightTimer = window.setTimeout(() => setHighlightKey(null), HIGHLIGHT_MS);
      }
    };

    tryFocus();

    return () => {
      if (highlightTimer) window.clearTimeout(highlightTimer);
    };
  }, [ready, replyPresenceKey]);

  return { requestFocus, isHighlighted };
}
