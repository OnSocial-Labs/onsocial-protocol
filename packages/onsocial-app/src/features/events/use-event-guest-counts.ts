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
): Record<string, string[]> {
  const key = collectionIds.join('\n');
  const [rosters, setRosters] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const ids = key ? key.split('\n') : [];
    if (ids.length === 0) return;
    let cancelled = false;

    const loadCounts = async () => {
      const next: Record<string, string[]> = {};
      await mapPool(ids, 4, async (id) => {
        try {
          next[id] = await load(id);
        } catch {
          // Leave the previous roster. A failed read is not zero guests.
        }
      });
      if (cancelled) return;
      setRosters((prev) => ({ ...prev, ...next }));
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

  return rosters;
}

/** Unique pass holders. Missing keys are still loading. */
export function useEventHolderRosters(
  collectionIds: string[]
): Record<string, string[]> {
  return useRosterCounts(collectionIds, loadEventHolderIds, 0);
}

/** Unique check-ins. `refreshMs` keeps On now live. */
export function useEventCheckInRosters(
  collectionIds: string[],
  refreshMs = 0
): Record<string, string[]> {
  return useRosterCounts(collectionIds, loadEventCheckInIds, refreshMs);
}
