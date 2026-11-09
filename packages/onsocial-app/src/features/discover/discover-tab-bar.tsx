'use client';

import { useTranslations } from 'next-intl';
import { OsChipRail } from '@/components/os/os-chip-rail';
import {
  DISCOVER_TABS,
  type DiscoverTab,
} from '@/features/discover/discover-tabs';

function discoverTabMessage(
  t: ReturnType<typeof useTranslations>,
  tab: DiscoverTab
): string {
  switch (tab) {
    case 'trending':
      return t('discover.moving');
    case 'profiles':
      return t('discover.profiles');
    case 'daos':
      return t('apps.daos');
    case 'guilds':
      return t('apps.groups');
    case 'hubs':
      return t('apps.hubs');
    case 'topics':
      return t('discover.topics');
    case 'tickers':
      return t('discover.tickers');
  }
}

export function DiscoverTabBar({
  tab,
  onTabChange,
  className,
}: {
  tab: DiscoverTab;
  onTabChange: (tab: DiscoverTab) => void;
  className?: string;
}) {
  const t = useTranslations('shell');
  return (
    <OsChipRail
      ariaLabel={t('apps.discover')}
      className={className}
      value={tab}
      onValueChange={onTabChange}
      tabIdFor={(option) => `discover-tab-${option}`}
      ariaControls={(option) => `discover-panel-${option}`}
      items={DISCOVER_TABS.map((option) => ({
        id: option,
        label: discoverTabMessage(t, option),
      }))}
    />
  );
}
