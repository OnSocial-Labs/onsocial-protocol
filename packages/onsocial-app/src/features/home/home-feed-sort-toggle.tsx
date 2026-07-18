'use client';

import {
  FireBFillIcon,
  FireBIcon,
  TimeFillIcon,
  TimeIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import {
  HOME_FEED_SORTS,
  homeFeedSortLabel,
  type HomeFeedSort,
} from '@/features/home/home-feed-sort';

export function HomeFeedSortToggle({
  sort,
  onSortChange,
}: {
  sort: HomeFeedSort;
  onSortChange: (sort: HomeFeedSort) => void;
}) {
  return (
    <div
      className="home-feed-sort-toggle"
      role="group"
      aria-label="Feed sort"
    >
      {HOME_FEED_SORTS.map((option) => {
        const selected = option === sort;
        const label = homeFeedSortLabel(option);
        return (
          <button
            key={option}
            type="button"
            className={`${osIconActionClassName} home-feed-sort-btn home-feed-sort-btn--${option}${selected ? ' is-active' : ''}`}
            aria-label={label}
            aria-pressed={selected}
            title={label}
            onClick={() => onSortChange(option)}
          >
            {option === 'hot' ? (
              selected ? (
                <FireBFillIcon
                  aria-hidden
                  className="home-feed-sort-btn-icon"
                />
              ) : (
                <FireBIcon aria-hidden className="home-feed-sort-btn-icon" />
              )
            ) : selected ? (
              <TimeFillIcon aria-hidden className="home-feed-sort-btn-icon" />
            ) : (
              <TimeIcon aria-hidden className="home-feed-sort-btn-icon" />
            )}
          </button>
        );
      })}
    </div>
  );
}
