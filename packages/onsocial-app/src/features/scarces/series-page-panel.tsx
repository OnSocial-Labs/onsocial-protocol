'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import type { CollectionView } from '@/features/scarces/collections-data';
import { SeriesEditSheet } from '@/features/scarces/series-edit-sheet';
import {
  fetchSeriesBrandingCached,
  type SeriesBranding,
} from '@/features/scarces/series-data';
import { StoreDropCard } from '@/features/scarces/store-catalog';
import { accountIdsEqual } from '@/lib/account-match';
import { APP_MARKET_PATH } from '@/lib/app-routes';
import { portfolioPath } from '@/lib/overlay-routes';
import { fallbackLabel } from '@/lib/profile-display';

interface SeriesPagePanelProps {
  creatorId: string;
  seriesId: string;
  initialBranding: SeriesBranding | null;
  /** Creator profile avatar — logo fallback for unbranded series (SSR). */
  creatorAvatarUrl: string | null;
  /** The creator's drops in this series, newest first (SSR). */
  drops: CollectionView[];
}

/** Public series page — creator brand header plus the drops it groups. */
export function SeriesPagePanel({
  creatorId,
  seriesId,
  initialBranding,
  creatorAvatarUrl,
  drops,
}: SeriesPagePanelProps) {
  const { accountId } = useAppWallet();
  const [branding, setBranding] = useState(initialBranding);
  const [editing, setEditing] = useState(false);

  // Brand lives on chain (`social.getOne`); soft-fill after indexer drops paint.
  useEffect(() => {
    let cancelled = false;
    void fetchSeriesBrandingCached(creatorId, seriesId).then((next) => {
      if (!cancelled && next) setBranding(next);
    });
    return () => {
      cancelled = true;
    };
  }, [creatorId, seriesId]);

  const isOwner = accountId != null && accountIdsEqual(accountId, creatorId);
  const fallbackTitle = drops.find((drop) => drop.seriesTitle)?.seriesTitle;
  const title = branding?.title ?? fallbackTitle ?? seriesId;
  // Unbranded series inherit the creator's identity instead of a bare letter.
  const logoUrl = branding?.logoUrl ?? creatorAvatarUrl;

  return (
    <OsAppScreen title={title} backFallbackHref={APP_MARKET_PATH}>
      <div className="series-page">
        <header className="series-hero">
          <span className={`series-hero-logo${logoUrl ? ' has-media' : ''}`}>
            {logoUrl ? (
              <img src={logoUrl} alt="" />
            ) : (
              <span aria-hidden>{title.slice(0, 1).toUpperCase()}</span>
            )}
          </span>
          <div className="series-hero-copy">
            <h2 className="series-hero-title">{title}</h2>
            <p className="series-hero-meta">
              Series by{' '}
              <Link href={portfolioPath(creatorId)} scroll={false}>
                @{fallbackLabel(creatorId)}
              </Link>{' '}
              · {drops.length} {drops.length === 1 ? 'drop' : 'drops'}
            </p>
            {branding?.description ? (
              <p className="series-hero-description">{branding.description}</p>
            ) : null}
          </div>
          {isOwner ? (
            <button
              type="button"
              className="os-surface-chip series-hero-edit"
              onClick={() => setEditing(true)}
            >
              Edit series
            </button>
          ) : null}
        </header>

        {drops.length > 0 ? (
          <ul className="app-drop-list">
            {drops.map((drop) => (
              <li key={drop.collectionId}>
                <StoreDropCard view={drop} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="standing-panel-empty-block is-centered">
            <div className="standing-panel-empty-state">
              <p className="standing-panel-empty-primary">
                No drops in this series yet.
              </p>
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
