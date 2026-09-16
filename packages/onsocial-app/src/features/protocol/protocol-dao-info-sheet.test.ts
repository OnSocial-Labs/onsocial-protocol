import { describe, expect, it } from 'vitest';
import {
  formatDaoInfoRoleList,
  formatDaoVotePolicySummary,
  resolveDaoCouncilNote,
} from '@/features/protocol/protocol-dao-info-sheet';
import type { ProtocolDaoPolicy } from '@/features/protocol/types';

const basePolicy = {
  proposal_bond: '100000000000000000000000',
  proposal_period: '604800000000000',
  roles: [
    {
      name: 'guardians',
      kind: { Group: ['a.near', 'b.near', 'c.near'] },
      permissions: [],
      vote_policy: {},
    },
    {
      name: 'delegated_proposers',
      kind: { Member: '500000000000000000000' },
      permissions: [],
      vote_policy: {},
    },
  ],
  default_vote_policy: {
    weight_kind: 'RoleWeight' as const,
    quorum: '0',
    threshold: [50, 100] as [number, number],
  },
} as ProtocolDaoPolicy;

describe('protocol-dao-info-sheet copy', () => {
  it('formats vote policy and council note from the guardian role', () => {
    expect(formatDaoVotePolicySummary(basePolicy)).toBe('50/100 · 50%');
    expect(resolveDaoCouncilNote(basePolicy)).toBe('Guardian 3');
  });

  it('labels roles like Members', () => {
    expect(
      formatDaoInfoRoleList(['guardians', 'delegated_proposers'])
    ).toBe('Guardian · Proposers');
  });
});
