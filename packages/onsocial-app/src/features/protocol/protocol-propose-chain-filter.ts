import type { ProtocolCreateKind } from '@/features/protocol/protocol-create';

export type ProtocolProposeChainContext = {
  managedContractsLoading: boolean;
  managedContractsCount: number;
  hashUpgradableManagedContractsCount: number;
  socialSpendTreasuryLoading: boolean;
  socialSpendTreasuryContext: {
    canFundSeasonPool: boolean;
    fundableSeasonIds: readonly string[];
  } | null;
  boostInfraLoading: boolean;
  boostInfraContext: {
    canWithdrawBoostInfra: boolean;
    canSetBoostInfraAuthority: boolean;
  } | null;
  transferAssetsLoading: boolean;
  transferAssetsCount: number;
};

export const EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT: ProtocolProposeChainContext =
  {
    managedContractsLoading: false,
    managedContractsCount: 0,
    hashUpgradableManagedContractsCount: 0,
    socialSpendTreasuryLoading: false,
    socialSpendTreasuryContext: null,
    boostInfraLoading: false,
    boostInfraContext: null,
    transferAssetsLoading: false,
    transferAssetsCount: 0,
  };

/** Policy-permitted kinds filtered by live on-chain capability for this DAO board. */
export function resolveAvailableProtocolCreateKinds(
  baseKinds: readonly ProtocolCreateKind[],
  chain: ProtocolProposeChainContext
): ProtocolCreateKind[] {
  let kinds = [...baseKinds];

  if (kinds.includes('transfer_ownership')) {
    if (chain.managedContractsLoading || chain.managedContractsCount === 0) {
      kinds = kinds.filter((kind) => kind !== 'transfer_ownership');
    }
  }

  if (kinds.includes('contract_upgrade')) {
    if (
      chain.managedContractsLoading ||
      chain.hashUpgradableManagedContractsCount === 0
    ) {
      kinds = kinds.filter((kind) => kind !== 'contract_upgrade');
    }
  }

  if (kinds.includes('fund_season_pool')) {
    if (
      chain.socialSpendTreasuryLoading ||
      !chain.socialSpendTreasuryContext?.canFundSeasonPool ||
      chain.socialSpendTreasuryContext.fundableSeasonIds.length === 0
    ) {
      kinds = kinds.filter((kind) => kind !== 'fund_season_pool');
    }
  }

  if (kinds.includes('withdraw_boost_infra')) {
    if (
      chain.boostInfraLoading ||
      !chain.boostInfraContext?.canWithdrawBoostInfra
    ) {
      kinds = kinds.filter((kind) => kind !== 'withdraw_boost_infra');
    }
  }

  if (kinds.includes('set_boost_infra_authority')) {
    if (
      chain.boostInfraLoading ||
      !chain.boostInfraContext?.canSetBoostInfraAuthority
    ) {
      kinds = kinds.filter((kind) => kind !== 'set_boost_infra_authority');
    }
  }

  if (kinds.includes('transfer')) {
    if (chain.transferAssetsLoading || chain.transferAssetsCount === 0) {
      kinds = kinds.filter((kind) => kind !== 'transfer');
    }
  }

  return kinds;
}

export function isProtocolCreateKindChainAvailable(
  kind: ProtocolCreateKind,
  chain: ProtocolProposeChainContext
): boolean {
  return resolveAvailableProtocolCreateKinds([kind], chain).includes(kind);
}
