'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { DiscoverFaceFilter } from '@onsocial/sdk';
import type { DiscoverTab } from '@/features/discover/discover-tabs';
import { discoverEmptyLine } from '@/lib/discover-empty-state';
import { formatDiscoverTabCount } from '@/lib/discover-tab-lead';
import { embeddedTaxonomyKey } from '@/lib/profile-taxonomy-label';
import { useCraftLabel, useIndustryLabel } from '@/lib/use-profile-taxonomy';

export function useDiscoverFaceLabel(): (id: DiscoverFaceFilter) => string {
  const t = useTranslations('shell');
  return useCallback(
    (id: DiscoverFaceFilter) => {
      switch (id) {
        case 'all':
          return t('topics.all');
        case 'people':
          return t('discover.people');
        case 'orgs':
          return t('discover.orgs');
        case 'daos':
          return t('apps.daos');
        case 'offers':
          return t('discover.offers');
        case 'hiring':
          return t('discover.hiring');
      }
    },
    [t]
  );
}

/** Same sentences as `discoverProfilesLead`. Known industry and craft names translate. */
export function useDiscoverProfilesLead(
  discoverableTotal: number | null | undefined,
  face: DiscoverFaceFilter = 'all',
  industry = '',
  craft = ''
): string {
  const t = useTranslations('shell');
  const industryName = useIndustryLabel();
  const craftName = useCraftLabel();
  const sector = industry.trim() ? industryName(industry.trim()) : '';
  const craftLabel = craft.trim() ? craftName(craft.trim()) : '';
  if (craftLabel) return t('discover.peopleIn', { name: craftLabel });
  if (face === 'offers') return t('discover.offers');
  if (face === 'hiring') {
    return sector
      ? t('discover.hiringIn', { name: sector })
      : t('discover.hiring');
  }
  if (face === 'orgs') {
    return sector ? t('discover.orgsIn', { name: sector }) : t('discover.orgs');
  }
  if (face === 'daos') {
    return sector ? t('discover.daosIn', { name: sector }) : t('apps.daos');
  }
  if (face === 'people') return t('discover.people');
  if (sector) return t('discover.profilesIn', { name: sector });
  if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
    if (discoverableTotal === 1) return t('discover.profileCountOne');
    return t('discover.profileCount', {
      count: formatDiscoverTabCount(discoverableTotal),
    });
  }
  return t('discover.profiles');
}

/** Same sentences as `discoverDaosLead`. */
export function useDiscoverDaosLead(total: number, syncing: boolean): string {
  const t = useTranslations('shell');
  if (syncing && total === 0) return t('discover.findingDaos');
  if (total > 0) {
    return t('discover.daoCount', { count: total.toLocaleString() });
  }
  return t('discover.nearDaos');
}

export function useDiscoverTopicsLead(filterPrefix: string): string {
  const t = useTranslations('shell');
  const prefix = filterPrefix.trim();
  if (prefix) return t('discover.topicsIn', { tag: prefix });
  return t('discover.trendingTopics');
}

export function useDiscoverEmptyLine(message: string | undefined): string {
  const t = useTranslations('shell');
  if (!message) return '';
  const mapped = discoverEmptyLine(message);
  if (!mapped) return message;
  if (!mapped.values?.name) return t(mapped.key);
  const nameKey = embeddedTaxonomyKey(mapped.key, mapped.values.name);
  const name = nameKey ? t(nameKey) : mapped.values.name;
  return t(mapped.key, { name });
}

/** Idle placeholder stays Search. Focus names the tab. Stored queries stay as typed. */
export function useDiscoverSearchCopy(
  tab: DiscoverTab,
  face: DiscoverFaceFilter,
  focused: boolean
): { placeholder: string; ariaLabel: string; clearAriaLabel: string } {
  const t = useTranslations('shell');
  let hint: string;
  let ariaLabel: string;
  if (tab === 'profiles' && face === 'offers') {
    hint = t('discover.offerTitle');
    ariaLabel = t('discover.searchOffers');
  } else if (tab === 'profiles' && face === 'hiring') {
    hint = t('discover.roleTitle');
    ariaLabel = t('discover.searchRoles');
  } else if (tab === 'daos') {
    hint = t('apps.daos');
    ariaLabel = t('discover.searchDaos');
  } else if (tab === 'guilds') {
    hint = t('apps.groups');
    ariaLabel = t('discover.findGuilds');
  } else if (tab === 'hubs') {
    hint = t('apps.hubs');
    ariaLabel = t('discover.searchHubs');
  } else if (tab === 'trending') {
    hint = t('discover.searchHintMoving');
    ariaLabel = t('discover.searchAriaMoving');
  } else {
    hint = t('discover.searchHintRest');
    ariaLabel = t('discover.searchAriaRest');
  }
  return {
    placeholder: focused ? hint : t('discover.search'),
    ariaLabel,
    clearAriaLabel: t('discover.clearSearch'),
  };
}

export function useDiscoverTickersLead(filterPrefix: string): string {
  const t = useTranslations('shell');
  const prefix = filterPrefix.trim();
  if (prefix) {
    return t('discover.tickersIn', { ticker: prefix.toUpperCase() });
  }
  return t('discover.trendingTickers');
}
