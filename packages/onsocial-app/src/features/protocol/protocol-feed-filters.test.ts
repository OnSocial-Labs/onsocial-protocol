import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_FEED_PAGE_SIZE,
  buildProtocolProposalAppId,
  filterProtocolApplications,
  getVisibleProtocolBatch,
  isProtocolRemovedFromChainPlaceholder,
  proposalDrawerContentReady,
  resolveProposalDrawerBody,
  sortProtocolApplicationsForFeed,
  upsertProtocolProposalApplication,
  viewerVotedOnProtocolApplication,
} from '@/features/protocol/protocol-feed-filters';
import type {
  ProtocolApplication,
  ProtocolDaoProposal,
  ProtocolDaoProposalStatus,
  ProtocolDaoVote,
} from '@/features/protocol/types';

describe('proposalDrawerContentReady', () => {
  it('waits for DAO config and a settled policy before showing proposals', () => {
    expect(
      proposalDrawerContentReady({
        feedState: 'ready',
        syncing: false,
        hasPolicy: true,
        configSettled: false,
      })
    ).toBe(false);
    expect(
      proposalDrawerContentReady({
        feedState: 'loading',
        syncing: true,
        hasPolicy: false,
        configSettled: true,
      })
    ).toBe(false);
    expect(
      proposalDrawerContentReady({
        feedState: 'ready',
        syncing: true,
        hasPolicy: false,
        configSettled: true,
      })
    ).toBe(false);
    expect(
      proposalDrawerContentReady({
        feedState: 'ready',
        syncing: true,
        hasPolicy: true,
        configSettled: true,
      })
    ).toBe(true);
    expect(
      proposalDrawerContentReady({
        feedState: 'ready',
        syncing: false,
        hasPolicy: false,
        configSettled: true,
      })
    ).toBe(true);
  });
});

describe('getVisibleProtocolBatch', () => {
  it('paints the first page and reports remaining rows', () => {
    const items = Array.from({ length: 25 }, (_, index) => index);
    const batch = getVisibleProtocolBatch(items, PROTOCOL_FEED_PAGE_SIZE);
    expect(batch.visibleItems).toEqual(items.slice(0, 10));
    expect(batch.hasMore).toBe(true);
    expect(batch.shownCount).toBe(10);
  });

  it('clamps to the available list length', () => {
    const items = [1, 2, 3];
    const batch = getVisibleProtocolBatch(items, 40);
    expect(batch.visibleItems).toEqual(items);
    expect(batch.hasMore).toBe(false);
    expect(batch.shownCount).toBe(3);
  });
});

describe('upsertProtocolProposalApplication', () => {
  it('inserts a live proposal row for immediate detail navigation', () => {
    const proposal: ProtocolDaoProposal = {
      id: 42,
      proposer: 'alice.testnet',
      description: 'Signal the roadmap',
      kind: { Policy: {} },
      status: 'InProgress',
      vote_counts: {},
      votes: {},
      submission_time: '1',
    };
    const next = upsertProtocolProposalApplication([], proposal, 'dao.testnet');
    expect(next).toHaveLength(1);
    expect(next[0]?.app_id).toBe(buildProtocolProposalAppId(42));
    expect(next[0]?.governance_proposal?.proposal_id).toBe(42);
  });

  it('merges into an existing feed row', () => {
    const proposal: ProtocolDaoProposal = {
      id: 42,
      proposer: 'alice.testnet',
      description: 'Updated description',
      kind: { Policy: {} },
      status: 'InProgress',
      vote_counts: { council: ['1', '0', '0'] },
      votes: { 'bob.testnet': 'Approve' },
      submission_time: '1',
    };
    const existing: ProtocolApplication = {
      app_id: buildProtocolProposalAppId(42),
      label: 'Proposal',
      status: 'approved',
      description: 'Old',
      created_at: '1',
      governance_proposal: {
        proposal_id: 42,
        status: 'InProgress',
        description: 'Old',
        dao_account: 'dao.testnet',
        tx_hash: null,
        submitted_at: '1',
        snapshot: {
          ...proposal,
          description: 'Old',
          vote_counts: {},
          votes: {},
        },
      },
    };
    const next = upsertProtocolProposalApplication(
      [existing],
      proposal,
      'dao.testnet'
    );
    expect(next[0]?.governance_proposal?.snapshot?.description).toBe(
      'Updated description'
    );
    expect(next[0]?.governance_proposal?.snapshot?.votes?.['bob.testnet']).toBe(
      'Approve'
    );
  });
});

