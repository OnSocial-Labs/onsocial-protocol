'use client';

import { useEffect, useMemo, useRef } from 'react';
import { PlusIcon } from '@onsocial/ui';
import { OsChipRail, type OsChipRailItem } from '@/components/os/os-chip-rail';
import {
  homeFeedLensLabel,
  homeFeedVisibleLenses,
  type HomeFeedLens,
} from '@/features/home/home-feed-lens';
import {
  homeFeedFocusKey,
  homeFeedFocusQueryValue,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';
import {
  homeSavedFeedFocus,
  homeSavedFeedLabel,
  type HomeSavedFeed,
} from '@/features/home/home-saved-feeds';

type HomeFeedChipId = `lens:${HomeFeedLens}` | `saved:${string}` | 'focus';

export function HomeFeedChipBar({
  lens,
  onLensChange,
  standingAvailable,
  savedFeeds,
  activeFocus,
  onSelectSavedFeed,
  onRemoveSavedFeed,
  onClearFocus,
  onNewFeed,
  className,
}: {
  lens: HomeFeedLens;
  onLensChange: (lens: HomeFeedLens) => void;
  standingAvailable: boolean;
  savedFeeds: HomeSavedFeed[];
  activeFocus: HomeFeedFocus | null;
  onSelectSavedFeed: (feed: HomeSavedFeed) => void;
  onRemoveSavedFeed: (id: string) => void;
  onClearFocus: () => void;
  onNewFeed: () => void;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLElement | null>(null);
  const activeFocusKey = homeFeedFocusKey(activeFocus);
  const activeSaved = savedFeeds.find(
    (feed) => homeFeedFocusKey(homeSavedFeedFocus(feed)) === activeFocusKey
  );
  const showEphemeralFocus = Boolean(activeFocus && !activeSaved);
  const lenses = homeFeedVisibleLenses(standingAvailable);

  const items = useMemo<OsChipRailItem<HomeFeedChipId>[]>(() => {
    const next: OsChipRailItem<HomeFeedChipId>[] = lenses.map((option) => ({
      id: `lens:${option}`,
      label: homeFeedLensLabel(option),
    }));

    for (const feed of savedFeeds) {
      const label = homeSavedFeedLabel(feed);
      next.push({
        id: `saved:${feed.id}`,
        label,
        onRemove: () => onRemoveSavedFeed(feed.id),
        removeAriaLabel: `Remove ${label}`,
      });
    }

    if (showEphemeralFocus && activeFocus) {
      next.push({
        id: 'focus',
        label: homeFeedFocusQueryValue(activeFocus),
        onRemove: onClearFocus,
        removeAriaLabel: 'Clear feed focus',
      });
    }

    return next;
  }, [
    activeFocus,
    lenses,
    onClearFocus,
    onRemoveSavedFeed,
    savedFeeds,
    showEphemeralFocus,
  ]);

  const value: HomeFeedChipId = activeSaved
    ? `saved:${activeSaved.id}`
    : showEphemeralFocus
      ? 'focus'
      : `lens:${lens}`;

  useEffect(() => {
    const chip = activeChipRef.current;
    const scroller = scrollerRef.current;
    if (!chip || !scroller) return;
    const chipLeft = chip.offsetLeft;
    const chipRight = chipLeft + chip.offsetWidth;
    const viewLeft = scroller.scrollLeft;
    const viewRight = viewLeft + scroller.clientWidth;
    if (chipLeft < viewLeft + 8 || chipRight > viewRight - 8) {
      chip.scrollIntoView({
        behavior: 'smooth',
        inline: 'nearest',
        block: 'nearest',
      });
    }
  }, [activeFocusKey, lens, savedFeeds.length]);

  return (
    <OsChipRail
      ariaLabel="Feed"
      className={['discover-tab-bar--header', className]
        .filter(Boolean)
        .join(' ')}
      scrollerRef={scrollerRef}
      selectedRef={activeChipRef}
      value={value}
      onValueChange={(id) => {
        if (id === 'focus') return;
        if (id.startsWith('lens:')) {
          onLensChange(id.slice('lens:'.length) as HomeFeedLens);
          return;
        }
        if (id.startsWith('saved:')) {
          const feed = savedFeeds.find(
            (entry) => entry.id === id.slice('saved:'.length)
          );
          if (feed) onSelectSavedFeed(feed);
        }
      }}
      items={items}
      trailing={
        <button
          type="button"
          className="discover-tab-bar-chip-add"
          aria-label="Add feed"
          onClick={onNewFeed}
        >
          <PlusIcon aria-hidden className="discover-tab-bar-chip-add-icon" />
        </button>
      }
    />
  );
}
