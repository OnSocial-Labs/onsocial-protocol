import { describe, expect, it } from 'vitest';
import {
  enrichApplicationProposalSnapshot,
  sortProtocolGovernanceFeedItems,
} from '../../src/services/governance-feed.js';

describe('enrichApplicationProposalSnapshot', () => {
  const policySnapshot = {
    roles: [{ name: 'guardians', kind: { Group: ['alice.testnet'] } }],
    default_vote_policy: {
      weight_kind: 'RoleWeight',
      quorum: '0',
      threshold: [50, 100],
    },
  };

  const enrichedById = new Map([
    [
      38,
      {
        id: 38,
        proposer: 'alice.testnet',
        description: 'Leave guardians',
        kind: { RemoveMemberFromRole: {} },
        status: 'Approved',
        vote_counts: { guardians: ['2', '0', '0'] },
        votes: { 'alice.testnet': 'Approve', 'bob.testnet': 'Approve' },
        submission_time: '1773316924632618708',
        last_actions_log: [{ block_height: '12345' }],
        policy_snapshot: policySnapshot,
      },
    ],
  ]);

  it('merges policy_snapshot into an existing feed snapshot', () => {
    const app = {
      app_id: 'protocol-proposal-38',
      label: 'Leave guardians',
      status: 'approved',
      wallet_id: null,
      description: 'Leave guardians',
      website_url: null,
      telegram_handle: null,
      x_handle: null,
      created_at: '2026-01-01T00:00:00.000Z',
      governance_scope: 'protocol' as const,
      governance_proposal: {
        proposal_id: 38,
        status: 'Approved',
        proposer: 'alice.testnet',
        description: 'Leave guardians',
        dao_account: 'governance.onsocial.testnet',
        tx_hash: null,
        submitted_at: '2026-01-01T00:00:00.000Z',
        kind: { RemoveMemberFromRole: {} },
        snapshot: {
          id: 38,
          proposer: 'alice.testnet',
          description: 'Leave guardians',
          kind: { RemoveMemberFromRole: {} },
          status: 'Approved',
          vote_counts: { guardians: ['2', '0', '0'] },
          votes: { 'alice.testnet': 'Approve', 'bob.testnet': 'Approve' },
          submission_time: '1773316924632618708',
          last_actions_log: [{ block_height: '12345' }],
        },
      },
    };

    const enriched = enrichApplicationProposalSnapshot(app, enrichedById);

    expect(enriched.governance_proposal?.snapshot?.policy_snapshot).toEqual(
      policySnapshot
    );
  });

  it('attaches a snapshot when the feed row had none', () => {
    const app = {
      app_id: 'partner_app',
      label: 'Partner',
      status: 'proposal_submitted',
      wallet_id: null,
      description: null,
      website_url: null,
      telegram_handle: null,
      x_handle: null,
      created_at: '2026-01-01T00:00:00.000Z',
      governance_scope: 'partners' as const,
      governance_proposal: {
        proposal_id: 38,
        status: 'Approved',
        proposer: null,
        description: null,
        dao_account: 'governance.onsocial.testnet',
        tx_hash: null,
        submitted_at: null,
        kind: null,
        snapshot: null,
      },
    };

    const enriched = enrichApplicationProposalSnapshot(app, enrichedById);

    expect(enriched.governance_proposal?.snapshot?.policy_snapshot).toEqual(
      policySnapshot
    );
  });
});

describe('sortProtocolGovernanceFeedItems', () => {
  it('keeps removed-from-chain placeholders after live proposals', () => {
    const live = (proposalId: number) => ({
      app_id: `protocol-proposal-${proposalId}`,
      label: `#${proposalId}`,
      status: 'approved',
      wallet_id: null,
      description: null,
      website_url: null,
      telegram_handle: null,
      x_handle: null,
      created_at: `2026-03-${String(proposalId).padStart(2, '0')}T00:00:00.000Z`,
      governance_scope: 'protocol' as const,
      governance_proposal: {
        proposal_id: proposalId,
        status: 'Approved',
        proposer: 'alice.testnet',
        description: null,
        dao_account: 'governance.onsocial.testnet',
        tx_hash: null,
        submitted_at: '1',
        kind: { Vote: null },
        snapshot: null,
      },
    });
    const placeholder = (proposalId: number) => ({
      app_id: `protocol-proposal-${proposalId}`,
      label: `#${proposalId}`,
      status: 'rejected',
      wallet_id: null,
      description: 'Removed from chain',
      website_url: null,
      telegram_handle: null,
      x_handle: null,
      created_at: new Date(0).toISOString(),
      governance_scope: 'protocol' as const,
      protocol_target_method: 'removed',
      governance_proposal: {
        proposal_id: proposalId,
        status: 'Removed',
        proposer: null,
        description: 'Removed from chain',
        dao_account: 'governance.onsocial.testnet',
        tx_hash: null,
        submitted_at: null,
        kind: { Removed: null },
        snapshot: null,
      },
    });

    const sorted = sortProtocolGovernanceFeedItems([
      placeholder(16),
      placeholder(17),
      live(53),
      live(56),
      live(55),
    ]);

    expect(sorted.map((row) => row.governance_proposal?.proposal_id)).toEqual([
      56, 55, 53, 17, 16,
    ]);
  });
});
