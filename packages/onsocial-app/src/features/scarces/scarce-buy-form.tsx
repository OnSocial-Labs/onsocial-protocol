'use client';

import { useState } from 'react';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { findLiveListingForPost } from '@/features/market/market-listings';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarcePostPreview } from '@/features/scarces/scarce-post-preview';
import {
  createAppScarcesWalletClient,
  LazyListingNotFoundError,
  resolveLazyListingDepositYocto,
} from '@/features/scarces/scarces-wallet-client';
import { accountIdsEqual } from '@/lib/account-match';
import { nearToYocto } from '@/lib/app-near-rpc';
import { parsePostText } from '@/lib/post-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

export interface ScarceBuySuccessDetail {
  listingId?: string;
  tokenId?: string;
}

interface ScarceBuyFormProps {
  post?: PostRow | null;
  /** Standalone market listing (no feed post). */
  listing?: {
    listingId?: string;
    tokenId?: string;
    status: PostScarceEmbed['status'];
    priceNear?: string;
    title?: string;
    mediaUrl?: string | null;
    creatorId?: string;
    cardBg?: string;
    copies?: number;
    remaining?: number;
  } | null;
  embed?: PostScarceEmbed | null;
  /** Profile display name for text-card preview byline. */
  authorName?: string | null;
  onSuccess?: (detail: ScarceBuySuccessDetail) => void;
}

function formatPriceNear(priceNear: string | undefined): string {
  if (!priceNear?.trim()) return '—';
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear.trim();
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

function titleFromPost(post: PostRow | null | undefined): string | null {
  if (!post) return null;
  const text = parsePostText(post.value).trim();
  if (!text) return null;
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? text;
  if (firstLine.length <= 80) return firstLine;
  const window = firstLine.slice(0, 80);
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace >= 40 ? window.slice(0, lastSpace) : window).trimEnd();
}

export function ScarceBuyForm({
  post = null,
  listing = null,
  embed = null,
  authorName = null,
  onSuccess,
}: ScarceBuyFormProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const status = listing?.status ?? embed?.status ?? 'none';
  const listingId = listing?.listingId ?? embed?.listingId;
  const tokenId = listing?.tokenId ?? embed?.tokenId;
  const priceNear = listing?.priceNear ?? embed?.priceNear;
  const copies = listing?.copies ?? embed?.copies;
  const remaining = listing?.remaining ?? embed?.remaining;
  const title =
    listing?.title?.trim() || titleFromPost(post) || 'Scarce';
  const sellerId = listing?.creatorId ?? post?.accountId;
  const isOwnListing =
    Boolean(viewerAccountId) &&
    Boolean(sellerId) &&
    accountIdsEqual(viewerAccountId!, sellerId!);

  const isLazyBuy = status === 'lazy_listing' && Boolean(listingId);
  const isMarketBuy = status === 'listed' && Boolean(tokenId);
  const isBuyable = !isOwnListing && (isLazyBuy || isMarketBuy);

  const canSubmit = isConnected && !pending && isBuyable;

  async function handleSubmit() {
    setFieldError(null);

    if (isOwnListing) {
      setFieldError('You can’t buy your own listing.');
      return;
    }

    if (!isLazyBuy && !isMarketBuy) {
      setFieldError(
        status === 'lazy_listing' || status === 'listed'
          ? 'Listing isn’t ready yet. Try again in a moment.'
          : 'This scarce isn’t for sale.'
      );
      return;
    }

    setPending(true);
    try {
      // Wallet only — paid scarces must not bootstrap the core social session.
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const fallbackDeposit = priceNear ? nearToYocto(priceNear) : null;

      let response;
      if (isLazyBuy) {
        const depositYocto = await resolveLazyListingDepositYocto(
          listingId!,
          fallbackDeposit
        );
        response = await client.scarces.lazy.purchase(listingId!, {
          depositYocto,
        });
      } else {
        if (!fallbackDeposit || fallbackDeposit === '0') {
          setFieldError('Could not load listing price. Try again.');
          return;
        }
        response = await client.scarces.market.purchase(tokenId!, {
          depositYocto: fallbackDeposit,
        });
      }

      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.buyingScarce,
        successMessage: txToastSuccess.scarcePurchased,
        failureMessage: txToastError.buyScarceFailed,
      });
      if (!confirmed) return;

      if (post) {
        const key = postScarceKey(post.accountId, post.postId);
        // Multi-copy: keep Buy live while the listing still has editions.
        const live =
          isLazyBuy && listingId
            ? await findLiveListingForPost(
                post.accountId,
                post.accountId,
                post.postId
              )
            : null;
        if (live?.listingId) {
          setScarceEmbedOverride(key, {
            status: 'lazy_listing',
            listingId: live.listingId,
            ...(priceNear || live.priceNear
              ? { priceNear: live.priceNear || priceNear }
              : {}),
            ...(live.copies != null ? { copies: live.copies } : {}),
            ...(live.remaining != null ? { remaining: live.remaining } : {}),
            events: [],
          });
        } else {
          setScarceEmbedOverride(key, {
            status: 'sold',
            ...(listingId ? { listingId } : {}),
            ...(tokenId ? { tokenId } : {}),
            ...(priceNear ? { priceNear } : {}),
            events: [],
          });
        }
      }

      onSuccess?.({ listingId, tokenId });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      if (cause instanceof LazyListingNotFoundError) {
        if (post) {
          setScarceEmbedOverride(postScarceKey(post.accountId, post.postId), {
            status: 'none',
            events: [],
          });
        }
        setFieldError('This listing is gone. Refresh and try another.');
        return;
      }
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error ? cause.message : txToastError.buyScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {post ? (
        <ScarcePostPreview
          post={post}
          creatorDisplayName={authorName}
          cardBg={embed?.cardBg ?? listing?.cardBg}
        />
      ) : null}

      {!post && listing?.mediaUrl ? (
        <div className="scarce-buy-media" aria-hidden>
          <img src={listing.mediaUrl} alt="" />
        </div>
      ) : null}

      <div className="scarce-buy-summary">
        {!post ? <p className="scarce-buy-title">{title}</p> : null}
        <p className="scarce-buy-price">{formatPriceNear(priceNear)}</p>
        {copies != null && copies > 1 ? (
          <p className="profile-support-hint">
            {remaining != null && remaining < copies
              ? `${remaining} of ${copies} left`
              : `${copies} editions`}
          </p>
        ) : null}
        <p className="profile-support-hint">
          {status === 'lazy_listing'
            ? 'Minted to you on purchase. Goes to the creator — small protocol fee.'
            : 'Transfer completes on confirmation. Seller is paid — small protocol fee.'}
        </p>
      </div>

      {fieldError ? (
        <p className="profile-support-error" role="alert">
          {fieldError}
        </p>
      ) : isOwnListing ? (
        <p className="profile-support-hint">
          This is your listing. Cancel it from the post menu if you want it off
          sale.
        </p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to buy this scarce.</p>
      ) : !isBuyable ? (
        <p className="profile-support-hint">
          {status === 'lazy_listing' || status === 'listed'
            ? 'Listing isn’t ready yet…'
            : 'This scarce isn’t for sale.'}
        </p>
      ) : null}

      {!isOwnListing ? (
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="submit"
            ready={isConnected ? canSubmit : true}
            pending={pending}
            pendingLabel="Buying…"
            disabled={pending || (isConnected && !canSubmit)}
          >
            {isConnected ? 'Buy' : 'Connect wallet'}
          </OsSheetAction>
        </OsSheetActions>
      ) : null}
    </form>
  );
}
