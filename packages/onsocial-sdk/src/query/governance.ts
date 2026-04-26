// ---------------------------------------------------------------------------
// Governance event queries (proposals, votes, members, join requests).
// Accessed as `os.query.governance.<method>()`.
//
// Backed by the `group_updates` table populated by substreams. Returns the
// historical event stream emitted by the core contract for everything that
// happens inside a group: proposals being created / voted on / finalized,
// members being added / removed / banned / unbanned, join requests being
// submitted / approved / rejected, and so on.
//
// For *current* on-chain state (e.g. "what is this proposal's tally now?",
// "who is currently a member?") use the direct view methods on `os.groups`
// (`getProposal`, `getProposalTally`, `listProposals`, `isMember`, ...).
// Use the helpers here when you need history, cross-account analytics, or
// to build activity feeds.
// ---------------------------------------------------------------------------

import type { QueryModule } from './index.js';

/**
 * A single row from `group_updates`. Most columns are sparse — they're only
 * populated for the relevant operation types — so consumers should branch on
 * `operation` (and `proposal_type` / `update_type` where applicable).
 */
export interface GovernanceEventRow {
  /** Operation tag (see {@link GOVERNANCE_OPERATIONS}). */
  operation: string;
  /** The account that signed the originating transaction. */
  author: string;
  /** Group this event belongs to (always set for governance ops). */
  groupId: string | null;
  /** Block this event was indexed at. */
  blockHeight: number;
  blockTimestamp: number;

  // ── Proposal fields ────────────────────────────────────────────────────
  proposalId: string | null;
  proposalType: string | null;
  status: string | null;
  sequenceNumber: number | null;
  title: string | null;
  description: string | null;
  autoVote: boolean | null;
  createdAt: number | null;
  expiresAt: number | null;
  lockedMemberCount: number | null;
  lockedDeposit: string | null;

  // ── Vote fields ────────────────────────────────────────────────────────
  voter: string | null;
  approve: boolean | null;
  yesVotes: number | null;
  noVotes: number | null;
  totalVotes: number | null;
  shouldExecute: boolean | null;
  shouldReject: boolean | null;
  votedAt: number | null;

  // ── Member / role fields ───────────────────────────────────────────────
  memberId: string | null;
  role: string | null;
  level: number | null;

  // ── Path / value (raw write payload, JSON string) ──────────────────────
  path: string | null;
  value: string | null;

  /** Full JSON payload for forward-compat (unrecognised operations). */
  extraData: string | null;
}

const GOVERNANCE_EVENT_FIELDS = `
  operation
  author
  groupId
  blockHeight
  blockTimestamp
  proposalId
  proposalType
  status
  sequenceNumber
  title
  description
  autoVote
  createdAt
  expiresAt
  lockedMemberCount
  lockedDeposit
  voter
  approve
  yesVotes
  noVotes
  totalVotes
  shouldExecute
  shouldReject
  votedAt
  memberId
  role
  level
  path
  value
  extraData
`;

// ── Operation taxonomy ─────────────────────────────────────────────────────
// These are the literal `operation` strings emitted by the core contract.
// Exported for callers that want to filter manually via `os.query.graphql`.

const PROPOSAL_CREATED_OPS = ['proposal_created'];
const PROPOSAL_STATUS_OPS = ['proposal_status_updated'];
const VOTE_OPS = ['vote_cast'];

const MEMBER_ADD_OPS = ['add_member'];
const MEMBER_REMOVE_OPS = ['remove_member'];
const MEMBER_INVITE_OPS = ['member_invited'];
const MEMBER_BLACKLIST_OPS = ['add_to_blacklist'];
const MEMBER_UNBLACKLIST_OPS = ['remove_from_blacklist'];
const MEMBER_OPS = [
  ...MEMBER_ADD_OPS,
  ...MEMBER_REMOVE_OPS,
  ...MEMBER_INVITE_OPS,
  ...MEMBER_BLACKLIST_OPS,
  ...MEMBER_UNBLACKLIST_OPS,
];

const JOIN_REQUEST_SUBMITTED = ['join_request_submitted'];
const JOIN_REQUEST_APPROVED = ['join_request_approved'];
const JOIN_REQUEST_REJECTED = ['join_request_rejected'];
const JOIN_REQUEST_CANCELLED = ['join_request_cancelled'];
const JOIN_REQUEST_OPS = [
  ...JOIN_REQUEST_SUBMITTED,
  ...JOIN_REQUEST_APPROVED,
  ...JOIN_REQUEST_REJECTED,
  ...JOIN_REQUEST_CANCELLED,
];

