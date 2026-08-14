'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  InformationCircleIcon,
  OsSheetAction,
  OsSheetActions,
  ProfileAvatar,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { PortfolioIdentityGestures } from '@/components/portfolio/portfolio-identity-gestures';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  CollectionAboutSheet,
  CollectionAboutTeaser,
} from '@/features/scarces/collection-about-sheet';
import { CollectionFactsSheet } from '@/features/scarces/collection-facts-sheet';
import {
  deriveCollectionStatus,
  fetchCollectionPreferIndexer,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchOwnedScarceByTokenId,
  fetchOwnedScarceForCollection,
  formatMarketRelativeTime,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { marketMediumLabel } from '@/features/market/market-medium';
import { CollectiblesPlaySkeleton } from '@/features/collectibles/collectibles-play-skeleton';
import {
  fetchCollectionCreatorFace,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import { ScarceClipPlayer } from '@/features/scarces/scarce-clip-player';
import { ScarceSellSheet } from '@/features/scarces/scarce-sell-sheet';
import { accountIdsEqual } from '@/lib/account-match';
import {
  APP_COLLECTIBLES_PATH,
  COLLECTIBLES_PLAY_PARAM,
  COLLECTIBLES_PLAY_TOKEN_PARAM,
  collectionPath,
} from '@/lib/app-routes';
import {
  getOfflineAlbum,
  playablesFromOfflineAlbum,
} from '@/lib/collectibles-offline';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

interface PlayLoadState {
  collectionId: string;
  view: CollectionView | null;
  failed: boolean;
  offline: boolean;
  creatorAvatarUrl: string | null;
  creatorDisplayName: string | null;
}

function collectionViewFromOfflineAlbum(
  album: NonNullable<Awaited<ReturnType<typeof getOfflineAlbum>>>
): CollectionView {
  return {
    collectionId: album.collectionId,
    creatorId: '',
    title: album.title,
    mediaUrl: album.poster,
    priceNear: null,
    priceYocto: '0',
    totalSupply: 0,
    minted: 0,
    remaining: 0,
    startTimeMs: null,
    endTimeMs: null,
    createdAtMs: album.updatedAt,
    maxPerWallet: null,
    mintMode: '',
    paused: false,
    cancelled: false,
    soldOut: false,
    hasAllowlist: false,
    appId: null,
    appCommissionBps: null,
    kind: 'audio',
    audioFormat:
      album.tracks.length >= 2
        ? 'album'
        : album.tracks.length === 1
          ? 'single'
          : null,
    facets: [],
    playables: playablesFromOfflineAlbum(album),
    readables: [],
    bookPdf: null,
    writingFormat: null,
    writingManifestCid: null,
    transferable: true,
    renewable: false,
    maxRedeems: null,
    isVariations: false,
    randomAssignment: false,
    seriesId: null,
    seriesTitle: null,
    royalty: null,
  };
}

/**
 * Focused Collectibles player — music / video holdings land here from the vault
 * (Play / Watch). Immersive cover under nav; title hands off on scroll.
 */
export function CollectiblesPlayPanel({
  initialCollectionId = null,
  initialTokenId = null,
  initialView = null,
  initialCreator = null,
}: {
  initialCollectionId?: string | null;
  initialTokenId?: string | null;
  initialView?: CollectionView | null;
  initialCreator?: CollectionCreatorFace | null;
} = {}) {
  const searchParams = useSearchParams();
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const collectionId =
    searchParams.get(COLLECTIBLES_PLAY_PARAM)?.trim() ||
    searchParams.get('collection')?.trim() ||
    initialCollectionId?.trim() ||
    '';
  const tokenIdParam =
    searchParams.get(COLLECTIBLES_PLAY_TOKEN_PARAM)?.trim() ||
    initialTokenId?.trim() ||
    '';
  const hasSsrLoad =
    Boolean(collectionId) &&
    initialCollectionId?.trim() === collectionId &&
    initialView != null;
  const ssrLoad: PlayLoadState | null = hasSsrLoad
    ? {
        collectionId,
        view: initialView,
        failed: false,
        offline: false,
        creatorAvatarUrl: initialCreator?.avatarUrl ?? null,
        creatorDisplayName: initialCreator?.displayName ?? null,
      }
    : null;
  const [clientLoad, setClientLoad] = useState<PlayLoadState | null>(null);
  // Prefer soft RPC refresh when present; keep SSR shell until then.
  const load =
    clientLoad?.collectionId === collectionId
      ? clientLoad
      : (ssrLoad ?? null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [ownedByKey, setOwnedByKey] = useState<{
    key: string;
    item: OwnedScarceItem | null;
  } | null>(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [headerElevated, setHeaderElevated] = useState(false);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null);
  const ownershipKey =
    isConnected && viewerAccountId && collectionId
      ? `${viewerAccountId}:${collectionId}:${tokenIdParam || '*'}`
      : '';

  // Soft RPC when SSR painted; full client load when landing without shell.
  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    void (async () => {
      if (hasSsrLoad) {
        const next = await fetchCollectionPreferIndexer(collectionId);
        if (cancelled || !next) return;
        setClientLoad({
          collectionId,
          view: next,
          failed: false,
          offline: false,
          creatorAvatarUrl: initialCreator?.avatarUrl ?? null,
          creatorDisplayName: initialCreator?.displayName ?? null,
        });
        return;
      }
      try {
        const client = createReadOnlyOnSocialClient();
        const view = await fetchCollectionPreferIndexer(collectionId);
        if (cancelled) return;
        if (!view) {
          const offline = await getOfflineAlbum(collectionId);
          if (cancelled) return;
          if (offline) {
            setClientLoad({
              collectionId,
              view: collectionViewFromOfflineAlbum(offline),
              failed: false,
              offline: true,
              creatorAvatarUrl: null,
              creatorDisplayName: null,
            });
            return;
          }
          setClientLoad({
            collectionId,
            view: null,
            failed: true,
            offline: false,
            creatorAvatarUrl: null,
            creatorDisplayName: null,
          });
          return;
        }
        const face = await fetchCollectionCreatorFace(client, view.creatorId);
        if (cancelled) return;
        setClientLoad({
          collectionId,
          view,
          failed: false,
          offline: false,
          creatorAvatarUrl: face.avatarUrl,
          creatorDisplayName: face.displayName,
        });
      } catch {
        const offline = await getOfflineAlbum(collectionId);
        if (cancelled) return;
        if (offline) {
          setClientLoad({
            collectionId,
            view: collectionViewFromOfflineAlbum(offline),
            failed: false,
            offline: true,
            creatorAvatarUrl: null,
            creatorDisplayName: null,
          });
          return;
        }
        setClientLoad({
          collectionId,
          view: null,
          failed: true,
          offline: false,
          creatorAvatarUrl: null,
          creatorDisplayName: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collectionId, hasSsrLoad, initialCreator]);

  // Resolve owned edition for quiet Sell — prefer `?t=` (exact edition).
  useEffect(() => {
    if (!ownershipKey || !viewerAccountId || !collectionId) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    let cancelled = false;
    void (async () => {
      let item: OwnedScarceItem | null = null;
      if (tokenIdParam) {
        item = await fetchOwnedScarceByTokenId(viewerAccountId, tokenIdParam);
      }
      if (!item) {
        item = await fetchOwnedScarceForCollection(
          viewerAccountId,
          collectionId
        );
      }
      if (!cancelled) setOwnedByKey({ key: ownershipKey, item });
    })();
    return () => {
      cancelled = true;
    };
  }, [ownershipKey, viewerAccountId, collectionId, tokenIdParam]);

  const status =
    !collectionId
      ? 'error'
      : load?.collectionId !== collectionId
        ? 'loading'
        : load.failed || !load.view
          ? 'error'
          : 'ready';
  const view = load?.collectionId === collectionId ? load.view : null;
  const offlinePlayback =
    load?.collectionId === collectionId ? Boolean(load.offline) : false;
  const creatorAvatarUrl =
    load?.collectionId === collectionId ? load.creatorAvatarUrl : null;
  const creatorDisplayName =
    load?.collectionId === collectionId ? load.creatorDisplayName : null;
  const playables = view?.playables ?? [];
  const hasPlayables = playables.length > 0;
  const description = view?.description?.trim() ?? '';
  const kindLabel = marketMediumLabel(view?.kind);
  const releasedRel =
    view && view.createdAtMs > 0
      ? formatMarketRelativeTime(view.createdAtMs)
      : null;
  const dropHref = collectionId
    ? collectionPath(collectionId)
    : APP_COLLECTIBLES_PATH;
  const isSelf =
    Boolean(viewerAccountId) &&
    Boolean(view?.creatorId) &&
    accountIdsEqual(viewerAccountId!, view!.creatorId);
  /** Visitor gestures only — skip owner payout marks on a listen surface. */
  const showCreatorGestures =
    Boolean(view?.creatorId) && isConnected && !isSelf;
  const ownedItem =
    ownershipKey && ownedByKey?.key === ownershipKey ? ownedByKey.item : null;
  /** Prefer live drop tracks so Sell keeps the same persist session as Play. */
  const sellItem = useMemo(() => {
    if (!ownedItem) return null;
    if (ownedItem.playables?.length || ownedItem.playable) return ownedItem;
    const fromView = view?.playables ?? [];
    if (fromView.length === 0) return ownedItem;
    return {
      ...ownedItem,
      playable: fromView[0],
      playables: fromView,
      ...(view?.mediaUrl?.trim() && !ownedItem.mediaUrl
        ? { mediaUrl: view.mediaUrl.trim() }
        : {}),
    };
  }, [ownedItem, view]);
  const canSell = ownedItem != null && ownedItem.listingKind == null;
  const isListed = ownedItem != null && ownedItem.listingKind != null;
  const dropIsLive =
    view != null && deriveCollectionStatus(view, nowMs) === 'live';
  const screenTitle = view?.title?.trim() || 'Player';
  // Immersive chrome while loading so the cover shell matches ready geometry.
  const immersive = status === 'loading' || (status === 'ready' && view != null);

  // Keep Live chip honest while the mint window can flip.
  useEffect(() => {
    if (status !== 'ready') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [status]);

  // Title handoff — same recipe as collection / guild immersive nav.
  const handoffKey = immersive ? (view?.collectionId ?? null) : null;
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

  return (
    <OsAppScreen
      title={screenTitle}
      backFallbackHref={APP_COLLECTIBLES_PATH}
      immersiveHeader={immersive}
      headerElevated={immersive ? headerElevated : false}
      glassChrome={!immersive}
      scrollRootRef={scrollRootRef}
      actions={
        status === 'ready' && view && !offlinePlayback ? (
          <Link
            className={`page-drawer-section-action collectibles-play-drop-action${
              dropIsLive ? ' is-live' : ''
            }`}
            href={dropHref}
            scroll={false}
          >
            {dropIsLive ? (
              <span className="collectibles-play-drop-live" aria-hidden />
            ) : null}
            <span>View drop</span>
            {dropIsLive ? (
              <span className="collectibles-play-drop-live-label">Live</span>
            ) : null}
          </Link>
        ) : undefined
      }
    >
      {immersive ? (
        <div
          aria-hidden
          className={`os-chrome-glass${headerElevated ? ' is-frosted' : ''}`}
        />
      ) : null}

      <div
        className={`market-page collectibles-play-page${
          immersive ? ' is-immersive' : ''
        }`}
      >
        {status === 'loading' ? <CollectiblesPlaySkeleton /> : null}

        {status === 'error' || !view ? (
          status !== 'loading' ? (
            <div className="market-page-empty">
              <p className="market-page-empty-copy">
                Couldn’t open this collectible.
              </p>
              <Link
                className="page-drawer-section-action"
                href={APP_COLLECTIBLES_PATH}
              >
                Back to Collectibles
              </Link>
            </div>
          ) : null
        ) : null}

        {status === 'ready' && view ? (
          <div className="collectibles-play-body">
            {hasPlayables ? (
              <ScarceClipPlayer
                key={playables[0]!.url}
                clip={playables[0]!}
                tracks={playables}
                poster={view.mediaUrl}
                layout="cover"
                persist={{
                  collectionId: view.collectionId,
                  title: view.title,
                }}
                creatorId={offlinePlayback ? null : view.creatorId}
                canKeepOffline={
                  offlinePlayback
                    ? true
                    : isSelf
                      ? true
                      : !isConnected
                        ? false
                        : !ownershipKey || ownedByKey?.key !== ownershipKey
                          ? null
                          : ownedItem != null
                }
              />
            ) : (
              <div className="market-page-empty">
                <p className="market-page-empty-copy">
                  This drop has no playable tracks yet.
                </p>
              </div>
            )}

            <div className="collectibles-play-title-row collection-title-row">
              <h1 className="collectibles-play-title" ref={heroTitleRef}>
                {view.title}
              </h1>
              {canSell ? (
                <OsSheetActions
                  layout="row-compact"
                  tone="frosted-primary"
                  borderless
                  className="collectibles-play-sell-action"
                >
                  <OsSheetAction
                    type="button"
                    variant="primary"
                    ready
                    onClick={() => setSellOpen(true)}
                  >
                    Sell
                  </OsSheetAction>
                </OsSheetActions>
              ) : isListed ? (
                <span className="collectibles-play-listed">Listed</span>
              ) : null}
            </div>

            {offlinePlayback ? null : (
            <div className="collectibles-play-creator collection-meta">
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
                  {kindLabel ? (
                    <>
                      <span className="collection-meta-sep" aria-hidden>
                        ·
                      </span>
                      <span className="collectibles-play-kind">{kindLabel}</span>
                    </>
                  ) : null}
                  {releasedRel ? (
                    <>
                      <span className="collection-meta-sep" aria-hidden>
                        ·
                      </span>
                      <span className="collection-meta-time">{releasedRel}</span>
                    </>
                  ) : null}
                  <span className="collection-meta-sep" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    className="guild-hero-facts-button collectibles-play-facts"
                    aria-label="Drop facts"
                    onClick={() => {
                      setNowMs(Date.now());
                      setFactsOpen(true);
                    }}
                  >
                    <InformationCircleIcon
                      className="guild-hero-facts-icon"
                      aria-hidden
                    />
                  </button>
                </div>
              </div>
            </div>
            )}

            {showCreatorGestures ? (
              <div className="collectibles-play-gestures">
                <PortfolioIdentityGestures
                  pageAccountId={view.creatorId}
                  profileName={creatorDisplayName}
                  avatarUrl={creatorAvatarUrl}
                />
              </div>
            ) : null}

            {description ? (
              <CollectionAboutTeaser
                text={description}
                onReadMore={() => setAboutOpen(true)}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {view ? (
        <>
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
        </>
      ) : null}

      <ScarceSellSheet
        open={sellOpen && sellItem != null}
        item={sellItem}
        sellerAccountId={viewerAccountId}
        onOpenChange={setSellOpen}
        onListed={() => {
          setSellOpen(false);
          if (!ownershipKey || !viewerAccountId || !collectionId) return;
          void (async () => {
            const item = tokenIdParam
              ? await fetchOwnedScarceByTokenId(viewerAccountId, tokenIdParam)
              : await fetchOwnedScarceForCollection(
                  viewerAccountId,
                  collectionId
                );
            setOwnedByKey({ key: ownershipKey, item });
          })();
        }}
      />
    </OsAppScreen>
  );
}
