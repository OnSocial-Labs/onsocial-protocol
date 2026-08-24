'use client';

import { useEffect, useState } from 'react';
import { useMatchingDaoFaceEligibility } from '@/contexts/dao-face-eligibility-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  getProtocolDaoStakeProposePath,
  getProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';

/**
 * Propose capability for a DAO public face — shared snapshot when mounted
 * under `DaoFaceEligibilityProvider`, otherwise a one-off fetch.
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
  const face = useMatchingDaoFaceEligibility(enabled ? daoAccountId : null);
  const { accountId, isConnected } = useAppWallet();
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasStakeProposePath, setHasStakeProposePath] = useState(false);
  const [stakePathReady, setStakePathReady] = useState(false);

  useEffect(() => {
    if (face || !enabled) {
      if (!enabled) {
        queueMicrotask(() => {
          setEligibility(null);
          setLoading(false);
          setHasStakeProposePath(false);
          setStakePathReady(false);
        });
      }
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
  }, [accountId, daoAccountId, enabled, face, isConnected]);

  if (face) {
    return {
      canPropose: face.canPropose,
      isGroupMember: face.isGroupMember,
      isLoading: face.isLoading,
      eligibility: face.eligibility,
      hasStakeProposePath: face.hasStakeProposePath,
      stakePathReady: face.stakePathReady,
    };
  }

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
