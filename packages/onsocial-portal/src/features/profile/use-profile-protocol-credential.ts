'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchDaoPolicy } from '@/features/governance/api';
import type { GovernanceDaoPolicy } from '@/features/governance/types';
import {
  resolveProfileProtocolRoleCredential,
  type ProfileProtocolCredential,
} from '@/features/profile/profile-identity-credentials';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/portal-config';

const POLICY_FRESH_MS = 60_000;

interface ProtocolDaoPolicies {
  governance: GovernanceDaoPolicy | null;
  treasury: GovernanceDaoPolicy | null;
}

let cachedPolicies: ProtocolDaoPolicies | undefined;
let cachedAt = 0;
let loadPromise: Promise<ProtocolDaoPolicies> | null = null;

async function loadProtocolDaoPolicies(): Promise<ProtocolDaoPolicies> {
  if (cachedPolicies !== undefined && Date.now() - cachedAt < POLICY_FRESH_MS) {
    return cachedPolicies;
  }

  if (!loadPromise) {
    loadPromise = Promise.all([
      fetchDaoPolicy(GOVERNANCE_DAO_ACCOUNT),
      fetchDaoPolicy(TREASURY_DAO_ACCOUNT),
    ])
      .then(([governance, treasury]) => {
        cachedPolicies = { governance, treasury };
        cachedAt = Date.now();
        return cachedPolicies;
      })
      .finally(() => {
        loadPromise = null;
      });
  }

  return loadPromise;
}

export function useProfileProtocolCredential(
  accountId: string | null,
  enabled: boolean
): ProfileProtocolCredential | null {
  const [policies, setPolicies] = useState<ProtocolDaoPolicies | null>(
    () => cachedPolicies ?? null
  );

  useEffect(() => {
    if (!enabled || !accountId) {
      return;
    }

    let cancelled = false;

    void loadProtocolDaoPolicies().then((nextPolicies) => {
      if (!cancelled) {
        setPolicies(nextPolicies);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accountId, enabled]);

  return useMemo(
    () =>
      resolveProfileProtocolRoleCredential(
        accountId,
        policies?.governance ?? null,
        policies?.treasury ?? null
      ),
    [accountId, policies]
  );
}
