import { describe, expect, it } from 'vitest';
import {
  protocolCreateBoostWithdrawReady,
  protocolCreateDescriptionPlaceholder,
  protocolCreateDescriptionReady,
  protocolCreateWhisper,
} from '@/features/protocol/protocol-create-compose';
import {
  EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
  resolveAvailableProtocolCreateKinds,
} from '@/features/protocol/protocol-propose-chain-filter';

describe('protocolCreateWhisper', () => {
  it('folds bond into membership whispers', () => {
    expect(protocolCreateWhisper('add_member', '0.1 NEAR')).toBe(
      'Role and account · 0.1 NEAR bond on confirm.'
    );
    expect(protocolCreateWhisper('remove_member', null)).toMatch(
      /confirm to submit/i
    );
  });

  it('describes ownership compose', () => {
    expect(protocolCreateWhisper('transfer_ownership', '0.1 NEAR')).toBe(
      'Contract and new owner · 0.1 NEAR bond on confirm.'
    );
  });

  it('describes boost infra withdraw compose', () => {
    expect(protocolCreateWhisper('withdraw_boost_infra', '0.1 NEAR')).toBe(
      'Infra pool to treasury · 0.1 NEAR bond on confirm.'
    );
  });

  it('describes treasury transfer compose', () => {
    expect(protocolCreateWhisper('transfer', '0.1 NEAR')).toBe(
      'Asset, recipient, and amount · 0.1 NEAR bond on confirm.'
    );
  });
});

describe('protocolCreateBoostWithdrawReady', () => {
  it('requires a positive amount within the infra pool', () => {
    expect(
      protocolCreateBoostWithdrawReady('0', {
        canWithdraw: true,
        infraPoolYocto: '1000000000000000000',
      })
    ).toBe(false);
    expect(
      protocolCreateBoostWithdrawReady('1', {
        canWithdraw: true,
        infraPoolYocto: '1000000000000000000',
      })
    ).toBe(true);
    expect(
      protocolCreateBoostWithdrawReady('2', {
        canWithdraw: true,
        infraPoolYocto: '1000000000000000000',
      })
    ).toBe(false);
  });
});

describe('resolveAvailableProtocolCreateKinds', () => {
  it('hides treasury-only kinds on governance when chain context says no', () => {
    const kinds = resolveAvailableProtocolCreateKinds(
      [
        'signal',
        'fund_season_pool',
        'withdraw_boost_infra',
        'set_boost_infra_authority',
      ],
      {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        boostInfraContext: {
          canWithdrawBoostInfra: false,
          canSetBoostInfraAuthority: false,
        },
        socialSpendTreasuryContext: null,
      }
    );

    expect(kinds).toEqual(['signal']);
  });

  it('keeps withdraw boost when treasury is withdraw authority', () => {
    const kinds = resolveAvailableProtocolCreateKinds(
      ['withdraw_boost_infra', 'transfer'],
      {
        ...EMPTY_PROTOCOL_PROPOSE_CHAIN_CONTEXT,
        boostInfraContext: {
          canWithdrawBoostInfra: true,
          canSetBoostInfraAuthority: false,
        },
        transferAssetsCount: 0,
      }
    );

    expect(kinds).toEqual(['withdraw_boost_infra']);
  });
});

describe('protocolCreateDescriptionPlaceholder', () => {
  it('morphs membership placeholders by role', () => {
    expect(
      protocolCreateDescriptionPlaceholder('add_member', {
        roleId: 'guardians',
      })
    ).toBe('Why they should join guardians');
  });
});

describe('protocolCreateDescriptionReady', () => {
  it('requires bounded prose', () => {
    expect(protocolCreateDescriptionReady('too short')).toBe(false);
    expect(
      protocolCreateDescriptionReady(
        'Berry has been contributing and should join guardians.'
      )
    ).toBe(true);
  });
});
