'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';

/**
 * Council capability for a DAO public face — `canPropose` when connected.
 */
export function useDaoPageCapability(
  daoAccountId: string,
  enabled: boolean
): {
  canPropose: boolean;
  isLoading: boolean;
} {
  const { accountId, isConnected } = useAppWallet();
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !isConnected || !accountId) {
      queueMicrotask(() => {
        setEligibility(null);
        setLoading(false);
      });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setLoading(true));
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (!cancelled) setEligibility(next);
      })
      .catch(() => {
        if (!cancelled) setEligibility(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, daoAccountId, enabled, isConnected]);

  return {
    canPropose: Boolean(enabled && isConnected && eligibility?.canPropose),
    isLoading: Boolean(enabled && isConnected && loading),
  };
}
