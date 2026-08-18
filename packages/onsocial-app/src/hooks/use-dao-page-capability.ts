'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';

/**
 * Council capability for a DAO public face — Group member or stake threshold.
 */
export function useDaoPageCapability(
  daoAccountId: string,
  enabled: boolean
): {
  canPropose: boolean;
  isGroupMember: boolean;
  isLoading: boolean;
  eligibility: ProtocolGovernanceEligibility | null;
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

  const live = enabled && isConnected ? eligibility : null;

  return {
    canPropose: Boolean(enabled && isConnected && viewerCanProposeOnDao(live)),
    isGroupMember: Boolean(live?.isGroupMember),
    isLoading: Boolean(enabled && isConnected && loading),
    eligibility: live,
  };
}
