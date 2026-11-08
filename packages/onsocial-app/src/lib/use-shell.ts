'use client';

import { useTranslations } from 'next-intl';
import { LAUNCHER_PEEK_DISPLAY_LIMIT } from '@/components/launcher-home/launcher-home-copy';
import type { EntityIdAvailability } from '@/hooks/use-entity-id-availability';
import { shellHomeFallbackKey } from '@/lib/shell-label';

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

export function useEntityIdLead(status: EntityIdAvailability): string {
  const t = useTranslations('shell');
  if (status === 'available') return t('account.available');
  if (status === 'taken') return t('account.taken');
  if (status === 'checking') return t('account.checking');
  return t('account.permanent');
}
