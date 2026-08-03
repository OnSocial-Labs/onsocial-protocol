'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import {
  Divider,
  GlassSheet,
  InformationCircleFillIcon,
  ProfileAvatar,
  ShareIcon,
  SheetHeader,
  ShopFillIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { GuildDescriptionClamp } from '@/features/guilds/guild-description-clamp';
import { CollectionAllowlistManager } from '@/features/scarces/collection-allowlist-manager';
import {
  CollectionActivityRows,
  type CollectionActivityRow,
} from '@/features/scarces/collection-activity-rows';
import { CollectionFactsSheet } from '@/features/scarces/collection-facts-sheet';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  fetchAllowlistRemaining,
  fetchCollection,
  fetchWalletMintRemaining,
  isCollectionMintable,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_MARKET_PATH,
  marketCreatorPath,
  seriesPagePath,
} from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { formatMarketRelativeTime } from '@/features/market/market-listings';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel, resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const MINT_ACTIVITY_OPS = new Set([
  'purchase',
  'creator_mint',
  'mint_from_collection',
  'airdrop',
]);

const ACTIVITY_PREVIEW_LIMIT = 3;

const NEAR_DECIMALS = 24;

function yoctoToNearDisplay(raw: string | null | undefined): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(NEAR_DECIMALS + 1, '0');
  const whole = padded.slice(0, padded.length - NEAR_DECIMALS) || '0';
  const frac = padded.slice(padded.length - NEAR_DECIMALS).replace(/0+$/, '');
  const near = frac ? `${whole}.${frac}` : whole;
  const n = Number.parseFloat(near);
  if (!Number.isFinite(n)) return near;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

const OPERATION_LABEL: Record<string, string> = {
  create: 'Drop created',
  purchase: 'Minted',
  creator_mint: 'Minted',
  mint_from_collection: 'Minted',
  airdrop: 'Airdropped',
  cancel: 'Cancelled',
  refund: 'Refunded',
  set_allowlist: 'Allowlist updated',
  pause: 'Paused',
  resume: 'Resumed',
};

function statusTone(status: CollectionStatus): string {
  if (status === 'live') return 'is-live';
  if (status === 'sold_out' || status === 'ended' || status === 'cancelled') {
    return 'is-closed';
  }
  return 'is-idle';
}

function scheduleLine(
  view: CollectionView,
  status: CollectionStatus
): string | null {
  if (status === 'upcoming' && view.startTimeMs) {
    const rel = formatMarketRelativeTime(view.startTimeMs);
    return rel ? `Opens ${rel}` : null;
  }
  if (status === 'live' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs);
    return rel ? `Closes ${rel}` : null;
  }
  if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs);
    return rel ? `Closed ${rel}` : null;
  }
  return null;
}

