'use client';

import { useTranslations } from 'next-intl';
import { LAUNCHER_PEEK_DISPLAY_LIMIT } from '@/components/launcher-home/launcher-home-copy';
import type { EntityIdAvailability } from '@/hooks/use-entity-id-availability';

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

export function useEntityIdLead(status: EntityIdAvailability): string {
  const t = useTranslations('shell');
  if (status === 'available') return t('account.available');
  if (status === 'taken') return t('account.taken');
  if (status === 'checking') return t('account.checking');
  return t('account.permanent');
}
