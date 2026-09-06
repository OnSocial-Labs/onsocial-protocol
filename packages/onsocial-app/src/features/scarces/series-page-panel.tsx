'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Divider,
  OsIconAction,
  SettingsIcon,
  ShopFillIcon,
  standingIdentityLabel,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import {
  fetchOwnedScarcesPage,
  type OwnedScarceItem,
} from '@/features/market/market-listings';
import type { CollectionView } from '@/features/scarces/collections-data';
import { groupSeriesDrops } from '@/features/scarces/series-catalog';
import { SeriesEditSheet } from '@/features/scarces/series-edit-sheet';
import {
  fetchSeriesBrandingCached,
  seedSeriesBrandingCache,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import {
  heldCollectionIdSet,
  ownedItemsInSeries,
  peekHeldSeriesItems,
  seriesPageBackHref,
  seriesUseFirst,
} from '@/features/scarces/series-page-view';
import { StoreDropCard } from '@/features/scarces/store-catalog';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_DROP_CREATE_PATH, marketCreatorPath } from '@/lib/app-routes';
import { portfolioCollectiblesPath, portfolioPath } from '@/lib/overlay-routes';
import {
  groupHoldingsForRail,
  toPortfolioHoldingPeek,
} from '@/lib/portfolio-holdings';

interface SeriesPagePanelProps {
  creatorId: string;
  seriesId: string;
  initialBranding: SeriesBranding | null;
  /** Creator profile avatar — logo fallback for unbranded series (SSR). */
  creatorAvatarUrl: string | null;
  /** Creator display name when known (SSR profile shell). */
  creatorDisplayName?: string | null;
  /** The creator's drops in this series, newest first (SSR). */
  drops: CollectionView[];
}

