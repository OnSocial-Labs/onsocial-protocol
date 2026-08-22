'use client';

import { useEffect, useState } from 'react';
import {
  primaryProtocolCouncilGuardianRoleId,
  type ProtocolCouncilGuardianRoleId,
} from '@/features/protocol/protocol-council-guardian';
import { fetchDaoRolesClient } from '@/lib/fetch-dao-roles-client';

/**
 * Soft-fill protocol Guardian/Council for a person face — never blocks paint.
 * Shares `/api/profile/dao-roles` cache with Joined facts.
 */
export function useProtocolCouncilGuardianRole(
  accountId: string,
  enabled: boolean
): ProtocolCouncilGuardianRoleId | null {
  const normalized = accountId.trim().toLowerCase();
  const [roleId, setRoleId] = useState<ProtocolCouncilGuardianRoleId | null>(
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
        setRoleId(primaryProtocolCouncilGuardianRoleId(data.daoRoleIds));
        setResolvedKey(normalized);
      } catch {
        if (!cancelled) {
          setRoleId(null);
          setResolvedKey(normalized);
        }
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
  return roleId;
}
