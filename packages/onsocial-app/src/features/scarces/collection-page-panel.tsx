'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Divider,
  OsHugSheet,
  HeartFillIcon,
  HeartIcon,
  InformationCircleIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  ScaleUpIcon,
  ShareIcon,
  OsIconAction,
  ShopFillIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { CollectionAllowlistManager } from '@/features/scarces/collection-allowlist-manager';
import {
  CollectionAboutSheet,
  CollectionAboutTeaser,
} from '@/features/scarces/collection-about-sheet';
import { mapCollectionActivityRows } from '@/features/scarces/collection-activity-map';
import {
  CollectionActivityRows,
  type CollectionActivityRow,
} from '@/features/scarces/collection-activity-rows';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import { CollectionOwnerManageMenu } from '@/features/scarces/collection-owner-manage-menu';
import { CollectionActivitySkeleton } from '@/features/scarces/collection-page-skeleton';
import { CollectionFactsSheet } from '@/features/scarces/collection-facts-sheet';
import { VariationSetPeek } from '@/features/scarces/variation-set-peek';
import { ticketEventScheduleFacts } from '@/features/scarces/ticket-event-facts';
import { GuildFacepile } from '@/features/guilds/guild-facepile';
import { ScarceFansSheet } from '@/features/scarces/scarce-fans-sheet';
import {
  collectionStatusLabel,
  deriveCollectionStatus,
  fetchAllowlistRemaining,
  fetchCollectionPreferIndexer,
  fetchOwnedCollectionTokenId,
  fetchOwnsCollectionEdition,
  fetchWalletMintRemaining,
  isCollectionMintable,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import {
  canCancelDrop,
  canDeleteDrop,
  canExtendTicketEntry,
  canPauseDrop,
  canResumeDrop,
} from '@/features/scarces/drop-owner-actions';
import { writingReadingSectionLabel } from '@/features/scarces/drop-writing';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import {
  isPassMediumKind,
  passStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import { fetchIsCollectionRedeemer } from '@/features/scarces/ticket-redeemers';
import { TicketShowPassSheet } from '@/features/scarces/ticket-show-pass-sheet';
import { CollectionDoorStaffManager } from '@/features/scarces/collection-door-staff-manager';
import { CollectionDoorLogSheet } from '@/features/scarces/collection-door-log-sheet';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
import { useScarceDropLoves } from '@/hooks/use-scarce-drop-loves';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_DROPS_PATH,
  APP_MARKET_PATH,
  COLLECTION_DOOR_QUERY,
  COLLECTION_PASS_QUERY,
  COLLECTION_PASS_TOKEN_PARAM,
  COLLECTION_READ_QUERY,
  COLLECTION_REDEEM_QUERY,
  collectionDoorPath,
  collectionRedeemPath,
  marketCreatorPath,
  seriesPagePath,
} from '@/lib/app-routes';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  formatFutureRelativeTime,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';
import { holdingsActionLabel } from '@/lib/portfolio-holdings';
import { postHrefFromSourcePath } from '@/lib/scarce-creator-earnings';
import { SHEET_Z } from '@/lib/sheet-z';

const MINT_ACTIVITY_OPS = new Set([
  'purchase',
  'creator_mint',
  'mint_from_collection',
  'airdrop',
]);

const ACTIVITY_PREVIEW_LIMIT = 3;

const EMPTY_ACTIVITY: CollectionActivityRow[] = [];

function statusTone(status: CollectionStatus): string {
  if (status === 'live') return 'is-live';
  if (status === 'sold_out' || status === 'ended' || status === 'cancelled') {
    return 'is-closed';
  }
  return 'is-idle';
}

function scheduleLine(
  view: CollectionView,
  status: CollectionStatus,
  nowMs: number
): string | null {
  if (status === 'upcoming' && view.startTimeMs) {
    const rel = formatFutureRelativeTime(view.startTimeMs, nowMs);
    return rel ? `Opens ${rel}` : null;
  }
  if (status === 'live' && view.endTimeMs) {
    const rel = formatFutureRelativeTime(view.endTimeMs, nowMs);
    return rel ? `Closes ${rel}` : null;
  }
  if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativeTime(view.endTimeMs, nowMs);
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
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const router = useRouter();
  const collectionSaves = useScarceCollectionSaves({
    collectionIds: [collectionId],
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });
  const collectionSaved = collectionSaves.viewerSaved(collectionId);
  const collectionSavePending = collectionSaves.isSavePending(collectionId);
  const [view, setView] = useState<CollectionView | null>(initial);
  /** Album / multi-clip drops love per track in the player — no Drop-level heart. */
  const showDropLove = (view?.playables.length ?? 0) === 0;
  const dropLoves = useScarceDropLoves({
    creatorId: showDropLove ? (view?.creatorId ?? null) : null,
    collectionId: showDropLove ? collectionId : null,
  });
  const dropFanIds = dropLoves.fanIds.slice(0, 5);
  const dropFanProfiles = usePostAuthorProfiles(showDropLove ? dropFanIds : []);
  const [dropFansOpen, setDropFansOpen] = useState(false);
  const [notFound, setNotFound] = useState(initial == null);
  const [walletRemaining, setWalletRemaining] = useState<number | null>(null);
  /** null = not checked yet / N/A; number = remaining allowlist mints. */
  const [allowlistRemaining, setAllowlistRemaining] = useState<number | null>(
    null
  );
  /** null = unchecked; true/false after ownership scan for writing reader. */
  const [holdsEdition, setHoldsEdition] = useState<boolean | null>(null);
  /** Owned edition for Show pass when known. */
  const [ownedPassTokenId, setOwnedPassTokenId] = useState<string | null>(null);
  const [mintOpen, setMintOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);
  const activityRequestKey = `${collectionId}:${refreshKey}`;
  const ssrActivityKey = `${collectionId}:0`;
  const [activityFetched, setActivityFetched] = useState<{
    key: string;
    rows: CollectionActivityRow[];
  } | null>(() =>
    initial != null ? { key: ssrActivityKey, rows: initialActivity } : null
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
  const [doorLogOpen, setDoorLogOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [writingReadOpen, setWritingReadOpen] = useState(false);
  const [showPassOpen, setShowPassOpen] = useState(false);
  const [showPassTokenId, setShowPassTokenId] = useState<string | null>(null);
  /** Viewer is creator or door staff for redeem. */
  const [isRedeemer, setIsRedeemer] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const activitySheetOpen = activityOpen && !activityClosing;

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
      queueMicrotask(() => {
        setWalletRemaining(null);
        setAllowlistRemaining(null);
        setHoldsEdition(null);
        setOwnedPassTokenId(null);
      });
      return;
    }
    let cancelled = false;
    const passKind = isPassMediumKind(view?.kind);
    const needsHoldCheck =
      passKind ||
      (view?.readables.length ?? 0) > 0 ||
      Boolean(view?.writingManifestCid?.trim()) ||
      (view?.playables.length ?? 0) > 0;
    void Promise.all([
      fetchWalletMintRemaining(collectionId, viewerAccountId),
      fetchAllowlistRemaining(collectionId, viewerAccountId),
      needsHoldCheck
        ? passKind
          ? fetchOwnedCollectionTokenId(collectionId, viewerAccountId)
          : fetchOwnsCollectionEdition(collectionId, viewerAccountId).then(
              (owns) => (owns ? '__owned__' : null)
            )
        : Promise.resolve(null),
    ]).then(([wallet, allowlist, ownedToken]) => {
      if (cancelled) return;
      setWalletRemaining(wallet);
      setAllowlistRemaining(allowlist);
      if (!needsHoldCheck) {
        setHoldsEdition(null);
        setOwnedPassTokenId(null);
        return;
      }
      if (passKind) {
        const tokenId =
          typeof ownedToken === 'string' && ownedToken !== '__owned__'
            ? ownedToken
            : null;
        setOwnedPassTokenId(tokenId);
        setHoldsEdition(Boolean(tokenId));
        return;
      }
      setOwnedPassTokenId(null);
      setHoldsEdition(ownedToken != null);
    });
    return () => {
      cancelled = true;
    };
  }, [
    collectionId,
    viewerAccountId,
    refreshKey,
    view?.kind,
    view?.readables.length,
    view?.writingManifestCid,
    view?.playables.length,
  ]);

  // Holdings "Read" deep-links with ?read=1 → open immersive reader once writing is present.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasWriting =
      (view?.readables.length ?? 0) > 0 || view?.bookPdf != null;
    if (!hasWriting) return;
    if (
      new URLSearchParams(window.location.search).get(COLLECTION_READ_QUERY) !==
      '1'
    ) {
      return;
    }
    queueMicrotask(() => {
      setWritingReadOpen(true);
    });
  }, [collectionId, view?.readables.length, view?.bookPdf]);

  // Collectibles "Show pass" deep-links with ?pass=1&t=… → open pass once token is known.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isPassMediumKind(view?.kind)) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(COLLECTION_PASS_QUERY) !== '1') return;
    const fromQuery = params.get(COLLECTION_PASS_TOKEN_PARAM)?.trim() || null;
    const tokenId = fromQuery || ownedPassTokenId;
    if (!tokenId) return;
    queueMicrotask(() => {
      setShowPassTokenId(tokenId);
      setShowPassOpen(true);
    });
  }, [collectionId, ownedPassTokenId, view?.kind]);

  // Legacy ?door=1 / ?redeem=1 → staff Admit or Redeem page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isPassMediumKind(view?.kind)) return;
    if (!isOwner && !isRedeemer) return;
    const params = new URLSearchParams(window.location.search);
    const door = params.get(COLLECTION_DOOR_QUERY) === '1';
    const redeem = params.get(COLLECTION_REDEEM_QUERY) === '1';
    if (!door && !redeem) return;
    const voice = passStaffVoice(view?.kind);
    router.replace(
      voice === 'redeem'
        ? collectionRedeemPath(collectionId)
        : collectionDoorPath(collectionId)
    );
  }, [collectionId, isOwner, isRedeemer, router, view?.kind]);

  useEffect(() => {
    if (!viewerAccountId || !isPassMediumKind(view?.kind)) {
      queueMicrotask(() => setIsRedeemer(false));
      return;
    }
    let cancelled = false;
    void fetchIsCollectionRedeemer(collectionId, viewerAccountId).then((ok) => {
      if (!cancelled) setIsRedeemer(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, viewerAccountId, view?.kind, refreshKey]);

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
  // Before Opens, minting is allowlist-gated on-chain whenever the drop is timed.
  // After Opens, anyone can mint (open) — do not keep gating on the list.
  const needsAllowlist =
    view != null && status === 'upcoming' && view.hasAllowlist;
  const allowlistOk =
    !needsAllowlist || (allowlistRemaining != null && allowlistRemaining > 0);
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

  const allowlistPending =
    needsAllowlist && isConnected && allowlistRemaining == null;
  // Dock Mint: allowlist window only when remaining + not pending; live public
  // when mintable and under wallet cap (show while disconnected — sheet connects).
  const showMintCompose =
    !isOwner &&
    view != null &&
    walletRemaining !== 0 &&
    ((needsAllowlist && allowlistOk && !allowlistPending) ||
      (status === 'live' && mintable));

  const openMintSheet = useCallback(() => {
    setMintOpen(true);
  }, []);
  const openOwnerPost = useCallback(() => {
    if (!view) return;
    requestDropCompose({
      collectionId: view.collectionId,
      title: view.title,
      ...(view.mediaUrl ? { mediaUrl: view.mediaUrl } : {}),
      ...(view.kind ? { mediumKind: view.kind } : {}),
    });
  }, [view]);
  useRegisterComposeAction(
    isOwner
      ? view
        ? openOwnerPost
        : null
      : showMintCompose
        ? openMintSheet
        : null,
    isOwner ? 'post' : 'mint'
  );

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

  const handleMintPurchased = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const showOwnerManage =
    isOwner &&
    (canPauseDrop(status) ||
      canResumeDrop(status) ||
      canCancelDrop(status) ||
      (view != null && canDeleteDrop(view.minted, status)) ||
      (view != null &&
        canExtendTicketEntry({
          kind: view.kind,
          renewable: view.renewable,
          status,
        })) ||
      status === 'cancelled');

  const handleOwnerManaged = useCallback(
    (
      change:
        | 'paused'
        | 'resumed'
        | 'deleted'
        | 'cancelled'
        | 'refunds_withdrawn'
        | 'entry_extended'
    ) => {
      if (change === 'deleted') {
        router.replace(APP_DROPS_PATH);
        return;
      }
      setRefreshKey((k) => k + 1);
    },
    [router]
  );

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
    () => sheetActivity.map((row) => row.actor?.trim() || '').filter(Boolean),
    [sheetActivity]
  );
  const activityProfiles = usePostAuthorProfiles(activityAccountIds);
  const creatorId = view?.creatorId?.trim() || '';
  const creatorShellLoading =
    Boolean(creatorId) && creatorResolvedKey !== creatorId;
  const resolvedCreatorAvatar = creatorShellLoading ? null : creatorAvatarUrl;
  const resolvedCreatorName = creatorShellLoading ? null : creatorDisplayName;
  const requestActivityClose = useCallback(() => {
    setActivityClosing(true);
  }, []);
  const handleActivityClosed = useCallback(() => {
    setActivityClosing(false);
    setActivityOpen(false);
  }, []);

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

  const mintListing = useMemo(() => {
    if (!view) return null;
    return {
      status: 'drop' as const,
      collectionId: view.collectionId,
      priceNear: view.priceNear ?? '0',
      title: view.title,
      ...(view.description?.trim()
        ? { description: view.description.trim() }
        : {}),
      mediaUrl: view.mediaUrl,
      creatorId: view.creatorId,
      artistId: view.creatorId,
      ...(view.cardBg ? { cardBg: view.cardBg } : {}),
      copies: view.totalSupply,
      remaining: view.remaining,
      mediumKind: view.kind,
      maxQuantity,
      ...(view.sourcePostPath ? { sourcePostPath: view.sourcePostPath } : {}),
      ...(view.playables.length > 0
        ? {
            playable: view.playables[0],
            playables: view.playables,
          }
        : {}),
      alreadyOwnsEdition: holdsEdition === true,
    };
  }, [view, holdsEdition, maxQuantity]);

  if (notFound || !view) {
    return (
      <OsAppScreen title="Drop" dockBack backFallbackHref={APP_MARKET_PATH}>
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
  const schedule = scheduleLine(view, status, nowMs);
  const allowlistBlocked =
    needsAllowlist &&
    isConnected &&
    allowlistRemaining != null &&
    allowlistRemaining < 1;
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
  const playables = view.playables;
  const hasPlayables = playables.length > 0;
  const sourceHref = postHrefFromSourcePath(view.sourcePostPath);
  const isAudio =
    hasPlayables || view.kind === 'audio' || view.kind === 'music';
  const mediumKind = (view.kind ?? '').trim().toLowerCase();
  const isPassKind = isPassMediumKind(mediumKind);
  const staffVoice = passStaffVoice(mediumKind);
  const canDoor =
    isPassKind &&
    (isOwner || isRedeemer) &&
    view.maxRedeems != null &&
    view.maxRedeems > 0;
  /**
   * Aa / thought cards — inset object, not immersive album bleed.
   * `cardBg` when theme was stamped; `thought`/`writing` for from-post text.
   */
  const isTextCardCover =
    !isAudio &&
    (Boolean(view.cardBg) ||
      mediumKind === 'thought' ||
      mediumKind === 'writing');
  const readables = view.readables;
  const hasReadables = readables.length > 0 || view.bookPdf != null;
  const canReadWriting = isOwner || holdsEdition === true;
  const canShowPass =
    isPassKind && holdsEdition === true && Boolean(ownedPassTokenId);
  const passActionLabel = holdingsActionLabel(mediumKind);
  const writingLockedHint = !isConnected
    ? 'Connect your wallet and Collect an edition to read.'
    : holdsEdition === null
      ? 'Checking your edition…'
      : 'Collect an edition to unlock the full text.';
  const openOwnedPass = () => {
    const tokenId = ownedPassTokenId?.trim();
    if (!tokenId) return;
    setShowPassTokenId(tokenId);
    setShowPassOpen(true);
  };
  const description = view.description?.trim() ?? '';
  const aboutEvent = ticketEventScheduleFacts(view, nowMs);
  const aboutHasMore =
    !aboutEvent.empty ||
    (view.accessEndsAtMs != null && view.accessEndsAtMs > 0) ||
    Boolean(view.seriesId) ||
    view.createdAtMs > 0;
  const aboutTeaserText =
    description ||
    aboutEvent.place ||
    (view.accessEndsAtMs != null && view.accessEndsAtMs > 0 && aboutEvent.empty
      ? 'Access details'
      : '') ||
    (aboutHasMore ? 'About' : '');
  const chipParts: string[] = [];
  if (view.isVariations) {
    chipParts.push(
      view.randomAssignment
        ? `${view.totalSupply} unique · random piece`
        : `${view.totalSupply} unique`
    );
  }
  // Schedule lives in the product status slot — don’t repeat it here.
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
    view.createdAtMs > 0 ? formatMarketRelativeTime(view.createdAtMs) : '';
  const showActivitySection =
    !activityLoaded || mintPreview.length > 0 || sheetActivity.length > 0;
  const showActivitySeeAll =
    activityLoaded && sheetActivity.length > mintPreview.length;

  return (
    <OsAppScreen
      title={view.title}
      dockBack
      backFallbackHref={APP_MARKET_PATH}
      immersiveHeader={immersive}
      headerElevated={immersive ? headerElevated : false}
      scrollRootRef={scrollRootRef}
      actions={
        <>
          <span className={`collection-header-status ${statusTone(status)}`}>
            {collectionStatusLabel(status)}
          </span>
          <OsIconAction asChild ariaLabel="Shop this creator">
            <Link href={marketCreatorPath(view.creatorId)} scroll={false}>
              <ShopFillIcon aria-hidden className="glass-sheet-close-icon" />
            </Link>
          </OsIconAction>
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
                showFeedPost={false}
                showShare={false}
                showDownloads={false}
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
              }${isTextCardCover ? ' is-card' : ''}${
                immersive ? ' is-immersive' : ''
              }${hasReadables || canShowPass ? ' has-read' : ''}`}
              {...(view.cardBg && !view.mediaUrl
                ? { style: { background: view.cardBg } }
                : {})}
            >
              {view.mediaUrl ? <img src={view.mediaUrl} alt="" /> : null}
              {hasReadables ? (
                <button
                  type="button"
                  className="scarce-clip-cover-expand collection-cover-read-expand"
                  aria-label="Open reader"
                  onClick={() => setWritingReadOpen(true)}
                >
                  <ScaleUpIcon
                    className="scarce-clip-cover-expand-icon"
                    aria-hidden
                  />
                </button>
              ) : canShowPass ? (
                <button
                  type="button"
                  className="scarce-clip-cover-expand collection-cover-read-expand"
                  aria-label={passActionLabel}
                  onClick={openOwnedPass}
                >
                  <ScaleUpIcon
                    className="scarce-clip-cover-expand-icon"
                    aria-hidden
                  />
                </button>
              ) : null}
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
                <AccountAvatar
                  accountId={view.creatorId}
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
            <div className="collection-product-row">
              <div className="collection-product-line">
                <span
                  className={`collection-product-status ${statusTone(status)}`}
                >
                  {schedule ?? collectionStatusLabel(status)}
                </span>
                <span className="collection-meta-sep" aria-hidden>
                  ·
                </span>
                <span className="collection-commerce-supply">
                  {view.minted}/{view.totalSupply}
                </span>
                {view.priceNear &&
                view.priceNear !== '0' &&
                view.priceYocto !== '0' ? (
                  <>
                    <span className="collection-meta-sep" aria-hidden>
                      ·
                    </span>
                    <span className="collection-product-price">
                      {view.priceNear} NEAR
                    </span>
                  </>
                ) : null}
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
              <div className="collection-commerce-share-row collection-commerce-share-row--viewer">
                {showOwnerManage ? (
                  <CollectionOwnerManageMenu
                    collectionId={view.collectionId}
                    title={view.title}
                    status={status}
                    minted={view.minted}
                    priceNear={view.priceNear}
                    kind={view.kind}
                    renewable={view.renewable}
                    eventEndsAtMs={view.eventEndsAtMs}
                    onManaged={handleOwnerManaged}
                  />
                ) : null}
                {showDropLove ? (
                  <button
                    type="button"
                    className={`collection-commerce-love${
                      dropLoves.viewerLoved ? ' is-loved' : ''
                    }${dropLoves.pending ? ' is-pending' : ''}`}
                    aria-label={
                      dropLoves.viewerLoved
                        ? dropLoves.loveCount > 0
                          ? `Remove love from this drop (${dropLoves.loveCount})`
                          : 'Remove love from this drop'
                        : dropLoves.loveCount > 0
                          ? `Love this drop (${dropLoves.loveCount})`
                          : 'Love this drop'
                    }
                    aria-pressed={dropLoves.viewerLoved}
                    disabled={dropLoves.pending}
                    onClick={() => {
                      void dropLoves.toggleLove();
                    }}
                  >
                    {dropLoves.viewerLoved ? (
                      <HeartFillIcon
                        aria-hidden
                        className="collection-commerce-love-icon"
                      />
                    ) : (
                      <HeartIcon
                        aria-hidden
                        className="collection-commerce-love-icon"
                      />
                    )}
                    {dropLoves.loveCount > 0 ? (
                      <span className="collection-commerce-love-count">
                        {dropLoves.loveCount}
                      </span>
                    ) : null}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`collection-commerce-save${
                    collectionSaved ? ' is-saved' : ''
                  }${collectionSavePending ? ' is-pending' : ''}`}
                  aria-label={
                    collectionSaved
                      ? 'Remove drop bookmark'
                      : 'Bookmark this drop'
                  }
                  aria-pressed={collectionSaved}
                  disabled={collectionSavePending}
                  onClick={() => {
                    void collectionSaves.toggleSave(collectionId);
                  }}
                >
                  {collectionSaved ? (
                    <BookmarkFillIcon
                      aria-hidden
                      className="collection-commerce-save-icon"
                    />
                  ) : (
                    <BookmarkIcon
                      aria-hidden
                      className="collection-commerce-save-icon"
                    />
                  )}
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
            </div>
            <div
              className="collection-progress"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Editions minted"
            >
              <Divider variant="detail" className="collection-progress-rule" />
              <span
                className="collection-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {showDropLove && dropLoves.fanCount > 0 ? (
              <div className="collection-drop-fans">
                <GuildFacepile
                  memberIds={dropFanIds}
                  profiles={dropFanProfiles}
                  memberCount={dropLoves.fanCount}
                  countUnit={{ one: 'fan', other: 'fans' }}
                  slots={Math.min(5, Math.max(1, dropLoves.fanCount))}
                  loading={dropLoves.fansLoading && dropFanIds.length === 0}
                  className="collection-drop-fans-facepile"
                  onClick={() => setDropFansOpen(true)}
                />
              </div>
            ) : null}
            {mintDisabledReason && !isOwner ? (
              <p className="collection-mint-hint">{mintDisabledReason}</p>
            ) : null}
            {aboutTeaserText ? (
              <CollectionAboutTeaser
                text={aboutTeaserText}
                hasMore={aboutHasMore}
                onReadMore={() => setAboutOpen(true)}
              />
            ) : null}
          </header>
        </section>

        {view.isVariations ? (
          <VariationSetPeek
            collectionId={view.collectionId}
            totalSupply={view.totalSupply}
            samples={view.variationSamples ?? []}
            randomAssignment={view.randomAssignment}
            referenceTemplate={view.variationReferenceTemplate}
          />
        ) : null}

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
              showFeedPost={false}
              showShare={false}
              showDownloads={false}
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
          <section className="collection-reading" aria-label="Reading">
            <div className="collection-reading-row">
              <p className="collection-section-label">
                {writingReadingSectionLabel(readables.length)}
              </p>
              <button
                type="button"
                className="collection-reading-open"
                onClick={() => setWritingReadOpen(true)}
              >
                Read
              </button>
            </div>
            {!canReadWriting ? (
              <p className="collection-writing-locked">{writingLockedHint}</p>
            ) : null}
          </section>
        ) : null}

        {canShowPass ? (
          <section className="collection-reading" aria-label="Your pass">
            <div className="collection-reading-row">
              <p className="collection-section-label">Your pass</p>
              <button
                type="button"
                className="collection-reading-open"
                onClick={openOwnedPass}
              >
                {passActionLabel}
              </button>
            </div>
          </section>
        ) : null}

        {canDoor ||
        (isOwner && view.maxRedeems != null && view.maxRedeems > 0) ||
        (isOwner && status === 'upcoming') ? (
          <section
            className="collection-reading"
            aria-label={isOwner ? 'Host tools' : 'Door'}
          >
            {canDoor ? (
              <>
                <div className="collection-reading-row">
                  <p className="collection-section-label">
                    {staffVoice === 'redeem' ? 'Counter' : 'Door'}
                  </p>
                  <Link
                    href={
                      staffVoice === 'redeem'
                        ? collectionRedeemPath(view.collectionId)
                        : collectionDoorPath(view.collectionId)
                    }
                    className="collection-reading-open"
                  >
                    {staffVoice === 'redeem' ? 'Redeem' : 'Admit'}
                  </Link>
                </div>
                <div className="collection-reading-row">
                  <p className="collection-section-label">
                    {staffVoice === 'redeem' ? 'Redeem log' : 'Door log'}
                  </p>
                  <button
                    type="button"
                    className="collection-reading-open"
                    onClick={() => setDoorLogOpen(true)}
                  >
                    See who
                  </button>
                </div>
              </>
            ) : null}
            {canDoor ? (
              <CollectionDoorLogSheet
                open={doorLogOpen}
                onClose={() => setDoorLogOpen(false)}
                collectionId={view.collectionId}
                dropTitle={view.title}
                voice={staffVoice}
              />
            ) : null}
            {isOwner && view.maxRedeems != null && view.maxRedeems > 0 ? (
              <CollectionDoorStaffManager
                collectionId={view.collectionId}
                creatorId={view.creatorId}
                voice={staffVoice}
              />
            ) : null}
            {isOwner && status === 'upcoming' ? (
              <CollectionAllowlistManager
                collectionId={view.collectionId}
                creatorId={view.creatorId}
                maxPerWallet={view.maxPerWallet}
                hasList={view.hasAllowlist}
                earlyAccessActive
              />
            ) : null}
          </section>
        ) : null}

        {sourceHref ? (
          <Link
            href={sourceHref}
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
      </div>

      <OsHugSheet
        open={activitySheetOpen}
        onClose={requestActivityClose}
        onClosed={handleActivityClosed}
        label="Activity"
        copy={view.title}
        closeAriaLabel="Close activity"
        backdropLabel="Close activity"
        zIndex={SHEET_Z.list}
        panelClassName="collection-activity-sheet-panel os-sheet-cap-standard"
        bodyClassName="collection-activity-sheet-body"
      >
        {sheetActivity.length > 0 ? (
          <CollectionActivityRows
            rows={sheetActivity}
            profiles={activityProfiles}
          />
        ) : (
          <p className="collection-activity-empty">No mint activity yet.</p>
        )}
      </OsHugSheet>

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

      <WritingReadSheet
        open={writingReadOpen}
        onClose={() => setWritingReadOpen(false)}
        title={view.title}
        cover={view.mediaUrl}
        collectionId={view.collectionId}
        accountId={viewerAccountId}
        readables={readables}
        bookPdf={view.bookPdf}
        writingFormat={view.writingFormat}
        canRead={canReadWriting}
        lockedHint={writingLockedHint}
      />

      {showPassTokenId ? (
        <TicketShowPassSheet
          open={showPassOpen}
          onClose={() => setShowPassOpen(false)}
          title={view.title}
          cover={view.mediaUrl}
          collectionId={view.collectionId}
          tokenId={showPassTokenId}
        />
      ) : null}

      <ScarceBuySheet
        open={mintOpen}
        listing={mintListing}
        alreadyOwnsEdition={holdsEdition === true}
        onOpenChange={setMintOpen}
        onPurchased={handleMintPurchased}
      />

      {showDropLove ? (
        <ScarceFansSheet
          open={dropFansOpen}
          onClose={() => setDropFansOpen(false)}
          fanIds={dropLoves.fanIds}
          fanCount={dropLoves.fanCount}
          dropTitle={view.title}
        />
      ) : null}
    </OsAppScreen>
  );
}
