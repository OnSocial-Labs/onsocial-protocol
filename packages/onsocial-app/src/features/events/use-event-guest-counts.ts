'use client';

import { useEffect, useState } from 'react';
import {
  loadEventCheckInIds,
  loadEventHolderIds,
} from '@/features/events/event-guests';

async function mapPool<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const current = items[index];
        index += 1;
        if (current === undefined) return;
        await run(current);
      }
    }
  );
  await Promise.all(workers);
}

function useRosterCounts(
  collectionIds: string[],
  load: (collectionId: string) => Promise<string[]>,
  refreshMs: number
): Record<string, number> {
  const key = collectionIds.join('\n');
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = key ? key.split('\n') : [];
    if (ids.length === 0) return;
    let cancelled = false;

    const loadCounts = async () => {
      const next: Record<string, number> = {};
      await mapPool(ids, 4, async (id) => {
        try {
          const guests = await load(id);
          next[id] = guests.length;
        } catch {
          // Leave the previous number. A failed read is not zero guests.
        }
      });
      if (cancelled) return;
      setCounts((prev) => ({ ...prev, ...next }));
    };

    void loadCounts();
    if (refreshMs <= 0) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => {
      void loadCounts();
    }, refreshMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key, load, refreshMs]);

  return counts;
}

/** Unique pass holders. Missing keys are still loading. */
export function useEventHolderCounts(
  collectionIds: string[]
): Record<string, number> {
  return useRosterCounts(collectionIds, loadEventHolderIds, 0);
}

/** Unique check-ins. `refreshMs` keeps On now live. */
export function useEventCheckInCounts(
  collectionIds: string[],
  refreshMs = 0
): Record<string, number> {
  return useRosterCounts(collectionIds, loadEventCheckInIds, refreshMs);
}
