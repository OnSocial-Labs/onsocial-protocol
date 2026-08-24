import { describe, expect, it } from 'vitest';
import {
  canProposeProtocolCreateKind,
  daoHasStakeProposePath,
  defaultForeignStakeTokenLabel,
  foreignStakeLockReason,
  getMemberProposeThreshold,
  isProtocolDaoGroupMember,
  resolveStakeProposeKind,
  viewerCanAddProposalOnPolicy,
  viewerHasCreateKindPermission,
} from '@/features/protocol/protocol-propose-gate';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

const councilOnly: ProtocolDaoPolicy = {
  roles: [
    {
      name: 'council',
      kind: { Group: ['alice.near'] },
      permissions: ['*:AddProposal', '*:VoteApprove'],
    },
  ],
  proposal_bond: '0',
};

const factoryEveryone: ProtocolDaoPolicy = {
  roles: [
    {
      name: 'all',
      kind: 'Everyone',
      permissions: ['*:AddProposal'],
    },
    {
      name: 'council',
      kind: { Group: ['alice.near'] },
      permissions: ['*:VoteApprove'],
    },
  ],
  proposal_bond: '0',
};

const voteOnlyGroup: ProtocolDaoPolicy = {
  roles: [
    {
      name: 'community',
      kind: { Group: ['bob.near'] },
      permissions: ['*:VoteApprove'],
    },
    {
      name: 'council',
      kind: { Group: ['alice.near'] },
      permissions: ['*:AddProposal'],
    },
  ],
  proposal_bond: '0',
};

const memberPath: ProtocolDaoPolicy = {
  roles: [
    {
      name: 'delegated_proposers',
      kind: { Member: '1000' },
      permissions: ['*:AddProposal'],
    },
  ],
  proposal_bond: '0',
};

describe('viewerCanAddProposalOnPolicy', () => {
  it('lets Everyone propose on a factory-style DAO', () => {
    expect(viewerCanAddProposalOnPolicy(factoryEveryone, 'bob.near', '0')).toBe(
      true
    );
    expect(
      canProposeProtocolCreateKind(factoryEveryone, 'bob.near', '0', 'signal')
    ).toBe(true);
    expect(
      viewerHasCreateKindPermission(factoryEveryone, 'bob.near', 'signal')
    ).toBe(true);
  });

  it('lets a proposing Group propose without SOCIAL weight', () => {
    expect(viewerCanAddProposalOnPolicy(councilOnly, 'alice.near', '0')).toBe(
      true
    );
    expect(viewerCanAddProposalOnPolicy(councilOnly, 'bob.near', '0')).toBe(
      false
    );
  });

  it('does not treat a vote-only Group as propose rights', () => {
    expect(isProtocolDaoGroupMember(voteOnlyGroup, 'bob.near')).toBe(true);
    expect(viewerCanAddProposalOnPolicy(voteOnlyGroup, 'bob.near', '0')).toBe(
      false
    );
    expect(viewerCanAddProposalOnPolicy(voteOnlyGroup, 'alice.near', '0')).toBe(
      true
    );
  });

  it('lets Member weight unlock propose when the threshold is met', () => {
    expect(viewerCanAddProposalOnPolicy(memberPath, 'bob.near', '999')).toBe(
      false
    );
    expect(viewerCanAddProposalOnPolicy(memberPath, 'bob.near', '1000')).toBe(
      true
    );
  });
});

describe('daoHasStakeProposePath', () => {
  it('requires a Member propose role and a staking contract', () => {
    expect(getMemberProposeThreshold(councilOnly)).toBeNull();
    expect(getMemberProposeThreshold(factoryEveryone)).toBeNull();
    expect(getMemberProposeThreshold(memberPath)).toBe('1000');
    expect(daoHasStakeProposePath(memberPath, 'staking.example')).toBe(true);
    expect(daoHasStakeProposePath(memberPath, null)).toBe(false);
    expect(daoHasStakeProposePath(councilOnly, 'staking.example')).toBe(false);
    expect(daoHasStakeProposePath(factoryEveryone, 'staking.example')).toBe(
      false
    );
  });
});

describe('resolveStakeProposeKind', () => {
  const social = 'token.onsocial.testnet';

  it('offers SOCIAL only when the staking token is SOCIAL', () => {
    expect(
      resolveStakeProposeKind({
        hasMemberProposeRole: true,
        stakingContractId: 'staking.other',
        stakeTokenId: social,
        socialTokenId: social,
      })
    ).toBe('social');
  });

  it('is foreign when the staking token is another FT', () => {
    expect(
      resolveStakeProposeKind({
        hasMemberProposeRole: true,
        stakingContractId: 'staking.other',
        stakeTokenId: 'usdc.near',
        socialTokenId: social,
      })
    ).toBe('foreign');
    expect(foreignStakeLockReason(defaultForeignStakeTokenLabel('usdc.near'))).toBe(
      'Need usdc.near stake'
    );
  });

  it('treats an unknown token as foreign unless the staking contract is known SOCIAL', () => {
    expect(
      resolveStakeProposeKind({
        hasMemberProposeRole: true,
        stakingContractId: 'staking.mystery',
        stakeTokenId: null,
        socialTokenId: social,
      })
    ).toBe('foreign');
    expect(
      resolveStakeProposeKind({
        hasMemberProposeRole: true,
        stakingContractId: 'staking-governance.onsocial.testnet',
        stakeTokenId: null,
        socialTokenId: social,
        knownSocialStakingIds: ['staking-governance.onsocial.testnet'],
      })
    ).toBe('social');
  });
});
