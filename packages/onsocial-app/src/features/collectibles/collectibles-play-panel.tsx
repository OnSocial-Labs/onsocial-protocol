'use client';

import { useEffect, useRef, useState } from 'react';
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
  fetchCollection,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  fetchOwnedScarceByTokenId,
  fetchOwnedScarceForCollection,
  formatMarketRelativeTime,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import { marketMediumLabel } from '@/features/market/market-medium';
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
import { fallbackLabel, resolveProfileMediaUrl } from '@/lib/profile-display';

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
    kind: 'music',
    playables: playablesFromOfflineAlbum(album),
    readables: [],
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

async function loadCreatorFace(creatorId: string): Promise<{
  avatarUrl: string | null;
  displayName: string | null;
}> {
  try {
    const client = createReadOnlyOnSocialClient();
    const [profile, statsRows] = await Promise.all([
      client.profiles.get(creatorId),
      client.query.profiles.statsForAccounts([creatorId]),
    ]);
    const media = profile ? client.profiles.avatarMedia(profile) : null;
    const faceFromProfile =
      media?.kind === 'image'
        ? media.url
        : (media?.poster ?? client.profiles.avatarUrl(profile) ?? null);
    const stats = statsRows[0];
    const avatarUrl =
      faceFromProfile ||
      (stats?.avatar ? resolveProfileMediaUrl(stats.avatar) : null);
    const handle = fallbackLabel(creatorId);
    const rawName = profile?.name?.trim() || stats?.name?.trim() || null;
    const hasDisplayName =
      Boolean(rawName) &&
      rawName!.toLowerCase() !== handle.toLowerCase() &&
      rawName!.toLowerCase() !== creatorId.toLowerCase();
    return {
      avatarUrl,
      displayName: hasDisplayName ? rawName : null,
    };
  } catch {
    return { avatarUrl: null, displayName: null };
  }
}

/**
 * Focused Collectibles player — music / video holdings land here from the vault
 * (Play / Watch). Immersive cover under nav; title hands off on scroll.
 */
export function CollectiblesPlayPanel() {
  const searchParams = useSearchParams();
  const { accountId: viewerAccountId, isConnected } = useAppWallet();
  const collectionId =
    searchParams.get(COLLECTIBLES_PLAY_PARAM)?.trim() ||
    searchParams.get('collection')?.trim() ||
    '';
  const tokenIdParam =
    searchParams.get(COLLECTIBLES_PLAY_TOKEN_PARAM)?.trim() || '';
  const [load, setLoad] = useState<PlayLoadState | null>(null);
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

  useEffect(() => {
    if (!collectionId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const view = await fetchCollection(collectionId);
        if (cancelled) return;
        if (!view) {
          const offline = await getOfflineAlbum(collectionId);
          if (cancelled) return;
          if (offline) {
            setLoad({
              collectionId,
              view: collectionViewFromOfflineAlbum(offline),
              failed: false,
              offline: true,
              creatorAvatarUrl: null,
              creatorDisplayName: null,
            });
            return;
          }
          setLoad({
            collectionId,
            view: null,
            failed: true,
            offline: false,
            creatorAvatarUrl: null,
            creatorDisplayName: null,
          });
          return;
        }
        const face = await loadCreatorFace(view.creatorId);
        if (cancelled) return;
        setLoad({
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
          setLoad({
            collectionId,
            view: collectionViewFromOfflineAlbum(offline),
            failed: false,
            offline: true,
            creatorAvatarUrl: null,
            creatorDisplayName: null,
          });
          return;
        }
        setLoad({
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
  }, [collectionId]);

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
  const canSell = ownedItem != null && ownedItem.listingKind == null;
  const isListed = ownedItem != null && ownedItem.listingKind != null;
  const dropIsLive =
    view != null && deriveCollectionStatus(view, nowMs) === 'live';
  const screenTitle = view?.title?.trim() || 'Player';
  const immersive = status === 'ready' && view != null;

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
        {status === 'loading' ? (
          <p className="market-page-status">Loading player…</p>
        ) : null}

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
        open={sellOpen && ownedItem != null}
        item={ownedItem}
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
