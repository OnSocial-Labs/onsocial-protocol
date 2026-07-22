'use client';

import { useEffect, useState } from 'react';
import type { PostRow, PostScarceEmbed, ScarcesEventRow } from '@onsocial/sdk';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  buyNowNear,
  currentBidNear,
  fetchScarceAuctionView,
  formatAuctionCountdown,
  minNextBidNear,
  minNextBidYocto,
  type ScarceAuctionView,
} from '@/features/scarces/scarce-auction';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarcePostPreview } from '@/features/scarces/scarce-post-preview';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { accountIdsEqual } from '@/lib/account-match';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { parsePostText } from '@/lib/post-display';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const NEAR_INPUT_DECIMALS = 4;

export interface ScarceBidSuccessDetail {
  tokenId: string;
  amountNear?: string;
  settled?: boolean;
}

interface ScarceBidFormProps {
  post?: PostRow | null;
  embed?: PostScarceEmbed | null;
  listing?: {
    tokenId: string;
    title?: string;
    mediaUrl?: string | null;
    sellerId: string;
    priceNear?: string;
  } | null;
  authorName?: string | null;
  onSuccess?: (detail: ScarceBidSuccessDetail) => void;
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

function formatNearLabel(near: string | null | undefined): string {
  if (!near?.trim()) return '—';
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return `${near.trim()} NEAR`;
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

export function ScarceBidForm({
  post = null,
  embed = null,
  listing = null,
  authorName = null,
  onSuccess,
}: ScarceBidFormProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState<'bid' | 'buyNow' | 'settle' | null>(
    null
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [auction, setAuction] = useState<ScarceAuctionView | null>(null);
  const [auctionLoading, setAuctionLoading] = useState(true);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [bidHistory, setBidHistory] = useState<ScarcesEventRow[]>([]);

  const tokenId = listing?.tokenId ?? embed?.tokenId ?? '';
  const sellerId = listing?.sellerId ?? auction?.sellerId ?? post?.accountId;
  const title =
    listing?.title?.trim() || titleFromPost(post) || 'Scarce';
  const isOwnAuction =
    Boolean(viewerAccountId) &&
    Boolean(sellerId) &&
    accountIdsEqual(viewerAccountId!, sellerId!);
  const isHighestBidder =
    Boolean(viewerAccountId) &&
    Boolean(auction?.highestBidder) &&
    accountIdsEqual(viewerAccountId!, auction!.highestBidder!);
  const ended =
    Boolean(auction?.isEnded) || countdown === 'Ended';
  const buyNow = auction && !ended ? buyNowNear(auction) : null;

  async function reloadAuction() {
    const view = await fetchScarceAuctionView(tokenId);
    setAuction(view);
    return view;
  }

  useEffect(() => {
    let cancelled = false;
    setAuctionLoading(true);
    void fetchScarceAuctionView(tokenId).then((view) => {
      if (cancelled) return;
      setAuction(view);
      if (view && !view.isEnded) {
        setAmountInput(minNextBidNear(view));
      }
      setAuctionLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  useEffect(() => {
    if (!tokenId) {
      setBidHistory([]);
      return;
    }
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.scarces
      .bids(tokenId, { limit: 12 })
      .then((rows) => {
        if (cancelled) return;
        setBidHistory([...rows].reverse().slice(0, 8));
      })
      .catch(() => {
        if (!cancelled) setBidHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  useEffect(() => {
    if (!auction?.expiresAtNs) {
      setCountdown(auction?.isEnded ? 'Ended' : null);
      return;
    }
    const tick = () => {
      const next = formatAuctionCountdown(auction.expiresAtNs);
      setCountdown(next);
      if (next === 'Ended' && !auction.isEnded) {
        void reloadAuction();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when clock flips
  }, [auction?.expiresAtNs, auction?.isEnded, tokenId]);

  const minNear = auction && !ended ? minNextBidNear(auction) : null;
  const highNear = auction ? currentBidNear(auction) : null;
  const normalizedAmount = finalizeAmountInput(
    amountInput,
    NEAR_INPUT_DECIMALS
  );
  const canBid =
    isConnected &&
    !pending &&
    !auctionLoading &&
    Boolean(tokenId) &&
    Boolean(auction) &&
    !ended &&
    !isOwnAuction &&
    Boolean(normalizedAmount);

  function applyAmountInput(raw: string) {
    setAmountInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
    setFieldError(null);
  }

  async function placeBidAmount(amountNear: string, kind: 'bid' | 'buyNow') {
    if (!tokenId || !auction) {
      setFieldError('Auction isn’t ready yet. Try again in a moment.');
      return;
    }
    let depositYocto: string;
    try {
      depositYocto = nearToYocto(amountNear);
    } catch {
      setFieldError('Enter a valid NEAR amount.');
      return;
    }
    if (kind === 'bid' && BigInt(depositYocto) < minNextBidYocto(auction)) {
      setFieldError(`Bid at least ${formatNearLabel(minNear)}.`);
      return;
    }

    setPending(kind);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.auctions.placeBid(
        tokenId,
        amountNear,
        { depositYocto }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage:
          kind === 'buyNow'
            ? txToastConfirming.buyingScarceNow
            : txToastConfirming.biddingScarce,
        successMessage:
          kind === 'buyNow'
            ? txToastSuccess.scarceBoughtNow
            : txToastSuccess.scarceBidPlaced,
        failureMessage:
          kind === 'buyNow'
            ? txToastError.buyScarceNowFailed
            : txToastError.bidScarceFailed,
      });
      if (!confirmed) return;

      if (post) {
        setScarceEmbedOverride(postScarceKey(post.accountId, post.postId), {
          status: kind === 'buyNow' ? 'sold' : 'auction',
          tokenId,
          priceNear: amountNear,
          events: [],
        });
      }

      onSuccess?.({ tokenId, amountNear, settled: kind === 'buyNow' });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : kind === 'buyNow'
              ? txToastError.buyScarceNowFailed
              : txToastError.bidScarceFailed,
      });
    } finally {
      setPending(null);
    }
  }

  async function handleSubmit() {
    setFieldError(null);
    if (isOwnAuction) {
      setFieldError('You can’t bid on your own auction.');
      return;
    }
    if (ended) {
      setFieldError('This auction has ended. Settle it below.');
      return;
    }
    const amountNear = finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS);
    if (!amountNear) {
      setFieldError('Enter a bid amount.');
      return;
    }
    await placeBidAmount(amountNear, 'bid');
  }

  async function handleBuyNow() {
    setFieldError(null);
    if (!buyNow) {
      setFieldError('Buy now isn’t available on this auction.');
      return;
    }
    if (isOwnAuction) {
      setFieldError('You can’t buy your own auction.');
      return;
    }
    await placeBidAmount(buyNow, 'buyNow');
  }

  async function handleSettle() {
    setFieldError(null);
    if (!tokenId || !ended) {
      setFieldError('Auction hasn’t ended yet.');
      return;
    }
    setPending('settle');
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const response = await client.scarces.auctions.settle(tokenId);
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.settlingScarceAuction,
        successMessage: txToastSuccess.scarceAuctionSettled,
        failureMessage: txToastError.settleScarceAuctionFailed,
      });
      if (!confirmed) return;
      if (post) {
        setScarceEmbedOverride(postScarceKey(post.accountId, post.postId), {
          status: auction?.reserveMet ? 'sold' : 'none',
          tokenId,
          events: [],
        });
      }
      onSuccess?.({ tokenId, settled: true });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.settleScarceAuctionFailed,
      });
    } finally {
      setPending(null);
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
          cardBg={embed?.cardBg}
        />
      ) : null}

      {!post && listing?.mediaUrl ? (
        <div className="scarce-buy-media" aria-hidden>
          <img src={listing.mediaUrl} alt="" />
        </div>
      ) : null}

      <div className="scarce-buy-summary">
        {!post ? <p className="scarce-buy-title">{title}</p> : null}
        <p className="scarce-buy-price">
          {auctionLoading
            ? 'Loading auction…'
            : ended
              ? auction?.reserveMet
                ? `Ended · ${formatNearLabel(highNear)}`
                : 'Ended · reserve not met'
              : highNear
                ? `High bid · ${formatNearLabel(highNear)}`
                : minNear
                  ? `Reserve · ${formatNearLabel(minNear)}`
                  : 'Auction'}
        </p>
        {countdown && !ended ? (
          <p className="profile-support-hint">Ends in {countdown}</p>
        ) : auction && !ended && auction.expiresAtNs == null ? (
          <p className="profile-support-hint">Starts on the first bid.</p>
        ) : null}
      </div>

      {bidHistory.length > 0 ? (
        <div className="scarce-bid-history" aria-label="Recent bids">
          <p className="scarce-mood-picker-label">Recent bids</p>
          <ul className="scarce-bid-history-list">
            {bidHistory.map((row, index) => {
              const amount =
                row.amount && /^\d+$/.test(row.amount)
                  ? formatNearLabel(yoctoToNear(row.amount))
                  : '—';
              const bidder = row.buyerId || row.author;
              return (
                <li
                  key={`${row.blockTimestamp}:${bidder}:${index}`}
                  className="scarce-bid-history-row"
                >
                  <span>@{fallbackLabel(bidder)}</span>
                  <span>{amount}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : !auctionLoading && !ended ? (
        <p className="profile-support-hint">No bids yet.</p>
      ) : null}

      {!isOwnAuction && auction && !ended ? (
        <div className="app-storage-amount-field profile-support-amount-field">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountInput}
            onChange={(event) => applyAmountInput(event.target.value)}
            onBlur={() =>
              applyAmountInput(
                finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS)
              )
            }
            placeholder={minNear ?? '0'}
            aria-label="Bid in NEAR"
            aria-invalid={Boolean(fieldError)}
            className="app-storage-amount-input"
            disabled={Boolean(pending) || auctionLoading}
          />
          <span className="account-card-balance-unit profile-support-token-unit">
            NEAR
          </span>
        </div>
      ) : null}

      {fieldError ? (
        <p className="profile-support-error" role="alert">
          {fieldError}
        </p>
      ) : isOwnAuction && !ended ? (
        <p className="profile-support-hint">Your auction.</p>
      ) : !isConnected && !ended ? (
        <p className="profile-support-hint">Connect to bid.</p>
      ) : null}

      {ended ? (
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="button"
            ready={isConnected ? !pending : true}
            pending={pending === 'settle'}
            pendingLabel="Settling…"
            disabled={Boolean(pending) || (isConnected && !tokenId)}
            onClick={() => {
              void handleSettle();
            }}
          >
            {isConnected ? 'Settle auction' : 'Connect wallet'}
          </OsSheetAction>
        </OsSheetActions>
      ) : !isOwnAuction && auction ? (
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="submit"
            ready={isConnected ? canBid : true}
            pending={pending === 'bid'}
            pendingLabel="Bidding…"
            disabled={Boolean(pending) || (isConnected && !canBid)}
          >
            {isConnected ? 'Place bid' : 'Connect wallet'}
          </OsSheetAction>
          {buyNow && isConnected ? (
            <OsSheetAction
              type="button"
              variant="ghost"
              ready={!pending}
              pending={pending === 'buyNow'}
              pendingLabel="Buying…"
              disabled={Boolean(pending)}
              onClick={() => {
                void handleBuyNow();
              }}
            >
              Buy now · {formatNearLabel(buyNow)}
            </OsSheetAction>
          ) : null}
        </OsSheetActions>
      ) : null}
    </form>
  );
}
