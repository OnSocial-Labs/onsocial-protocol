'use client';

import {
  DISCOVER_TABS,
  discoverTabLabel,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';

export function DiscoverTabBar({
  tab,
  onTabChange,
}: {
  tab: DiscoverTab;
  onTabChange: (tab: DiscoverTab) => void;
}) {
  return (
    <div className="discover-tab-bar" role="tablist" aria-label="Discover">
      {DISCOVER_TABS.map((option) => {
        const selected = option === tab;
        return (
          <button
            key={option}
            type="button"
            role="tab"
            id={`discover-tab-${option}`}
            aria-selected={selected}
            aria-controls={`discover-panel-${option}`}
            className={selected ? 'is-active' : undefined}
            onClick={() => onTabChange(option)}
          >
            {discoverTabLabel(option)}
          </button>
        );
      })}
    </div>
  );
}
