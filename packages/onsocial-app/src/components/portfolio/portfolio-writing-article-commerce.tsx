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
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { ScarceTransferSheet } from '@/features/scarces/scarce-transfer-sheet';
import { ownedScarceCanTransfer } from '@/features/scarces/scarce-transfer';
import { usePostScarceEmbed } from '@/features/scarces/use-post-scarce-embed';
import { accountIdsEqual } from '@/lib/account-match';

/**
 * Article reader commerce. Mint, Buy, and Bid open their sheets above the
 * reader. Drop, Hub, and Market stay links inside the row. Series stays on the drop.
 */
export function PortfolioWritingArticleCommerce({ post }: { post: PostRow }) {
  const actionZ = postLayerOverlayZ(usePostLayerOwnerZ()).sheet;
  const { accountId: viewerId, isConnected } = useAppWallet();
  const { embed, rootRef, retry } = usePostScarceEmbed(post, { force: true });
  const [buyOpen, setBuyOpen] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [ownedState, setOwnedState] = useState<{
    key: string;
    item: OwnedScarceItem | null;
  } | null>(null);
  const [ownedTick, setOwnedTick] = useState(0);

  const collectionId =
    embed?.collectionId?.trim() || embed?.latest?.collectionId?.trim() || '';
  const tokenId = embed?.tokenId?.trim() || '';
  const sourcePostPath = `${post.accountId}/post/${post.postId}`;
  const status = embed?.status ?? 'none';
  const ownershipKey =
    isConnected && viewerId && status !== 'none'
      ? `${viewerId}|${sourcePostPath}|${tokenId}|${collectionId}|${ownedTick}`
      : null;

  useEffect(() => {
    if (!ownershipKey || !viewerId) return;
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
        if (!cancelled) setOwnedState({ key: ownershipKey, item });
      } catch {
        if (!cancelled) setOwnedState({ key: ownershipKey, item: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId, ownershipKey, sourcePostPath, tokenId, viewerId]);

  const owned =
    ownershipKey && ownedState?.key === ownershipKey ? ownedState.item : null;

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
      className="article-read-footer-lead"
      ref={(node) => {
        rootRef.current = node;
      }}
    >
      <PostScarceCta
        embed={embed}
        isAuthor={Boolean(
          viewerId && accountIdsEqual(viewerId, post.accountId)
        )}
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
        zIndex={actionZ}
      />
      <ScarceBidSheet
        open={bidOpen}
        post={bidOpen ? post : null}
        embed={embed}
        onOpenChange={setBidOpen}
        onBid={refreshOwned}
        zIndex={actionZ}
      />
      <ScarceSellSheet
        open={sellOpen && owned != null}
        item={owned}
        sellerAccountId={viewerId}
        onOpenChange={setSellOpen}
        onListed={refreshOwned}
        zIndex={actionZ}
      />
      <ScarceTransferSheet
        open={transferOpen && owned != null}
        item={owned}
        ownerAccountId={viewerId}
        onOpenChange={setTransferOpen}
        onTransferred={refreshOwned}
        zIndex={actionZ}
      />
    </div>
  );
}
