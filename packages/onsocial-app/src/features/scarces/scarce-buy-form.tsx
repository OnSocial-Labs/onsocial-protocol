'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { CollectionQtyStepper, ProfileAvatar } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchScarceListingMeta,
  fetchScarceMintSummary,
  formatMarketRelativeTime,
  findLiveListingForPost,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
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
import { ScarceTraits } from '@/features/scarces/scarce-traits';
import {
  createAppScarcesWalletClient,
  LazyListingNotFoundError,
  resolveLazyListingDepositYocto,
} from '@/features/scarces/scarces-wallet-client';
import { accountIdsEqual } from '@/lib/account-match';
import { nearToYocto } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { portfolioPath } from '@/lib/overlay-routes';
import { parseDropPaintSnapshot, parsePostText } from '@/lib/post-display';
import { displayName, fallbackLabel } from '@/lib/profile-display';
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
  formId: string;
  post?: PostRow | null;
  /** Standalone market listing (no feed post). */
  listing?: {
    listingId?: string;
    tokenId?: string;
    collectionId?: string;
    status: PostScarceEmbed['status'];
    priceNear?: string;
    title?: string;
    description?: string;
    mediaUrl?: string | null;
    creatorId?: string;
    /** Original mint creator when different from seller (resale). */
    artistId?: string;
    cardBg?: string;
    copies?: number;
    remaining?: number;
    sourcePostPath?: string;
    postHref?: string | null;
    listedAtMs?: number;
    playable?: ScarcePlayableMedia;
    playables?: ScarcePlayableMedia[];
    alreadyOwnsEdition?: boolean;
    maxQuantity?: number;
  } | null;
  embed?: PostScarceEmbed | null;
  /** Profile display name for text-card preview byline. */
  authorName?: string | null;
  onSuccess?: (detail: ScarceBuySuccessDetail) => void;
  /** Secondary path for fixed-price resales — opens offer sheet. */
  onMakeOffer?: () => void;
  /** Viewer already owns an edition — Mint/Buy another. */
  alreadyOwnsEdition?: boolean;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

