'use client';

import { useEffect, useState } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  fetchOwnedScarceByTokenId,
  fetchOwnedScarceForCollection,
  fetchOwnedScarceForSourcePost,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { PostScarceCta } from '@/features/scarces/post-scarce-cta';
import { ScarceBidSheet } from '@/features/scarces/scarce-bid-sheet';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { ScarceTransferSheet } from '@/features/scarces/scarce-transfer-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { usePostScarceEmbed } from '@/features/scarces/use-post-scarce-embed';
import { accountIdsEqual } from '@/lib/account-match';

/**
 * Article reader commerce. Mint, Buy, and Bid open their sheets above the
 * reader. Drop, Series, Hub, and Market stay links inside the row.
 */
export function PortfolioWritingArticleCommerce({ post }: { post: PostRow }) {
  const { accountId: viewerId, isConnected } = useAppWallet();
  const { embed, rootRef, retry } = usePostScarceEmbed(post, { force: true });
  const [buyOpen, setBuyOpen] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [owned, setOwned] = useState<OwnedScarceItem | null>(null);
  const [ownedTick, setOwnedTick] = useState(0);

  const collectionId =
    embed?.collectionId?.trim() || embed?.latest?.collectionId?.trim() || '';
  const tokenId = embed?.tokenId?.trim() || '';
  const sourcePostPath = `${post.accountId}/post/${post.postId}`;
  const status = embed?.status ?? 'none';

  useEffect(() => {
    if (!isConnected || !viewerId || status === 'none') {
      setOwned(null);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        let item: OwnedScarceItem | null = null;
        if (tokenId) {
          item = await fetchOwnedScarceByTokenId(viewerId, tokenId);
        }
        if (!item && collectionId) {
          item = await fetchOwnedScarceForCollection(viewerId, collectionId);
        }
        if (!item) {
          item = await fetchOwnedScarceForSourcePost(viewerId, sourcePostPath);
        }
        if (!cancelled) setOwned(item);
      } catch {
        if (!cancelled) setOwned(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    collectionId,
    isConnected,
    ownedTick,
    sourcePostPath,
    status,
    tokenId,
    viewerId,
  ]);

  if (!embed || embed.status === 'none') {
    return null;
  }

  const canSell = Boolean(
    isConnected && owned != null && owned.listingKind == null
  );
  const canTransfer = Boolean(
    isConnected && owned != null && ownedScarceCanTransfer(owned)
  );
  const sellListed = Boolean(
    isConnected && owned != null && owned.listingKind != null
  );
  const refreshOwned = () => {
    retry();
    setOwnedTick((tick) => tick + 1);
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
        canSell={canSell}
        onSell={() => setSellOpen(true)}
        canTransfer={canTransfer}
        onTransfer={() => setTransferOpen(true)}
        sellListed={sellListed}
        alreadyOwnsEdition={owned != null}
        onBuy={() => setBuyOpen(true)}
        onBid={() => setBidOpen(true)}
      />
      <ScarceBuySheet
        open={buyOpen}
        post={buyOpen ? post : null}
        embed={embed}
        alreadyOwnsEdition={owned != null}
        onOpenChange={setBuyOpen}
        onPurchased={refreshOwned}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceBidSheet
        open={bidOpen}
        post={bidOpen ? post : null}
        embed={embed}
        onOpenChange={setBidOpen}
        onBid={refreshOwned}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceSellSheet
        open={sellOpen && owned != null}
        item={owned}
        sellerAccountId={viewerId}
        onOpenChange={setSellOpen}
        onListed={refreshOwned}
        zIndex={SCARCE_Z.commerceOverListen}
      />
      <ScarceTransferSheet
        open={transferOpen && owned != null}
        item={owned}
        ownerAccountId={viewerId}
        onOpenChange={setTransferOpen}
        onTransferred={refreshOwned}
        zIndex={SCARCE_Z.commerceOverListen}
      />
    </div>
  );
}
