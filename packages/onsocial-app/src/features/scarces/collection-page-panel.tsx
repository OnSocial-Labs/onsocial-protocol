'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Divider,
  OsHugSheet,
  HeartFillIcon,
  HeartIcon,
  BookmarkFillIcon,
  BookmarkIcon,
  ShareIcon,
  OsIconAction,
  ShopFillIcon,
  IpfsImg,
  ipfsImgSrcSet,
} from '@onsocial/ui';
import './collection-drop-enter.css';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsLateFill } from '@/components/app/os-late-fill';
import { OsRouteSettle } from '@/components/app/os-route-settle';
import {
  APP_COLUMN_HERO_SIZES,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';
import { RollingNumber } from '@/components/ui/rolling-number';
import { useCatalogDockBack } from '@/hooks/use-catalog-dock-back';
import { useImmersiveTitleHandoff } from '@/hooks/use-immersive-title-handoff';
import {
  isUnmodifiedPrimaryClick,
  usePostThreadLayer,
} from '@/features/home/post-thread-layer';
import { usePostLayerOwnerZ } from '@/features/home/post-layer-owner-z';
import { postLayerOverlayZ } from '@/lib/sheet-z';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useRegisterComposeAction } from '@/contexts/compose-launcher-context';
import { useCollectiblesNowPlayingOptional } from '@/contexts/collectibles-now-playing-context';
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
  collectionCreatorNameLine,
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import { readCollectionCreatorFace } from '@/features/scarces/collection-creator-face-cache';
import { readCollectionView } from '@/features/scarces/collection-view-cache';
import { scarceRowPartyLead } from '@/lib/scarce-row-kind';
import { CollectionOwnerManageMenu } from '@/features/scarces/collection-owner-manage-menu';
import {
  collectionCatalogShell,
  collectionCoverExpandAction,
  collectionCoverImmersive,
  collectionCoverIsAudio,
  collectionCoverIsTextCard,
  collectionCoverSquare,
  collectionDropBackHref,
  collectionOpensWritingReader,
  collectionShowInlineTracks,
  collectionUseFirst,
  collectionViewNeedsCatalogSoftFill,
  collectionFaceTitle,
  collectionMediumBodyPending,
  collectionSoftFillPeek,
  editionTokenForCollection,
  mergeCatalogSoftFillIntoSeed,
  peekDropFaceHoldSeed,
  peekHoldsCollection,
  peekHoldsCollectionForDropPage,
  peekOwnedTokenForCollection,
  peekViewerAccountId,
  resolveCollectionOwnership,
  seedCollectionViewFromNowPlaying,
} from '@/features/scarces/collection-page-view';
import {
  CollectionDropEnter,
  CollectionSeatSettle,
  dropEnterShouldPlay,
  readDropFirstPaint,
  useDropReducedMotion,
} from '@/features/scarces/collection-page-enter';
import {
  COLLECTION_MINT_HINT_SIZER,
  CollectionActivitySkeleton,
  CollectionPageSkeleton,
  CollectionTracksSkeleton,
} from '@/features/scarces/collection-page-skeleton';
import { DropArtOverlay } from '@/features/scarces/drop-artwork-preview';
import { CollectionFactsSheet } from '@/features/scarces/collection-facts-sheet';
import { dollarStickerLabel } from '@/features/scarces/dollar-price';
import { VariationSetPeek } from '@/features/scarces/variation-set-peek';
import {
  EVENT_SCHEDULE_UPDATED_LABEL,
  eventHintLive,
  eventScheduleMoved,
  ticketEventScheduleFacts,
} from '@/features/scarces/ticket-event-facts';
import { DropFaceFans } from '@/components/drops/drop-row-fans';
import { warmDropFanIds } from '@/lib/scarce-drop-fans';
import {
  applyDropSupply,
  collectionStatusLabel,
  deriveCollectionStatus,
  dropSupplyShouldPoll,
  fetchAllowlistRemaining,
  editionCoverUrl,
  fetchCollectionPreferIndexer,
  readCollectionSupply,
  fetchOwnedCollectionTokenId,
  fetchWalletMintRemaining,
  hydrateWritingManifest,
  isCollectionMintable,
  type CollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  LIVE_DROP_SUPPLY_MS,
  useLiveDropSupply,
} from '@/features/scarces/use-live-drop-supply';
import { requestDropCompose } from '@/features/scarces/drop-compose-draft';
import {
  canCancelDrop,
  canDeleteDrop,
  canExtendTicketEntry,
  canPauseDrop,
  canResumeDrop,
} from '@/features/scarces/drop-owner-actions';
import { prefetchDropRead } from '@/features/scarces/drop-read-ahead';
import { prefetchShowPass } from '@/features/scarces/show-pass-ahead';
import { listedArticleReaderHref } from '@/features/scarces/drop-writing';
import { ScarceBuySheet } from '@/features/scarces/scarce-buy-sheet';
import { SCARCE_Z } from '@/features/scarces/scarce-overlay-z';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { WritingReadSheet } from '@/features/scarces/scarce-writing-read-sheet';
import {
  isPassMediumKind,
  passStaffVoice,
} from '@/features/scarces/ticket-pass-payload';
import { fetchIsCollectionRedeemer } from '@/features/scarces/ticket-redeemers';
import { CollectionEventGuests } from '@/features/events/event-guests-sheet';
import { collectionGuestRoster } from '@/features/events/event-guests';
import { eventWindowFor } from '@/features/events/events-catalog';
import { TicketShowPassSheet } from '@/features/scarces/ticket-show-pass-sheet';
import { CollectionDoorLogSheet } from '@/features/scarces/collection-door-log-sheet';
import { usePostAuthorProfiles } from '@/hooks/use-post-author-profiles';
import { useScarceCollectionSaves } from '@/hooks/use-scarce-collection-saves';
import { useScarceDropLoves } from '@/hooks/use-scarce-drop-loves';
import { useScarceTrackLoves } from '@/hooks/use-scarce-track-loves';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_DROPS_PATH,
  COLLECTION_DOOR_QUERY,
  COLLECTION_PASS_QUERY,
  COLLECTION_PASS_TOKEN_PARAM,
  COLLECTION_READ_QUERY,
  COLLECTION_REDEEM_QUERY,
  collectionDoorPath,
  collectionRedeemPath,
  collectiblesPlayPath,
  marketCreatorPath,
  seriesPagePath,
} from '@/lib/app-routes';
import { socialTimeProps } from '@/lib/post-display';
import { replaceBrowserQueryUrl } from '@/lib/sync-browser-url-query';
import { MARKET_PAGE_CLASS, osChromePageClassName } from '@/lib/os-chrome-page';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { OsRowAction } from '@/lib/os-row-action';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  formatFutureRelativeTime,
  formatMarketRelativePhrase,
  formatMarketRelativeTime,
} from '@/features/market/market-listings';
import { portfolioCollectiblesPath, portfolioPath } from '@/lib/overlay-routes';
import { isAppPostSheetHref } from '@/lib/post-routes';
import {
  heldEditionMark,
  heldEditionPlural,
} from '@/features/collectibles/held-editions';
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
  const sale = view.kind === 'ticket';
  if (status === 'upcoming' && view.startTimeMs) {
    const rel = formatFutureRelativeTime(view.startTimeMs, nowMs);
    return rel ? `${sale ? 'Sale opens' : 'Opens'} ${rel}` : null;
  }
  if (status === 'live' && view.endTimeMs) {
    const rel = formatFutureRelativeTime(view.endTimeMs, nowMs);
    return rel ? `${sale ? 'Sale closes' : 'Closes'} ${rel}` : null;
  }
  if (status === 'ended' && view.endTimeMs) {
    const rel = formatMarketRelativePhrase(view.endTimeMs, nowMs);
    return rel ? `${sale ? 'Sale closed' : 'Closed'} ${rel}` : null;
  }
  return null;
}

