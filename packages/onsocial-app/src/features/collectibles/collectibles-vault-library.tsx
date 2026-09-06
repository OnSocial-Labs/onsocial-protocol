'use client';

import type { ReactNode } from 'react';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import { fallbackLabel } from '@/lib/profile-display';
import type { CollectiblesLibraryCreatorGroup } from '@/lib/portfolio-holdings';

function headingDomId(prefix: string, key: string): string {
  return `collectibles-${prefix}-${key.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
}

function CreatorHeading({
  creatorId,
  headingId,
  filterable,
  onSelect,
}: {
  creatorId: string | null;
  headingId: string;
  filterable: boolean;
  onSelect?: () => void;
}) {
  const label = creatorId ? `@${fallbackLabel(creatorId)}` : 'Other';
  if (filterable && onSelect) {
    return (
      <button
        type="button"
        id={headingId}
        className="collectibles-library-heading collectibles-library-heading--action"
        onClick={onSelect}
      >
        {label}
      </button>
    );
  }
  return (
    <h2 id={headingId} className="collectibles-library-heading">
      {label}
    </h2>
  );
}

function SeriesHeading({
  title,
  headingId,
  filterable,
  onSelect,
}: {
  title: string;
  headingId: string;
  filterable: boolean;
  onSelect?: () => void;
}) {
  if (filterable && onSelect) {
    return (
      <button
        type="button"
        id={headingId}
        className="collectibles-library-series-heading collectibles-library-heading--action"
        onClick={onSelect}
      >
        {title}
      </button>
    );
  }
  return (
    <h3 id={headingId} className="collectibles-library-series-heading">
      {title}
    </h3>
  );
}

/** Creator → series → use-first drop rows. */
export function CollectiblesVaultLibrary({
  groups,
  ownedByToken,
  showCreatorHeadings,
  renderOwnerMenu,
  onSelectCreator,
  onSelectSeries,
  embedded = false,
}: {
  groups: CollectiblesLibraryCreatorGroup[];
  ownedByToken: Map<string, OwnedScarceItem>;
  showCreatorHeadings: boolean;
  renderOwnerMenu?: (owned: OwnedScarceItem) => ReactNode;
  onSelectCreator?: (creatorKey: string) => void;
  onSelectSeries?: (seriesKey: string) => void;
  /** Drawer preview — keep the parent Collectibles heading. */
  embedded?: boolean;
}) {
  const stack = (
      <div
        id={embedded ? undefined : 'collectibles-results'}
        className="collectibles-library-stack"
      >
        {groups.map((creator) => {
          const creatorHeadingId = headingDomId('from', creator.creatorKey);
          return (
            <section
              key={creator.creatorKey}
              className="collectibles-library-creator"
              aria-labelledby={
                showCreatorHeadings ? creatorHeadingId : undefined
              }
            >
              {showCreatorHeadings ? (
                <CreatorHeading
                  creatorId={creator.creatorId}
                  headingId={creatorHeadingId}
                  filterable={Boolean(onSelectCreator)}
                  onSelect={
                    onSelectCreator
                      ? () => onSelectCreator(creator.creatorKey)
                      : undefined
                  }
                />
              ) : null}
              {creator.series.map((series) => {
                const seriesHeadingId = series.seriesKey
                  ? headingDomId(
                      'series',
                      `${creator.creatorKey}-${series.seriesKey}`
                    )
                  : undefined;
                return (
                  <div
                    key={series.seriesKey ?? `open:${creator.creatorKey}`}
                    className="collectibles-library-series"
                  >
                    {series.seriesTitle && seriesHeadingId ? (
                      <SeriesHeading
                        title={series.seriesTitle}
                        headingId={seriesHeadingId}
                        filterable={Boolean(onSelectSeries)}
                        onSelect={
                          onSelectSeries && series.seriesKey
                            ? () => onSelectSeries(series.seriesKey!)
                            : undefined
                        }
                      />
                    ) : null}
                    <div className="market-listing-list" role="list">
                      {series.drops.map((item) => {
                        const owned = ownedByToken.get(item.tokenId);
                        return (
                          <CollectiblesHoldingRow
                            key={item.tokenId}
                            item={item}
                            editionCount={item.editionCount}
                            hideCreator={showCreatorHeadings}
                            ownerMenu={
                              owned && renderOwnerMenu
                                ? renderOwnerMenu(owned)
                                : null
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
  );

  if (embedded) {
    return <div className="collectibles-library">{stack}</div>;
  }

  return (
    <section
      className="market-section collectibles-library"
      aria-label="Collectibles"
    >
      {stack}
    </section>
  );
}
