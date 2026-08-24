'use client';

import { useEffect, useState } from 'react';
import {
  fetchProtocolDaoBoostInfra,
  fetchProtocolDaoManagedContracts,
  fetchProtocolDaoSocialSpendTreasury,
  fetchProtocolDaoTransferAssets,
} from '@/features/protocol/protocol-dao-context-client';
import {
  EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
  type ProtocolProposeChainContext,
} from '@/features/protocol/protocol-propose-chain-filter';
import type { ProtocolPickerLoadState } from '@/features/protocol/protocol-picker-sheet';

type ChainSnapshot = {
  daoAccountId: string;
  loadState: Exclude<ProtocolPickerLoadState, 'idle' | 'loading'>;
  chain: ProtocolProposeChainContext;
};

const LOADING_CHAIN_CONTEXT: ProtocolProposeChainContext = {
  ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
  managedContractsLoading: true,
  socialSpendTreasuryLoading: true,
  boostInfraLoading: true,
  transferAssetsLoading: true,
};

export function useProtocolProposeChainContext(
  daoAccountId: string | null,
  open: boolean
): {
  loadState: ProtocolPickerLoadState;
  chain: ProtocolProposeChainContext;
} {
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);

  useEffect(() => {
    if (!open || !daoAccountId) {
      return;
    }

    let cancelled = false;
    const activeDao = daoAccountId;

    void Promise.all([
      fetchProtocolDaoManagedContracts(activeDao),
      fetchProtocolDaoSocialSpendTreasury(activeDao),
      fetchProtocolDaoBoostInfra(activeDao),
      fetchProtocolDaoTransferAssets(activeDao),
    ])
      .then(
        ([
          managedContracts,
          socialSpendTreasuryContext,
          boostInfraContext,
          transferAssets,
        ]) => {
          if (cancelled) return;
          setSnapshot({
            daoAccountId: activeDao,
            loadState: 'ready',
            chain: {
              managedContractsLoading: false,
              managedContractsCount: managedContracts.length,
              hashUpgradableManagedContractsCount: managedContracts.filter(
                (contract) => contract.upgradable
              ).length,
              socialSpendTreasuryLoading: false,
              socialSpendTreasuryContext,
              boostInfraLoading: false,
              boostInfraContext,
              transferAssetsLoading: false,
              transferAssetsCount: transferAssets.length,
            },
          });
        }
      )
      .catch(() => {
        if (cancelled) return;
        setSnapshot({
          daoAccountId: activeDao,
          loadState: 'error',
          chain: EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [daoAccountId, open]);

  if (!open) {
    return {
      loadState: 'idle',
      chain: EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
    };
  }

  if (!daoAccountId) {
    return {
      loadState: 'ready',
      chain: EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
    };
  }

  if (!snapshot || snapshot.daoAccountId !== daoAccountId) {
    return {
      loadState: 'loading',
      chain: LOADING_CHAIN_CONTEXT,
    };
  }

  return {
    loadState: snapshot.loadState,
    chain: snapshot.chain,
  };
}