function mergeHydratedWriting(
  prev: CollectionView | null,
  next: CollectionView
): CollectionView | null {
  if (!prev || prev.collectionId !== next.collectionId) return prev;
  if (prev.readables.length > 0 || prev.bookPdf) return prev;
  return {
    ...prev,
    readables: next.readables,
    bookPdf: next.bookPdf,
    writingFormat: next.writingFormat ?? prev.writingFormat,
    textAlign: next.textAlign ?? prev.textAlign,
  };
}

/** Live `?t=` after navigation. Isolated so the drop page can still render on the server. */
function EditionQueryToken({
  collectionId,
  onToken,
}: {
  collectionId: string;
  onToken: (token: string) => void;
}) {
  const searchParams = useSearchParams();
  const token = editionTokenForCollection(
    collectionId,
    searchParams.get(COLLECTION_PASS_TOKEN_PARAM)
  );
  useLayoutEffect(() => {
    onToken(token);
  }, [onToken, token]);
  return null;
}

/**
 * Lead seat for Open Collectibles — same width logged out or in.
 * One wrapper; only visibility flips (no Link↔button remount flash).
 */
function CollectionOpenCollectiblesLead({ href }: { href: string | null }) {
  return (
    <span
      className={href ? undefined : 'collection-use-actions-lead-ghost'}
      aria-hidden={href ? undefined : true}
    >
      {href ? (
        <OsRowAction href={href}>Open Collectibles</OsRowAction>
      ) : (
        <OsRowAction onClick={() => {}}>Open Collectibles</OsRowAction>
      )}
    </span>
  );
}

/** Show pass seat — same button tree; ghost only toggles visibility. */
function CollectionShowPassTrail({
  ready,
  label,
  onOpen,
}: {
  ready: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <span
      className={ready ? undefined : 'collection-use-actions-trail-ghost'}
      aria-hidden={ready ? undefined : true}
    >
      <OsRowAction
        className="collectibles-holding-action"
        onClick={ready ? onOpen : () => {}}
      >
        {label}
      </OsRowAction>
    </span>
  );
}

/** ?read=1 already opened the reader this visit — Back must not open it again. */
const consumedCollectionReadLinks = new Set<string>();