/** Public series page — use-first when held, shop catalog for visitors. */
export function SeriesPagePanel({
  creatorId,
  seriesId,
  initialBranding,
  creatorAvatarUrl,
  creatorDisplayName = null,
  drops,
}: SeriesPagePanelProps) {
  const { accountId } = useAppWallet();
  const [branding, setBranding] = useState(initialBranding);
  const [editing, setEditing] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const collectionIds = useMemo(
    () => drops.map((drop) => drop.collectionId).filter(Boolean),
    [drops]
  );
  const holdMatch = useMemo(
    () => ({ creatorId, seriesId, collectionIds }),
    [collectionIds, creatorId, seriesId]
  );
  const holdKey = `${accountId ?? ''}:${creatorId}:${seriesId}:${collectionIds.join(',')}`;
  const [fetchedOwned, setFetchedOwned] = useState<{
    key: string;
    items: OwnedScarceItem[];
  } | null>(null);

  useEffect(() => {
    seedSeriesBrandingCache(creatorId, seriesId, initialBranding);
  }, [creatorId, initialBranding, seriesId]);

  // Brand lives on chain (`social.get`); soft-fill if SSR missed it.
  useEffect(() => {
    if (initialBranding) return;
    let cancelled = false;
    void fetchSeriesBrandingCached(creatorId, seriesId).then((next) => {
      if (!cancelled && next) setBranding(next);
    });
    return () => {
      cancelled = true;
    };
  }, [creatorId, initialBranding, seriesId]);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    void fetchOwnedScarcesPage(accountId)
      .then((page) => {
        if (cancelled) return;
        setFetchedOwned({
          key: holdKey,
          items: ownedItemsInSeries(page.items, holdMatch),
        });
      })
      .catch(() => {
        /* Keep the vault peek — a failed owned fetch must not flash shop chrome. */
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, holdKey, holdMatch]);

  const ownedInSeries =
    fetchedOwned?.key === holdKey
      ? fetchedOwned.items
      : peekHeldSeriesItems(accountId, holdMatch);
  const isOwner = accountId != null && accountIdsEqual(accountId, creatorId);
  const holdsEditionInSeries =
    ownedInSeries.length > 0 ? true : accountId ? null : false;
  const useFirst = seriesUseFirst({ isOwner, holdsEditionInSeries });
  const fallbackTitle = drops.find((drop) => drop.seriesTitle)?.seriesTitle;
  const title = branding?.title ?? fallbackTitle ?? seriesId;
  // Unbranded series inherit the creator's identity instead of a bare letter.
  const logoUrl = branding?.logoUrl ?? creatorAvatarUrl;
  const shopHref = marketCreatorPath(creatorId);
  const seriesBackHref = seriesPageBackHref({
    useFirst,
    viewerAccountId: accountId,
    shopHref,
  });
  const vaultHref = accountId ? portfolioCollectiblesPath(accountId) : null;
  const heldIds = useMemo(
    () => heldCollectionIdSet(ownedInSeries),
    [ownedInSeries]
  );
  const heldRows = useMemo(
    () => groupHoldingsForRail(ownedInSeries.map(toPortfolioHoldingPeek)),
    [ownedInSeries]
  );
  const storeDrops = useMemo(
    () => drops.filter((drop) => !heldIds.has(drop.collectionId)),
    [drops, heldIds]
  );
  const dropCount = drops.length > 0 ? drops.length : heldRows.length;
  const dropCountLabel = `${dropCount} ${dropCount === 1 ? 'drop' : 'drops'}`;
  const groups = useMemo(
    () => groupSeriesDrops(storeDrops, nowMs),
    [nowMs, storeDrops]
  );
  const showSectionLabels = groups.length > 1;
  const creatorLabel = standingIdentityLabel(
    creatorId,
    creatorDisplayName
  ).label;
  const needsBrand =
    isOwner && !branding?.description?.trim() && !branding?.logo;

  return (
    <OsAppScreen
      title={title}
      subtitle={dropCountLabel}
      dockBack
      backFallbackHref={seriesBackHref}
      glassChrome
      actions={
        <>
          <OsIconAction asChild ariaLabel="Shop this creator">
            <Link href={shopHref} scroll={false}>
              <ShopFillIcon aria-hidden className="glass-sheet-close-icon" />
            </Link>
          </OsIconAction>
          {isOwner ? (
            <OsIconAction
              ariaLabel="Edit series"
              onClick={() => setEditing(true)}
            >
              <SettingsIcon aria-hidden className="glass-sheet-close-icon" />
            </OsIconAction>
          ) : null}
        </>
      }
    >
      <div
        className={`market-page series-page${useFirst ? ' is-use-first' : ''}`}
        data-series-use-first={useFirst ? '' : undefined}
        data-series-back={seriesBackHref}
      >
        <header className="series-hero">
          <div className="series-hero-identity">
            <span className={`series-hero-logo${logoUrl ? ' has-media' : ''}`}>
              {logoUrl ? (
                <img src={logoUrl} alt="" />
              ) : (
                <span aria-hidden>{title.slice(0, 1).toUpperCase()}</span>
              )}
            </span>
            <div className="series-hero-copy">
              <h2 className="series-hero-title">{title}</h2>
              <p className="series-hero-meta">{dropCountLabel}</p>
            </div>
          </div>

          <div className="standing-row series-hero-creator">
            <div className="standing-row-main">
              <Link
                href={portfolioPath(creatorId)}
                className="standing-row-hit"
                scroll={false}
                aria-label={`View ${creatorLabel}'s profile`}
              />
              <StandingIdentity
                accountId={creatorId}
                profileName={creatorDisplayName}
                avatarUrl={creatorAvatarUrl}
                size="md"
                copyLeading={
                  <span className="series-hero-creator-role">Series by</span>
                }
              />
            </div>
          </div>

          {branding?.description ? (
            <p className="series-hero-description">{branding.description}</p>
          ) : needsBrand ? (
            <button
              type="button"
              className="series-hero-brand-hint"
              onClick={() => setEditing(true)}
            >
              Add a logo and story for this series
            </button>
          ) : null}
          {useFirst && vaultHref ? (
            <div className="series-use-actions">
              <Link
                href={vaultHref}
                scroll={false}
                className="collection-reading-open"
              >
                Open Collectibles
              </Link>
            </div>
          ) : null}
        </header>

        {heldRows.length > 0 ? (
          <div className="series-held-list market-listing-list" role="list">
            {heldRows.map((item) => (
              <CollectiblesHoldingRow
                key={item.tokenId}
                item={item}
                editionCount={item.editionCount}
                hideCreator
              />
            ))}
          </div>
        ) : null}

        {storeDrops.length > 0 ? (
          <>
            <Divider variant="item" className="series-hero-divider" />
            <div className="series-catalog">
              {groups.map((group) => (
                <section
                  key={group.bucket}
                  className="series-catalog-section"
                  aria-label={group.label}
                >
                  {showSectionLabels ? (
                    <p className="collection-section-label">{group.label}</p>
                  ) : null}
                  <ul className="app-drop-list">
                    {group.drops.map((drop) => (
                      <li key={drop.collectionId}>
                        <StoreDropCard view={drop} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : null}

        {storeDrops.length === 0 && heldRows.length === 0 ? (
          <div className="standing-panel-empty-block is-centered">
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">
                No drops in this series yet.
              </p>
              {isOwner ? (
                <>
                  <p className="standing-panel-empty-secondary">
                    Start the next drop in this line from Create.
                  </p>
                  <Link
                    href={APP_DROP_CREATE_PATH}
                    className="page-drawer-section-action series-empty-create"
                    scroll={false}
                  >
                    Create a drop
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {isOwner ? (
        <SeriesEditSheet
          open={editing}
          creatorId={creatorId}
          seriesId={seriesId}
          branding={branding}
          fallbackTitle={fallbackTitle ?? seriesId}
          onClose={() => setEditing(false)}
          onSaved={setBranding}
        />
      ) : null}
    </OsAppScreen>
  );
}
