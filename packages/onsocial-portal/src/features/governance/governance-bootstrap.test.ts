import { describe, expect, it } from 'vitest';
import {
  buildGovernanceApplicationsFromDaoProposals,
  buildMissingGovernanceApplicationFromProposalId,
  shouldIncludeInGovernanceBootstrap,
} from '@/features/governance/governance-bootstrap';
import type { GovernanceDaoProposal } from '@/features/governance/types';

describe('governance bootstrap proposal coverage', () => {
  it('includes staking and signaling proposals', () => {
    const staking: GovernanceDaoProposal = {
      id: 0,
      proposer: 'alice.testnet',
      description: 'Set governance staking contract',
      kind: {
        SetStakingContract: {
          staking_id: 'staking-governance.onsocial.testnet',
        },
      },
      status: 'Approved',
      vote_counts: {},
      votes: {},
      submission_time: '1',
    };
    const signaling: GovernanceDaoProposal = {
      id: 36,
      proposer: 'bob.testnet',
      description: 'Community idea',
      kind: { Vote: null },
      status: 'InProgress',
      vote_counts: {},
      votes: {},
      submission_time: '2',
    };

    expect(shouldIncludeInGovernanceBootstrap(staking)).toBe(true);
    expect(shouldIncludeInGovernanceBootstrap(signaling)).toBe(true);

    const apps = buildGovernanceApplicationsFromDaoProposals(
      [staking, signaling],
      'governance.onsocial.testnet'
    );

    expect(apps).toHaveLength(2);
    expect(apps[0]?.protocol_kind).toBe('staking');
    expect(apps[1]?.protocol_kind).toBe('signaling');
  });

  it('fills missing proposal ids up to lastProposalId', () => {
    const apps = buildGovernanceApplicationsFromDaoProposals(
      [
        {
          id: 0,
          proposer: 'alice.testnet',
          description: 'Set staking',
          kind: { SetStakingContract: { staking_id: 'staking.testnet' } },
          status: 'Approved',
          vote_counts: {},
          votes: {},
          submission_time: '1',
        },
        {
          id: 2,
          proposer: 'bob.testnet',
          description: 'Idea',
          kind: { Vote: null },
          status: 'InProgress',
          vote_counts: {},
          votes: {},
          submission_time: '2',
        },
      ],
      'governance.onsocial.testnet',
      { lastProposalId: 2 }
    );

    expect(apps).toHaveLength(3);
    expect(
      apps.find((app) => app.governance_proposal?.proposal_id === 1)?.label
    ).toContain('removed from chain');
  });

  it('skips tail placeholders when lastProposalId runs ahead of sync', () => {
    const apps = buildGovernanceApplicationsFromDaoProposals(
      [
        {
          id: 0,
          proposer: 'alice.testnet',
          description: 'Set staking',
          kind: { SetStakingContract: { staking_id: 'staking.testnet' } },
          status: 'Approved',
          vote_counts: {},
          votes: {},
          submission_time: '1',
        },
        {
          id: 2,
          proposer: 'bob.testnet',
          description: 'Idea',
          kind: { Vote: null },
          status: 'InProgress',
          vote_counts: {},
          votes: {},
          submission_time: '2',
        },
      ],
      'governance.onsocial.testnet',
      { lastProposalId: 3 }
    );

    expect(apps).toHaveLength(3);
    expect(apps.some((app) => app.governance_proposal?.proposal_id === 3)).toBe(
      false
    );
  });

  it('builds a removed placeholder card', () => {
    const app = buildMissingGovernanceApplicationFromProposalId(
      16,
      'governance.onsocial.testnet'
    );

    expect(app.app_id).toBe('protocol-proposal-16');
    expect(app.governance_proposal?.status).toBe('Removed');
  });
});
