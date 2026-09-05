'use client';

import { useCallback, useMemo } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useOptionalPortfolioPostPeeks } from '@/contexts/portfolio-post-peeks-context';
import { useRegisterWritingCompose } from '@/contexts/writing-compose-context';
import { usePersonalComposer } from '@/features/home/use-personal-composer';
import { accountIdsEqual } from '@/lib/account-match';
import { toProfilePostPeek } from '@/lib/fetch-profile-peeks';

interface PortfolioPersonalComposerProps {
  pageAccountId: string;
}

/**
 * Owner-only personal compose on portfolio — registers the dock pen and
 * mounts the shared composer sheet. Confirmed roots refresh drawer peeks.
 */
export function PortfolioPersonalComposer({
  pageAccountId,
}: PortfolioPersonalComposerProps) {
  const { accountId, isConnected } = useAppWallet();
  const peeks = useOptionalPortfolioPostPeeks();
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
      peeks?.prependPostPeek(toProfilePostPeek(post));
    },
    [pageAccountId, peeks]
  );

  const { sheet, openPost } = usePersonalComposer({
    registerPen: Boolean(isOwner),
    destinationLabel,
    onConfirmed,
  });

  useRegisterWritingCompose(isOwner ? openPost : null);

  if (!isOwner) return null;
  return sheet;
}
