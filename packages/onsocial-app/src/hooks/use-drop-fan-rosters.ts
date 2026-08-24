'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchDropFanRostersByCollectionIds,
  type DropFanRoster,
} from '@/features/drops/drops-data';

/** Soft-fill loved fan counts + facepile ids after paint (Drops + portfolio drawer). */
export function useDropFanRosters(collectionIds: string[]): Map<string, DropFanRoster> {
  const rosterKey = useMemo(
    () => [...new Set(collectionIds.map((id) => id.trim()).filter(Boolean))].sort().join('\0'),
    [collectionIds]
  );
  const [rosters, setRosters] = useState<Map<string, DropFanRoster>>(new Map());

  useEffect(() => {
    if (!rosterKey) return;
    let cancelled = false;
    void fetchDropFanRostersByCollectionIds(rosterKey.split('\0')).then((map) => {
      if (!cancelled) setRosters(map);
    });
    return () => {
      cancelled = true;
    };
  }, [rosterKey]);

  return rosters;
}

export function mergeDropFanRoster<T extends { collectionId: string }>(
  item: T,
  roster: DropFanRoster | undefined
): T & { fanCount?: number; fanIds?: string[] } {
  if (!roster) return item;
  return {
    ...item,
    fanCount: roster.fanCount,
    ...(roster.fanIds.length > 0 ? { fanIds: roster.fanIds } : {}),
  };
}
