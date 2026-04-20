// ---------------------------------------------------------------------------
// Integration: Groups Governance — proposal reads, votes, tallies, and cancel
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { groupConfigV1 } from '../../src/schema/v1.js';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getClient,
  getClientForAccount,
  testId,
} from './helpers.js';

describe('groups governance', () => {
  let os: OnSocial;
  let voterOs: OnSocial;
  const voterId = 'test02.onsocial.testnet';
  const groupId = `grp_gov_${testId()}`;
  const inviteDescription = `Invite voter ${testId()}`;
  const proposalTitle = `SDK governance ${testId()}`;
  const cancelTitle = `SDK cancel ${testId()}`;
  let inviteProposalId = '';
  let inviteSequence = 0;
  let proposalId = '';
  let proposalSequence = 0;
  let cancelProposalId = '';
  let cancelProposalSequence = 0;

  beforeAll(async () => {
    os = await getClient();
    voterOs = await getClientForAccount(voterId);
  });

  it('should create a member-driven governance group', async () => {
    const result = await os.groups.create(
      groupId,
      groupConfigV1({
        name: `Governance ${groupId}`,
        description: 'SDK governance integration test group',
        isPrivate: true,
        memberDriven: true,
        tags: ['integration', 'sdk', 'governance'],
      })
    );

    expect(result).toBeTruthy();

    const config = await confirmDirect(
      async () => {
        const value = await os.groups.getConfig(groupId);
        return value?.name === `Governance ${groupId}` ? value : null;
      },
      'governance group config'
    );

    expect(config?.name).toBe(`Governance ${groupId}`);
    expect(config?.member_driven ?? config?.memberDriven).toBe(true);
    expect(config?.is_private ?? config?.isPrivate).toBe(true);
  }, 25_000);

  it('should create and auto-execute a member invite proposal for the second voter', async () => {
    const before = await os.groups.getProposalCount(groupId);
    inviteSequence = before + 1;

    const result = await os.groups.propose(
      groupId,
      'member_invite',
      { target_user: voterId },
      {
        autoVote: true,
        description: inviteDescription,
      }
    );

    expect(result).toBeTruthy();

    const proposal = await confirmDirect(
      async () => {
        const [count, value] = await Promise.all([
          os.groups.getProposalCount(groupId),
          os.groups.getProposalBySequence(groupId, inviteSequence),
        ]);
        return count >= inviteSequence && value?.sequence_number === inviteSequence
          ? value
          : null;
      },
      'invite proposal'
    );

    inviteProposalId = proposal?.id ?? '';

    expect(inviteProposalId).toBeTruthy();
    expect(proposal?.type).toBe('member_invite');
    expect(proposal?.status).toBe('executed');
  }, 30_000);

  it('should add the invited voter as a member after the invite proposal executes', async () => {
    const isMember = await confirmDirect(
      async () => ((await os.groups.isMember(groupId, voterId)) ? true : null),
      'invited voter membership'
    );

    expect(isMember).toBe(true);
  }, 25_000);

  it('should emit a proposal_created event for the invite proposal', async () => {
    const result = await confirmIndexed(
      async () => {
        const value = await os.query.graphql<{
          groupUpdates: Array<{
            groupId: string;
            proposalId: string;
            proposalType: string;
            operation: string;
            author: string;
          }>;
        }>({
          query: `query InviteProposalCreated($groupId: String!, $proposalId: String!, $author: String!) {
            groupUpdates(
              where: {
                groupId: {_eq: $groupId},
                proposalId: {_eq: $proposalId},
                author: {_eq: $author},
                operation: {_eq: "proposal_created"}
              },
              limit: 1,
              orderBy: [{blockHeight: DESC}]
            ) {
              groupId
              proposalId
              proposalType
              operation
              author
            }
          }`,
          variables: {
            groupId,
            proposalId: inviteProposalId,
            author: ACCOUNT_ID,
          },
        });
        return value.data?.groupUpdates?.[0] ?? null;
      },
      'invite proposal created event'
    );

    expect(result?.groupId).toBe(groupId);
    expect(result?.proposalId).toBe(inviteProposalId);
    expect(result?.proposalType).toBe('member_invite');
    expect(result?.operation).toBe('proposal_created');
  }, 35_000);

  it('should create an active custom proposal with the proposer auto-vote recorded', async () => {
    const before = await os.groups.getProposalCount(groupId);
    proposalSequence = before + 1;

    const result = await os.groups.propose(
      groupId,
      'custom_proposal',
      {
        title: proposalTitle,
        description: 'SDK governance approval flow',
        custom_data: { source: 'sdk-integration', kind: 'approval' },
      },
      {
        autoVote: true,
        description: 'Approval flow proposal',
      }
    );

    expect(result).toBeTruthy();

    const proposal = await confirmDirect(
      async () => {
        const [count, value] = await Promise.all([
          os.groups.getProposalCount(groupId),
          os.groups.getProposalBySequence(groupId, proposalSequence),
        ]);
        return count >= proposalSequence && value?.sequence_number === proposalSequence
          ? value
          : null;
      },
      'active custom proposal'
    );

    proposalId = proposal?.id ?? '';

    expect(proposalId).toBeTruthy();
    expect(proposal?.type).toBe('custom_proposal');
    expect(proposal?.status).toBe('active');
    expect(proposal?.proposer).toBe(ACCOUNT_ID);
    expect(proposal?.title).toBe(proposalTitle);
    expect(proposal?.data?.CustomProposal?.title).toBe(proposalTitle);
  }, 30_000);

  it('should expose proposal reads via getProposal, getProposalBySequence, listProposals, tally, and owner vote', async () => {
    const state = await confirmDirect(
      async () => {
        const [proposal, bySequence, list, tally, ownerVote] = await Promise.all([
          os.groups.getProposal(groupId, proposalId),
          os.groups.getProposalBySequence(groupId, proposalSequence),
          os.groups.listProposals(groupId, { limit: 20 }),
          os.groups.getProposalTally(groupId, proposalId),
          os.groups.getVote(groupId, proposalId, ACCOUNT_ID),
        ]);

        const listed = list.find((item) => item.id === proposalId);
        return proposal && bySequence && listed && tally && ownerVote
          ? { proposal, bySequence, listed, tally, ownerVote }
          : null;
      },
      'proposal read endpoints'
    );

    expect(state?.proposal.id).toBe(proposalId);
    expect(state?.bySequence.id).toBe(proposalId);
    expect(state?.listed.id).toBe(proposalId);
    expect(state?.tally.yes_votes).toBeGreaterThanOrEqual(1);
    expect(state?.tally.total_votes).toBeGreaterThanOrEqual(1);
    expect(state?.tally.locked_member_count).toBeGreaterThanOrEqual(2);
    expect(state?.ownerVote.voter).toBe(ACCOUNT_ID);
    expect(state?.ownerVote.approve).toBe(true);
  }, 30_000);

  it('should emit a proposal_created event for the active custom proposal', async () => {
    const result = await confirmIndexed(
      async () => {
        const value = await os.query.graphql<{
          groupUpdates: Array<{
            groupId: string;
            proposalId: string;
            proposalType: string;
            operation: string;
            author: string;
          }>;
        }>({
          query: `query CustomProposalCreated($groupId: String!, $proposalId: String!, $author: String!) {
            groupUpdates(
              where: {
                groupId: {_eq: $groupId},
                proposalId: {_eq: $proposalId},
                author: {_eq: $author},
                operation: {_eq: "proposal_created"}
              },
              limit: 1,
              orderBy: [{blockHeight: DESC}]
            ) {
              groupId
              proposalId
              proposalType
              operation
              author
            }
          }`,
          variables: {
            groupId,
            proposalId,
            author: ACCOUNT_ID,
          },
        });
        return value.data?.groupUpdates?.[0] ?? null;
      },
      'custom proposal created event'
    );

    expect(result?.groupId).toBe(groupId);
    expect(result?.proposalId).toBe(proposalId);
    expect(result?.proposalType).toBe('custom_proposal');
    expect(result?.author).toBe(ACCOUNT_ID);
  }, 35_000);

  it('should let the second voter approve the active proposal', async () => {
    const result = await voterOs.groups.vote(groupId, proposalId, true);
    expect(result).toBeTruthy();
  });

  it('should execute the approved proposal and expose the second voter vote', async () => {
    const state = await confirmDirect(
      async () => {
        const [proposal, tally, vote] = await Promise.all([
          os.groups.getProposal(groupId, proposalId),
          os.groups.getProposalTally(groupId, proposalId),
          os.groups.getVote(groupId, proposalId, voterId),
        ]);

        return proposal?.status === 'executed' && tally && vote
          ? { proposal, tally, vote }
          : null;
      },
      'executed governance proposal'
    );

    expect(state?.proposal.status).toBe('executed');
    expect(state?.vote.voter).toBe(voterId);
    expect(state?.vote.approve).toBe(true);
    expect(state?.tally.total_votes).toBeGreaterThanOrEqual(2);
    expect(state?.tally.yes_votes).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('should emit indexed vote_cast and executed status events for the approved proposal', async () => {
    const state = await confirmIndexed(
      async () => {
        const value = await os.query.graphql<{
          votes: Array<{
            groupId: string;
            proposalId: string;
            operation: string;
            voter: string;
            approve: boolean;
          }>;
          statuses: Array<{
            groupId: string;
            proposalId: string;
            operation: string;
            status: string;
          }>;
        }>({
          query: `query ProposalExecution($groupId: String!, $proposalId: String!, $voter: String!) {
            votes: groupUpdates(
              where: {
                groupId: {_eq: $groupId},
                proposalId: {_eq: $proposalId},
                voter: {_eq: $voter},
                operation: {_eq: "vote_cast"}
              },
              limit: 1,
              orderBy: [{blockHeight: DESC}]
            ) {
              groupId
              proposalId
              operation
              voter
              approve
            }
            statuses: groupUpdates(
              where: {
                groupId: {_eq: $groupId},
                proposalId: {_eq: $proposalId},
                operation: {_eq: "proposal_status_updated"},
                status: {_eq: "executed"}
              },
              limit: 1,
              orderBy: [{blockHeight: DESC}]
            ) {
              groupId
              proposalId
              operation
              status
            }
          }`,
          variables: {
            groupId,
            proposalId,
            voter: voterId,
          },
        });

        const vote = value.data?.votes?.[0];
        const status = value.data?.statuses?.[0];
        return vote && status ? { vote, status } : null;
      },
      'proposal execution events'
    );

    expect(state?.vote.groupId).toBe(groupId);
    expect(state?.vote.proposalId).toBe(proposalId);
    expect(state?.vote.voter).toBe(voterId);
    expect(state?.vote.approve).toBe(true);
    expect(state?.status.groupId).toBe(groupId);
    expect(state?.status.proposalId).toBe(proposalId);
    expect(state?.status.status).toBe('executed');
  }, 40_000);

  it('should create a cancellable custom proposal without auto-voting', async () => {
    const before = await os.groups.getProposalCount(groupId);
    cancelProposalSequence = before + 1;

    const result = await os.groups.propose(
      groupId,
      'custom_proposal',
      {
        title: cancelTitle,
        description: 'SDK governance cancel flow',
        custom_data: { source: 'sdk-integration', kind: 'cancel' },
      },
      {
        autoVote: false,
        description: 'Cancel flow proposal',
      }
    );

    expect(result).toBeTruthy();

    const proposal = await confirmDirect(
      async () => {
        const [count, value, tally] = await Promise.all([
          os.groups.getProposalCount(groupId),
          os.groups.getProposalBySequence(groupId, cancelProposalSequence),
          os.groups.getProposalTally(groupId, cancelProposalId || 'pending'),
        ]).catch(async () => {
          const count = await os.groups.getProposalCount(groupId);
          const value = await os.groups.getProposalBySequence(groupId, cancelProposalSequence);
          return [count, value, null] as const;
        });

        if (count < cancelProposalSequence || !value) return null;
        return value.status === 'active' ? value : null;
      },
      'cancellable proposal'
    );

    cancelProposalId = proposal?.id ?? '';

    expect(cancelProposalId).toBeTruthy();
    expect(proposal?.status).toBe('active');
  }, 30_000);

  it('should cancel the active proposal', async () => {
    const result = await os.groups.cancelProposal(groupId, cancelProposalId);
    expect(result).toBeTruthy();
  });

  it('should expose the cancelled proposal state', async () => {
    const proposal = await confirmDirect(
      async () => {
        const value = await os.groups.getProposal(groupId, cancelProposalId);
        return value?.status === 'cancelled' ? value : null;
      },
      'cancelled proposal'
    );

    expect(proposal?.id).toBe(cancelProposalId);
    expect(proposal?.status).toBe('cancelled');
  }, 25_000);

  it('should emit a cancelled proposal_status_updated event', async () => {
    const result = await confirmIndexed(
      async () => {
        const value = await os.query.graphql<{
          groupUpdates: Array<{
            groupId: string;
            proposalId: string;
            operation: string;
            status: string;
          }>;
        }>({
          query: `query ProposalCancelled($groupId: String!, $proposalId: String!) {
            groupUpdates(
              where: {
                groupId: {_eq: $groupId},
                proposalId: {_eq: $proposalId},
                operation: {_eq: "proposal_status_updated"},
                status: {_eq: "cancelled"}
              },
              limit: 1,
              orderBy: [{blockHeight: DESC}]
            ) {
              groupId
              proposalId
              operation
              status
            }
          }`,
          variables: {
            groupId,
            proposalId: cancelProposalId,
          },
        });
        return value.data?.groupUpdates?.[0] ?? null;
      },
      'cancelled proposal status event'
    );

    expect(result?.groupId).toBe(groupId);
    expect(result?.proposalId).toBe(cancelProposalId);
    expect(result?.operation).toBe('proposal_status_updated');
    expect(result?.status).toBe('cancelled');
  }, 35_000);
});