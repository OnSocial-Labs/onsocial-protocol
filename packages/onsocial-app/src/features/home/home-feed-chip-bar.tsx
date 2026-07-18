'use client';

import { useEffect, useRef } from 'react';
import { MultiplyIcon, PlusIcon } from '@onsocial/ui';
import {
  homeFeedLensLabel,
  type HomeFeedLens,
} from '@/features/home/home-feed-lens';
import {
  homeFeedFocusKey,
  homeFeedFocusQueryValue,
  type HomeFeedFocus,
} from '@/features/home/home-feed-focus';
import {
  HOME_FEED_SORTS,
  homeFeedSortLabel,
  type HomeFeedSort,
} from '@/features/home/home-feed-sort';
import {
  homeSavedFeedFocus,
  homeSavedFeedLabel,
  type HomeSavedFeed,
} from '@/features/home/home-saved-feeds';

export function HomeFeedChipBar({
  lens,
  onLensChange,
  sort,
  onSortChange,
  standingAvailable,
  savedFeeds,
  activeFocus,
  onSelectSavedFeed,
  onRemoveSavedFeed,
  onClearFocus,
  onNewFeed,
}: {
  lens: HomeFeedLens;
  onLensChange: (lens: HomeFeedLens) => void;
  sort: HomeFeedSort;
  onSortChange: (sort: HomeFeedSort) => void;
  standingAvailable: boolean;
  savedFeeds: HomeSavedFeed[];
  activeFocus: HomeFeedFocus | null;
  onSelectSavedFeed: (feed: HomeSavedFeed) => void;
  onRemoveSavedFeed: (id: string) => void;
  onClearFocus: () => void;
  onNewFeed: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeChipRef = useRef<HTMLElement | null>(null);
  const activeFocusKey = homeFeedFocusKey(activeFocus);
  const activeSaved = savedFeeds.find(
    (feed) => homeFeedFocusKey(homeSavedFeedFocus(feed)) === activeFocusKey
  );
  const showEphemeralFocus = Boolean(activeFocus && !activeSaved);
  const lenses: HomeFeedLens[] = standingAvailable
    ? ['standing', 'global']
    : ['global'];

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
  }, [activeFocusKey, lens, savedFeeds.length, sort]);

  return (
    <div
      className="discover-tab-bar home-feed-chip-bar discover-tab-bar--header"
      role="tablist"
      aria-label="Feed"
    >
      <div className="discover-tab-bar-scroller" ref={scrollerRef}>
        {lenses.map((option) => {
          const selected = !activeFocus && option === lens;
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? 'is-active' : undefined}
              ref={
                selected
                  ? (node) => {
                      activeChipRef.current = node;
                    }
                  : undefined
              }
              onClick={() => onLensChange(option)}
            >
              {homeFeedLensLabel(option)}
            </button>
          );
        })}

        {!activeFocus
          ? HOME_FEED_SORTS.map((option) => {
              const selected = option === sort;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={selected ? 'is-active' : undefined}
                  onClick={() => onSortChange(option)}
                >
                  {homeFeedSortLabel(option)}
                </button>
              );
            })
          : null}

        {savedFeeds.map((feed) => {
          const selected = activeSaved?.id === feed.id;
          const label = homeSavedFeedLabel(feed);

          if (!selected) {
            return (
              <button
                key={feed.id}
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => onSelectSavedFeed(feed)}
              >
                {label}
              </button>
            );
          }

          return (
            <span
              key={feed.id}
              ref={(node) => {
                activeChipRef.current = node;
              }}
              className="home-feed-chip-cluster is-active"
            >
              <button
                type="button"
                role="tab"
                aria-selected
                className="is-active"
                onClick={() => onSelectSavedFeed(feed)}
              >
                {label}
              </button>
              <button
                type="button"
                className="home-feed-chip-remove"
                aria-label={`Remove ${label}`}
                onClick={() => onRemoveSavedFeed(feed.id)}
              >
                <MultiplyIcon
                  aria-hidden
                  className="home-feed-chip-remove-icon"
                />
              </button>
            </span>
          );
        })}

        {showEphemeralFocus && activeFocus ? (
          <span
            ref={(node) => {
              activeChipRef.current = node;
            }}
            className="home-feed-chip-cluster is-active"
          >
            <button
              type="button"
              role="tab"
              aria-selected
              className="is-active"
            >
              {homeFeedFocusQueryValue(activeFocus)}
            </button>
            <button
              type="button"
              className="home-feed-chip-remove"
              aria-label="Clear feed focus"
              onClick={onClearFocus}
            >
              <MultiplyIcon
                aria-hidden
                className="home-feed-chip-remove-icon"
              />
            </button>
          </span>
        ) : null}

        <button
          type="button"
          className="home-feed-chip-add"
          aria-label="Add feed"
          onClick={onNewFeed}
        >
          <PlusIcon aria-hidden className="home-feed-chip-add-icon" />
        </button>
      </div>
    </div>
  );
}
