'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { CollectiblesHoldingRow } from '@/features/collectibles/collectibles-holding-row';
import {
  collectionCreatorNameLine,
  type CollectionCreatorFace,
} from '@/features/scarces/collection-creator-face';
import type { OwnedScarceItem } from '@/features/market/market-listings';
import { seriesDisplayTitle } from '@/features/scarces/series-page-view';
import { seriesPagePath } from '@/lib/app-routes';
import {
  COLLECTIBLES_LIBRARY_JUMP_MIN,
  collectiblesLibraryHeadingId,
  countLibraryCreatorDrops,
  type CollectiblesLibraryCreatorGroup,
} from '@/lib/portfolio-holdings';

export { collectiblesLibraryHeadingId };

function jumpToHeading(headingId: string) {
  document
    .getElementById(headingId)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function CreatorHeading({
  creatorId,
  headingId,
  dropCount,
  face,
  selected,
  filterable,
  onSelect,
}: {
  creatorId: string | null;
  headingId: string;
  dropCount: number;
  face?: CollectionCreatorFace | null;
  selected: boolean;
  filterable: boolean;
  onSelect?: () => void;
}) {
  const name = creatorId
    ? collectionCreatorNameLine(creatorId, face?.displayName)
    : 'Other';
  const accessibleName = `${name}, ${dropCount}`;
  const inner = (
    <>
      {creatorId ? (
        <AccountAvatar
          accountId={creatorId}
          src={face?.avatarUrl}
          fallbackInitial={name}
          size="sm"
          className="collectibles-library-heading-face"
        />
      ) : null}
      <span className="collectibles-library-heading-name">{name}</span>
      <span className="collectibles-library-heading-count">{dropCount}</span>
    </>
  );
  const className = [
    'collectibles-library-heading',
    filterable && onSelect ? 'collectibles-library-heading--action' : '',
    selected ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (filterable && onSelect) {
    return (
      <button
        type="button"
        id={headingId}
        className={className}
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={accessibleName}
      >
        {inner}
      </button>
    );
  }
  return (
    <h2 id={headingId} className={className}>
      {inner}
    </h2>
  );
}

function SeriesHeading({
  title,
  headingId,
  dropCount,
  href,
}: {
  title: string;
  headingId: string;
  dropCount: number;
  href?: string;
}) {
  const accessibleName = `${title}, ${dropCount}`;
  const inner = (
    <>
      <span className="collectibles-library-heading-name">{title}</span>
      <span className="collectibles-library-heading-count">{dropCount}</span>
    </>
  );
  const className = [
    'collectibles-library-series-heading',
    href ? 'collectibles-library-heading--action' : '',
  ]
    .filter(Boolean)
    .join(' ');
  if (href) {
    return (
      <Link
        id={headingId}
        href={href}
        scroll={false}
        className={className}
        aria-label={accessibleName}
      >
        {inner}
      </Link>
    );
  }
  return (
    <h3 id={headingId} className={className}>
      {inner}
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
  selectedCreator = null,
  creatorFaces,
  embedded = false,
  refreshing = false,
}: {
  groups: CollectiblesLibraryCreatorGroup[];
  ownedByToken: Map<string, OwnedScarceItem>;
  showCreatorHeadings: boolean;
  renderOwnerMenu?: (owned: OwnedScarceItem) => ReactNode;
  onSelectCreator?: (creatorKey: string) => void;
  selectedCreator?: string | null;
  creatorFaces?: ReadonlyMap<string, CollectionCreatorFace>;
  /** Drawer preview — keep the parent Collectibles heading. */
  embedded?: boolean;
  /** Keep painted rows visible while the vault revalidates in the background. */
  refreshing?: boolean;
}) {
  const showJump =
    !embedded && showCreatorHeadings && groups.length >= COLLECTIBLES_LIBRARY_JUMP_MIN;
  const stack = (
      <div
        id={embedded ? undefined : 'collectibles-results'}
        className="collectibles-library-stack"
      >
        {showJump ? (
          <nav className="collectibles-library-jump" aria-label="Jump to creator">
            <OsChipRail<string | null>
              selection="option"
              className="collectibles-library-jump-rail"
              ariaLabel="Jump to creator"
              value={null}
              onValueChange={(id) => {
                if (!id) return;
                jumpToHeading(collectiblesLibraryHeadingId('from', id));
              }}
              items={groups.map((creator) => {
                const face = creator.creatorId
                  ? creatorFaces?.get(creator.creatorId)
                  : undefined;
                const label = creator.creatorId
                  ? collectionCreatorNameLine(
                      creator.creatorId,
                      face?.displayName
                    )
                  : 'Other';
                return { id: creator.creatorKey, label };
              })}
            />
          </nav>
        ) : null}
        {groups.map((creator) => {
          const creatorHeadingId = collectiblesLibraryHeadingId(
            'from',
            creator.creatorKey
          );
          const face = creator.creatorId
            ? creatorFaces?.get(creator.creatorId)
            : undefined;
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
                  dropCount={countLibraryCreatorDrops(creator)}
                  face={face}
                  selected={selectedCreator === creator.creatorKey}
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
                  ? collectiblesLibraryHeadingId(
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
                        title={seriesDisplayTitle({
                          dropSeriesTitle: series.seriesTitle,
                          seriesId: series.seriesId ?? series.seriesKey ?? '',
                        })}
                        headingId={seriesHeadingId}
                        dropCount={series.drops.length}
                        href={
                          creator.creatorId && series.seriesId
                            ? seriesPagePath(
                                creator.creatorId,
                                series.seriesId
                              )
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
      className={`market-section collectibles-library${
        refreshing ? ' collectibles-library--refreshing' : ''
      }`}
      aria-label="Collectibles"
      aria-busy={refreshing || undefined}
    >
      {stack}
    </section>
  );
}
