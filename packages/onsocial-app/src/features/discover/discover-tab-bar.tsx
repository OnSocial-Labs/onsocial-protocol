'use client';

import { OsChipRail } from '@/components/os/os-chip-rail';
import {
  DISCOVER_TABS,
  discoverTabLabel,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';

export function DiscoverTabBar({
  tab,
  onTabChange,
  className,
}: {
  tab: DiscoverTab;
  onTabChange: (tab: DiscoverTab) => void;
  className?: string;
}) {
  return (
    <OsChipRail
      ariaLabel="Discover"
      className={className}
      value={tab}
      onValueChange={onTabChange}
      tabIdFor={(option) => `discover-tab-${option}`}
      ariaControls={(option) => `discover-panel-${option}`}
      items={DISCOVER_TABS.map((option) => ({
        id: option,
        label: discoverTabLabel(option),
      }))}
    />
  );
}
