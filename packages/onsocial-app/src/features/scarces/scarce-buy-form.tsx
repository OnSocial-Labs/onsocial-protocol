'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { PostRow, PostScarceEmbed } from '@onsocial/sdk';
import { ProfileAvatar } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  fetchScarceListingMeta,
  fetchScarceMintedAt,
  formatMarketRelativeTime,
  findLiveListingForPost,
  type ScarcePlayableMedia,
} from '@/features/market/market-listings';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { ScarcePostPreview } from '@/features/scarces/scarce-post-preview';
import { ScarceProvenanceCopy } from '@/features/scarces/scarce-provenance-copy';
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
import { parsePostText } from '@/lib/post-display';
import { postThreadPath } from '@/lib/post-routes';
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
    status: PostScarceEmbed['status'];
    priceNear?: string;
    title?: string;
    description?: string;
    mediaUrl?: string | null;
    creatorId?: string;
    cardBg?: string;
    copies?: number;
    remaining?: number;
    sourcePostPath?: string;
    postHref?: string | null;
    listedAtMs?: number;
    playable?: ScarcePlayableMedia;
    playables?: ScarcePlayableMedia[];
  } | null;
  embed?: PostScarceEmbed | null;
  /** Profile display name for text-card preview byline. */
  authorName?: string | null;
  onSuccess?: (detail: ScarceBuySuccessDetail) => void;
  /** Secondary path for fixed-price resales — opens offer sheet. */
  onMakeOffer?: () => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
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
  formId,
  post = null,
  listing = null,
  embed = null,
  authorName = null,
  onSuccess,
  onMakeOffer,
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
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);
  const [creatorProfileName, setCreatorProfileName] = useState<string | null>(
    null
  );

  const status = listing?.status ?? embed?.status ?? 'none';
  const listingId = listing?.listingId ?? embed?.listingId;
  const tokenId = listing?.tokenId ?? embed?.tokenId;
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
    listing?.sourcePostPath?.trim() || hydratedSourcePostPath || null;
  const resolvedPlayable = listing?.playable ?? hydratedPlayable;
  const resolvedPlayables =
    listing?.playables ?? hydratedPlayables ?? undefined;
  const sellerId = listing?.creatorId ?? post?.accountId;
  const authorHandle = sellerId ? fallbackLabel(sellerId) : null;
  const authorHref = post
    ? postThreadPath(post)
    : sellerId
      ? portfolioPath(sellerId)
      : null;
  const authorDisplayName = sellerId
    ? displayName(sellerId, creatorProfileName ?? authorName ?? undefined)
    : null;
  const authorNameIsCustom =
    Boolean(authorDisplayName) &&
    Boolean(authorHandle) &&
    authorDisplayName!.toLowerCase() !== authorHandle!.toLowerCase();

  useEffect(() => {
    const accountId = sellerId?.trim();
    if (!accountId) {
      setCreatorAvatarUrl(null);
      setCreatorProfileName(null);
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
        setCreatorAvatarUrl(faceUrl);
        setCreatorProfileName(profile?.name?.trim() || null);
      } catch {
        if (!cancelled) {
          setCreatorAvatarUrl(null);
          setCreatorProfileName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

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
    if (!id || status === 'lazy_listing') {
      setMintedAtMs(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const minted = await fetchScarceMintedAt(id);
      if (!cancelled) setMintedAtMs(minted);
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenId, status]);

  const isOwnListing =
    Boolean(viewerAccountId) &&
    Boolean(sellerId) &&
    accountIdsEqual(viewerAccountId!, sellerId!);

  const isLazyBuy = status === 'lazy_listing' && Boolean(listingId);
  const isMarketBuy = status === 'listed' && Boolean(tokenId);
  const isBuyable = !isOwnListing && (isLazyBuy || isMarketBuy);

  const canSubmit = isConnected && !pending && isBuyable;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (isOwnListing) return null;
    return {
      visible: true,
      primaryLabel: isConnected ? 'Buy' : 'Connect wallet',
      primaryPendingLabel: 'Buying…',
      canSubmit: isConnected ? canSubmit : true,
      pending,
      disabled: pending || (isConnected && !canSubmit),
      secondary:
        isMarketBuy && onMakeOffer && isConnected
          ? {
              label: 'Make an offer',
              disabled: pending,
              onClick: onMakeOffer,
            }
          : null,
    };
  }, [canSubmit, isConnected, isMarketBuy, isOwnListing, onMakeOffer, pending]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

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
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {/* A video scarce mints a still as its cover — show that as the
          poster and let the buyer play the clip they are actually paying
          for, rather than sending them off to the source post. */}
      {resolvedPlayable ? (
        <ScarceClipPlayer
          key={resolvedPlayable.url}
          clip={resolvedPlayable}
          {...(resolvedPlayables?.length
            ? { tracks: resolvedPlayables }
            : {})}
          poster={resolvedMediaUrl}
        />
      ) : post ? (
        <ScarcePostPreview
          post={post}
          creatorDisplayName={authorName}
          creatorAvatarUrl={creatorAvatarUrl}
          mediaUrl={resolvedMediaUrl}
          cardBg={embed?.cardBg ?? listing?.cardBg}
        />
      ) : resolvedMediaUrl ? (
        <div className="scarce-buy-media" aria-hidden>
          <img src={resolvedMediaUrl} alt="" />
        </div>
      ) : null}

      <div className="scarce-buy-summary">
        {!post ? <p className="scarce-buy-title">{title}</p> : null}
        {authorHandle && authorHref ? (
          <p className="scarce-buy-author-line">
            <span className="scarce-buy-author-label">Author</span>
            <Link
              href={authorHref}
              scroll={false}
              className="scarce-sell-from-author"
            >
              <ProfileAvatar
                src={creatorAvatarUrl}
                size="sm"
                className="scarce-sell-from-avatar"
              />
              {authorNameIsCustom ? (
                <>
                  <span className="scarce-sell-from-name">
                    {authorDisplayName}
                  </span>
                  <span className="scarce-sell-from-handle">
                    @{authorHandle}
                  </span>
                </>
              ) : (
                <span className="scarce-sell-from-name">@{authorHandle}</span>
              )}
            </Link>
          </p>
        ) : null}
        <p className="scarce-buy-price">{formatPriceNear(priceNear)}</p>
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
          if (!listedLabel && !mintedLabel) return null;
          return (
            <p className="profile-support-hint">
              {[
                listedLabel ? `Listed ${listedLabel}` : null,
                mintedLabel ? `Minted ${mintedLabel}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          );
        })()}
        <p className="profile-support-hint">
          {status === 'lazy_listing'
            ? 'Mints to you. Creator is paid after a 2% marketplace fee.'
            : 'Transfers to you. Seller is paid after a 2% marketplace fee.'}
        </p>
      </div>

      <ScarceProvenanceCopy
        title={title}
        description={resolvedDescription}
        post={post}
        postHref={listing?.postHref}
        sourcePostPath={resolvedSourcePostPath ?? listing?.sourcePostPath}
        hideOriginalLink={Boolean(post)}
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
        <p className="profile-support-hint">Connect to buy this scarce.</p>
      ) : !isBuyable ? (
        <p className="profile-support-hint">
          {status === 'lazy_listing' || status === 'listed'
            ? 'Listing isn’t ready yet…'
            : 'This scarce isn’t for sale.'}
        </p>
      ) : null}
    </form>
  );
}
