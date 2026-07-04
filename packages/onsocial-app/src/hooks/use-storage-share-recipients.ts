'use client';

import { useEffect, useMemo, useState } from 'react';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import {
  isNearAccountInputReady,
  normalizeNearAccountId,
} from '@/lib/app-near-account';

export type ShareRecipientRowStatus =
  | 'empty'
  | 'invalid'
  | 'self'
  | 'duplicate'
  | 'checking'
  | 'already_sponsored'
  | 'ready';

interface ShareRecipientsValidation {
  statuses: ShareRecipientRowStatus[];
  readyNormalizedIds: string[];
}

export function useStorageShareRecipientsValidation(
  rows: string[],
  viewerAccountId: string,
  enabled: boolean
): ShareRecipientsValidation {
  const normalizedRows = useMemo(
    () => rows.map((row) => normalizeNearAccountId(row)),
    [rows]
  );

  const staticStatuses = useMemo(
    () =>
      rows.map((row, index) => {
        if (!row.trim()) return 'empty' as const;
        if (!isNearAccountInputReady(row)) return 'invalid' as const;
        const normalized = normalizedRows[index]!;
        if (normalized === viewerAccountId) return 'self' as const;
        if (normalizedRows.filter((id) => id === normalized).length > 1) {
          return 'duplicate' as const;
        }
        return 'checking' as const;
      }),
    [normalizedRows, rows, viewerAccountId]
  );

  const [sponsoredIds, setSponsoredIds] = useState<Set<string>>(new Set());
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const idsToCheck = useMemo(
    () =>
      staticStatuses
        .map((status, index) =>
          status === 'checking' ? normalizedRows[index]! : null
        )
        .filter((id): id is string => Boolean(id)),
    [normalizedRows, staticStatuses]
  );
  const idsToCheckKey = idsToCheck.join('|');

  useEffect(() => {
    if (!enabled || idsToCheck.length === 0) return;

    let cancelled = false;
    const os = createAppOnSocialClient(viewerAccountId);

    void (async () => {
      const sponsored = new Set<string>();
      const checked = new Set<string>();

      await Promise.all(
        idsToCheck.map(async (accountId) => {
          try {
            const shared =
              await os.storageAccount.sponsorshipReceived(accountId);
            checked.add(accountId);
            if (shared) sponsored.add(accountId);
          } catch {
            checked.add(accountId);
          }
        })
      );

      if (!cancelled) {
        setSponsoredIds(sponsored);
        setCheckedIds(checked);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, idsToCheck, idsToCheckKey, viewerAccountId]);

  const statuses = useMemo(
    () =>
      staticStatuses.map((status, index) => {
        if (status !== 'checking') return status;
        const normalized = normalizedRows[index]!;
        if (!checkedIds.has(normalized)) return 'checking';
        if (sponsoredIds.has(normalized)) return 'already_sponsored';
        return 'ready';
      }),
    [checkedIds, normalizedRows, sponsoredIds, staticStatuses]
  );

  const readyNormalizedIds = useMemo(
    () =>
      statuses
        .map((status, index) =>
          status === 'ready' ? normalizedRows[index]! : null
        )
        .filter((id): id is string => Boolean(id)),
    [normalizedRows, statuses]
  );

  return { statuses, readyNormalizedIds };
}
