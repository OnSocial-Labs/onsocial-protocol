'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { accountIdsEqual } from '@/lib/account-match';
import {
  isArticlePost,
  shouldShowWritingLink,
} from '@/lib/article-post-payload';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { writingPath } from '@/lib/overlay-routes';

const WRITING_PRESENCE_LIMIT = 24;
const presenceCache = new Map<string, boolean>();

function useAccountHasArticles(
  accountId: string,
  enabled: boolean
): boolean | null {
  const cached = enabled ? (presenceCache.get(accountId) ?? null) : null;
  const [fetched, setFetched] = useState<{
    id: string;
    value: boolean;
  } | null>(null);
  const resolved =
    cached ?? (fetched?.id === accountId ? fetched.value : null);

  useEffect(() => {
    if (!enabled || presenceCache.has(accountId)) return;
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.feed
      .recent({
        author: accountId,
        limit: WRITING_PRESENCE_LIMIT,
        section: 'posts',
      })
      .then((page) => {
        const next = page.items.some(isArticlePost);
        presenceCache.set(accountId, next);
        if (!cancelled) setFetched({ id: accountId, value: next });
      })
      .catch(() => {
        if (!cancelled) setFetched({ id: accountId, value: false });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, enabled]);

  return enabled ? resolved : null;
}

/** Owner always; visitors only once articles are confirmed. */
export function useShowPortfolioWritingLink(accountId: string): boolean {
  const { accountId: viewerId } = useAppWallet();
  const isOwner = Boolean(viewerId && accountIdsEqual(viewerId, accountId));
  const hasArticles = useAccountHasArticles(accountId, !isOwner);
  return shouldShowWritingLink({ isOwner, hasArticles });
}

/** Presentational Writing door — parent owns visibility. */
export function PortfolioWritingAnchor({ accountId }: { accountId: string }) {
  return (
    <Link
      href={writingPath(accountId)}
      className="portfolio-about-link"
      scroll={false}
    >
      Writing
    </Link>
  );
}

/** Face / About entry to the Writing shelf. Hidden for visitors with no articles. */
export function PortfolioWritingLink({ accountId }: { accountId: string }) {
  const show = useShowPortfolioWritingLink(accountId);
  if (!show) return null;
  return <PortfolioWritingAnchor accountId={accountId} />;
}
