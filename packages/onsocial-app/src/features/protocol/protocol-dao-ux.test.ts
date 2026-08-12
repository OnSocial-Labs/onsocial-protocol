import { describe, expect, it } from 'vitest';
import {
  countProtocolApplicationsByStatus,
  filterProtocolApplications,
  findProtocolApplicationByProposalId,
} from '@/features/protocol/protocol-feed-filters';
import { deriveProtocolProposalPresentation } from '@/features/protocol/protocol-proposal-presentation';
import type { ProtocolApplication } from '@/features/protocol/types';
import {
  parseProtocolFeedStatus,
  parseProtocolProposalId,
} from '@/lib/app-routes';

function app(partial: {
  proposalId: number;
  status: string;
  label?: string;
}): ProtocolApplication {
  return {
    app_id: `protocol-proposal-${partial.proposalId}`,
    label: partial.label ?? `Proposal ${partial.proposalId}`,
    status: 'approved',
    description: null,
    created_at: '1',
    protocol_kind: null,
    protocol_subject: null,
    protocol_target_account: null,
    protocol_target_method: null,
    governance_proposal: {
      proposal_id: partial.proposalId,
      status: partial.status,
      description: null,
      dao_account: 'dao.near',
      tx_hash: null,
      submitted_at: null,
      snapshot: {
        id: partial.proposalId,
        proposer: 'alice.near',
        description: 'desc',
        kind: { Vote: {} },
        status: partial.status as 'InProgress',
        vote_counts: {},
        votes: {},
        submission_time: '1',
      },
    },
  };
}

describe('protocol feed filters', () => {
  const rows = [
    app({ proposalId: 1, status: 'InProgress' }),
    app({ proposalId: 2, status: 'Approved' }),
    app({ proposalId: 3, status: 'Rejected' }),
    app({ proposalId: 4, status: 'Expired' }),
  ];

  it('parses status and proposal query params', () => {
    expect(parseProtocolFeedStatus('approved')).toBe('approved');
    expect(parseProtocolFeedStatus('InProgress')).toBe('open');
    expect(parseProtocolFeedStatus(null)).toBe('open');
    expect(parseProtocolProposalId('12')).toBe(12);
    expect(parseProtocolProposalId('nope')).toBeNull();
  });

  it('filters and counts by status', () => {
    expect(filterProtocolApplications(rows, 'open')).toHaveLength(1);
    expect(filterProtocolApplications(rows, 'approved')[0]?.app_id).toBe(
      'protocol-proposal-2'
    );
    expect(countProtocolApplicationsByStatus(rows)).toMatchObject({
      open: 1,
      approved: 1,
      rejected: 1,
      expired: 1,
      all: 4,
    });
  });

  it('finds applications by proposal id', () => {
    expect(findProtocolApplicationByProposalId(rows, 3)?.app_id).toBe(
      'protocol-proposal-3'
    );
    expect(findProtocolApplicationByProposalId(rows, 99)).toBeNull();
  });
});

describe('protocol proposal presentation', () => {
  it('headlines membership and transfer kinds', () => {
    expect(
      deriveProtocolProposalPresentation({
        kind: {
          AddMemberToRole: { member_id: 'bob.near', role: 'delegated_proposers' },
        },
        description: null,
        proposer: 'alice.near',
      }).headline
    ).toBe('Add to Delegated Proposers');

    expect(
      deriveProtocolProposalPresentation({
        kind: {
          Transfer: {
            receiver_id: 'treasury.near',
            amount: '1000000000000000000000000',
            token_id: '',
          },
        },
        description: null,
        proposer: 'alice.near',
      }).headline
    ).toContain('Send');
  });

  it('uses signal description for Vote proposals', () => {
    const presentation = deriveProtocolProposalPresentation({
      kind: { Vote: {} },
      description: 'Ship season two\nmore detail',
      proposer: 'alice.near',
    });
    expect(presentation.headline).toBe('Ship season two');
    expect(presentation.actionBadge).toBe('Signal');
  });
});
