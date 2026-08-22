'use client';

import { useEffect, useState } from 'react';
import {
  primaryProtocolCouncilGuardianRoleIdFromLabels,
  type ProtocolCouncilGuardianRoleId,
} from '@/features/protocol/protocol-council-guardian';

/**
 * Soft-fill protocol Guardian/Council for a person face — never blocks paint.
 * Uses the same `/api/profile/dao-roles` path as Joined facts.
 */
export function useProtocolCouncilGuardianRole(
  accountId: string,
  enabled: boolean
): ProtocolCouncilGuardianRoleId | null {
  const [roleId, setRoleId] = useState<ProtocolCouncilGuardianRoleId | null>(
    null
  );

  useEffect(() => {
    if (!enabled || !accountId.trim()) {
      setRoleId(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(
          `/api/profile/dao-roles?accountId=${encodeURIComponent(accountId)}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          if (!cancelled) setRoleId(null);
          return;
        }
        const data = (await res.json()) as { daoRoleLabels?: string[] };
        if (cancelled) return;
        setRoleId(
          primaryProtocolCouncilGuardianRoleIdFromLabels(
            data.daoRoleLabels ?? []
          )
        );
      } catch {
        if (!cancelled) setRoleId(null);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountId, enabled]);

  return roleId;
}