describe('sortProtocolApplicationsForFeed', () => {
  const live = (proposalId: number): ProtocolApplication => ({
    app_id: buildProtocolProposalAppId(proposalId),
    label: `#${proposalId}`,
    status: 'approved',
    description: null,
    created_at: `2026-01-${String(proposalId).padStart(2, '0')}T00:00:00.000Z`,
    governance_proposal: {
      proposal_id: proposalId,
      status: 'Approved',
      proposer: 'alice.testnet',
      description: null,
      dao_account: 'dao.testnet',
      tx_hash: null,
      submitted_at: '1',
      snapshot: {
        id: proposalId,
        proposer: 'alice.testnet',
        description: '',
        kind: { Vote: null },
        status: 'Approved',
        vote_counts: {},
        votes: {},
        submission_time: '1',
      },
    },
  });

  const placeholder = (proposalId: number): ProtocolApplication => ({
    app_id: buildProtocolProposalAppId(proposalId),
    label: `#${proposalId}`,
    status: 'rejected',
    description: 'Removed from chain',
    created_at: new Date(0).toISOString(),
    protocol_target_method: 'removed',
    governance_proposal: {
      proposal_id: proposalId,
      status: 'Removed',
      proposer: null,
      description: 'Removed from chain',
      dao_account: 'dao.testnet',
      tx_hash: null,
      submitted_at: null,
      kind: { Removed: null },
      snapshot: {
        id: proposalId,
        proposer: '',
        description: 'Removed from chain',
        kind: { Removed: null },
        status: 'Removed',
        vote_counts: {},
        votes: {},
        submission_time: '',
      },
    },
  });

  it('orders newest live proposals first and placeholders last', () => {
    const sorted = sortProtocolApplicationsForFeed([
      placeholder(16),
      placeholder(17),
      live(53),
      live(56),
      live(55),
    ]);
    expect(sorted.map((row) => row.governance_proposal?.proposal_id)).toEqual([
      56, 55, 53, 17, 16,
    ]);
    expect(isProtocolRemovedFromChainPlaceholder(placeholder(16))).toBe(true);
  });
});

function votedProposal(
  id: number,
  votes: Record<string, ProtocolDaoVote>,
  extras?: { description?: string; status?: ProtocolDaoProposalStatus }
): ProtocolApplication {
  const status = extras?.status ?? 'InProgress';
  const description = extras?.description ?? `Proposal ${id}`;
  return {
    app_id: buildProtocolProposalAppId(id),
    label: `#${id}`,
    status: 'approved',
    description,
    created_at: '2026-01-01T00:00:00.000Z',
    governance_proposal: {
      proposal_id: id,
      status,
      proposer: 'alice.testnet',
      description,
      dao_account: 'dao.testnet',
      tx_hash: null,
      submitted_at: '1',
      snapshot: {
        id,
        proposer: 'alice.testnet',
        description,
        kind: { Vote: null },
        status,
        vote_counts: {},
        votes,
        submission_time: '1',
      },
    },
  };
}

const votedRows = [
  votedProposal(1, { 'ada.testnet': 'Approve' }, { description: 'Roadmap' }),
  votedProposal(2, { 'ADA.testnet': 'Reject' }),
  votedProposal(3, { 'ada.testnet': 'Remove' }, { status: 'Approved' }),
  votedProposal(4, { 'bob.testnet': 'Approve' }, { description: 'Treasury' }),
  votedProposal(5, {}),
];

