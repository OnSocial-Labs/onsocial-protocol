'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { LAUNCHER_PEEK_DISPLAY_LIMIT } from '@/components/launcher-home/launcher-home-copy';
import type { EntityIdAvailability } from '@/hooks/use-entity-id-availability';
import {
  COMMUNITY_TOPIC_SUGGESTIONS,
  type CommunityTopicId,
} from '@/lib/community-topic-suggestions';
import { shellCreateError, shellHomeFallbackKey } from '@/lib/shell-label';

const COMMUNITY_TOPIC_IDS = new Set<string>(
  COMMUNITY_TOPIC_SUGGESTIONS.map((topic) => topic.id)
);

export function usePeekOverflowLabel(
  total: number,
  destination: 'home' | 'discover',
  limit = LAUNCHER_PEEK_DISPLAY_LIMIT
): string | null {
  const t = useTranslations('shell');
  const remaining = total - limit;
  if (remaining <= 0) return null;
  const place = destination === 'home' ? t('apps.home') : t('apps.discover');
  return t('peekOverflow', { count: remaining, place });
}

/** Translate a known launcher fallback. Other messages stay as stored. */
export function useShellHomeMessage(message: string): string {
  const t = useTranslations('shell');
  const key = shellHomeFallbackKey(message);
  return key ? t(key) : message;
}

/** Known suggestion ids use the catalog. Typed topics stay as written. */
export function useCommunityTopicLabel(): (id: string) => string {
  const t = useTranslations('shell');
  return useCallback(
    (id: string) =>
      COMMUNITY_TOPIC_IDS.has(id) ? t(`topics.${id as CommunityTopicId}`) : id,
    [t]
  );
}

/**
 * Discover filter chips. Known topics and All use the catalog.
 * A typed topic keeps the sentence-case label it already has.
 */
export function useDiscoverChipLabel(): (
  id: string,
  fallback: string
) => string {
  const t = useTranslations('shell');
  const topicName = useCommunityTopicLabel();
  return useCallback(
    (id: string, fallback: string) => {
      if (id === 'all') return t('topics.all');
      const named = topicName(id);
      return named === id ? fallback : named;
    },
    [t, topicName]
  );
}

/** Translate a known create-form error. Other messages stay as stored. */
export function useShellCreateError(message: string | null): string | null {
  const t = useTranslations('shell');
  if (!message) return null;
  const mapped = shellCreateError(message);
  if (!mapped) return message;
  return mapped.values ? t(mapped.key, mapped.values) : t(mapped.key);
}

export function useEntityIdLead(status: EntityIdAvailability): string {
  const t = useTranslations('shell');
  if (status === 'available') return t('account.available');
  if (status === 'taken') return t('account.taken');
  if (status === 'checking') return t('account.checking');
  return t('account.permanent');
}
