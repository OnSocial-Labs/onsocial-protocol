'use client';

import { useEffect, useState } from 'react';
import { fetchPageConfigFromBrowserProxy } from '@/lib/read-page-config';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';

const moodCache = new Map<string, ResolvedMood>();

/** Drop a cached page mood after the owner changes their page config. */
export function invalidatePageOwnerMoodCache(accountId?: string) {
  if (accountId) {
    moodCache.delete(accountId);
    return;
  }
  moodCache.clear();
}

/**
 * Resolve a page owner's committed mood (for Support / Amplify signal chrome).
 * Cached in memory; pass `enabled` false while the sheet is closed.
 */
export function usePageOwnerMood(
  accountId: string | null | undefined,
  enabled: boolean
): ResolvedMood | null {
  const id = accountId?.trim() || '';
  const [mood, setMood] = useState<ResolvedMood | null>(() =>
    id ? (moodCache.get(id) ?? null) : null
  );

  useEffect(() => {
    if (!enabled || !id) {
      return;
    }

    const cached = moodCache.get(id);
    if (cached) {
      queueMicrotask(() => setMood(cached));
      return;
    }

    let cancelled = false;
    void fetchPageConfigFromBrowserProxy(id)
      .then((config) => {
        const resolved = resolvePortfolioMood(config);
        moodCache.set(id, resolved);
        if (!cancelled) setMood(resolved);
      })
      .catch(() => {
        const fallback = resolvePortfolioMood({});
        moodCache.set(id, fallback);
        if (!cancelled) setMood(fallback);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, id]);

  if (!enabled || !id) return null;
  return mood ?? moodCache.get(id) ?? null;
}