describe('voted-on proposal drawer', () => {
  it('keeps only proposals the current user has voted on', () => {
    const ids = filterProtocolApplications(votedRows, 'all', {
      votedOnly: true,
      accountId: 'ada.testnet',
    }).map((row) => row.governance_proposal?.proposal_id);

    expect(ids).toEqual([1, 2, 3]);
    expect(viewerVotedOnProtocolApplication(votedRows[1]!, 'Ada.Testnet')).toBe(
      true
    );
    expect(viewerVotedOnProtocolApplication(votedRows[3]!, 'ada.testnet')).toBe(
      false
    );
    expect(viewerVotedOnProtocolApplication(votedRows[0]!, null)).toBe(false);
    expect(viewerVotedOnProtocolApplication(votedRows[0]!, '  ')).toBe(false);
  });

  it('leaves the existing list, search, and status filters unchanged', () => {
    expect(
      filterProtocolApplications(votedRows, 'all').map(
        (row) => row.governance_proposal?.proposal_id
      )
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      filterProtocolApplications(votedRows, 'all', {
        searchQuery: 'treasury',
      }).map((row) => row.governance_proposal?.proposal_id)
    ).toEqual([4]);
    expect(
      filterProtocolApplications(votedRows, 'open').map(
        (row) => row.governance_proposal?.proposal_id
      )
    ).toEqual([1, 2, 4, 5]);
    expect(
      filterProtocolApplications(votedRows, 'all', { family: 'config' }).map(
        (row) => row.governance_proposal?.proposal_id
      )
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      filterProtocolApplications(votedRows, 'all', {
        family: 'treasury',
        votedOnly: true,
        accountId: 'ada.testnet',
      })
    ).toEqual([]);
    expect(
      filterProtocolApplications(votedRows, 'approved', {
        votedOnly: true,
        accountId: 'ada.testnet',
      }).map((row) => row.governance_proposal?.proposal_id)
    ).toEqual([3]);
    expect(
      filterProtocolApplications(votedRows, 'all', {
        votedOnly: true,
        accountId: 'ada.testnet',
        searchQuery: 'roadmap',
      }).map((row) => row.governance_proposal?.proposal_id)
    ).toEqual([1]);
  });

  it('uses the skeleton until the drawer is ready, then only voted rows', () => {
    const loading = resolveProposalDrawerBody({
      feedState: 'loading',
      syncing: true,
      hasPolicy: false,
      configSettled: false,
      applications: votedRows,
      status: 'all',
      votedOnly: true,
      accountId: 'ada.testnet',
    });
    expect(loading).toEqual({ state: 'skeleton' });

    const configPending = resolveProposalDrawerBody({
      feedState: 'ready',
      syncing: false,
      hasPolicy: true,
      configSettled: false,
      applications: votedRows,
      status: 'all',
      votedOnly: true,
      accountId: 'ada.testnet',
    });
    expect(configPending).toEqual({ state: 'skeleton' });

    const ready = resolveProposalDrawerBody({
      feedState: 'ready',
      syncing: true,
      hasPolicy: true,
      configSettled: true,
      applications: votedRows,
      status: 'all',
      searchQuery: '',
      family: 'all',
      votedOnly: true,
      accountId: 'ada.testnet',
    });
    expect(ready.state).toBe('ready');
    if (ready.state !== 'ready') return;
    expect(
      ready.applications.map((row) => row.governance_proposal?.proposal_id)
    ).toEqual([1, 2, 3]);
  });

  it('keeps the error state even when voted rows are already in hand', () => {
    expect(
      resolveProposalDrawerBody({
        feedState: 'error',
        syncing: false,
        hasPolicy: true,
        configSettled: true,
        applications: votedRows,
        status: 'all',
        votedOnly: true,
        accountId: 'ada.testnet',
      })
    ).toEqual({ state: 'error' });
  });
});