export function CollectionPagePanel({
  collectionId,
  initial,
}: {
  collectionId: string;
  initial: CollectionView | null;
}) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [view, setView] = useState<CollectionView | null>(initial);
  const [notFound, setNotFound] = useState(initial == null);
  const [activity, setActivity] = useState<CollectionActivityRow[]>([]);
  const [walletRemaining, setWalletRemaining] = useState<number | null>(null);
  /** null = not checked yet / N/A; number = remaining allowlist mints. */
  const [allowlistRemaining, setAllowlistRemaining] = useState<number | null>(
    null
  );
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);
  const [headerElevated, setHeaderElevated] = useState(false);
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);
  const [creatorDisplayName, setCreatorDisplayName] = useState<string | null>(
    null
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityClosing, setActivityClosing] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const activityTitleId = useId();
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const activitySheetOpen = activityOpen && !activityClosing;
  useScrollLock(activityOpen || activityClosing);

  const isOwner =
    Boolean(viewerAccountId) &&
    view != null &&
    accountIdsEqual(viewerAccountId!, view.creatorId);
  const hasImmersiveCover = Boolean(view?.mediaUrl || view?.cardBg);

  // Refresh the live record on mount and after a mint.
  useEffect(() => {
    let cancelled = false;
    void fetchCollection(collectionId).then((next) => {
      if (cancelled) return;
      if (next) {
        setView(next);
        setNotFound(false);
      } else if (!initial) {
        setNotFound(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, initial, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.scarces
      .collection(collectionId, { limit: 48 })
      .then((rows) => {
        if (cancelled) return;
        setActivity(
          rows.map((row, index) => {
            const operation = row.operation?.trim() || 'unknown';
            const isCreate = operation === 'create';
            return {
              key: `${operation}:${row.blockTimestamp}:${index}`,
              operation,
              label: OPERATION_LABEL[operation] ?? operation,
              actor:
                row.buyerId?.trim() ||
                row.ownerId?.trim() ||
                row.author?.trim() ||
                null,
              time: formatMarketRelativeTime(row.blockTimestamp) ?? '',
              // Create is not a sale — never show a price on that row.
              priceNear: isCreate
                ? null
                : yoctoToNearDisplay(row.price ?? row.amount),
            };
          })
        );
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, refreshKey]);

  useEffect(() => {
    if (!viewerAccountId) {
      setWalletRemaining(null);
      setAllowlistRemaining(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchWalletMintRemaining(collectionId, viewerAccountId),
      fetchAllowlistRemaining(collectionId, viewerAccountId),
    ]).then(([wallet, allowlist]) => {
      if (cancelled) return;
      setWalletRemaining(wallet);
      setAllowlistRemaining(allowlist);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, viewerAccountId, refreshKey]);

  useEffect(() => {
    const creatorId = view?.creatorId?.trim();
    if (!creatorId) {
      setCreatorAvatarUrl(null);
      setCreatorDisplayName(null);
      return;
    }
    let cancelled = false;
    setCreatorAvatarUrl(null);
    setCreatorDisplayName(null);
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        // Prefer profilesCurrent (full field rows). profileSearch can omit
        // accounts that still have a name/avatar on-chain.
        const [profile, statsRows] = await Promise.all([
          client.profiles.get(creatorId),
          client.query.profiles.statsForAccounts([creatorId]),
        ]);
        if (cancelled) return;
        const media = profile ? client.profiles.avatarMedia(profile) : null;
        const faceFromProfile =
          media?.kind === 'image'
            ? media.url
            : (media?.poster ?? client.profiles.avatarUrl(profile) ?? null);
        const stats = statsRows[0];
        const faceUrl =
          faceFromProfile ||
          (stats?.avatar ? resolveProfileMediaUrl(stats.avatar) : null);
        setCreatorAvatarUrl(faceUrl);
        const handle = fallbackLabel(creatorId);
        const rawName =
          profile?.name?.trim() || stats?.name?.trim() || null;
        const hasDisplayName =
          Boolean(rawName) &&
          rawName!.toLowerCase() !== handle.toLowerCase() &&
          rawName!.toLowerCase() !== creatorId.toLowerCase();
        setCreatorDisplayName(hasDisplayName ? rawName : null);
      } catch {
        if (!cancelled) {
          setCreatorAvatarUrl(null);
          setCreatorDisplayName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view?.creatorId]);

  const status = view ? deriveCollectionStatus(view, nowMs) : 'ended';
  // Early access (before start) is allowlist-gated on-chain; allowlist-only
  // drops also gate in the UI so Collect matches product intent.
  const needsAllowlist =
    view != null && (status === 'upcoming' || view.allowlistOnly);
  const allowlistOk =
    !needsAllowlist ||
    (allowlistRemaining != null && allowlistRemaining > 0);
  // Live always; upcoming only when this wallet still has allowlist allocation.
  const mintable =
    view != null &&
    (isCollectionMintable(status) ||
      (status === 'upcoming' && allowlistOk && allowlistRemaining != null));

  // Tick a clock only while a timed drop is counting down.
  const hasClock =
    view != null &&
    ((view.startTimeMs != null && status === 'upcoming') ||
      (view.endTimeMs != null && status === 'live'));
  useEffect(() => {
    if (!hasClock) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasClock]);

  const maxQuantity = useMemo(() => {
    if (!view) return 1;
    const caps = [view.remaining];
    if (walletRemaining != null) caps.push(walletRemaining);
    if (view.maxPerWallet != null) caps.push(view.maxPerWallet);
    if (needsAllowlist && allowlistRemaining != null) {
      caps.push(allowlistRemaining);
    }
    const positive = caps.filter((n) => n > 0);
    if (positive.length === 0) return 1;
    const cap = Math.min(...positive, 10);
    return Math.max(1, Number.isFinite(cap) ? cap : 1);
  }, [view, walletRemaining, allowlistRemaining, needsAllowlist]);

  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQuantity));
  }, [maxQuantity]);

  // Title handoff: elevate immersive nav once the drop name scrolls under it
  // — same recipe as guild / hub (no room-filter rail).
  const handoffKey = hasImmersiveCover ? (view?.collectionId ?? null) : null;
  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || !handoffKey) return;

    const heroTitle = heroTitleRef.current;
    const header = scrollRoot.parentElement?.querySelector(
      '.os-app-screen-header'
    );
    const screen = scrollRoot.closest<HTMLElement>('.os-app-screen') ?? null;

    const syncElevated = () => {
      const scrolled = scrollRoot.scrollTop > 8;
      if (!heroTitle) {
        setHeaderElevated(scrollRoot.scrollTop > 18);
        return;
      }
      const headerBottom =
        header?.getBoundingClientRect().bottom ??
        scrollRoot.getBoundingClientRect().top + 72;
      const heroRect = heroTitle.getBoundingClientRect();
      const titleTop = heroRect.top;

      if (heroRect.height > 0) {
        const fadeZone = 28;
        const distance = titleTop - headerBottom;
        const t = Math.max(0, Math.min(1, 1 - distance / fadeZone));
        screen?.style.setProperty('--title-handoff', String(t));
      }

      setHeaderElevated((current) => {
        if (current) {
          return scrolled && titleTop < headerBottom + 2;
        }
        return scrolled && titleTop < headerBottom - 4;
      });
    };

    syncElevated();
    scrollRoot.addEventListener('scroll', syncElevated, { passive: true });
    window.addEventListener('resize', syncElevated, { passive: true });
    return () => {
      scrollRoot.removeEventListener('scroll', syncElevated);
      window.removeEventListener('resize', syncElevated);
      screen?.style.removeProperty('--title-handoff');
      setHeaderElevated(false);
    };
  }, [handoffKey]);

  const totalYocto = useMemo(() => {
    if (!view) return '0';
    try {
      return (BigInt(view.priceYocto) * BigInt(quantity)).toString();
    } catch {
      return '0';
    }
  }, [view, quantity]);
  const totalNear = yoctoToNearDisplay(totalYocto);

  const handleMint = useCallback(async () => {
    if (!view || pending || !mintable) return;
    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const isFree = view.priceYocto === '0';
      const response = await client.scarces.collections.purchaseFrom(
        view.collectionId,
        view.priceNear ?? '0',
        {
          quantity,
          ...(isFree ? {} : { depositYocto: totalYocto }),
        }
      );
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.mintingCollection,
        successMessage: txToastSuccess.collectionMinted,
        failureMessage: txToastError.mintCollectionFailed,
      });
      if (!confirmed) return;
      setRefreshKey((k) => k + 1);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.mintCollectionFailed,
      });
    } finally {
      setPending(false);
    }
  }, [
    view,
    pending,
    mintable,
    quantity,
    totalYocto,
    getSigningWallet,
    trackTransaction,
    setTxResult,
  ]);

  const handleShare = useCallback(async () => {
    if (!view) return;
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    const title = view.title.trim() || 'Drop';
    const text = `Mint ${title} on OnSocial`;

    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (cause) {
        if (
          cause instanceof DOMException &&
          (cause.name === 'AbortError' || cause.name === 'NotAllowedError')
        ) {
          return;
        }
        // Fall through to clipboard when share isn’t available for this payload.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      setTxResult({
        type: 'error',
        msg: 'Couldn’t copy the link.',
      });
    }
  }, [setTxResult, view]);

  const sheetActivity = useMemo(
    () => activity.filter((row) => row.operation !== 'create'),
    [activity]
  );
  const mintPreview = useMemo(
    () =>
      sheetActivity
        .filter((row) => MINT_ACTIVITY_OPS.has(row.operation))
        .slice(0, ACTIVITY_PREVIEW_LIMIT),
    [sheetActivity]
  );
  const activityAccountIds = useMemo(
    () =>
      sheetActivity
        .map((row) => row.actor?.trim() || '')
        .filter(Boolean),
    [sheetActivity]
  );
  const activityProfiles = usePostAuthorProfiles(activityAccountIds);
  const requestActivityClose = useCallback(() => {
    setActivityClosing(true);
  }, []);
  const handleActivityClosed = useCallback(() => {
    setActivityClosing(false);
    setActivityOpen(false);
  }, []);

  if (notFound || !view) {
    return (
      <OsAppScreen title="Drop" backFallbackHref={APP_MARKET_PATH}>
        <div className="market-page">
          <p className="market-page-status">
            This drop isn’t available.{' '}
            <Link className="app-soon-link" href={APP_MARKET_PATH}>
              Back to Market
            </Link>
          </p>
        </div>
      </OsAppScreen>
    );
  }

  const progressPct =
    view.totalSupply > 0
      ? Math.min(100, Math.round((view.minted / view.totalSupply) * 100))
      : 0;
  const schedule = scheduleLine(view, status);
  const allowlistBlocked =
    needsAllowlist &&
    isConnected &&
    allowlistRemaining != null &&
    allowlistRemaining < 1;
  const allowlistPending =
    needsAllowlist && isConnected && allowlistRemaining == null;
  const mintDisabledReason = !mintable
    ? status === 'sold_out'
      ? 'This drop is sold out.'
      : status === 'upcoming' && allowlistBlocked
        ? 'Early access is allowlist only.'
        : status === 'upcoming'
          ? 'Minting hasn’t opened yet.'
          : status === 'paused'
            ? 'The creator paused this drop.'
            : status === 'cancelled'
              ? 'This drop was cancelled.'
              : 'This drop has closed.'
    : walletRemaining === 0
      ? 'You’ve reached your limit for this drop.'
      : allowlistBlocked
        ? 'You’re not on the allowlist.'
        : null;
  const canMint =
    isConnected &&
    mintable &&
    walletRemaining !== 0 &&
    allowlistOk &&
    !allowlistPending &&
    !pending;
  // Pin the commerce band while minting is still in play (collectors) or
  // while the owner can share a live / upcoming drop.
  const pinCollect = status === 'live' || status === 'upcoming';
  const playables = view.playables;
  const hasPlayables = playables.length > 0;
  const isMusic = view.kind === 'music' || hasPlayables;
  const description = view.description?.trim() ?? '';
  const chipParts: string[] = [];
  if (view.isVariations) {
    chipParts.push(
      view.randomAssignment
        ? `${view.totalSupply} unique · random`
        : `${view.totalSupply} unique`
    );
  }
  if (schedule) chipParts.push(schedule);
  if (view.allowlistOnly) chipParts.push('Allowlist');
  const personalAllowlistLeft =
    needsAllowlist &&
    isConnected &&
    allowlistRemaining != null &&
    allowlistRemaining > 0
      ? allowlistRemaining
      : null;
  const immersive = hasImmersiveCover;
  const createdRel =
    view.createdAtMs > 0
      ? formatMarketRelativeTime(view.createdAtMs)
      : '';
  const showActivitySection = mintPreview.length > 0 || sheetActivity.length > 0;
  const showActivitySeeAll = sheetActivity.length > mintPreview.length;

  const collectBand = (
    <section
      className="collection-action-band"
      aria-label={isOwner ? 'Drop' : 'Mint'}
    >
      <div className="collection-commerce">
        <div className="collection-commerce-line">
          <div className="collection-commerce-meta">
            <span className="collection-commerce-supply">
              {view.minted}/{view.totalSupply}
            </span>
            {personalAllowlistLeft != null ? (
              <>
                <span className="collection-meta-sep" aria-hidden>
                  ·
                </span>
                <span className="collection-commerce-chips">
                  {personalAllowlistLeft === 1
                    ? '1 left for you'
                    : `${personalAllowlistLeft} left for you`}
                </span>
              </>
            ) : null}
            {chipParts.length > 0 ? (
              <>
                <span className="collection-meta-sep" aria-hidden>
                  ·
                </span>
                <span className="collection-commerce-chips">
                  {chipParts.join(' · ')}
                </span>
              </>
            ) : null}
          </div>
          {isOwner ? (
            <button
              type="button"
              className="collection-commerce-share"
              aria-label={shareCopied ? 'Link copied' : 'Share drop link'}
              onClick={() => {
                void handleShare();
              }}
            >
              <ShareIcon
                aria-hidden
                className="collection-commerce-share-icon"
              />
            </button>
          ) : null}
        </div>
        <div
          className="collection-progress-track"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Editions minted"
        >
          <span
            className="collection-progress-fill"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {!isOwner ? (
        <div className="collection-mint-row">
          {mintable && maxQuantity > 1 ? (
            <div className="collection-qty" role="group" aria-label="Quantity">
              <button
                type="button"
                className="collection-qty-btn"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={pending || quantity <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="collection-qty-value" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="collection-qty-btn"
                onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                disabled={pending || quantity >= maxQuantity}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          ) : null}
          <OsSheetActions
            layout="stack"
            tone="frosted-primary"
            borderless
            className="collection-mint-actions"
          >
            <OsSheetAction
              type="button"
              variant="primary"
              ready={canMint}
              disabled={!canMint}
              pending={pending}
              pendingLabel="Minting…"
              onClick={() => {
                void handleMint();
              }}
            >
              {!isConnected
                ? 'Connect to mint'
                : view.priceYocto === '0'
                  ? 'Mint'
                  : `Mint · ${totalNear} NEAR`}
            </OsSheetAction>
          </OsSheetActions>
        </div>
      ) : null}

      {mintDisabledReason && !isOwner ? (
        <p className="collection-mint-hint">{mintDisabledReason}</p>
      ) : null}
    </section>
  );

  return (
    <OsAppScreen
      title={view.title}
      backFallbackHref={APP_MARKET_PATH}
      immersiveHeader={immersive}
      headerElevated={immersive ? headerElevated : false}
      scrollRootRef={scrollRootRef}
      footer={pinCollect ? collectBand : undefined}
      actions={
        <Link
          href={marketCreatorPath(view.creatorId)}
          scroll={false}
          className={osIconActionClassName}
          aria-label="Shop this creator"
        >
          <ShopFillIcon aria-hidden />
        </Link>
      }
    >
      {immersive ? (
        <div
          aria-hidden
          className={`os-chrome-glass${headerElevated ? ' is-frosted' : ''}`}
        />
      ) : null}
      <div className="collection-page">
        <section className="collection-hero" aria-label="Drop cover">
          <div
            className={`collection-cover${view.mediaUrl ? ' has-media' : ''}${
              isMusic ? ' is-square' : ''
            }${immersive ? ' is-immersive' : ''}`}
            {...(view.cardBg && !view.mediaUrl
              ? { style: { background: view.cardBg } }
              : {})}
          >
            {view.mediaUrl ? <img src={view.mediaUrl} alt="" /> : null}
            <span className={`collection-status ${statusTone(status)}`}>
              {collectionStatusLabel(status)}
            </span>
          </div>

          <header className="collection-head">
            <div className="collection-title-row">
              <h1 className="collection-title" ref={heroTitleRef}>
                {view.title}
              </h1>
              <button
                type="button"
                className="guild-hero-facts-button"
                aria-label="Drop facts"
                onClick={() => setFactsOpen(true)}
              >
                <InformationCircleFillIcon
                  className="guild-hero-facts-icon"
                  aria-hidden
                />
              </button>
            </div>
            <div className="collection-meta">
              <Link
                href={portfolioPath(view.creatorId)}
                scroll={false}
                className="collection-meta-avatar-link"
                tabIndex={creatorDisplayName ? -1 : undefined}
                aria-hidden={creatorDisplayName ? true : undefined}
              >
                <ProfileAvatar
                  src={creatorAvatarUrl}
                  fallbackInitial={
                    creatorDisplayName || fallbackLabel(view.creatorId)
                  }
                  size="sm"
                  className="collection-meta-avatar"
                />
              </Link>
              <div className="collection-meta-copy">
                {creatorDisplayName ? (
                  <Link
                    href={portfolioPath(view.creatorId)}
                    scroll={false}
                    className="collection-meta-creator-name"
                  >
                    by {creatorDisplayName}
                  </Link>
                ) : null}
                <div className="collection-meta-sub">
                  {creatorDisplayName ? (
                    <span className="collection-meta-handle">
                      @{fallbackLabel(view.creatorId)}
                    </span>
                  ) : (
                    <Link
                      href={portfolioPath(view.creatorId)}
                      scroll={false}
                      className="collection-meta-handle"
                    >
                      @{fallbackLabel(view.creatorId)}
                    </Link>
                  )}
                  {view.seriesId ? (
                    <>
                      <span className="collection-meta-sep" aria-hidden>
                        ·
                      </span>
                      <Link
                        href={seriesPagePath(view.creatorId, view.seriesId)}
                        scroll={false}
                        className="collection-meta-link"
                      >
                        {view.seriesTitle ?? view.seriesId}
                      </Link>
                    </>
                  ) : null}
                  {createdRel ? (
                    <>
                      <span className="collection-meta-sep" aria-hidden>
                        ·
                      </span>
                      <span className="collection-meta-time">{createdRel}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
            {description ? (
              <GuildDescriptionClamp text={description} />
            ) : null}
          </header>
        </section>

        {hasPlayables ? (
          <section className="collection-tracks" aria-label="Tracks">
            <p className="collection-section-label">
              {playables.length === 1
                ? '1 track'
                : `${playables.length} tracks`}
            </p>
            <ScarceClipPlayer
              key={playables[0]!.url}
              clip={playables[0]!}
              tracks={playables}
              poster={view.mediaUrl}
              layout="tracks"
            />
          </section>
        ) : null}

        {isOwner ? (
          <div className="collection-owner-tools">
            <CollectionAllowlistManager
              collectionId={view.collectionId}
              creatorId={view.creatorId}
              maxPerWallet={view.maxPerWallet}
            />
          </div>
        ) : null}

        {view.sourcePostPath ? (
          <Link
            href={`/${view.sourcePostPath}`}
            scroll={false}
            className="collection-source-link"
          >
            View source post
          </Link>
        ) : null}

        {showActivitySection ? (
          <section className="collection-activity" aria-label="Drop activity">
            <Divider variant="detail" />
            <div className="collection-activity-head">
              <p className="collection-section-label">Activity</p>
              {showActivitySeeAll ? (
                <button
                  type="button"
                  className="collection-activity-more"
                  onClick={() => setActivityOpen(true)}
                >
                  See all
                </button>
              ) : null}
            </div>
            {mintPreview.length > 0 ? (
              <CollectionActivityRows
                rows={mintPreview}
                profiles={activityProfiles}
              />
            ) : null}
          </section>
        ) : null}

        {/* Closed / owner: keep Mint in-flow. Live collectors use screen footer. */}
        {!pinCollect ? collectBand : null}
      </div>

      <GlassSheet
        open={activitySheetOpen}
        onClose={requestActivityClose}
        onClosed={handleActivityClosed}
        tone="os"
        initialDetent="full"
        peekRatio={1}
        zIndex={58}
        ariaLabelledBy={activityTitleId}
        backdropLabel="Close activity"
        panelClassName="collection-activity-sheet-panel"
        bodyClassName="collection-activity-sheet-body"
        header={
          <>
            <SheetHeader
              titleId={activityTitleId}
              title="Activity"
              subtitle={view.title}
              onClose={requestActivityClose}
              closeAriaLabel="Close activity"
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        {sheetActivity.length > 0 ? (
          <CollectionActivityRows
            rows={sheetActivity}
            profiles={activityProfiles}
          />
        ) : (
          <p className="collection-activity-empty">No mint activity yet.</p>
        )}
      </GlassSheet>

      <CollectionFactsSheet
        open={factsOpen}
        onClose={() => setFactsOpen(false)}
        view={view}
        nowMs={nowMs}
      />
    </OsAppScreen>
  );
}
