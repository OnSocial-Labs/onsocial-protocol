'use client';

import { useCallback, useMemo } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioPostPeeks } from '@/contexts/portfolio-post-peeks-context';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { accountIdsEqual } from '@/lib/account-match';
import { parsePostText } from '@/lib/post-display';

interface PortfolioPersonalComposerProps {
  pageAccountId: string;
}

function peekFromOptimisticPost(post: PostRow) {
  const text = parsePostText(post.value).trim() || '…';
  const kind =
    post.kind && post.kind !== 'text' ? post.kind : null;
  return {
    accountId: post.accountId,
    postId: post.postId,
    text: text.length > 140 ? `${text.slice(0, 139).trimEnd()}…` : text,
    blockTimestamp: post.blockTimestamp,
    kind,
  };
}

/**
 * Owner-only personal compose on portfolio — registers the dock pen and
 * mounts the shared composer sheet. Confirmed roots refresh drawer peeks.
 */
export function PortfolioPersonalComposer({
  pageAccountId,
}: PortfolioPersonalComposerProps) {
  const { accountId, isConnected } = useAppWallet();
  const { prependPostPeek } = usePortfolioPostPeeks();
  const isOwner =
    isConnected &&
    Boolean(accountId) &&
    accountIdsEqual(accountId!, pageAccountId);

  const destinationLabel = useMemo(
    () => `@${pageAccountId} · Public`,
    [pageAccountId]
  );

  const onConfirmed = useCallback(
    (post: PostRow) => {
      // Drawer peeks are author roots + quotes, not replies into other threads.
      if (post.parentPath) return;
      if (post.accountId !== pageAccountId) return;
      prependPostPeek(peekFromOptimisticPost(post));
    },
    [pageAccountId, prependPostPeek]
  );

  const { sheet } = usePersonalComposer({
    registerPen: Boolean(isOwner),
    destinationLabel,
    onConfirmed,
  });

  if (!isOwner) return null;
  return sheet;
}
