'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  OsIconAction,
  SettingsIcon,
  ShopFillIcon,
  StandingIdentity,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import type { CollectionView } from '@/features/scarces/collections-data';
import { groupSeriesDrops } from '@/features/scarces/series-catalog';
import { SeriesEditSheet } from '@/features/scarces/series-edit-sheet';
import {
  fetchSeriesBrandingCached,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import { StoreDropCard } from '@/features/scarces/store-catalog';
import { accountIdsEqual } from '@/lib/account-match';
import { marketCreatorPath } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

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
  const groups = useMemo(() => groupSeriesDrops(drops, nowMs), [drops, nowMs]);
  const showSectionLabels = groups.length > 1;

  return (
    <OsAppScreen
      title={title}
      subtitle={dropCountLabel}
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
      <div className="series-page">
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

          <Link
            href={portfolioPath(creatorId)}
            className="series-hero-creator standing-row"
            scroll={false}
            aria-label={`View ${creatorDisplayName?.trim() || fallbackLabel(creatorId)}'s profile`}
          >
            <StandingIdentity
              accountId={creatorId}
              profileName={creatorDisplayName}
              avatarUrl={creatorAvatarUrl}
              size="md"
              copyLeading={
                <span className="series-hero-creator-role">Series by</span>
              }
            />
          </Link>

          {branding?.description ? (
            <p className="series-hero-description">{branding.description}</p>
          ) : null}
        </header>

        {drops.length > 0 ? (
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
        ) : (
          <div className="standing-panel-empty-block is-centered">
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">
                No drops in this series yet.
              </p>
              {isOwner ? (
                <p className="standing-panel-empty-secondary">
                  Add this series when you create the next drop.
                </p>
              ) : null}
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