export const GOVERNANCE_OPERATIONS = {
  PROPOSAL_CREATED: PROPOSAL_CREATED_OPS,
  PROPOSAL_STATUS_UPDATED: PROPOSAL_STATUS_OPS,
  VOTE_CAST: VOTE_OPS,
  MEMBER_ADD: MEMBER_ADD_OPS,
  MEMBER_REMOVE: MEMBER_REMOVE_OPS,
  MEMBER_INVITE: MEMBER_INVITE_OPS,
  MEMBER_BLACKLIST: MEMBER_BLACKLIST_OPS,
  MEMBER_UNBLACKLIST: MEMBER_UNBLACKLIST_OPS,
  MEMBER_ALL: MEMBER_OPS,
  JOIN_REQUEST_SUBMITTED,
  JOIN_REQUEST_APPROVED,
  JOIN_REQUEST_REJECTED,
  JOIN_REQUEST_CANCELLED,
  JOIN_REQUEST_ALL: JOIN_REQUEST_OPS,
} as const;

export class GovernanceQuery {
  constructor(private _q: QueryModule) {}

  /**
   * Proposals created in a group (operation = `proposal_created`), newest
   * first.
   *
   * ```ts
   * const created = await os.query.governance.proposals('dao', {
   *   proposalType: 'custom_proposal',
   *   limit: 20,
   * });
   * ```
   */
  async proposals(
    groupId: string,
    opts: { proposalType?: string; limit?: number; offset?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const variables: Record<string, unknown> = {
      groupId,
      ops: PROPOSAL_CREATED_OPS,
      limit,
      offset,
    };
    const typeFilter = opts.proposalType
      ? ', proposalType: {_eq: $proposalType}'
      : '';
    if (opts.proposalType) variables.proposalType = opts.proposalType;
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query Proposals($groupId: String!, $ops: [String!]!, $limit: Int!, $offset: Int!${
        opts.proposalType ? ', $proposalType: String!' : ''
      }) {
        groupUpdates(
          where: { groupId: {_eq: $groupId}, operation: {_in: $ops}${typeFilter} },
          limit: $limit,
          offset: $offset,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Full event timeline for a single proposal — the `proposal_created` row,
   * every `vote_cast`, and any `proposal_status_updated` finalization.
   * Returned in chronological order.
   *
   * ```ts
   * const timeline = await os.query.governance.proposal('dao', proposalId);
   * ```
   */
  async proposal(
    groupId: string,
    proposalId: string,
    opts: { limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query Proposal($groupId: String!, $proposalId: String!, $limit: Int!) {
        groupUpdates(
          where: {
            groupId: {_eq: $groupId},
            proposalId: {_eq: $proposalId}
          },
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables: { groupId, proposalId, limit: opts.limit ?? 200 },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * All proposals authored by an account (across every group), newest first.
   *
   * ```ts
   * const mine = await os.query.governance.proposalsBy('alice.near');
   * ```
   */
  async proposalsBy(
    proposer: string,
    opts: { groupId?: string; limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const variables: Record<string, unknown> = {
      author: proposer,
      ops: PROPOSAL_CREATED_OPS,
      limit: opts.limit ?? 50,
    };
    const groupFilter = opts.groupId ? ', groupId: {_eq: $groupId}' : '';
    if (opts.groupId) variables.groupId = opts.groupId;
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query ProposalsBy($author: String!, $ops: [String!]!, $limit: Int!${
        opts.groupId ? ', $groupId: String!' : ''
      }) {
        groupUpdates(
          where: { author: {_eq: $author}, operation: {_in: $ops}${groupFilter} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Proposal-status finalization events (`proposal_status_updated`) for a
   * group — typically the executed/cancelled/rejected/expired transitions.
   * Filter by `status` to see only one outcome.
   *
   * ```ts
   * const executed = await os.query.governance.proposalStatusUpdates('dao', {
   *   status: 'executed',
   * });
   * ```
   */
  async proposalStatusUpdates(
    groupId: string,
    opts: { status?: string; limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const variables: Record<string, unknown> = {
      groupId,
      ops: PROPOSAL_STATUS_OPS,
      limit: opts.limit ?? 50,
    };
    const statusFilter = opts.status ? ', status: {_eq: $status}' : '';
    if (opts.status) variables.status = opts.status;
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query ProposalStatusUpdates($groupId: String!, $ops: [String!]!, $limit: Int!${
        opts.status ? ', $status: String!' : ''
      }) {
        groupUpdates(
          where: { groupId: {_eq: $groupId}, operation: {_in: $ops}${statusFilter} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Every `vote_cast` event for a single proposal, in chronological order.
   *
   * ```ts
   * const votes = await os.query.governance.votes('dao', proposalId);
   * ```
   */
  async votes(
    groupId: string,
    proposalId: string,
    opts: { limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query Votes($groupId: String!, $proposalId: String!, $ops: [String!]!, $limit: Int!) {
        groupUpdates(
          where: {
            groupId: {_eq: $groupId},
            proposalId: {_eq: $proposalId},
            operation: {_in: $ops}
          },
          limit: $limit,
          orderBy: [{blockHeight: ASC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables: {
        groupId,
        proposalId,
        ops: VOTE_OPS,
        limit: opts.limit ?? 200,
      },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Voting history for an account — every `vote_cast` they signed.
   * Optionally scoped to a single group.
   *
   * ```ts
   * const history = await os.query.governance.votesBy('alice.near');
   * ```
   */
  async votesBy(
    voter: string,
    opts: { groupId?: string; limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const variables: Record<string, unknown> = {
      voter,
      ops: VOTE_OPS,
      limit: opts.limit ?? 50,
    };
    const groupFilter = opts.groupId ? ', groupId: {_eq: $groupId}' : '';
    if (opts.groupId) variables.groupId = opts.groupId;
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query VotesBy($voter: String!, $ops: [String!]!, $limit: Int!${
        opts.groupId ? ', $groupId: String!' : ''
      }) {
        groupUpdates(
          where: { voter: {_eq: $voter}, operation: {_in: $ops}${groupFilter} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables,
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Membership change events for a group (add / remove / invite / blacklist /
   * unblacklist), newest first.
   *
   * ```ts
   * const changes = await os.query.governance.members('dao');
   * ```
   */
  async members(
    groupId: string,
    opts: { limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query GroupMembers($groupId: String!, $ops: [String!]!, $limit: Int!) {
        groupUpdates(
          where: { groupId: {_eq: $groupId}, operation: {_in: $ops} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables: { groupId, ops: MEMBER_OPS, limit: opts.limit ?? 100 },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Membership timeline for a single account inside a group — every
   * add / remove / invite / blacklist / unblacklist event where the account
   * is the subject (`memberId`).
   */
  async memberHistory(
    groupId: string,
    memberId: string,
    opts: { limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query MemberHistory($groupId: String!, $memberId: String!, $ops: [String!]!, $limit: Int!) {
        groupUpdates(
          where: {
            groupId: {_eq: $groupId},
            memberId: {_eq: $memberId},
            operation: {_in: $ops}
          },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables: {
        groupId,
        memberId,
        ops: MEMBER_OPS,
        limit: opts.limit ?? 50,
      },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Join request events for a group (submitted / approved / rejected /
   * cancelled). Pass `status` to narrow to one stage.
   *
   * ```ts
   * const pending = await os.query.governance.joinRequests('dao', {
   *   status: 'submitted',
   * });
   * ```
   */
  async joinRequests(
    groupId: string,
    opts: {
      status?: 'submitted' | 'approved' | 'rejected' | 'cancelled';
      limit?: number;
    } = {}
  ): Promise<GovernanceEventRow[]> {
    let ops: string[] = JOIN_REQUEST_OPS;
    if (opts.status === 'submitted') ops = JOIN_REQUEST_SUBMITTED;
    else if (opts.status === 'approved') ops = JOIN_REQUEST_APPROVED;
    else if (opts.status === 'rejected') ops = JOIN_REQUEST_REJECTED;
    else if (opts.status === 'cancelled') ops = JOIN_REQUEST_CANCELLED;
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query JoinRequests($groupId: String!, $ops: [String!]!, $limit: Int!) {
        groupUpdates(
          where: { groupId: {_eq: $groupId}, operation: {_in: $ops} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables: { groupId, ops, limit: opts.limit ?? 50 },
    });
    return res.data?.groupUpdates ?? [];
  }

  /**
   * Full event stream for a group (every operation), newest first. Useful
   * for activity feeds; consumers should branch on `operation`.
   *
   * ```ts
   * const feed = await os.query.governance.activity('dao', { limit: 200 });
   * ```
   */
  async activity(
    groupId: string,
    opts: { limit?: number } = {}
  ): Promise<GovernanceEventRow[]> {
    const res = await this._q.graphql<{
      groupUpdates: GovernanceEventRow[];
    }>({
      query: `query GroupActivity($groupId: String!, $limit: Int!) {
        groupUpdates(
          where: { groupId: {_eq: $groupId} },
          limit: $limit,
          orderBy: [{blockHeight: DESC}]
        ) { ${GOVERNANCE_EVENT_FIELDS} }
      }`,
      variables: { groupId, limit: opts.limit ?? 100 },
    });
    return res.data?.groupUpdates ?? [];
  }
}
