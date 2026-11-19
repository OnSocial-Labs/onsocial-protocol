import { describe, expect, it } from 'vitest';
import {
  resolveProtocolDaoProposerFlags,
  proposerFlagsByAccount,
} from '../../src/services/governance-dao-proposer-flags.js';

describe('resolveProtocolDaoProposerFlags', () => {
  const governance = 'governance.onsocial.testnet';
  const treasury = 'treasury.onsocial.testnet';

  it('maps distinct dao ids to governance and treasury flags', () => {
    expect(
      resolveProtocolDaoProposerFlags(
        [governance, treasury, governance],
        governance,
        treasury
      )
    ).toEqual({ governance: true, treasury: true });
  });

  it('normalizes dao account ids', () => {
    expect(
      resolveProtocolDaoProposerFlags(
        ['Governance.OnSocial.Testnet'],
        governance,
        treasury
      )
    ).toEqual({ governance: true, treasury: false });
  });

  it('returns false for unrelated daos', () => {
    expect(
      resolveProtocolDaoProposerFlags(['community.near'], governance, treasury)
    ).toEqual({ governance: false, treasury: false });
  });
});

describe('proposerFlagsByAccount', () => {
  const governance = 'governance.onsocial.testnet';
  const treasury = 'treasury.onsocial.testnet';

  it('maps one snapshot read onto every requested account', () => {
    expect(
      proposerFlagsByAccount(
        [
          {
            proposerAccountId: 'Alice.Near',
            daoAccountId: governance,
          },
          {
            proposerAccountId: 'alice.near',
            daoAccountId: treasury,
          },
        ],
        ['alice.near', 'bob.near'],
        governance,
        treasury
      )
    ).toEqual({
      'alice.near': { governance: true, treasury: true },
      'bob.near': { governance: false, treasury: false },
    });
  });
});
