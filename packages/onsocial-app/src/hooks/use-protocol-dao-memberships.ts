'use client';

import { useEffect, useState } from 'react';
import { fetchDaoRolesClient } from '@/lib/fetch-dao-roles-client';
import {
  EMPTY_PROTOCOL_DAO_MEMBERSHIPS,
  type ProtocolDaoMemberships,
} from '@/lib/protocol-dao-memberships';

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * Soft-fill protocol Governance / Treasury membership for person faces & lists.
 * Never blocks paint. Shares `/api/profile/dao-roles` cache with Joined facts.
 */
export function useProtocolDaoMemberships(
  accountId: string,
  enabled: boolean
): ProtocolDaoMemberships | null {
  const normalized = accountId.trim().toLowerCase();
  const [memberships, setMemberships] = useState<ProtocolDaoMemberships | null>(
    null
  );
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !normalized) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const data = await fetchDaoRolesClient(accountId, controller.signal);
        if (cancelled) return;
        setMemberships(data.memberships);
        setResolvedKey(normalized);
      } catch (error) {
        // Abort = unmount / account change — keep unresolved so we retry.
        if (cancelled || isAbortError(error)) return;
        setMemberships(EMPTY_PROTOCOL_DAO_MEMBERSHIPS);
        setResolvedKey(normalized);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountId, enabled, normalized]);

  if (!enabled || !normalized || resolvedKey !== normalized) {
    return null;
  }
  return memberships;
}
