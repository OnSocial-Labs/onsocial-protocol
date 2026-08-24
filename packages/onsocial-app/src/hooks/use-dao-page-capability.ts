'use client';

import { useEffect, useState } from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  getProtocolDaoStakeProposePath,
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';

/**
 * Propose capability for a DAO public face — this DAO's policy.
 */
export function useDaoPageCapability(
  daoAccountId: string,
  enabled: boolean
): {
  canPropose: boolean;
  isGroupMember: boolean;
  isLoading: boolean;
  eligibility: ProtocolGovernanceEligibility | null;
  hasStakeProposePath: boolean;
  stakePathReady: boolean;
} {
  const { accountId, isConnected } = useAppWallet();
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasStakeProposePath, setHasStakeProposePath] = useState(false);
  const [stakePathReady, setStakePathReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      queueMicrotask(() => {
        setEligibility(null);
        setLoading(false);
        setHasStakeProposePath(false);
        setStakePathReady(false);
      });
      return;
    }

    let cancelled = false;

    if (!isConnected || !accountId) {
      queueMicrotask(() => {
        setEligibility(null);
        setLoading(false);
      });
      void getProtocolDaoStakeProposePath(daoAccountId)
        .then((next) => {
          if (cancelled) return;
          setHasStakeProposePath(next);
          setStakePathReady(true);
        })
        .catch(() => {
          if (cancelled) return;
          setHasStakeProposePath(false);
          setStakePathReady(true);
        });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => setLoading(true));
    void getProtocolGovernanceEligibility(accountId, daoAccountId)
      .then((next) => {
        if (cancelled) return;
        setEligibility(next);
        setHasStakeProposePath(next.hasStakeProposePath);
        setStakePathReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEligibility(null);
        setHasStakeProposePath(false);
        setStakePathReady(true);
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
    hasStakeProposePath,
    stakePathReady,
  };
}