function formatPriceNear(priceNear: string | undefined): string {
  if (!priceNear?.trim()) return '—';
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear.trim();
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 4 })} NEAR`;
}

function scalePriceNear(
  priceNear: string | undefined,
  quantity: number
): string | undefined {
  if (!priceNear?.trim()) return undefined;
  const n = Number.parseFloat(priceNear);
  if (!Number.isFinite(n)) return priceNear.trim();
  const total = n * Math.max(1, quantity);
  return String(total);
}

function resolveMintMaxQuantity(opts: {
  listingMax?: number | null;
  remaining?: number | null;
}): number {
  const caps: number[] = [];
  if (
    typeof opts.listingMax === 'number' &&
    Number.isFinite(opts.listingMax) &&
    opts.listingMax > 0
  ) {
    caps.push(Math.floor(opts.listingMax));
  }
  if (
    typeof opts.remaining === 'number' &&
    Number.isFinite(opts.remaining) &&
    opts.remaining > 0
  ) {
    caps.push(Math.floor(opts.remaining));
  }
  if (caps.length === 0) return 1;
  return Math.max(1, Math.min(...caps, 10));
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

function authorFromSourcePostPath(
  path: string | null | undefined
): string | undefined {
  if (!path?.trim()) return undefined;
  const match = path.trim().match(/^(.+)\/post\/(.+)$/);
  return match?.[1]?.trim() || undefined;
}

function PartyLine({
  label,
  accountId,
  displayNameValue,
  avatarUrl,
}: {
  label: string;
  accountId: string;
  displayNameValue?: string | null;
  avatarUrl?: string | null;
}) {
  const handle = fallbackLabel(accountId);
  const name = displayName(accountId, displayNameValue ?? undefined);
  const nameIsCustom =
    Boolean(name) && name.toLowerCase() !== handle.toLowerCase();
  return (
    <div className="scarce-buy-author-line">
      <span className="scarce-buy-author-label">{label}</span>
      <Link
        href={portfolioPath(accountId)}
        scroll={false}
        className="scarce-buy-party"
      >
        <ProfileAvatar
          src={avatarUrl}
          size="sm"
          className="scarce-buy-party-avatar"
        />
        {/* Stacked like open-post identity — name, then quiet @account. */}
        <div className="scarce-buy-party-text">
          {nameIsCustom ? (
            <>
              <div className="scarce-buy-party-name">{name}</div>
              <div className="scarce-buy-party-handle">@{handle}</div>
            </>
          ) : (
            <div className="scarce-buy-party-name">@{handle}</div>
          )}
        </div>
      </Link>
    </div>
  );
}

export function ScarceBuyForm({
  formId,
  post = null,
  listing = null,
  embed = null,
  authorName = null,
  onSuccess,
  onMakeOffer,
  alreadyOwnsEdition: alreadyOwnsEditionProp = false,
  onFooterStateChange,
}: ScarceBuyFormProps) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
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
  const [artistAvatarUrl, setArtistAvatarUrl] = useState<string | null>(null);
  const [artistProfileName, setArtistProfileName] = useState<string | null>(
    null
  );
  const [sellerAvatarUrl, setSellerAvatarUrl] = useState<string | null>(null);
  const [sellerProfileName, setSellerProfileName] = useState<string | null>(
    null
  );

  const status = listing?.status ?? embed?.status ?? 'none';
  const listingId = listing?.listingId ?? embed?.listingId;
  const tokenId = listing?.tokenId ?? embed?.tokenId;
  const collectionId = listing?.collectionId ?? embed?.collectionId;
  const priceNear = listing?.priceNear ?? embed?.priceNear;
  const copies = listing?.copies ?? embed?.copies;
  const remaining = listing?.remaining ?? embed?.remaining;
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
  const sellerId =
    listing?.creatorId ?? embed?.creatorId ?? post?.accountId ?? null;
  const artistFromListing = listing?.artistId?.trim() || undefined;
  const artistFromPost =
    post?.accountId?.trim() ||
    authorFromSourcePostPath(resolvedSourcePostPath) ||
    undefined;
  const artistId =
    artistFromListing ||
    (sellerId &&
    artistFromPost &&
    !accountIdsEqual(sellerId, artistFromPost)
      ? artistFromPost
      : undefined) ||
    sellerId;
  const showDistinctSeller =
    Boolean(sellerId) &&
    Boolean(artistId) &&
    !accountIdsEqual(sellerId!, artistId!);

  useEffect(() => {
    const accountId = artistId?.trim();
    if (!accountId) {
      setArtistAvatarUrl(null);
      setArtistProfileName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const profile = await client.profiles.get(accountId);
        if (cancelled) return;
        const media = profile ? client.profiles.avatarMedia(profile) : null;
        const faceUrl =
          media?.kind === 'image'
            ? media.url
            : (media?.poster ?? client.profiles.avatarUrl(profile) ?? null);
        setArtistAvatarUrl(faceUrl);
        setArtistProfileName(profile?.name?.trim() || null);
      } catch {
        if (!cancelled) {
          setArtistAvatarUrl(null);
          setArtistProfileName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  useEffect(() => {
    if (!showDistinctSeller || !sellerId?.trim()) {
      setSellerAvatarUrl(null);
      setSellerProfileName(null);
      return;
    }
    const accountId = sellerId.trim();
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const profile = await client.profiles.get(accountId);
        if (cancelled) return;
        const media = profile ? client.profiles.avatarMedia(profile) : null;
        const faceUrl =
          media?.kind === 'image'
            ? media.url
            : (media?.poster ?? client.profiles.avatarUrl(profile) ?? null);
        setSellerAvatarUrl(faceUrl);
        setSellerProfileName(profile?.name?.trim() || null);
      } catch {
        if (!cancelled) {
          setSellerAvatarUrl(null);
          setSellerProfileName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDistinctSeller, sellerId]);

  useEffect(() => {
    const needsDescription = !listing?.description?.trim();
    const needsMedia = !listing?.mediaUrl?.trim() && !embed?.mediaUrl?.trim();
    const needsSource = !listing?.sourcePostPath?.trim();
    const needsPlayable = !listing?.playable;
    const needsPlayables = !listing?.playables?.length;
    if (
      !needsDescription &&
      !needsMedia &&
      !needsSource &&
      !needsPlayable &&
      !needsPlayables
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
      const meta = await fetchScarceListingMeta({ listingId, tokenId });
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
    listingId,
    tokenId,
    listing?.description,
    listing?.mediaUrl,
    listing?.sourcePostPath,
    listing?.playable,
    listing?.playables,
    embed?.mediaUrl,
  ]);

  useEffect(() => {
    const id = tokenId?.trim();
    if (!id || status === 'lazy_listing' || status === 'drop') {
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
  }, [tokenId, status]);

  useEffect(() => {
    setRoyalty(null);
    let cancelled = false;
    void (async () => {
      const map = await fetchScarceRoyaltyMap({
        collectionId,
        listingId,
        tokenId,
      });
      if (cancelled) return;
      setRoyalty(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId, listingId, tokenId]);

  const isOwnListing =
    Boolean(viewerAccountId) &&
    Boolean(sellerId) &&
    accountIdsEqual(viewerAccountId!, sellerId!);

  const isLazyBuy = status === 'lazy_listing' && Boolean(listingId);
  const isDropBuy = status === 'drop' && Boolean(collectionId);
  const isMarketBuy = status === 'listed' && Boolean(tokenId);
  const isPrimaryMint = isLazyBuy || isDropBuy;
  const isBuyable = !isOwnListing && (isLazyBuy || isDropBuy || isMarketBuy);
  const alreadyOwnsEdition =
    Boolean(listing?.alreadyOwnsEdition) || alreadyOwnsEditionProp;
  const maxQuantity = resolveMintMaxQuantity({
    listingMax: listing?.maxQuantity,
    remaining: isDropBuy ? remaining : null,
  });
  const showMintQty = isDropBuy && maxQuantity > 1;
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity));
  }, [maxQuantity]);
  const mintQty = showMintQty ? quantity : 1;
  const totalPriceNear = scalePriceNear(priceNear, mintQty);
  const isPaidMint =
    Boolean(totalPriceNear?.trim()) &&
    Number.parseFloat(totalPriceNear!) > 0;
  const primaryActionLabel = isPrimaryMint
    ? alreadyOwnsEdition
      ? 'Mint another'
      : 'Mint'
    : alreadyOwnsEdition
      ? 'Buy another'
      : 'Buy';
  const primaryLabelWithPrice =
    isConnected && isDropBuy && isPaidMint
      ? `${primaryActionLabel} · ${formatPriceNear(totalPriceNear)}`
      : isConnected
        ? primaryActionLabel
        : 'Connect wallet';

  const canSubmit = isConnected && !pending && isBuyable;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (isOwnListing) return null;
    return {
      visible: true,
      primaryLabel: primaryLabelWithPrice,
      primaryPendingLabel: isPrimaryMint ? 'Minting…' : 'Buying…',
      canSubmit: isConnected ? canSubmit : true,
      pending,
      disabled: pending || (isConnected && !canSubmit),
      leadingKey: showMintQty ? `qty:${mintQty}:${maxQuantity}` : undefined,
      leading: showMintQty ? (
        <CollectionQtyStepper
          value={mintQty}
          min={1}
          max={maxQuantity}
          disabled={pending}
          aria-label="Quantity"
          decreaseLabel="Decrease quantity"
          increaseLabel="Increase quantity"
          onChange={setQuantity}
        />
      ) : null,
      secondary:
        isMarketBuy && onMakeOffer && isConnected
          ? {
              label: 'Make an offer',
              disabled: pending,
              onClick: onMakeOffer,
            }
          : null,
    };
  }, [
    canSubmit,
    isConnected,
    isPrimaryMint,
    isMarketBuy,
    isOwnListing,
    maxQuantity,
    mintQty,
    onMakeOffer,
    pending,
    primaryLabelWithPrice,
    showMintQty,
  ]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  const listingFacts = useMemo((): ScarceListingFacts => {
    return {
      title,
      kind: isPrimaryMint ? 'mint' : 'resale',
      askNear: priceNear ?? null,
      mintPriceNear: isPrimaryMint
        ? (priceNear ?? null)
        : mintPriceNear,
      mintedAtMs,
      listedAtMs: listing?.listedAtMs ?? null,
      copies: copies ?? null,
      remaining: remaining ?? null,
      mediumKind: embed?.mediumKind ?? null,
      authorId: artistId ?? null,
      sellerId: sellerId ?? null,
      sourcePostPath: resolvedSourcePostPath,
      postHref: listing?.postHref ?? null,
      collectionId: collectionId ?? null,
      tokenId: tokenId ?? null,
      listingId: listingId ?? null,
      royalty,
    };
  }, [
    title,
    isPrimaryMint,
    priceNear,
    mintPriceNear,
    mintedAtMs,
    listing?.listedAtMs,
    listing?.postHref,
    copies,
    remaining,
    embed?.mediumKind,
    artistId,
    sellerId,
    resolvedSourcePostPath,
    collectionId,
    tokenId,
    listingId,
    royalty,
  ]);

  async function handleSubmit() {
    setFieldError(null);

    if (isOwnListing) {
      setFieldError('You can’t buy your own listing.');
      return;
    }

    if (!isLazyBuy && !isDropBuy && !isMarketBuy) {
      setFieldError(
        status === 'lazy_listing' || status === 'listed' || status === 'drop'
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
      } else if (isDropBuy) {
        // Free drops (priceNear null/"0") omit deposit opts — same as the
        // former collection-page mint path. Paid drops need a deposit × qty.
        const isFree = !fallbackDeposit || fallbackDeposit === '0';
        let depositYocto: string | undefined;
        if (!isFree && fallbackDeposit) {
          try {
            depositYocto = (
              BigInt(fallbackDeposit) * BigInt(mintQty)
            ).toString();
          } catch {
            depositYocto = fallbackDeposit;
          }
        }
        response = await client.scarces.collections.purchaseFrom(
          collectionId!,
          priceNear ?? '0',
          {
            quantity: mintQty,
            ...(depositYocto ? { depositYocto } : {}),
          }
        );
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
        submittedMessage: isPrimaryMint
          ? txToastConfirming.mintingCollection
          : txToastConfirming.buyingScarce,
        successMessage: isPrimaryMint
          ? txToastSuccess.collectionMinted
          : txToastSuccess.scarcePurchased,
        failureMessage: isPrimaryMint
          ? txToastError.mintCollectionFailed
          : txToastError.buyScarceFailed,
      });
      if (!confirmed) return;

      if (post) {
        const key = postScarceKey(post.accountId, post.postId);
        if (isDropBuy && collectionId) {
          const shell = await createReadOnlyOnSocialClient()
            .query.scarces.collectionCurrent(collectionId)
            .catch(() => null);
          const nextRemaining = shell?.remaining;
          if (nextRemaining != null && nextRemaining > 0) {
            setScarceEmbedOverride(key, {
              status: 'drop',
              collectionId,
              ...(priceNear ? { priceNear } : {}),
              ...(shell?.totalSupply != null
                ? { copies: shell.totalSupply }
                : copies != null
                  ? { copies }
                  : {}),
              remaining: nextRemaining,
              events: [],
            });
          } else {
            setScarceEmbedOverride(key, {
              status: 'sold',
              collectionId,
              ...(priceNear ? { priceNear } : {}),
              events: [],
            });
          }
        } else {
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
          cause instanceof Error
            ? cause.message
            : isPrimaryMint
              ? txToastError.mintCollectionFailed
              : txToastError.buyScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }

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
      {/* Same cover plane as Market — post preview is list/compose only. */}
      {resolvedPlayable ? (
        <ScarceClipPlayer
          key={resolvedPlayable.url}
          clip={resolvedPlayable}
          {...(resolvedPlayables?.length ? { tracks: resolvedPlayables } : {})}
          poster={resolvedMediaUrl}
          commerce
          {...(collectionId
            ? {
                persist: {
                  collectionId,
                  title,
                },
                creatorId: artistId ?? sellerId,
              }
            : {})}
        />
      ) : resolvedMediaUrl ? (
        <ScarceBuyCover src={resolvedMediaUrl} label={title} />
      ) : post ? (
        <ScarcePostPreview
          post={post}
          creatorDisplayName={artistProfileName ?? authorName}
          creatorAvatarUrl={artistAvatarUrl}
          mediaUrl={resolvedMediaUrl}
          disableLiveSvg
          cardBg={embed?.cardBg ?? listing?.cardBg}
        />
      ) : null}

      <div className="scarce-buy-summary">
        <p className="scarce-buy-title">{title}</p>
        {artistId ? (
          <PartyLine
            label="Author"
            accountId={artistId}
            displayNameValue={
              artistId === post?.accountId
                ? (authorName ?? artistProfileName)
                : artistProfileName
            }
            avatarUrl={artistAvatarUrl}
          />
        ) : null}
        {showDistinctSeller && sellerId ? (
          <PartyLine
            label="Seller"
            accountId={sellerId}
            displayNameValue={sellerProfileName}
            avatarUrl={sellerAvatarUrl}
          />
        ) : null}
        <p className="scarce-buy-price">
          {formatPriceNear(isDropBuy ? totalPriceNear : priceNear)}
        </p>
        {copies != null && copies > 1 ? (
          <p className="profile-support-hint">
            {remaining != null && remaining < copies
              ? `${remaining} of ${copies} left`
              : `${copies} editions`}
          </p>
        ) : null}
        {(() => {
          const listedLabel = listing?.listedAtMs
            ? formatMarketRelativeTime(listing.listedAtMs)
            : '';
          const mintedLabel = mintedAtMs
            ? formatMarketRelativeTime(mintedAtMs)
            : '';
          const mintPriceLabel =
            !isPrimaryMint && mintPriceNear
              ? formatPriceNear(mintPriceNear)
              : isPrimaryMint && priceNear
                ? formatPriceNear(priceNear)
                : '';
          if (isPrimaryMint) {
            return (
              <ScarceBuyFactsMeta
                parts={
                  mintPriceLabel
                    ? ['Mint', mintPriceLabel]
                    : ['Primary mint']
                }
                onOpenFacts={() => setFactsOpen(true)}
              />
            );
          }
          const parts = [
            listedLabel ? `Listed ${listedLabel}` : null,
            mintedLabel ? `Minted ${mintedLabel}` : null,
            mintPriceLabel || null,
          ].filter((part): part is string => Boolean(part));
          return (
            <ScarceBuyFactsMeta
              parts={parts.length > 0 ? parts : ['Resale']}
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
      />

      {status !== 'lazy_listing' ? <ScarceTraits tokenId={tokenId} /> : null}

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
        <p className="profile-support-hint">
          {isPrimaryMint
            ? 'Connect to mint this scarce.'
            : 'Connect to buy this scarce.'}
        </p>
      ) : !isBuyable ? (
        <p className="profile-support-hint">
          {status === 'lazy_listing' || status === 'listed'
            ? 'Listing isn’t ready yet…'
            : 'This scarce isn’t for sale.'}
        </p>
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
