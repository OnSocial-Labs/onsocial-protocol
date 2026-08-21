'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PostRow, PostScarceEmbed, ScarcesEventRow } from '@onsocial/sdk';
import { AmountField } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchScarceListingMeta,
  fetchScarceMintSummary,
  formatMarketRelativeTime,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
import {
  buyNowNear,
  currentBidNear,
  fetchScarceAuctionView,
  formatAuctionCountdown,
  minBidIncrementNear,
  minNextBidNear,
  minNextBidYocto,
  type ScarceAuctionView,
} from '@/features/scarces/scarce-auction';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { ScarceBuyFactsMeta } from '@/features/scarces/scarce-buy-facts-meta';
import {
  ScarceListingFactsSheet,
  type ScarceListingFacts,
} from '@/features/scarces/scarce-listing-facts-sheet';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarceBuyCover } from '@/features/scarces/scarce-buy-cover';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { ScarcePostPreview } from '@/features/scarces/scarce-post-preview';
import { ScarceProvenanceCopy, isScarceOriginalSelf } from '@/features/scarces/scarce-provenance-copy';
import { fetchScarceRoyaltyMap } from '@/features/scarces/scarce-royalty-fetch';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { fetchCollectionPreferIndexer } from '@/features/scarces/collections-data';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { accountIdsEqual } from '@/lib/account-match';
import { nearToYocto, yoctoToNear } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { parseDropPaintSnapshot, parsePostText } from '@/lib/post-display';
import { fallbackLabel } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  collectionIdFromTokenId,
} from '@/features/market/market-listings';
const NEAR_INPUT_DECIMALS = 4;

export interface ScarceBidSuccessDetail {
  tokenId: string;
  amountNear?: string;
  settled?: boolean;
}

