'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  getProtocolDaoStakeProposePath,
  getProtocolGovernanceEligibility,
  invalidateProtocolGovernanceEligibility,
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { accountIdsEqual } from '@/lib/account-match';

export type DaoFaceEligibilityValue = {
  daoAccountId: string;
  eligibility: ProtocolGovernanceEligibility | null;
  canPropose: boolean;
  isGroupMember: boolean;
  isLoading: boolean;
  hasStakeProposePath: boolean;
  stakePathReady: boolean;
  refresh: (opts?: {
    fresh?: boolean;
  }) => Promise<ProtocolGovernanceEligibility | null>;
};

const DaoFaceEligibilityContext =
  createContext<DaoFaceEligibilityValue | null>(null);

export function DaoFaceEligibilityProvider({
  daoAccountId,
  children,
}: {
  daoAccountId: string;
  children: ReactNode;
}) {
  const { accountId, isConnected } = useAppWallet();
  const [eligibility, setEligibility] =
    useState<ProtocolGovernanceEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasStakeProposePath, setHasStakeProposePath] = useState(false);
  const [stakePathReady, setStakePathReady] = useState(false);
  const inflightRef = useRef<Promise<ProtocolGovernanceEligibility | null> | null>(
    null
  );

  const refresh = useCallback(
    async (opts?: { fresh?: boolean }) => {
      if (inflightRef.current && !opts?.fresh) {
        return inflightRef.current;
      }

      const task = (async () => {
        if (!isConnected || !accountId) {
          setEligibility(null);
          setLoading(false);
          try {
            const next = await getProtocolDaoStakeProposePath(daoAccountId);
            setHasStakeProposePath(next);
            setStakePathReady(true);
          } catch {
            setHasStakeProposePath(false);
            setStakePathReady(true);
          }
          return null;
        }

        if (opts?.fresh) {
          invalidateProtocolGovernanceEligibility(accountId, daoAccountId);
        }
        setLoading(true);
        try {
          const next = await getProtocolGovernanceEligibility(
            accountId,
            daoAccountId,
            opts
          );
          setEligibility(next);
          setHasStakeProposePath(next.hasStakeProposePath);
          setStakePathReady(true);
          return next;
        } catch {
          setEligibility(null);
          setHasStakeProposePath(false);
          setStakePathReady(true);
          return null;
        } finally {
          setLoading(false);
        }
      })();

      inflightRef.current = task;
      try {
        return await task;
      } finally {
        if (inflightRef.current === task) {
          inflightRef.current = null;
        }
      }
    },
    [accountId, daoAccountId, isConnected]
  );

  useEffect(() => {
    let cancelled = false;
    void refresh().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const live = isConnected ? eligibility : null;
  const value = useMemo<DaoFaceEligibilityValue>(
    () => ({
      daoAccountId,
      eligibility: live,
      canPropose: Boolean(isConnected && viewerCanProposeOnDao(live)),
      isGroupMember: Boolean(live?.isGroupMember),
      isLoading: Boolean(isConnected && loading),
      hasStakeProposePath,
      stakePathReady,
      refresh,
    }),
    [
      daoAccountId,
      hasStakeProposePath,
      isConnected,
      live,
      loading,
      refresh,
      stakePathReady,
    ]
  );

  return (
    <DaoFaceEligibilityContext.Provider value={value}>
      {children}
    </DaoFaceEligibilityContext.Provider>
  );
}

export function useDaoFaceEligibilityOptional(): DaoFaceEligibilityValue | null {
  return useContext(DaoFaceEligibilityContext);
}

export function useMatchingDaoFaceEligibility(
  daoAccountId: string | null | undefined
): DaoFaceEligibilityValue | null {
  const face = useDaoFaceEligibilityOptional();
  if (!face || !daoAccountId) return null;
  return accountIdsEqual(face.daoAccountId, daoAccountId) ? face : null;
}
