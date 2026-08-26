import { describe, expect, it } from 'vitest';
import { resolveProtocolDaoProposerFlags } from '../../src/services/governance-dao-proposer-flags.js';

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
