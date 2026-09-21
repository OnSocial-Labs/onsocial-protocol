'use client';

import { useRouter } from 'next/navigation';
import type { PostRow } from '@onsocial/sdk';
import { PostScarceCta } from '@/features/scarces/post-scarce-cta';
import { usePostScarceEmbed } from '@/features/scarces/use-post-scarce-embed';
import { collectionPath } from '@/lib/app-routes';
import { accountIdsEqual } from '@/lib/account-match';
import { useAppWallet } from '@/contexts/app-wallet-context';

/** Listed article — Mint / Buy opens the Drop. Same footing slot as feed. */
export function PortfolioWritingArticleCommerce({ post }: { post: PostRow }) {
  const router = useRouter();
  const { accountId: viewerId } = useAppWallet();
  const { embed, rootRef } = usePostScarceEmbed(post, { force: true });
  const collectionId =
    embed?.collectionId?.trim() || embed?.latest?.collectionId?.trim() || '';

  if (!embed || embed.status === 'none' || !collectionId) {
    return null;
  }

  const openDrop = () => {
    if (!collectionId) return;
    router.push(collectionPath(collectionId));
  };

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
      }}
    >
      <PostScarceCta
        embed={embed}
        isAuthor={Boolean(viewerId && accountIdsEqual(viewerId, post.accountId))}
        authorAccountId={post.accountId}
        onBuy={openDrop}
        onBid={openDrop}
      />
    </div>
  );
}
