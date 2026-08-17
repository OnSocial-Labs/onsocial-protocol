'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Divider,
  OsIconAction,
  SettingsIcon,
  ShopFillIcon,
  StandingIdentity,
  standingIdentityLabel,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  deriveCollectionStatus,
  type CollectionView,
} from '@/features/scarces/collections-data';
import {
  groupSeriesCatalogDrops,
  pickSeriesFeaturedDrop,
} from '@/features/scarces/series-catalog';
import { SeriesEditSheet } from '@/features/scarces/series-edit-sheet';
import {
  fetchSeriesBrandingCached,
  seedSeriesBrandingCache,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import {
  StoreDropCard,
  StoreDropSpotlightCard,
} from '@/features/scarces/store-catalog';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_DROP_CREATE_PATH, marketCreatorPath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';

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

function seriesFeaturedEyebrow(
  featured: CollectionView,
  nowMs: number
): string {
  return deriveCollectionStatus(featured, nowMs) === 'upcoming'
    ? 'Up next'
    : 'Featured';
}

/** Public series page — brand-first catalog for a creator's drop line. */
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

  const isOwner = accountId != null && accountIdsEqual(accountId, creatorId);
  const fallbackTitle = drops.find((drop) => drop.seriesTitle)?.seriesTitle;
  const title = branding?.title ?? fallbackTitle ?? seriesId;
  // Unbranded series inherit the creator's identity instead of a bare letter.
  const logoUrl = branding?.logoUrl ?? creatorAvatarUrl;
  const shopHref = marketCreatorPath(creatorId);
  const dropCountLabel = `${drops.length} ${drops.length === 1 ? 'drop' : 'drops'}`;
  const featured = useMemo(
    () => pickSeriesFeaturedDrop(drops, nowMs),
    [drops, nowMs]
  );
  const groups = useMemo(
    () => groupSeriesCatalogDrops(drops, featured?.collectionId ?? null, nowMs),
    [drops, featured?.collectionId, nowMs]
  );
  // Label sections whenever more than one list remains under the spotlight.
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
      // Brand lives in the hero — keep chrome to back + actions only.
      heading={<></>}
      backFallbackHref={shopHref}
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
      <div className="market-page series-page">
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
        </header>

        {drops.length > 0 ? (
          <>
            <Divider variant="item" className="series-hero-divider" />
            <div className="series-catalog">
              {featured ? (
                <section
                  className="series-catalog-featured"
                  aria-label="Featured drop"
                >
                  <p className="series-catalog-featured-eyebrow">
                    {seriesFeaturedEyebrow(featured, nowMs)}
                  </p>
                  <StoreDropSpotlightCard view={featured} showCreator={false} />
                </section>
              ) : null}
              {groups.map((group) => (
                <section
                  key={group.bucket}
                  className="series-catalog-section"
                  aria-label={group.label}
                >
                  {showSectionLabels ||
                  (featured != null && groups.length === 1) ? (
                    <p className="collection-section-label">{group.label}</p>
                  ) : null}
                  <ul className="app-drop-list">
                    {group.drops.map((drop) => (
                      <li key={drop.collectionId}>
                        <StoreDropCard
                          view={drop}
                          showCreator={false}
                          size="catalog"
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        ) : (
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
              ) : (
                <>
                  <p className="standing-panel-empty-secondary">
                    When the next drop lands, it will show up here.
                  </p>
                  <Link
                    href={shopHref}
                    className="page-drawer-section-action series-empty-create"
                    scroll={false}
                  >
                    Shop this creator
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
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
