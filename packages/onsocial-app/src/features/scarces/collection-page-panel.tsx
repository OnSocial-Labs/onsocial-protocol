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
  InformationCircleIcon,
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
import { CollectionQtyStepper } from '@/components/ui/collection-qty-stepper';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { CollectionAllowlistManager } from '@/features/scarces/collection-allowlist-manager';
import {
  CollectionAboutSheet,
  CollectionAboutTeaser,
} from '@/features/scarces/collection-about-sheet';
import { CollectionWritingReader } from '@/features/scarces/collection-writing-reader';
import { mapCollectionActivityRows } from '@/features/scarces/collection-activity-map';
import {
  CollectionActivityRows,
  type CollectionActivityRow,
} from '@/features/scarces/collection-activity-rows';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import {
  CollectionActivitySkeleton,
} from '@/features/scarces/collection-page-skeleton';
import { CollectionFactsSheet } from '@/features/scarces/collection-facts-sheet';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  fetchAllowlistRemaining,
  fetchCollectionPreferIndexer,
  fetchOwnsCollectionEdition,
  fetchWalletMintRemaining,
  isCollectionMintable,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
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
import { fallbackLabel } from '@/lib/profile-display';
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

const EMPTY_ACTIVITY: CollectionActivityRow[] = [];

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
  initialCreator = null,
  initialActivity = EMPTY_ACTIVITY,
}: {
  collectionId: string;
  initial: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
  initialActivity?: CollectionActivityRow[];
}) {
  const {
    accountId: viewerAccountId,
    isConnected,
    getSigningWallet,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [view, setView] = useState<CollectionView | null>(initial);
  const [notFound, setNotFound] = useState(initial == null);
  const [walletRemaining, setWalletRemaining] = useState<number | null>(null);
  /** null = not checked yet / N/A; number = remaining allowlist mints. */
  const [allowlistRemaining, setAllowlistRemaining] = useState<number | null>(
    null
  );
  /** null = unchecked; true/false after ownership scan for writing reader. */
  const [holdsEdition, setHoldsEdition] = useState<boolean | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [pending, setPending] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);
  const activityRequestKey = `${collectionId}:${refreshKey}`;
  const ssrActivityKey = `${collectionId}:0`;
  const [activityFetched, setActivityFetched] = useState<{
    key: string;
    rows: CollectionActivityRow[];
  } | null>(() =>
    initial != null
      ? { key: ssrActivityKey, rows: initialActivity }
      : null
  );
  const [headerElevated, setHeaderElevated] = useState(false);
  const initialCreatorId = initial?.creatorId?.trim() || '';
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(
    () => initialCreator?.avatarUrl ?? null
  );
  const [creatorDisplayName, setCreatorDisplayName] = useState<string | null>(
    () => initialCreator?.displayName ?? null
  );
  const [creatorResolvedKey, setCreatorResolvedKey] = useState(() =>
    initialCreator != null && initialCreatorId ? initialCreatorId : ''
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityClosing, setActivityClosing] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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

  // Soft indexer refresh after paint (minted/remaining/paused/price); RPC only if thin.
  // SSR already seeded a solid shell — skip the first keyed refetch.
  useEffect(() => {
    if (refreshKey === 0 && initial != null) return;
    let cancelled = false;
    void fetchCollectionPreferIndexer(collectionId).then((next) => {
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
    // SSR already seeded activity for first paint — refetch only after mint.
    if (refreshKey === 0 && initial != null) return;
    let cancelled = false;
    const key = activityRequestKey;
    const client = createReadOnlyOnSocialClient();
    void client.query.scarces
      .collection(collectionId, { limit: 48 })
      .then((rows) => {
        if (cancelled) return;
        setActivityFetched({
          key,
          rows: mapCollectionActivityRows(rows),
        });
      })
      .catch(() => {
        if (!cancelled) setActivityFetched({ key, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activityRequestKey, collectionId, initial, refreshKey]);

  useEffect(() => {
    if (!viewerAccountId) {
      setWalletRemaining(null);
      setAllowlistRemaining(null);
      setHoldsEdition(null);
      return;
    }
    let cancelled = false;
    const needsHoldCheck =
      (view?.readables.length ?? 0) > 0 ||
      Boolean(view?.writingManifestCid?.trim()) ||
      (view?.playables.length ?? 0) > 0;
    void Promise.all([
      fetchWalletMintRemaining(collectionId, viewerAccountId),
      fetchAllowlistRemaining(collectionId, viewerAccountId),
      needsHoldCheck
        ? fetchOwnsCollectionEdition(collectionId, viewerAccountId)
        : Promise.resolve(null),
    ]).then(([wallet, allowlist, owns]) => {
      if (cancelled) return;
      setWalletRemaining(wallet);
      setAllowlistRemaining(allowlist);
      setHoldsEdition(owns);
    });
    return () => {
      cancelled = true;
    };
  }, [
    collectionId,
    viewerAccountId,
    refreshKey,
    view?.readables.length,
    view?.writingManifestCid,
    view?.playables.length,
  ]);

  useEffect(() => {
    const creatorId = view?.creatorId?.trim();
    if (!creatorId) return;
    if (creatorResolvedKey === creatorId) return;
    let cancelled = false;
    void (async () => {
      const client = createReadOnlyOnSocialClient();
      const face = await fetchCollectionCreatorFace(client, creatorId);
      if (cancelled) return;
      setCreatorAvatarUrl(face.avatarUrl);
      setCreatorDisplayName(face.displayName);
      setCreatorResolvedKey(creatorId);
    })();
    return () => {
      cancelled = true;
    };
  }, [view?.creatorId, creatorResolvedKey]);

  const status = view ? deriveCollectionStatus(view, nowMs) : 'ended';
  // Before Opens, minting is allowlist-gated on-chain when a list exists.
  // After Opens, anyone can mint (open) — do not keep gating on the list.
  const needsAllowlist =
    view != null && status === 'upcoming' && view.hasAllowlist;
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

  const activityLoaded = activityFetched?.key === activityRequestKey;
  const activity = activityLoaded ? activityFetched.rows : EMPTY_ACTIVITY;
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
  const creatorId = view?.creatorId?.trim() || '';
  const creatorShellLoading =
    Boolean(creatorId) && creatorResolvedKey !== creatorId;
  const resolvedCreatorAvatar = creatorShellLoading
    ? null
    : creatorAvatarUrl;
  const resolvedCreatorName = creatorShellLoading
    ? null
    : creatorDisplayName;
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
  const isAudio =
    hasPlayables || view.kind === 'audio' || view.kind === 'music';
  const readables = view.readables;
  const hasReadables = readables.length > 0 || view.bookPdf != null;
  const canReadWriting =
    isOwner || holdsEdition === true;
  const writingLockedHint = !isConnected
    ? 'Connect your wallet and Collect an edition to read.'
    : holdsEdition === null
      ? 'Checking your edition…'
      : 'Collect an edition to unlock the full text.';
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
  if (view.hasAllowlist) chipParts.push('Early access');
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
  const showActivitySection =
    !activityLoaded || mintPreview.length > 0 || sheetActivity.length > 0;
  const showActivitySeeAll =
    activityLoaded && sheetActivity.length > mintPreview.length;

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
            <div className="collection-commerce-share-row">
              <button
                type="button"
                className="collection-commerce-post-feed"
                onClick={() => {
                  requestDropCompose({
                    collectionId: view.collectionId,
                    title: view.title,
                    ...(view.mediaUrl ? { mediaUrl: view.mediaUrl } : {}),
                    ...(view.kind ? { mediumKind: view.kind } : {}),
                  });
                }}
              >
                Post to feed
              </button>
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
            </div>
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
            <CollectionQtyStepper
              value={quantity}
              min={1}
              max={maxQuantity}
              disabled={pending}
              aria-label="Quantity"
              decreaseLabel="Decrease quantity"
              increaseLabel="Increase quantity"
              onChange={setQuantity}
            />
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
        <>
          <span
            className={`collection-header-status ${statusTone(status)}`}
          >
            {collectionStatusLabel(status)}
          </span>
          <Link
            href={marketCreatorPath(view.creatorId)}
            scroll={false}
            className={osIconActionClassName}
            aria-label="Shop this creator"
          >
            <ShopFillIcon aria-hidden />
          </Link>
        </>
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
          {isAudio && hasPlayables ? (
            <div
              className={`collection-music-hero${
                immersive ? ' is-immersive' : ''
              }`}
            >
              <ScarceClipPlayer
                key={`cover-${playables[0]!.url}`}
                clip={playables[0]!}
                tracks={playables}
                poster={view.mediaUrl}
                layout="cover"
                showTracks={false}
                persist={{
                  collectionId: view.collectionId,
                  title: view.title,
                }}
                creatorId={view.creatorId}
                canKeepOffline={
                  isOwner
                    ? true
                    : !viewerAccountId
                      ? false
                      : holdsEdition == null
                        ? null
                        : holdsEdition
                }
              />
            </div>
          ) : (
            <div
              className={`collection-cover${view.mediaUrl ? ' has-media' : ''}${
                isAudio ? ' is-square' : ''
              }${immersive ? ' is-immersive' : ''}`}
              {...(view.cardBg && !view.mediaUrl
                ? { style: { background: view.cardBg } }
                : {})}
            >
              {view.mediaUrl ? <img src={view.mediaUrl} alt="" /> : null}
            </div>
          )}

          <header className="collection-head">
            <div className="collection-title-row">
              <h1 className="collection-title" ref={heroTitleRef}>
                {view.title}
              </h1>
            </div>
            <div className="collection-meta">
              <Link
                href={portfolioPath(view.creatorId)}
                scroll={false}
                className="collection-meta-avatar-link"
                tabIndex={resolvedCreatorName ? -1 : undefined}
                aria-hidden={resolvedCreatorName ? true : undefined}
              >
                <ProfileAvatar
                  src={resolvedCreatorAvatar}
                  fallbackInitial={
                    resolvedCreatorName || fallbackLabel(view.creatorId)
                  }
                  shellLoading={creatorShellLoading}
                  size="sm"
                  className="collection-meta-avatar"
                />
              </Link>
              <div className="collection-meta-copy">
                {creatorShellLoading ? (
                  <span
                    className="standing-row-shimmer collection-skeleton-creator-name"
                    aria-hidden
                  />
                ) : resolvedCreatorName ? (
                  <Link
                    href={portfolioPath(view.creatorId)}
                    scroll={false}
                    className="collection-meta-creator-name"
                  >
                    by {resolvedCreatorName}
                  </Link>
                ) : null}
                <div className="collection-meta-sub">
                  {resolvedCreatorName ? (
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
                  <span className="collection-meta-sep" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    className="guild-hero-facts-button collectibles-play-facts"
                    aria-label="Drop facts"
                    onClick={() => setFactsOpen(true)}
                  >
                    <InformationCircleIcon
                      className="guild-hero-facts-icon"
                      aria-hidden
                    />
                  </button>
                </div>
              </div>
            </div>
            {description ? (
              <CollectionAboutTeaser
                text={description}
                onReadMore={() => setAboutOpen(true)}
              />
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
              key={`tracks-${playables[0]!.url}`}
              clip={playables[0]!}
              tracks={playables}
              poster={view.mediaUrl}
              layout="tracks"
              showTransport={false}
              persist={{
                collectionId: view.collectionId,
                title: view.title,
              }}
              creatorId={view.creatorId}
              canKeepOffline={
                isOwner
                  ? true
                  : !viewerAccountId
                    ? false
                    : holdsEdition == null
                      ? null
                      : holdsEdition
              }
            />
          </section>
        ) : null}

        {hasReadables ? (
          <CollectionWritingReader
            collectionId={view.collectionId}
            accountId={viewerAccountId}
            readables={readables}
            bookPdf={view.bookPdf}
            writingFormat={view.writingFormat}
            canRead={canReadWriting}
            lockedHint={writingLockedHint}
          />
        ) : null}

        {isOwner && status === 'upcoming' ? (
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
            {activityLoaded ? (
              mintPreview.length > 0 ? (
                <CollectionActivityRows
                  rows={mintPreview}
                  profiles={activityProfiles}
                />
              ) : null
            ) : (
              <CollectionActivitySkeleton rows={3} />
            )}
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

      <CollectionAboutSheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        view={view}
      />

      <CollectionFactsSheet
        open={factsOpen}
        onClose={() => setFactsOpen(false)}
        view={view}
        nowMs={nowMs}
      />
    </OsAppScreen>
  );
}