export function CollectionPagePanel({
  collectionId,
  initial,
  initialCreator = null,
  initialActivity,
  initialViewerAccountId = null,
  initialHoldSeed = null,
  initialEditionToken = null,
  embedded = false,
  onClose,
  suspendDock = false,
}: {
  collectionId: string;
  initial: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
  /**
   * Route SSR passes an array (possibly empty). Soft-nav loading / appear omit
   * it so activity can fetch + reserve rails instead of locking empty.
   */
  initialActivity?: CollectionActivityRow[];
  /**
   * SSR wallet hint cookie — Collectibles / hold frame 1 on hard refresh.
   * Hint only; live `useAppWallet().accountId` wins when present.
   */
  initialViewerAccountId?: string | null;
  /**
   * SSR hold hint cookie — use-first / Show pass / #edition on hard refresh
   * when the in-memory hold cache is empty.
   */
  initialHoldSeed?: { holds: boolean; tokenId: string | null } | null;
  /** `?t=` from the drop page request, so the first paint is that edition. */
  initialEditionToken?: string | null;
  /**
   * Nested in the shared drop sheet. Same face as the page, no second
   * launcher — dock Back closes the sheet.
   */
  embedded?: boolean;
  onClose?: () => void;
  /**
   * Sheet is parked under a profile / door hop. Release Back and Mint so
   * the page underneath owns the one dock.
   */
  suspendDock?: boolean;
}) {
  const {
    accountId: viewerAccountId,
    isConnected,
    isLoading: walletLoading,
  } = useAppWallet();
  const { setTxResult } = useAppTransactionFeedback();
  const nowPlaying = useCollectiblesNowPlayingOptional();
  const router = useRouter();
  const { openPostThread } = usePostThreadLayer();
  const ownerZ = usePostLayerOwnerZ();
  const collectionSaves = useScarceCollectionSaves({
    collectionIds: [collectionId],
    onError: (message) => setTxResult({ type: 'error', msg: message }),
  });
  const collectionSaved = collectionSaves.viewerSaved(collectionId);
  const collectionSavePending = collectionSaves.isSavePending(collectionId);
  const isNowPlayingThisDrop =
    nowPlaying?.session?.collectionId?.trim() === collectionId.trim();
  const [liveEditionToken, setLiveEditionToken] = useState<{
    id: string;
    token: string;
  } | null>(null);
  const rememberEditionToken = useCallback(
    (token: string) => {
      setLiveEditionToken((current) =>
        current?.id === collectionId && current.token === token
          ? current
          : { id: collectionId, token }
      );
    },
    [collectionId]
  );
  const editionToken =
    liveEditionToken?.id === collectionId
      ? liveEditionToken.token
      : editionTokenForCollection(collectionId, initialEditionToken);
  const [liveView, setView] = useState<CollectionView | null>(() =>
    readDropFirstPaint({
      initial,
      cached: readCollectionView(collectionId),
      nowPlayingSeed:
        isNowPlayingThisDrop && nowPlaying?.session
          ? seedCollectionViewFromNowPlaying(nowPlaying.session)
          : null,
    })
  );
  /** Seed, view cache, or now-playing — first paint was already the drop. */
  const [seededHotOpen] = useState(() => liveView != null);
  const view = liveView ?? initial ?? null;
  /** Album loves per track; writing/art love the drop. Fans seat is always the same. */
  const isAudioDrop = collectionCoverIsAudio({
    kind: view?.kind,
    playablesLength: view?.playables.length ?? 0,
  });
  const showDropLoveHeart = !isAudioDrop;
  const dropLoves = useScarceDropLoves({
    creatorId: showDropLoveHeart ? (view?.creatorId ?? null) : null,
    collectionId: showDropLoveHeart ? collectionId : null,
  });
  const albumTrackLoves = useScarceTrackLoves({
    creatorId: isAudioDrop ? (view?.creatorId ?? null) : null,
    collectionId: isAudioDrop ? collectionId : null,
    tracks: isAudioDrop ? (view?.playables ?? []) : [],
  });
  const faceFans = isAudioDrop
    ? {
        fanIds: albumTrackLoves.fanIds,
        fanCount: albumTrackLoves.fanCount,
      }
    : {
        fanIds: dropLoves.fanIds,
        fanCount: dropLoves.fanCount,
      };
  useEffect(() => {
    const creatorId = view?.creatorId?.trim();
    if (!creatorId || !collectionId) return;
    warmDropFanIds(creatorId, collectionId);
  }, [view?.creatorId, collectionId]);
  const [clientSettled, setClientSettled] = useState(
    () =>
      initial != null ||
      liveView != null ||
      (isNowPlayingThisDrop && Boolean(nowPlaying?.session))
  );
  const [walletRemaining, setWalletRemaining] = useState<number | null>(null);
  /** null = not checked yet / N/A; number = remaining allowlist mints. */
  const [allowlistRemaining, setAllowlistRemaining] = useState<number | null>(
    null
  );
  /**
   * Live wallet when known; SSR hint only while wallet is still restoring
   * (hard refresh HTML match). Once settled signed-out, drop the hint so
   * Collectibles does not keep a disconnected account path.
   */
  const paintViewerAccountId =
    viewerAccountId?.trim() ||
    (walletLoading ? initialViewerAccountId?.trim() || null : null);
  /** null = unchecked; true/false after seed or ownership scan. */
  const [holdsEdition, setHoldsEdition] = useState<boolean | null>(() => {
    if (initialHoldSeed) return initialHoldSeed.holds;
    const seed = peekDropFaceHoldSeed(
      viewerAccountId?.trim() || initialViewerAccountId?.trim() || null,
      collectionId
    );
    return seed.holds;
  });
  /** Owned edition for Show pass when known. */
  const [ownedPassTokenId, setOwnedPassTokenId] = useState<string | null>(
    () => {
      if (initialHoldSeed) return initialHoldSeed.tokenId;
      const seed = peekDropFaceHoldSeed(
        viewerAccountId?.trim() || initialViewerAccountId?.trim() || null,
        collectionId
      );
      return seed.tokenId;
    }
  );
  /** Query `?t=` wins; held token fills the same reserved seat (never inserts a line). */
  const faceEditionToken =
    editionToken || (ownedPassTokenId ? ownedPassTokenId.trim() : '');
  const editionLine = faceEditionToken
    ? (heldEditionMark(faceEditionToken) ?? '')
    : '';
  const coverSrc = view
    ? editionCoverUrl(view, faceEditionToken || null)
    : null;
  const coverSrcSet = ipfsImgSrcSet(coverSrc, SCARCE_HERO_WIDTHS);
  const [mintOpen, setMintOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshKey, setRefreshKey] = useState(0);
  const activityRequestKey = `${collectionId}:${refreshKey}`;
  const ssrActivityKey = `${collectionId}:0`;
  /** Route SSR seeded activity (including empty). Omitted on soft-nav loading. */
  const activityFromRoute = initialActivity !== undefined;
  const [activityFetched, setActivityFetched] = useState<{
    key: string;
    rows: CollectionActivityRow[];
  } | null>(() =>
    initial != null &&
    !collectionViewNeedsCatalogSoftFill(initial) &&
    activityFromRoute
      ? { key: ssrActivityKey, rows: initialActivity }
      : null
  );
  const initialCreatorId =
    initial?.creatorId?.trim() || liveView?.creatorId?.trim() || '';
  const [seededCreatorFace] = useState(
    () => initialCreator ?? readCollectionCreatorFace(collectionId)
  );
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(
    () => seededCreatorFace?.avatarUrl ?? null
  );
  const [creatorDisplayName, setCreatorDisplayName] = useState<string | null>(
    () => seededCreatorFace?.displayName ?? null
  );
  const [creatorResolvedKey, setCreatorResolvedKey] = useState(() =>
    seededCreatorFace != null && initialCreatorId ? initialCreatorId : ''
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityClosing, setActivityClosing] = useState(false);
  const [doorLogOpen, setDoorLogOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [writingReadOpen, setWritingReadOpen] = useState(false);
  const [coverListenOpen, setCoverListenOpen] = useState(false);
  const [showPassOpen, setShowPassOpen] = useState(false);
  const [showPassTokenId, setShowPassTokenId] = useState<string | null>(null);
  const [mediaOverlayOpen, setMediaOverlayOpen] = useState(false);
  /** Viewer is creator or door staff for redeem. */
  const [isRedeemer, setIsRedeemer] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  /** Series and date stay as first painted. The story line keeps its own seat. */
  const [faceChrome, setFaceChrome] = useState<{
    id: string;
    series: boolean;
    date: boolean;
  } | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const activitySheetOpen = activityOpen && !activityClosing;

  const isOwner =
    Boolean(viewerAccountId) &&
    view != null &&
    accountIdsEqual(viewerAccountId!, view.creatorId);
  const hasImmersiveCover = Boolean(view?.mediaUrl || view?.cardBg);

  // Soft-fill catalog after paint; solid SSR shells skip the first keyed refetch.
  useEffect(() => {
    if (
      refreshKey === 0 &&
      initial != null &&
      !collectionViewNeedsCatalogSoftFill(initial)
    ) {
      return;
    }
    let cancelled = false;
    void fetchCollectionPreferIndexer(collectionId)
      .then(async (next) => {
        if (cancelled || !next) return;
        const supply = await readCollectionSupply(collectionId);
        if (cancelled) return;
        const catalog = supply ? applyDropSupply(next, supply) : next;
        setView((prev) => {
          if (
            prev &&
            collectionViewNeedsCatalogSoftFill(prev) &&
            prev.collectionId.trim() === catalog.collectionId.trim()
          ) {
            return mergeCatalogSoftFillIntoSeed(prev, catalog);
          }
          return catalog;
        });
      })
      .finally(() => {
        if (cancelled) return;
        if (refreshKey === 0 && collectionViewNeedsCatalogSoftFill(initial)) {
          setClientSettled(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, initial, refreshKey]);

  // SSR shell often skips client catalog refresh — still hydrate writing chapters.
  useEffect(() => {
    if (!view) return;
    if (view.readables.length > 0 || view.bookPdf) return;
    const kind = (view.kind ?? '').trim().toLowerCase();
    if (
      kind !== 'writing' &&
      !view.writingManifestCid?.trim() &&
      !view.sourcePostPath?.trim()
    ) {
      return;
    }
    let cancelled = false;
    void hydrateWritingManifest(view).then((next) => {
      if (cancelled) return;
      if (next.readables.length === 0 && !next.bookPdf) return;
      setView((prev) => mergeHydratedWriting(prev, next));
    });
    return () => {
      cancelled = true;
    };
  }, [
    view?.collectionId,
    view?.kind,
    view?.writingManifestCid,
    view?.sourcePostPath,
    view?.readables.length,
    view?.bookPdf,
  ]);

  // Warm source essay so Read opens with the article footer already known.
  useEffect(() => {
    if (!view?.sourcePostPath?.trim()) return;
    void prefetchDropRead({
      collectionId,
      meta: {
        writingFormat: view.writingFormat ?? null,
        sourcePostPath: view.sourcePostPath,
      },
    });
  }, [collectionId, view?.sourcePostPath, view?.writingFormat]);

  // Warm Show pass status while the holder is on the drop.
  useEffect(() => {
    const tokenId = ownedPassTokenId?.trim();
    if (!tokenId || !isPassMediumKind(view?.kind) || holdsEdition !== true) {
      return;
    }
    void prefetchShowPass({
      collectionId,
      tokenId,
      seedTitle: view?.title,
      seedCover: view?.mediaUrl,
    });
  }, [
    collectionId,
    holdsEdition,
    ownedPassTokenId,
    view?.kind,
    view?.mediaUrl,
    view?.title,
  ]);

  useEffect(() => {
    // Solid route SSR activity stays; soft-nav loading / thin peeks refetch.
    if (
      refreshKey === 0 &&
      initial != null &&
      !collectionViewNeedsCatalogSoftFill(initial) &&
      activityFromRoute
    ) {
      return;
    }
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
  }, [
    activityFromRoute,
    activityRequestKey,
    collectionId,
    initial,
    refreshKey,
  ]);

  useEffect(() => {
    // Wallet still hydrating — keep peeked #edition / hold; do not wipe.
    if (!viewerAccountId) {
      if (walletLoading) return;
      // Restoring session: live id is briefly null while localStorage still
      // has the account — wiping here flashes Show pass / Collectibles off.
      if (peekViewerAccountId()) return;
      queueMicrotask(() => {
        setWalletRemaining(null);
        setAllowlistRemaining(null);
        setHoldsEdition(null);
        setOwnedPassTokenId(null);
      });
      return;
    }
    // First paint often has no account — re-seed hold from vault once wallet hydrates.
    if (peekHoldsCollection(viewerAccountId, collectionId)) {
      queueMicrotask(() => {
        setHoldsEdition((prev) => (prev == null ? true : prev));
        const token = peekOwnedTokenForCollection(
          viewerAccountId,
          collectionId
        );
        if (token) {
          setOwnedPassTokenId((prev) => prev ?? token);
        }
      });
    }
    let cancelled = false;
    // Always resolve a token id (not a boolean). Clearing to null only when
    // the fetch says not held — the old non-pass `__owned__` path wiped #N.
    void Promise.all([
      fetchWalletMintRemaining(collectionId, viewerAccountId),
      fetchAllowlistRemaining(collectionId, viewerAccountId),
      fetchOwnedCollectionTokenId(collectionId, viewerAccountId),
    ]).then(([wallet, allowlist, ownedToken]) => {
      if (cancelled) return;
      setWalletRemaining(wallet);
      setAllowlistRemaining(allowlist);
      // Skip no-op updates — same token must not remount Show pass.
      setOwnedPassTokenId((prev) => (prev === ownedToken ? prev : ownedToken));
      setHoldsEdition((prev) => {
        const next = Boolean(ownedToken);
        return prev === next ? prev : next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [collectionId, viewerAccountId, refreshKey, walletLoading]);

  // Old Read links used ?read=1. Open once, then drop the flag so Back stays on the drop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(COLLECTION_READ_QUERY) !== '1') return;
    if (consumedCollectionReadLinks.has(collectionId)) {
      params.delete(COLLECTION_READ_QUERY);
      replaceBrowserQueryUrl(window.location.pathname, params);
      return;
    }
    const hasWriting = collectionOpensWritingReader({
      kind: view?.kind,
      hasReadables: (view?.readables.length ?? 0) > 0 || view?.bookPdf != null,
    });
    if (!hasWriting) return;
    consumedCollectionReadLinks.add(collectionId);
    params.delete(COLLECTION_READ_QUERY);
    replaceBrowserQueryUrl(window.location.pathname, params);
    const openFolioReader = () => {
      queueMicrotask(() => {
        setWritingReadOpen(true);
      });
    };
    if (view) {
      const listedHref = listedArticleReaderHref({
        writingFormat: view.writingFormat,
        sourcePostPath: view.sourcePostPath,
      });
      const needsBody =
        Boolean(listedHref) &&
        (view.readables.length ?? 0) === 0 &&
        !view.bookPdf &&
        Boolean(view.sourcePostPath?.trim());
      if (needsBody) {
        void hydrateWritingManifest(view).then((next) => {
          setView((prev) => mergeHydratedWriting(prev, next));
          openFolioReader();
        });
        return;
      }
    }
    openFolioReader();
  }, [
    collectionId,
    view,
    view?.kind,
    view?.readables.length,
    view?.bookPdf,
    view?.sourcePostPath,
    view?.writingFormat,
  ]);

  // Share deep-link ?pass=1&t=… → open pass in this turn (no event-face flash).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isPassMediumKind(view?.kind)) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get(COLLECTION_PASS_QUERY) !== '1') return;
    const fromQuery = params.get(COLLECTION_PASS_TOKEN_PARAM)?.trim() || null;
    const tokenId = fromQuery || ownedPassTokenId;
    if (!tokenId) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot ?pass=1 deep link into Show pass */
    setShowPassTokenId(tokenId);
    setShowPassOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
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

  const supplyLive = view != null && dropSupplyShouldPoll(view, nowMs);
  useLiveDropSupply(collectionId, supplyLive, setView);

  useEffect(() => {
    if (!supplyLive) return;
    const id = collectionId.trim();
    if (!id) return;
    let stopped = false;
    let timer = 0;

    const load = () => {
      const client = createReadOnlyOnSocialClient();
      void client.query.scarces
        .collection(id, { limit: 48 })
        .then((rows) => {
          if (stopped) return;
          setActivityFetched((prev) => ({
            key: prev?.key ?? `${id}:0`,
            rows: mapCollectionActivityRows(rows),
          }));
        })
        .catch(() => {
          // Keep the rows already on screen.
        });
    };

    const arm = () => {
      window.clearInterval(timer);
      timer = 0;
      if (document.hidden) return;
      timer = window.setInterval(load, LIVE_DROP_SUPPLY_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        window.clearInterval(timer);
        timer = 0;
        return;
      }
      load();
      arm();
    };

    if (!document.hidden) load();
    arm();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [collectionId, supplyLive]);

  const handoffKey = collectionCoverImmersive({
    hasMedia: hasImmersiveCover,
    kind: view?.kind,
  })
    ? (view?.collectionId ?? null)
    : null;
  useImmersiveTitleHandoff(
    scrollRootRef,
    heroTitleRef,
    Boolean(handoffKey),
    handoffKey
  );

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

  // The open mint sheet keeps the ask it opened with. The next press re-reads.
  const [heldMintListing, setHeldMintListing] =
    useState<typeof mintListing>(null);

  const openMintSheet = () => {
    setHeldMintListing(mintListing);
    setMintOpen(true);
  };
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
    suspendDock
      ? null
      : isOwner
        ? view
          ? openOwnerPost
          : null
        : showMintCompose
          ? openMintSheet
          : null,
    isOwner ? 'announce' : 'mint'
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
          eventEndsAtMs: view.eventEndsAtMs,
        })) ||
      (view != null &&
        isPassMediumKind((view.kind ?? '').trim().toLowerCase()) &&
        view.maxRedeems != null &&
        view.maxRedeems > 0) ||
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
  const activityAccountIds = useMemo(() => {
    const rows = activitySheetOpen ? sheetActivity : mintPreview;
    return rows.map((row) => row.actor?.trim() || '').filter(Boolean);
  }, [activitySheetOpen, mintPreview, sheetActivity]);
  const activityProfiles = usePostAuthorProfiles(activityAccountIds);
  /**
   * Soft-fill face from the open seed only (latched via `initial`). Cache-only
   * opens use live view fields as they land — no mid-session soft-fill flip.
   */
  const softFillPeek = collectionSoftFillPeek(initial);
  const creatorId = view?.creatorId?.trim() || '';
  const creatorByName = creatorDisplayName?.trim() || null;
  const creatorFacePending =
    Boolean(creatorId) && creatorResolvedKey !== creatorId;
  /** Cool grey shell until face fetch lands — never letter-flash a known photo. */
  const creatorShellLoading =
    Boolean(creatorId) && !creatorAvatarUrl && creatorFacePending;
  /** Local-part name on frame 1; profile name soft-replaces in the same line. */
  const creatorNameLine = creatorId
    ? collectionCreatorNameLine(creatorId, creatorByName)
    : '';
  const creatorPartyLead = scarceRowPartyLead({
    mediumKind: view?.kind,
    audioFormat: view?.audioFormat ?? null,
    writingFormat: view?.writingFormat ?? null,
  });
  const requestActivityClose = () => {
    setActivityClosing(true);
  };
  const handleActivityClosed = () => {
    setActivityClosing(false);
    setActivityOpen(false);
  };

  const reducedMotion = useDropReducedMotion();
  const enterOn = dropEnterShouldPlay({
    reducedMotion,
    openedWithContent: seededHotOpen,
    ready: view != null,
  });
  const catalogShell = collectionCatalogShell({
    hasView: view != null,
    ssrMiss: initial == null,
    clientSettled,
  });
  const catalogLeaveHref = collectionDropBackHref({
    useFirst: peekHoldsCollectionForDropPage(
      paintViewerAccountId,
      collectionId
    ),
    viewerAccountId: paintViewerAccountId,
  });
  const dockFallbackHref = view
    ? collectionDropBackHref({
        useFirst: collectionUseFirst(
          resolveCollectionOwnership({
            isOwner,
            holdsEdition,
            walletLoading,
            viewerAccountId: paintViewerAccountId,
            playSessionMatches: isNowPlayingThisDrop,
          })
        ),
        viewerAccountId: paintViewerAccountId,
      })
    : catalogLeaveHref;
  const onDockBack = useCatalogDockBack(dockFallbackHref);
  const dockBackOn = !suspendDock;
  const dockBackHandler = dockBackOn
    ? embedded
      ? onClose
      : onDockBack
    : undefined;
  if (catalogShell === 'skeleton' && !seededHotOpen) {
    return (
      <OsAppScreen
        title="Drop"
        embedded={embedded}
        dockBack={dockBackOn}
        onDockBack={dockBackHandler}
        backFallbackHref={catalogLeaveHref}
        immersiveHeader
        scrollRootRef={scrollRootRef}
      >
        <div className="collection-drop-settle">
          <OsRouteSettle
            ready={false}
            skeleton={
              <CollectionPageSkeleton hasEdition={Boolean(editionToken)} />
            }
          >
            {null}
          </OsRouteSettle>
        </div>
      </OsAppScreen>
    );
  }
  if (!view) {
    return (
      <OsAppScreen
        title="Drop"
        embedded={embedded}
        dockBack={dockBackOn}
        onDockBack={dockBackHandler}
        backFallbackHref={catalogLeaveHref}
      >
        <div className={MARKET_PAGE_CLASS}>
          <div className="market-page-empty">
            <p className="market-page-empty-copy">This drop isn’t available.</p>
            {embedded ? (
              <OsEmptyAction onClick={onClose}>Back</OsEmptyAction>
            ) : (
              <OsEmptyAction href={catalogLeaveHref}>
                {catalogLeaveHref === APP_DROPS_PATH
                  ? 'Back to Drops'
                  : 'Back to Collectibles'}
              </OsEmptyAction>
            )}
          </div>
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
  const personalMintHint =
    walletRemaining === 0
      ? 'You’ve reached your limit for this drop.'
      : allowlistBlocked
        ? status === 'upcoming'
          ? 'Early access is allowlist only.'
          : 'You’re not on the allowlist.'
        : null;
  const playables = view.playables;
  const hasPlayables = playables.length > 0;
  const holderPlayHref = hasPlayables
    ? collectiblesPlayPath(view.collectionId, {
        tokenId: faceEditionToken || null,
      })
    : null;
  const ownership = resolveCollectionOwnership({
    isOwner,
    holdsEdition,
    walletLoading,
    viewerAccountId: paintViewerAccountId,
    playSessionMatches: isNowPlayingThisDrop,
  });
  const useFirst = collectionUseFirst(ownership);
  const listenOnPlayPage = Boolean(holderPlayHref) && ownership === 'holder';
  const sourceHref = postHrefFromSourcePath(view.sourcePostPath);
  // Soft-fill may land `kind` after open — keep pass seat from the list seed.
  const faceKind = view.kind ?? initial?.kind ?? null;
  const mediumKind = (faceKind ?? '').trim().toLowerCase();
  const isAudio = collectionCoverIsAudio({
    kind: faceKind,
    playablesLength: playables.length,
  });
  const isPassKind = isPassMediumKind(mediumKind);
  const staffVoice = passStaffVoice(mediumKind);
  const canDoor =
    isPassKind &&
    (isOwner || isRedeemer) &&
    view.maxRedeems != null &&
    view.maxRedeems > 0;
  const isTextCardCover = collectionCoverIsTextCard({
    kind: view.kind,
    cardBg: view.cardBg,
    isAudio,
  });
  const readables = view.readables;
  const hasReadables = readables.length > 0 || view.bookPdf != null;
  const opensWritingReader = collectionOpensWritingReader({
    kind: view.kind,
    hasReadables,
  });
  const listedArticleHref = listedArticleReaderHref({
    writingFormat: view.writingFormat,
    sourcePostPath: view.sourcePostPath,
  });
  const openWritingRead = () => {
    const openFolioReader = () => {
      queueMicrotask(() => setWritingReadOpen(true));
    };
    // Same WritingReadSheet as Book/Issue — stay on the drop, no article route hop.
    const listedNeedsBody =
      Boolean(listedArticleHref) &&
      readables.length === 0 &&
      !view.bookPdf &&
      Boolean(view.sourcePostPath?.trim());
    if (listedNeedsBody) {
      void hydrateWritingManifest(view).then((next) => {
        setView((prev) => mergeHydratedWriting(prev, next));
        openFolioReader();
      });
      return;
    }
    openFolioReader();
  };
  const canShowPass =
    isPassKind && holdsEdition === true && Boolean(ownedPassTokenId);
  const coverExpand = collectionCoverExpandAction({
    hasMedia: Boolean(coverSrc),
  });
  const passActionLabel = holdingsActionLabel(mediumKind);
  const showInlineTracks = collectionShowInlineTracks({
    hasPlayables,
  });
  const catalogFacePending = collectionViewNeedsCatalogSoftFill(view);
  const mediumBodyPending = collectionMediumBodyPending({
    softFillPeek: softFillPeek && catalogFacePending,
    isAudio,
    hasPlayables,
  });
  const dropBackHref = collectionDropBackHref({
    useFirst,
    viewerAccountId: paintViewerAccountId,
  });
  // Live wallet, else SSR hint cookie — same on server HTML and hydrate.
  // Never localStorage-peek during render (Link↔button remount flash).
  const vaultHref = paintViewerAccountId
    ? portfolioCollectiblesPath(paintViewerAccountId)
    : null;
  const openOwnedPass = () => {
    const tokenId = ownedPassTokenId?.trim();
    if (!tokenId) return;
    setShowPassTokenId(tokenId);
    setShowPassOpen(true);
  };
  // Soft-fill: keep a seeded story line; empty seed may take catalog copy later
  // (OsLateFill appears that one line — actions stay put).
  const seedDescription = initial?.description?.trim() ?? '';
  const liveDescription = view.description?.trim() ?? '';
  const description = softFillPeek
    ? seedDescription || liveDescription
    : liveDescription;
  const faceSeriesId = softFillPeek
    ? (initial?.seriesId ?? null)
    : view.seriesId;
  const faceSeriesTitle = softFillPeek
    ? (initial?.seriesTitle ?? null)
    : view.seriesTitle;
  const aboutEvent = ticketEventScheduleFacts(view, nowMs);
  const scheduleMoved = eventScheduleMoved({
    previousEndsAtMs: view.eventEndsAtPreviousMs,
    previousStartsAtMs: view.eventStartsAtPreviousMs,
  });
  const aboutHasMore =
    !aboutEvent.empty ||
    (view.accessEndsAtMs != null && view.accessEndsAtMs > 0) ||
    Boolean(view.seriesId) ||
    view.createdAtMs > 0;
  const chipParts: string[] = [];
  if (view.isVariations) {
    chipParts.push(
      view.randomAssignment
        ? `${view.totalSupply} unique · random piece`
        : `${view.totalSupply} unique`
    );
  }
  // Schedule lives in the product status slot. Early access only matters
  // before the public sale opens; after that it stays in Info.
  if (view.hasAllowlist && status === 'upcoming') {
    chipParts.push('Early access');
  }
  const personalAllowlistLeft =
    needsAllowlist &&
    isConnected &&
    allowlistRemaining != null &&
    allowlistRemaining > 0
      ? allowlistRemaining
      : null;
  const isSquareCover = collectionCoverSquare({
    kind: view.kind,
    isAudio,
  });
  const immersive = collectionCoverImmersive({
    hasMedia: Boolean(coverSrc || view.cardBg),
    kind: view.kind,
  });
  const createdRel =
    softFillPeek || view.createdAtMs <= 0
      ? ''
      : formatMarketRelativeTime(view.createdAtMs);
  const faceTitle = collectionFaceTitle(view.title, view.collectionId);
  const seriesOnFace = Boolean(faceSeriesId && faceSeriesTitle);
  let chrome = faceChrome;
  if (chrome == null || chrome.id !== view.collectionId) {
    chrome = {
      id: view.collectionId,
      series: seriesOnFace,
      date: Boolean(createdRel),
    };
    setFaceChrome(chrome);
  }
  const dateOnFace = chrome.date && Boolean(createdRel);
  // Activity section always seated — pending skeleton, rows, or empty copy.
  // Never mount then unmount (CLS on soft-nav empty fetch).
  const showActivityPending = !activityLoaded;
  const showActivitySeeAll =
    activityLoaded && sheetActivity.length > mintPreview.length;
  const productStatus = schedule ?? collectionStatusLabel(status);
  const isTicketKind = mediumKind === 'ticket';
  const capApplicable = needsAllowlist && !isOwner && isConnected;
  const dropFace = (
    <div
      className={osChromePageClassName(
        'collection-page',
        useFirst && 'is-use-first'
      )}
      data-collection-use-first={useFirst ? '' : undefined}
      data-collection-back={dropBackHref}
    >
      <section className="collection-hero" aria-label="Drop cover">
        <CollectionDropEnter play={enterOn} index={0}>
          <div
            className={`collection-cover${coverSrc ? ' has-media' : ''}${
              isSquareCover ? ' is-square' : ''
            }${isTextCardCover ? ' is-card' : ''}${
              immersive ? ' is-immersive' : ''
            }${coverExpand ? ' has-read' : ''}`}
            {...(view.cardBg && !coverSrc
              ? { style: { background: view.cardBg } }
              : {})}
          >
            {coverSrc ? (
              <IpfsImg
                src={coverSrc}
                srcSet={coverSrcSet}
                sizes={coverSrcSet ? APP_COLUMN_HERO_SIZES : undefined}
                alt=""
                decoding="async"
              />
            ) : null}
            {coverExpand === 'artwork' ? (
              <button
                type="button"
                className="scarce-clip-cover-expand collection-cover-read-expand collection-cover-read-hit"
                aria-label="View full cover"
                onClick={() => setMediaOverlayOpen(true)}
              />
            ) : null}
          </div>
        </CollectionDropEnter>

        <header className="collection-head">
          <CollectionDropEnter play={enterOn} index={1}>
            <div className="collection-title-row">
              <div className="collectibles-play-title-block">
                {faceTitle ? (
                  <h1 className="collection-title" ref={heroTitleRef}>
                    {faceTitle}
                  </h1>
                ) : softFillPeek && catalogFacePending ? (
                  <span
                    className="standing-row-shimmer collection-skeleton-title"
                    aria-hidden
                  />
                ) : null}
              </div>
              <div className="drops-discovery-head-trail">
                {editionLine ? (
                  <span className="collection-edition-trail">
                    {editionLine}
                  </span>
                ) : null}
                {dateOnFace ? (
                  <time
                    className="market-listing-meta-right collection-meta-time"
                    {...socialTimeProps(view.createdAtMs)}
                  >
                    {createdRel}
                  </time>
                ) : null}
                <CollectionOwnerManageMenu
                  collectionId={view.collectionId}
                  title={faceTitle || 'Drop'}
                  status={status}
                  minted={view.minted}
                  priceNear={view.priceNear}
                  kind={view.kind}
                  renewable={view.renewable}
                  eventEndsAtMs={view.eventEndsAtMs}
                  eventStartsAtMs={view.eventStartsAtMs}
                  saleClosesAtMs={view.endTimeMs}
                  owner={showOwnerManage}
                  onOpenFacts={() => setFactsOpen(true)}
                  doorStaff={
                    isPassKind && view.maxRedeems != null && view.maxRedeems > 0
                      ? { creatorId: view.creatorId, voice: staffVoice }
                      : null
                  }
                  onManaged={handleOwnerManaged}
                />
              </div>
            </div>
            <Link
              href={portfolioPath(view.creatorId)}
              scroll={false}
              className="drops-discovery-party drops-discovery-party--lead"
            >
              <AccountAvatar
                accountId={view.creatorId}
                src={creatorAvatarUrl}
                fallbackInitial={creatorByName || fallbackLabel(view.creatorId)}
                shellLoading={creatorShellLoading}
                size="sm"
                className="drops-discovery-party-avatar"
              />
              <span className="drops-discovery-party-stack">
                <span className="drops-discovery-lead">{creatorPartyLead}</span>
                <span className="drops-discovery-by">{creatorNameLine}</span>
                <span className="drops-discovery-sub">
                  @{fallbackLabel(view.creatorId)}
                </span>
              </span>
            </Link>
            {chrome.series ? (
              <div className="collection-meta-series-seat">
                {faceSeriesId && faceSeriesTitle ? (
                  <Link
                    href={seriesPagePath(view.creatorId, faceSeriesId)}
                    scroll={false}
                    className="collection-meta-series"
                  >
                    {faceSeriesTitle}
                  </Link>
                ) : null}
              </div>
            ) : null}
            <OsLateFill className="collection-about-seat" fade>
              {description || aboutHasMore ? (
                <CollectionAboutTeaser
                  text={description}
                  hasMore={aboutHasMore}
                  onReadMore={() => setAboutOpen(true)}
                />
              ) : null}
            </OsLateFill>
          </CollectionDropEnter>
          <CollectionDropEnter play={enterOn} index={2}>
            <div className="collection-commerce-actions has-fans-seat">
              {view ? (
                <DropFaceFans
                  creatorId={view.creatorId}
                  collectionId={collectionId}
                  title={faceTitle || view.title || 'Drop'}
                  fanIds={faceFans.fanIds}
                  fanCount={faceFans.fanCount}
                />
              ) : null}
              <div className="collection-commerce-action-icons">
                {showDropLoveHeart ? (
                  <button
                    type="button"
                    className={`collection-commerce-love os-confirm-icon${
                      dropLoves.viewerLoved ? ' is-loved' : ''
                    }${dropLoves.pending ? ' is-pending' : ''}`}
                    aria-label={
                      dropLoves.pending
                        ? 'Confirming love'
                        : dropLoves.viewerLoved
                          ? 'Remove love from this drop'
                          : 'Love this drop'
                    }
                    aria-pressed={dropLoves.viewerLoved}
                    aria-busy={dropLoves.pending}
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
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`collection-commerce-save os-confirm-icon${
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
            <div className="collection-use-actions">
              {(() => {
                // Industry CLS: same reading-row chassis as the skeleton from
                // frame 1. Lead + trail seats fill in place — never solo
                // Collectibles, never morph when hold/wallet lands.
                const trail =
                  isPassKind && holdsEdition !== false ? (
                    <CollectionShowPassTrail
                      ready={canShowPass}
                      label={passActionLabel}
                      onOpen={openOwnedPass}
                    />
                  ) : opensWritingReader ? (
                    <OsRowAction
                      className="collectibles-holding-action"
                      onClick={openWritingRead}
                    >
                      Read
                    </OsRowAction>
                  ) : hasPlayables &&
                    useFirst &&
                    listenOnPlayPage &&
                    holderPlayHref ? (
                    <OsRowAction
                      className="collectibles-holding-action"
                      href={holderPlayHref}
                    >
                      Play
                    </OsRowAction>
                  ) : hasPlayables && !useFirst ? (
                    <OsRowAction
                      className="collectibles-holding-action"
                      onClick={() => setCoverListenOpen(true)}
                    >
                      Play
                    </OsRowAction>
                  ) : (
                    <span
                      className="collection-use-actions-trail-chassis"
                      aria-hidden
                    />
                  );
                // Reserve the pass+Play row while hold is unknown or held —
                // never mount a second reading row after fetch (height flash).
                const reservePassPlayRow =
                  isPassKind &&
                  hasPlayables &&
                  Boolean(holderPlayHref) &&
                  holdsEdition !== false &&
                  (canShowPass ||
                    ownership === 'holder' ||
                    ownership === 'unknown');
                const holderPlayBesidePass = reservePassPlayRow ? (
                  <div className="collection-reading-row">
                    <CollectionOpenCollectiblesLead href={null} />
                    {canShowPass || ownership === 'holder' ? (
                      <OsRowAction
                        className="collectibles-holding-action"
                        href={holderPlayHref!}
                      >
                        Play
                      </OsRowAction>
                    ) : (
                      <span
                        className="collection-use-actions-trail-ghost"
                        aria-hidden
                      >
                        <OsRowAction onClick={() => {}}>Play</OsRowAction>
                      </span>
                    )}
                  </div>
                ) : null;
                return (
                  <>
                    <div className="collection-reading-row">
                      <CollectionOpenCollectiblesLead href={vaultHref} />
                      {trail}
                    </div>
                    {holderPlayBesidePass}
                  </>
                );
              })()}
            </div>
            {isTicketKind ? (
              <div className="collection-event-lines">
                <p
                  className={`collection-product-line${
                    aboutEvent.when || scheduleMoved ? '' : ' is-reserved'
                  }`}
                >
                  {aboutEvent.when ? <span>{aboutEvent.when}</span> : null}
                  {scheduleMoved ? (
                    <>
                      {aboutEvent.when ? (
                        <span className="collection-meta-sep" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="collection-product-status is-idle collection-event-updated"
                        onClick={() => setFactsOpen(true)}
                      >
                        {EVENT_SCHEDULE_UPDATED_LABEL}
                      </button>
                    </>
                  ) : aboutEvent.when ? null : (
                    <span aria-hidden>When</span>
                  )}
                </p>
                <p
                  className={`collection-product-line${
                    aboutEvent.place ? '' : ' is-reserved'
                  }`}
                >
                  {aboutEvent.place ?? <span aria-hidden>Place</span>}
                </p>
                <p
                  className={`collection-product-line${
                    aboutEvent.next ? '' : ' is-reserved'
                  }`}
                >
                  {aboutEvent.next ? (
                    eventHintLive(aboutEvent.next) ? (
                      <span className="collection-product-status is-live">
                        {aboutEvent.next}
                      </span>
                    ) : (
                      aboutEvent.next
                    )
                  ) : (
                    <span aria-hidden>Next</span>
                  )}
                </p>
              </div>
            ) : null}
            {/* Always paint supply + progress — ownership/mint settle must not
                collapse this chassis (CLS on soft-nav and cold hydrate). */}
            <div
              className={`collection-product-row${
                capApplicable ? ' has-wallet-cap' : ''
              }`}
            >
              <div className="collection-product-line">
                <span
                  className={`collection-product-status ${statusTone(status)}`}
                >
                  {productStatus}
                </span>
                <span className="collection-meta-sep" aria-hidden>
                  ·
                </span>
                <span className="collection-commerce-supply">
                  <span className="sr-only">
                    {view.minted}/{view.totalSupply}
                  </span>
                  <span
                    aria-hidden="true"
                    className="collection-commerce-supply-figures"
                  >
                    <RollingNumber value={view.minted} />
                    <span className="collection-commerce-supply-sep">/</span>
                    <RollingNumber value={view.totalSupply} />
                  </span>
                </span>
                {dollarStickerLabel(view.usdE6) ||
                (view.priceNear &&
                  view.priceNear !== '0' &&
                  view.priceYocto !== '0') ? (
                  <>
                    <span className="collection-meta-sep" aria-hidden>
                      ·
                    </span>
                    <span className="collection-product-price">
                      {dollarStickerLabel(view.usdE6) ??
                        `${view.priceNear} NEAR`}
                    </span>
                  </>
                ) : view.kind === 'ticket' ? (
                  <>
                    <span className="collection-meta-sep" aria-hidden>
                      ·
                    </span>
                    <span className="collection-product-price">Free</span>
                  </>
                ) : null}
                {capApplicable ? (
                  <OsLateFill className="collection-wallet-cap">
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
                  </OsLateFill>
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
            </div>
            <div
              className="collection-progress"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${heldEditionPlural(view.kind)} minted`}
            >
              <Divider variant="detail" className="collection-progress-rule" />
              <span
                className="collection-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="collection-mint-hint-seat">
              <p className="collection-mint-hint-sizer" aria-hidden>
                {COLLECTION_MINT_HINT_SIZER}
              </p>
              <OsLateFill className="collection-mint-hint">
                {personalMintHint && !isOwner ? personalMintHint : null}
              </OsLateFill>
            </div>
          </CollectionDropEnter>
        </header>
      </section>

      <CollectionDropEnter play={enterOn} index={3}>
        {view.isVariations ? (
          <VariationSetPeek
            collectionId={view.collectionId}
            totalSupply={view.totalSupply}
            samples={view.variationSamples ?? []}
            randomAssignment={view.randomAssignment}
            referenceTemplate={view.variationReferenceTemplate}
          />
        ) : null}

        {showInlineTracks || mediumBodyPending ? (
          <div className="collection-tracks-seat">
            <CollectionSeatSettle
              pending={!showInlineTracks && mediumBodyPending}
              skeleton={<CollectionTracksSkeleton />}
            >
              {showInlineTracks && playables[0] ? (
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
                    poster={coverSrc}
                    layout="tracks"
                    showTransport={false}
                    showFeedPost={false}
                    showShare={false}
                    showDownloads={false}
                    showAlbumFans={false}
                    persist={{
                      collectionId: view.collectionId,
                      title: view.title,
                      creatorId: view.creatorId,
                      seriesId: view.seriesId,
                      seriesTitle: view.seriesTitle,
                      audioFormat: view.audioFormat,
                      facets: view.facets,
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
            </CollectionSeatSettle>
          </div>
        ) : null}

        <CollectionEventGuests
          collectionId={view.collectionId}
          title={view.title}
          sold={view.minted}
          live={supplyLive}
          {...collectionGuestRoster({
            kind: view.kind,
            window: eventWindowFor({ view }, nowMs),
            accessEndsAtMs: view.accessEndsAtMs,
            eventStartsAtMs: view.eventStartsAtMs,
            eventEndsAtMs: view.eventEndsAtMs,
            nowMs,
          })}
          voice={staffVoice}
        />

        {canDoor || (isOwner && status === 'upcoming') ? (
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
                  <OsRowAction
                    href={
                      staffVoice === 'redeem'
                        ? collectionRedeemPath(view.collectionId)
                        : collectionDoorPath(view.collectionId)
                    }
                  >
                    {staffVoice === 'redeem' ? 'Redeem' : 'Admit'}
                  </OsRowAction>
                </div>
                <div className="collection-reading-row">
                  <p className="collection-section-label">
                    {staffVoice === 'redeem' ? 'Redeem log' : 'Door log'}
                  </p>
                  <OsRowAction onClick={() => setDoorLogOpen(true)}>
                    Scans
                  </OsRowAction>
                </div>
              </>
            ) : null}
            {canDoor ? (
              <CollectionDoorLogSheet
                open={doorLogOpen}
                onClose={() => setDoorLogOpen(false)}
                collectionId={view.collectionId}
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
            onClick={(event: MouseEvent<HTMLAnchorElement>) => {
              if (!isUnmodifiedPrimaryClick(event)) return;
              if (!isAppPostSheetHref(sourceHref)) return;
              event.preventDefault();
              event.stopPropagation();
              openPostThread({ href: sourceHref });
            }}
            onNavigate={(event) => {
              if (!isAppPostSheetHref(sourceHref)) return;
              event.preventDefault();
              openPostThread({ href: sourceHref });
            }}
          >
            View source post
          </Link>
        ) : null}

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
          <div className="collection-activity-seat">
            <CollectionSeatSettle
              pending={showActivityPending}
              skeleton={<CollectionActivitySkeleton rows={3} />}
            >
              {mintPreview.length > 0 ? (
                <CollectionActivityRows
                  rows={mintPreview}
                  profiles={activityProfiles}
                />
              ) : (
                <p className="collection-activity-empty">No activity yet</p>
              )}
            </CollectionSeatSettle>
          </div>
        </section>
      </CollectionDropEnter>
    </div>
  );

  return (
    <OsAppScreen
      title={faceTitle || 'Drop'}
      embedded={embedded}
      dockBack={dockBackOn}
      onDockBack={dockBackHandler}
      backFallbackHref={dropBackHref}
      immersiveHeader={immersive}
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
      {seededHotOpen ? (
        // Warm soft-nav: opaque. loading.tsx → page remount + surface fade
        // made Open Collectibles / Show pass flicker; cold settle still rises.
        dropFace
      ) : (
        <div className="collection-drop-settle">
          <OsRouteSettle
            ready
            skeleton={
              <CollectionPageSkeleton hasEdition={Boolean(editionToken)} />
            }
          >
            {dropFace}
          </OsRouteSettle>
        </div>
      )}
      <Suspense fallback={null}>
        <EditionQueryToken
          collectionId={collectionId}
          onToken={rememberEditionToken}
        />
      </Suspense>

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
        {!activityLoaded ? (
          <CollectionActivitySkeleton rows={6} />
        ) : sheetActivity.length > 0 ? (
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
        cover={coverSrc}
        collectionId={view.collectionId}
        tokenId={editionToken}
        accountId={viewerAccountId}
        creatorId={view.creatorId}
        readables={readables}
        bookPdf={view.bookPdf}
        writingFormat={view.writingFormat}
        textAlign={view.textAlign ?? null}
        publishedAt={view.createdAtMs > 0 ? view.createdAtMs : null}
        sourcePostPath={view.sourcePostPath}
      />

      {coverListenOpen && playables[0] ? (
        <ScarceClipPlayer
          key={`cover-listen-${playables[0].url}`}
          clip={playables[0]}
          tracks={playables}
          poster={coverSrc}
          layout="cover"
          showTransport
          showTracks={false}
          immersiveListen
          onListenClose={() => setCoverListenOpen(false)}
          persist={{
            collectionId: view.collectionId,
            title: view.title,
            creatorId: view.creatorId,
            seriesId: view.seriesId,
            seriesTitle: view.seriesTitle,
            audioFormat: view.audioFormat,
            facets: view.facets,
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
      ) : null}

      {showPassTokenId ? (
        <TicketShowPassSheet
          open={showPassOpen}
          onClose={() => setShowPassOpen(false)}
          title={view.title}
          cover={editionCoverUrl(view, showPassTokenId)}
          collectionId={view.collectionId}
          tokenId={showPassTokenId}
          eventEndsAtMs={view.eventEndsAtMs}
          whenLabel={aboutEvent.when}
          placeLabel={aboutEvent.place}
          voice={staffVoice}
        />
      ) : null}

      <ScarceBuySheet
        open={mintOpen}
        listing={mintOpen ? heldMintListing : mintListing}
        alreadyOwnsEdition={holdsEdition === true}
        onOpenChange={setMintOpen}
        onPurchased={handleMintPurchased}
        zIndex={
          coverListenOpen
            ? postLayerOverlayZ(ownerZ).sheet
            : ownerZ == null
              ? SCARCE_Z.sheet
              : Math.max(SCARCE_Z.sheet, ownerZ + 1)
        }
      />

      {coverSrc && mediaOverlayOpen ? (
        <DropArtOverlay
          open={mediaOverlayOpen}
          src={coverSrc}
          label={view.title}
          onClose={() => setMediaOverlayOpen(false)}
        />
      ) : null}
    </OsAppScreen>
  );
}
