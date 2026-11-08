'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { DiscoverFaceFilter } from '@onsocial/sdk';
import { formatDiscoverTabCount } from '@/lib/discover-tab-lead';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';

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

/** Same sentences as `discoverProfilesLead`. Craft and industry names stay as stored. */
export function useDiscoverProfilesLead(
  discoverableTotal: number | null | undefined,
  face: DiscoverFaceFilter = 'all',
  industry = '',
  craft = ''
): string {
  const t = useTranslations('shell');
  const sector = industry.trim();
  const craftLabel = craft.trim()
    ? profileIdentityTopicLabel(craft.trim())
    : '';
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

export function useDiscoverTickersLead(filterPrefix: string): string {
  const t = useTranslations('shell');
  const prefix = filterPrefix.trim();
  if (prefix) {
    return t('discover.tickersIn', { ticker: prefix.toUpperCase() });
  }
  return t('discover.trendingTickers');
}
