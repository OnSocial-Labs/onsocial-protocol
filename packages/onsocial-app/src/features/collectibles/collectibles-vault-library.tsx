'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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

const DOCKED_STRIP_CLASS = 'is-docked';
const ACCOUNT_STRIP_SELECTOR =
  'h2.collectibles-library-heading, button.collectibles-library-heading';

/**
 * Keep the docked account strip sharp on the page's one-pane glass sheet
 * (`.collectibles-chrome-glass`). `position: sticky` exposes no stuck state,
 * so measure each account heading against the scroller's content-box top
 * (its clamp line, including the search-tuck offset via the heading's
 * computed `top`):
 * - `is-docked` toggles only while clamped at the line — strips sliding out
 *   above it stay under the glass so they blur away with the rows.
 * - `--collectibles-strip-cover` (on the page root) grows the glass sheet
 *   down to the docked strip's bottom so rail + strip frost read as one.
 */
function useDockedAccountStrip(
  stackRef: RefObject<HTMLDivElement | null>,
  disabled: boolean,
  groups: readonly CollectiblesLibraryCreatorGroup[],
  selectedCreator: string | null
) {
  useEffect(() => {
    const stack = stackRef.current;
    if (disabled || !stack) return;
    const scroller = stack.closest<HTMLElement>('.os-app-screen-body');
    const page = stack.closest<HTMLElement>('.collectibles-page');
    if (!scroller) return;
    const header = stack
      .closest('.os-app-screen')
      ?.querySelector('.os-app-screen-header');

    let raf = 0;
    let settleTimer: number | null = null;
    const measure = () => {
      raf = 0;
      const clipLine =
        scroller.getBoundingClientRect().top +
        (parseFloat(getComputedStyle(scroller).paddingTop) || 0);
      let stripCover = 0;
      stack
        .querySelectorAll<HTMLElement>(ACCOUNT_STRIP_SELECTOR)
        .forEach((heading) => {
          const stickTop = parseFloat(getComputedStyle(heading).top) || 0;
          const rect = heading.getBoundingClientRect();
          const docked = Math.abs(rect.top - (clipLine + stickTop)) <= 2;
          heading.classList.toggle(DOCKED_STRIP_CLASS, docked);
          if (docked) {
            stripCover = Math.max(stripCover, rect.bottom - clipLine);
          }
        });
      page?.style.setProperty(
        '--collectibles-strip-cover',
        `${stripCover.toFixed(2)}px`
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    // The stick offset animates (top transition) after a tuck toggle —
    // re-measure once it settles so the sheet height tracks the strip.
    const scheduleWithSettle = () => {
      schedule();
      if (settleTimer != null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(schedule, 250);
    };

    schedule();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(scroller);
    // Search tuck / pin flips header classes (and the stick offset) without
    // necessarily scrolling — re-measure on chrome class changes too.
    const chromeObserver = new MutationObserver(scheduleWithSettle);
    if (header) {
      chromeObserver.observe(header, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (settleTimer != null) window.clearTimeout(settleTimer);
      scroller.removeEventListener('scroll', schedule);
      resizeObserver.disconnect();
      chromeObserver.disconnect();
      page?.style.removeProperty('--collectibles-strip-cover');
    };
  }, [stackRef, disabled, groups, selectedCreator]);
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
  const stackRef = useRef<HTMLDivElement | null>(null);
  useDockedAccountStrip(stackRef, embedded, groups, selectedCreator);
  const stack = (
      <div
        ref={stackRef}
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
