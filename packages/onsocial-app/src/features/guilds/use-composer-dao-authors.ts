'use client';

import { useEffect, useMemo, useState } from 'react';
import { resolveDaoDirectoryName } from '@/features/protocol/dao-directory';
import {
  fetchMyDaos,
  type MyDaoMembership,
} from '@/features/protocol/my-daos-client';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';

export const COMPOSER_AUTHOR_ME = 'me';
export const COMPOSER_AUTHOR_DAO = 'dao';

export type ComposerDaoAuthorOption = {
  daoAccountId: string;
  label: string;
};

export type ComposerAuthorMode = typeof COMPOSER_AUTHOR_ME | typeof COMPOSER_AUTHOR_DAO;

/**
 * DAOs the viewer can propose on — for composer “As DAO” author picker.
 * Membership from my-daos, then per-DAO `canPropose` eligibility.
 */
export function useComposerDaoAuthors(args: {
  active: boolean;
  accountId: string | null | undefined;
}): {
  loading: boolean;
  eligible: ComposerDaoAuthorOption[];
  eligibilityByDao: Record<string, ProtocolGovernanceEligibility>;
  hasEligible: boolean;
} {
  const { active, accountId } = args;
  const [memberships, setMemberships] = useState<MyDaoMembership[]>([]);
  const [eligibilityByDao, setEligibilityByDao] = useState<
    Record<string, ProtocolGovernanceEligibility>
  >({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active || !accountId) {
      queueMicrotask(() => {
        setMemberships([]);
        setEligibilityByDao({});
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    void fetchMyDaos(accountId)
      .then(async (response) => {
        if (cancelled) return;
        const rows = response.daos.slice(0, 24);
        setMemberships(rows);
        const entries = await Promise.all(
          rows.map(async (row) => {
            try {
              const next = await getProtocolGovernanceEligibility(
                accountId,
                row.daoAccountId
              );
              return [row.daoAccountId, next] as const;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        const map: Record<string, ProtocolGovernanceEligibility> = {};
        for (const entry of entries) {
          if (!entry) continue;
          map[entry[0]] = entry[1];
        }
        setEligibilityByDao(map);
      })
      .catch(() => {
        if (!cancelled) {
          setMemberships([]);
          setEligibilityByDao({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, accountId]);

  const eligible = useMemo(() => {
    const options: ComposerDaoAuthorOption[] = [];
    for (const row of memberships) {
      const eligibility = eligibilityByDao[row.daoAccountId];
      if (!eligibility?.canPropose) continue;
      options.push({
        daoAccountId: row.daoAccountId,
        label: resolveDaoDirectoryName(row.daoAccountId, {
          name: row.name,
          metadata: row.metadata,
        }),
      });
    }
    return options;
  }, [eligibilityByDao, memberships]);

  return {
    loading,
    eligible,
    eligibilityByDao,
    hasEligible: eligible.length > 0,
  };
}