interface ScarceBidFormProps {
  formId: string;
  post?: PostRow | null;
  embed?: PostScarceEmbed | null;
  listing?: {
    tokenId: string;
    title?: string;
    description?: string;
    mediaUrl?: string | null;
    sellerId: string;
    priceNear?: string;
    sourcePostPath?: string;
    postHref?: string | null;
    listedAtMs?: number;
    playable?: ScarcePlayableMedia;
    playables?: ScarcePlayableMedia[];
  } | null;
  authorName?: string | null;
  onSuccess?: (detail: ScarceBidSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
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

/** Compact amount for meta chips (no repeated “NEAR” on every segment). */
function formatNearShort(near: string | null | undefined): string {
  if (!near?.trim()) return '—';
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near.trim();
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function bidRowAmountNear(row: ScarcesEventRow): string | null {
  let raw = row.bidAmount ?? row.amount ?? row.price;
  if (!raw?.trim() && row.extraData?.trim()) {
    try {
      const extra = JSON.parse(row.extraData) as Record<string, unknown>;
      const fromExtra = extra.bid_amount ?? extra.bidAmount ?? extra.amount;
      if (typeof fromExtra === 'string' || typeof fromExtra === 'number') {
        raw = String(fromExtra);
      }
    } catch {
      /* ignore */
    }
  }
  if (!raw?.trim()) return null;
  if (/^\d+$/.test(raw.trim())) return yoctoToNear(raw.trim());
  return raw.trim();
}

export function ScarceBidForm({
  formId,
  post = null,
  embed = null,
  listing = null,
  authorName = null,
  onSuccess,
  onFooterStateChange,
}: ScarceBidFormProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const onAmountFocus = useMobileFieldFocusScroll<HTMLInputElement>();
  const [pending, setPending] = useState<'bid' | 'buyNow' | 'settle' | null>(
    null
  );
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [auction, setAuction] = useState<ScarceAuctionView | null>(null);
  const [auctionLoading, setAuctionLoading] = useState(true);
  const [countdown, setCountdown] = useState<string | null>(null);
  /** Indexer bids for this token (all auctions), oldest → newest. */
  const [tokenBidRows, setTokenBidRows] = useState<ScarcesEventRow[]>([]);
  const [hydratedDescription, setHydratedDescription] = useState<string | null>(
    null
  );
  const [hydratedMediaUrl, setHydratedMediaUrl] = useState<string | null>(null);
  const [hydratedSourcePostPath, setHydratedSourcePostPath] = useState<
    string | null
  >(null);
  const [hydratedPlayable, setHydratedPlayable] =
    useState<ScarcePlayableMedia | null>(null);
  const [hydratedPlayables, setHydratedPlayables] = useState<
    ScarcePlayableMedia[] | null
  >(null);
  const [mintedAtMs, setMintedAtMs] = useState<number | null>(null);
  const [mintPriceNear, setMintPriceNear] = useState<string | null>(null);
  const [royalty, setRoyalty] = useState<Record<string, number> | null>(null);
  const [factsOpen, setFactsOpen] = useState(false);
  const [hydratedEvent, setHydratedEvent] = useState<{
    eventStartsAtMs: number | null;
    eventEndsAtMs: number | null;
    place: string | null;
    description: string | null;
  } | null>(null);

  const tokenId = listing?.tokenId ?? embed?.tokenId ?? '';
  const collectionId =
    embed?.collectionId?.trim() ||
    (tokenId ? collectionIdFromTokenId(tokenId) : null) ||
    undefined;
  const sellerId = listing?.sellerId ?? auction?.sellerId ?? post?.accountId;
  const title = listing?.title?.trim() || titleFromPost(post) || 'Scarce';
  const resolvedDescription =
    listing?.description?.trim() || hydratedDescription || null;
  const resolvedMediaUrl =
    listing?.mediaUrl?.trim() ||
    embed?.mediaUrl?.trim() ||
    hydratedMediaUrl ||
    null;
  const resolvedSourcePostPath =
    listing?.sourcePostPath?.trim() ||
    hydratedSourcePostPath ||
    parseDropPaintSnapshot(post?.value ?? '')?.sourcePostPath?.trim() ||
    null;
  const resolvedPlayable = listing?.playable ?? hydratedPlayable;
  const resolvedPlayables =
    listing?.playables ?? hydratedPlayables ?? undefined;
  const isOwnAuction =
    Boolean(viewerAccountId) &&
    Boolean(sellerId) &&
    accountIdsEqual(viewerAccountId!, sellerId!);
  const isHighestBidder =
    Boolean(viewerAccountId) &&
    Boolean(auction?.highestBidder) &&
    accountIdsEqual(viewerAccountId!, auction!.highestBidder!);
  const ended = Boolean(auction?.isEnded) || countdown === 'Ended';
  const buyNow = auction && !ended ? buyNowNear(auction) : null;

  // Only this listing’s bids — last `bid_count` events match on-chain state.
  const bidHistory = useMemo(() => {
    const count = auction?.bidCount ?? 0;
    if (count <= 0 || tokenBidRows.length === 0) return [];
    const current = tokenBidRows.slice(-count);
    return [...current].reverse();
  }, [auction?.bidCount, tokenBidRows]);

  async function reloadAuction() {
    const view = await fetchScarceAuctionView(tokenId);
    setAuction(view);
    return view;
  }

  useEffect(() => {
    const id = collectionId?.trim();
    if (!id) {
      setHydratedEvent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchCollectionPreferIndexer(id);
        if (cancelled) return;
        setHydratedEvent(
          view
            ? {
                eventStartsAtMs: view.eventStartsAtMs,
                eventEndsAtMs: view.eventEndsAtMs,
                place: view.place,
                description: view.description?.trim() || null,
              }
            : null
        );
      } catch {
        if (!cancelled) setHydratedEvent(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

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
    const needsDescription = !listing?.description?.trim();
    const needsMedia = !listing?.mediaUrl?.trim() && !embed?.mediaUrl?.trim();
    const needsSource = !listing?.sourcePostPath?.trim();
    const needsPlayable = !listing?.playable;
    const needsPlayables = !listing?.playables?.length;
    if (
      !tokenId ||
      (!needsDescription &&
        !needsMedia &&
        !needsSource &&
        !needsPlayable &&
        !needsPlayables)
    ) {
      setHydratedDescription(null);
      setHydratedMediaUrl(null);
      setHydratedSourcePostPath(null);
      setHydratedPlayable(null);
      setHydratedPlayables(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const meta = await fetchScarceListingMeta({ tokenId });
      if (cancelled || !meta) return;
      if (needsDescription && meta.description) {
        setHydratedDescription(meta.description);
      }
      if (needsMedia && meta.mediaUrl) {
        setHydratedMediaUrl(meta.mediaUrl);
      }
      if (needsSource && meta.sourcePostPath) {
        setHydratedSourcePostPath(meta.sourcePostPath);
      }
      if (needsPlayable && meta.playable) {
        setHydratedPlayable(meta.playable);
      }
      if (needsPlayables && meta.playables?.length) {
        setHydratedPlayables(meta.playables);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    tokenId,
    listing?.description,
    listing?.mediaUrl,
    listing?.sourcePostPath,
    listing?.playable,
    listing?.playables,
    embed?.mediaUrl,
  ]);

  useEffect(() => {
    const id = tokenId.trim();
    if (!id) {
      setMintedAtMs(null);
      setMintPriceNear(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const summary = await fetchScarceMintSummary(id);
      if (cancelled) return;
      setMintedAtMs(summary.mintedAtMs);
      setMintPriceNear(summary.mintPriceNear);
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  useEffect(() => {
    const id = tokenId.trim();
    setRoyalty(null);
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const map = await fetchScarceRoyaltyMap({ tokenId: id });
      if (cancelled) return;
      setRoyalty(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

  useEffect(() => {
    if (!tokenId) {
      setTokenBidRows([]);
      return;
    }
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.scarces
      .bids(tokenId, { limit: 80 })
      .then((rows) => {
        if (cancelled) return;
        setTokenBidRows(rows);
      })
      .catch(() => {
        if (!cancelled) setTokenBidRows([]);
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
  const stepNear = auction ? minBidIncrementNear(auction) : null;
  const normalizedAmount = finalizeAmountInput(
    amountInput,
    NEAR_INPUT_DECIMALS
  );
  const buyNowYocto = (() => {
    if (!auction?.buyNowPriceYocto) return 0n;
    try {
      return BigInt(auction.buyNowPriceYocto);
    } catch {
      return 0n;
    }
  })();
  const bidMeetsBuyNow = (() => {
    if (buyNowYocto <= 0n || !normalizedAmount) return false;
    try {
      return BigInt(nearToYocto(normalizedAmount)) >= buyNowYocto;
    } catch {
      return false;
    }
  })();
  const bidMeetsMin = (() => {
    if (!auction || !normalizedAmount) return false;
    try {
      return BigInt(nearToYocto(normalizedAmount)) >= minNextBidYocto(auction);
    } catch {
      return false;
    }
  })();
  // Next-bid floor already at/above Buy now → primary is Buy now.
  const minMeetsBuyNow =
    buyNowYocto > 0n &&
    Boolean(auction) &&
    minNextBidYocto(auction!) >= buyNowYocto;
  const canBid =
    isConnected &&
    !pending &&
    !auctionLoading &&
    Boolean(tokenId) &&
    Boolean(auction) &&
    !ended &&
    !isOwnAuction &&
    bidMeetsMin;

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
    // Under-min is blocked in the CTA (disabled + label shows the floor).
    if (kind === 'bid' && BigInt(depositYocto) < minNextBidYocto(auction)) {
      return;
    }

    // Contract auto-settles when bid >= buy_now — mirror that in UX/toasts.
    const buyNowYocto = auction.buyNowPriceYocto
      ? BigInt(auction.buyNowPriceYocto)
      : 0n;
    const settlesImmediately =
      kind === 'buyNow' ||
      (buyNowYocto > 0n && BigInt(depositYocto) >= buyNowYocto);

    setPending(settlesImmediately ? 'buyNow' : kind);
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
        submittedMessage: settlesImmediately
          ? txToastConfirming.buyingScarceNow
          : txToastConfirming.biddingScarce,
        successMessage: settlesImmediately
          ? txToastSuccess.scarceBoughtNow
          : txToastSuccess.scarceBidPlaced,
        failureMessage: settlesImmediately
          ? txToastError.buyScarceNowFailed
          : txToastError.bidScarceFailed,
      });
      if (!confirmed) return;

      if (post) {
        setScarceEmbedOverride(postScarceKey(post.accountId, post.postId), {
          status: settlesImmediately ? 'sold' : 'auction',
          tokenId,
          priceNear: amountNear,
          events: [],
        });
      }

      onSuccess?.({
        tokenId,
        amountNear,
        settled: settlesImmediately,
      });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : settlesImmediately
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
    // Bidding at/above Buy now settles immediately on-chain — use that path.
    await placeBidAmount(
      amountNear,
      bidMeetsBuyNow || minMeetsBuyNow ? 'buyNow' : 'bid'
    );
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
        successMessage:
          isHighestBidder && !isOwnAuction
            ? txToastSuccess.scarceAuctionCollected
            : txToastSuccess.scarceAuctionSettled,
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

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    const visible = ended || (!isOwnAuction && Boolean(auction));
    if (!visible) return null;

    if (ended) {
      const settleLabel = !isConnected
        ? 'Connect wallet'
        : isHighestBidder && !isOwnAuction
          ? 'Collect'
          : isOwnAuction
            ? 'Complete sale'
            : 'Settle auction';
      return {
        visible: true,
        primaryType: 'button',
        primaryLabel: settleLabel,
        primaryPendingLabel:
          isHighestBidder && !isOwnAuction ? 'Collecting…' : 'Settling…',
        canSubmit: isConnected ? !pending : true,
        pending: pending === 'settle',
        disabled: Boolean(pending) || (isConnected && !tokenId),
        onPrimaryClick: () => {
          void handleSettle();
        },
      };
    }

    const buyNowPath = bidMeetsBuyNow || minMeetsBuyNow;
    const bidAmountLabel = bidMeetsMin
      ? formatNearLabel(normalizedAmount)
      : formatNearLabel(minNear);
    return {
      visible: true,
      primaryLabel: isConnected
        ? buyNowPath
          ? `Buy now · ${formatNearLabel(buyNow ?? normalizedAmount ?? minNear)}`
          : `Bid · ${bidAmountLabel}`
        : 'Connect wallet',
      primaryPendingLabel: buyNowPath ? 'Buying…' : 'Bidding…',
      canSubmit: isConnected ? canBid : true,
      pending: pending === 'bid' || pending === 'buyNow',
      disabled: Boolean(pending) || (isConnected && !canBid),
      secondary:
        buyNow && isConnected && !buyNowPath
          ? {
              label: `Buy now · ${formatNearLabel(buyNow)}`,
              pending: pending === 'buyNow',
              pendingLabel: 'Buying…',
              disabled: Boolean(pending),
              onClick: () => {
                void handleBuyNow();
              },
            }
          : null,
    };
  }, [
    auction,
    bidMeetsBuyNow,
    bidMeetsMin,
    buyNow,
    canBid,
    ended,
    isConnected,
    isHighestBidder,
    isOwnAuction,
    minMeetsBuyNow,
    minNear,
    normalizedAmount,
    pending,
    tokenId,
  ]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  const listingFacts = useMemo((): ScarceListingFacts => {
    return {
      title,
      kind: 'auction',
      askNear: highNear ?? minNear ?? listing?.priceNear ?? null,
      mintPriceNear,
      mintedAtMs,
      listedAtMs: listing?.listedAtMs ?? null,
      mediumKind: embed?.mediumKind ?? null,
      authorId:
        post?.accountId ??
        (resolvedSourcePostPath?.match(/^(.+)\/post\//)?.[1] ?? null),
      sellerId: sellerId ?? null,
      sourcePostPath: resolvedSourcePostPath,
      postHref: listing?.postHref ?? null,
      tokenId: tokenId || null,
      collectionId: collectionId ?? null,
      royalty,
      eventStartsAtMs: hydratedEvent?.eventStartsAtMs ?? null,
      eventEndsAtMs: hydratedEvent?.eventEndsAtMs ?? null,
      place: hydratedEvent?.place ?? null,
      description:
        resolvedDescription ?? hydratedEvent?.description ?? null,
    };
  }, [
    title,
    highNear,
    minNear,
    listing?.priceNear,
    listing?.listedAtMs,
    listing?.postHref,
    mintPriceNear,
    mintedAtMs,
    embed?.mediumKind,
    post?.accountId,
    resolvedSourcePostPath,
    sellerId,
    tokenId,
    collectionId,
    royalty,
    hydratedEvent,
    resolvedDescription,
  ]);

  return (
    <>
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {/* Same cover plane as Market — post preview only when no scarce media. */}
      {resolvedPlayable ? (
        <ScarceClipPlayer
          key={resolvedPlayable.url}
          clip={resolvedPlayable}
          {...(resolvedPlayables?.length
            ? { tracks: resolvedPlayables }
            : {})}
          poster={resolvedMediaUrl}
          commerce
          {...(collectionId
            ? {
                persist: {
                  collectionId,
                  title,
                },
                creatorId: sellerId,
              }
            : {})}
        />
      ) : resolvedMediaUrl ? (
        <ScarceBuyCover src={resolvedMediaUrl} label={title} />
      ) : post ? (
        <ScarcePostPreview
          post={post}
          creatorDisplayName={authorName}
          mediaUrl={resolvedMediaUrl}
          disableLiveSvg
          cardBg={embed?.cardBg}
        />
      ) : null}

      <div className="scarce-buy-summary">
        <p className="scarce-buy-title">{title}</p>
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
        {!ended && !auctionLoading ? (
          <p className="profile-support-hint scarce-buy-meta">
            {[
              countdown
                ? countdown === 'Ended'
                  ? 'Ended'
                  : `Ends ${countdown}`
                : auction?.expiresAtNs == null
                  ? 'Starts on first bid'
                  : null,
              stepNear ? `Step ${formatNearShort(stepNear)}` : null,
              buyNow && !bidMeetsBuyNow && !minMeetsBuyNow
                ? `Buy now ${formatNearShort(buyNow)}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            {stepNear || (buyNow && !bidMeetsBuyNow && !minMeetsBuyNow)
              ? ' NEAR'
              : ''}
          </p>
        ) : null}
        {(() => {
          const listedLabel = listing?.listedAtMs
            ? formatMarketRelativeTime(listing.listedAtMs)
            : '';
          const mintedLabel = mintedAtMs
            ? formatMarketRelativeTime(mintedAtMs)
            : '';
          const mintPriceLabel = mintPriceNear
            ? `${formatNearShort(mintPriceNear)} NEAR`
            : '';
          const parts = [
            listedLabel ? `Listed ${listedLabel}` : null,
            mintedLabel ? `Minted ${mintedLabel}` : null,
            mintPriceLabel || null,
          ].filter((part): part is string => Boolean(part));
          return (
            <ScarceBuyFactsMeta
              parts={parts.length > 0 ? parts : ['Auction']}
              onOpenFacts={() => setFactsOpen(true)}
            />
          );
        })()}
      </div>

      <ScarceProvenanceCopy
        title={title}
        description={resolvedDescription}
        post={post}
        postHref={listing?.postHref}
        sourcePostPath={resolvedSourcePostPath ?? listing?.sourcePostPath}
        hideOriginalLink={isScarceOriginalSelf(
          post,
          resolvedSourcePostPath ?? listing?.sourcePostPath,
          listing?.postHref
        )}
        event={
          hydratedEvent
            ? {
                eventStartsAtMs: hydratedEvent.eventStartsAtMs,
                eventEndsAtMs: hydratedEvent.eventEndsAtMs,
                place: hydratedEvent.place,
              }
            : null
        }
      />

      {bidHistory.length > 0 ? (
        <div className="scarce-bid-history" aria-label="Bids this auction">
          <p className="scarce-mood-picker-label">This auction</p>
          <ul className="scarce-bid-history-list">
            {bidHistory.map((row, index) => {
              const amountNear = bidRowAmountNear(row);
              const amount = amountNear ? formatNearLabel(amountNear) : '—';
              const bidder = row.bidder || row.buyerId || row.author;
              return (
                <li
                  key={`${row.blockTimestamp}:${bidder}:${index}`}
                  className="scarce-bid-history-row"
                >
                  <span className="scarce-bid-history-bidder">
                    @{fallbackLabel(bidder)}
                  </span>
                  <span className="scarce-bid-history-amount">{amount}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : !auctionLoading && !ended ? (
        <p className="profile-support-hint">No bids yet this auction.</p>
      ) : null}

      {!isOwnAuction && auction && !ended ? (
        <>
          <AmountField
            value={amountInput}
            onValueChange={applyAmountInput}
            maxDecimals={NEAR_INPUT_DECIMALS}
            onFocus={onAmountFocus}
            placeholder={minNear ?? '0'}
            aria-label="Bid in NEAR"
            invalid={Boolean(fieldError)}
            unit="NEAR"
            disabled={Boolean(pending) || auctionLoading}
          />
          {bidMeetsBuyNow && !minMeetsBuyNow ? (
            <p className="profile-support-hint">
              Meets Buy now — you win immediately.
            </p>
          ) : null}
        </>
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
    </form>
      <ScarceListingFactsSheet
        open={factsOpen}
        onClose={() => setFactsOpen(false)}
        zIndex={SCARCE_Z.nestedOverCommerce}
        facts={listingFacts}
      />
    </>
  );
}
