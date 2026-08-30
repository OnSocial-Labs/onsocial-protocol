import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
  isProtocolCreateKindChainAvailable,
  resolveAvailableProtocolCreateKinds,
} from '@/features/protocol/protocol-propose-chain-filter';

describe('resolveAvailableProtocolCreateKinds', () => {
  it('drops transfer when the DAO has no assets', () => {
    expect(
      resolveAvailableProtocolCreateKinds(['transfer', 'signal'], {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        transferAssetsCount: 0,
      })
    ).toEqual(['signal']);
  });

  it('drops contract upgrades when nothing is upgradable', () => {
    expect(
      resolveAvailableProtocolCreateKinds(['contract_upgrade'], {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        managedContractsCount: 2,
        hashUpgradableManagedContractsCount: 0,
      })
    ).toEqual([]);
  });
});

describe('isProtocolCreateKindChainAvailable', () => {
  it('requires fundable seasons for fund rally', () => {
    expect(
      isProtocolCreateKindChainAvailable('fund_season_pool', {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        socialSpendTreasuryContext: {
          canFundSeasonPool: true,
          canSetSeasonConfig: false,
          fundableSeasonIds: [],
        },
      })
    ).toBe(false);
  });

  it('requires social-spend owner for start rally', () => {
    expect(
      isProtocolCreateKindChainAvailable('season_config', {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        socialSpendTreasuryContext: {
          canFundSeasonPool: true,
          canSetSeasonConfig: false,
          fundableSeasonIds: ['season-two'],
        },
      })
    ).toBe(false);

    expect(
      isProtocolCreateKindChainAvailable('season_config', {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        socialSpendTreasuryContext: {
          canFundSeasonPool: true,
          canSetSeasonConfig: true,
          fundableSeasonIds: [],
        },
      })
    ).toBe(true);
  });
});
