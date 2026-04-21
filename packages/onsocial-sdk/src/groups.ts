// ---------------------------------------------------------------------------
// OnSocial SDK — groups module (lifecycle, membership, governance)
// ---------------------------------------------------------------------------

import type { HttpClient } from './http.js';
import { resolveContractId } from './contracts.js';
import type { GroupConfigV1 } from './schema/v1.js';
import type {
  CustomProposalInput,
  GroupMemberData,
  GroupPostRef,
  GroupStats,
  JoinRequest,
  ListProposalsOptions,
  PostData,
  Proposal,
  ProposalCreateOptions,
  ProposalTally,
  RelayResponse,
  Vote,
  TransferOwnershipProposalOptions,
} from './types.js';
import {
  buildGroupPostSetData,
  buildGroupPostPath,
  buildGroupQuoteSetData,
  buildGroupReplySetData,
} from './social.js';

/**
 * Groups — lifecycle, membership, governance, and group content.
 *
 * ```ts
 * // Create a group
 * await os.groups.create('dao', { owner: 'alice.near', member_driven: true });
 *
 * // Manage members
 * await os.groups.join('dao');
 * await os.groups.addMember('dao', 'bob.near');
 *
 * // Governance
 * await os.groups.propose('dao', 'CustomProposal', {
 *   title: 'Upgrade logo',
 *   description: 'New branding',
 *   custom_data: {},
 * });
 * await os.groups.vote('dao', proposalId, true);
 *
 * // Read group state
 * const config = await os.groups.getConfig('dao');
 * const stats = await os.groups.getStats('dao');
 * const isMember = await os.groups.isMember('dao', 'bob.near');
 * ```
 */
export class GroupsModule {
  private _coreContract: string;

  constructor(private _http: HttpClient) {
    this._coreContract = resolveContractId(_http.network, 'core');
  }

  private execute(action: Record<string, unknown>): Promise<RelayResponse> {
    return this._http.post<RelayResponse>('/relay/execute', {
      action,
      target_account: this._coreContract,
    });
  }

  private normalizeConfig(config: GroupConfigV1): Record<string, unknown> {
    const { isPrivate, memberDriven, ...rest } = config;
    return {
      ...rest,
      is_private: isPrivate,
      ...(memberDriven !== undefined && { member_driven: memberDriven }),
    };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async create(groupId: string, config: GroupConfigV1): Promise<RelayResponse> {
    return this.execute({
      type: 'create_group',
      group_id: groupId,
      config: this.normalizeConfig(config),
    });
  }

  async join(groupId: string): Promise<RelayResponse> {
    return this.execute({ type: 'join_group', group_id: groupId });
  }

  async leave(groupId: string): Promise<RelayResponse> {
    return this.execute({ type: 'leave_group', group_id: groupId });
  }

  // ── Member management ─────────────────────────────────────────────────

  async addMember(groupId: string, memberId: string): Promise<RelayResponse> {
    return this.execute({
      type: 'add_group_member',
      group_id: groupId,
      member_id: memberId,
    });
  }

  async removeMember(
    groupId: string,
    memberId: string
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'remove_group_member',
      group_id: groupId,
      member_id: memberId,
    });
  }

  async approveJoin(
    groupId: string,
    requesterId: string
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'approve_join_request',
      group_id: groupId,
      requester_id: requesterId,
    });
  }

  async rejectJoin(
    groupId: string,
    requesterId: string,
    reason?: string
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'reject_join_request',
      group_id: groupId,
      requester_id: requesterId,
      ...(reason !== undefined && { reason }),
    });
  }

  async cancelJoin(groupId: string): Promise<RelayResponse> {
    return this.execute({ type: 'cancel_join_request', group_id: groupId });
  }

  async blacklist(groupId: string, memberId: string): Promise<RelayResponse> {
    return this.execute({
      type: 'blacklist_group_member',
      group_id: groupId,
      member_id: memberId,
    });
  }

  async unblacklist(groupId: string, memberId: string): Promise<RelayResponse> {
    return this.execute({
      type: 'unblacklist_group_member',
      group_id: groupId,
      member_id: memberId,
    });
  }

  async transferOwnership(
    groupId: string,
    newOwner: string,
    removeOldOwner?: boolean
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'transfer_group_ownership',
      group_id: groupId,
      new_owner: newOwner,
      ...(removeOldOwner !== undefined && {
        remove_old_owner: removeOldOwner,
      }),
    });
  }

  async setPrivacy(
    groupId: string,
    isPrivate: boolean
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'set_group_privacy',
      group_id: groupId,
      is_private: isPrivate,
    });
  }

  // ── Group content ─────────────────────────────────────────────────────

  async post(
    groupId: string,
    post: PostData,
    postId?: string
  ): Promise<RelayResponse> {
    const id = postId ?? Date.now().toString();
    const data = buildGroupPostSetData(groupId, post, id);
    const entries = Object.entries(data);
    const [path, value] = entries[0];
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  async reply(
    groupId: string,
    parentPath: string,
    post: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    const id = replyId ?? Date.now().toString();
    const data = buildGroupReplySetData(groupId, parentPath, post, id);
    const [path, value] = Object.entries(data)[0];
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  async replyToPost(
    groupId: string,
    parent: GroupPostRef,
    post: PostData,
    replyId?: string
  ): Promise<RelayResponse> {
    return this.reply(groupId, buildGroupPostPath(parent), post, replyId);
  }

  async quote(
    groupId: string,
    refPath: string,
    post: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    const id = quoteId ?? Date.now().toString();
    const data = buildGroupQuoteSetData(groupId, refPath, post, id);
    const [path, value] = Object.entries(data)[0];
    return this._http.post<RelayResponse>('/compose/set', {
      path,
      value: JSON.stringify(value),
      targetAccount: this._coreContract,
    });
  }

  async quotePost(
    groupId: string,
    ref: GroupPostRef,
    post: PostData,
    quoteId?: string
  ): Promise<RelayResponse> {
    return this.quote(groupId, buildGroupPostPath(ref), post, quoteId);
  }

  // ── Governance ────────────────────────────────────────────────────────

  async propose(
    groupId: string,
    proposalType: string,
    changes: Record<string, unknown>,
    opts?: ProposalCreateOptions
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'create_proposal',
      group_id: groupId,
      proposal_type: proposalType,
      changes,
      ...(opts?.autoVote !== undefined && { auto_vote: opts.autoVote }),
      ...(opts?.description !== undefined && {
        description: opts.description,
      }),
    });
  }

  async proposeInviteMember(
    groupId: string,
    targetUser: string,
    opts?: ProposalCreateOptions & { message?: string }
  ): Promise<RelayResponse> {
    return this.propose(
      groupId,
      'member_invite',
      {
        target_user: targetUser,
        ...(opts?.message !== undefined && { message: opts.message }),
      },
      opts
    );
  }

  async proposeRemoveMember(
    groupId: string,
    targetUser: string,
    opts?: ProposalCreateOptions & { reason?: string }
  ): Promise<RelayResponse> {
    return this.propose(
      groupId,
      'group_update',
      {
        update_type: 'remove_member',
        target_user: targetUser,
        ...(opts?.reason !== undefined && { reason: opts.reason }),
      },
      opts
    );
  }

  async proposeTransferOwnership(
    groupId: string,
    newOwner: string,
    opts?: TransferOwnershipProposalOptions & { reason?: string }
  ): Promise<RelayResponse> {
    return this.propose(
      groupId,
      'group_update',
      {
        update_type: 'transfer_ownership',
        new_owner: newOwner,
        ...(opts?.removeOldOwner !== undefined && {
          remove_old_owner: opts.removeOldOwner,
        }),
        ...(opts?.reason !== undefined && { reason: opts.reason }),
      },
      opts
    );
  }

  async proposeCustom(
    groupId: string,
    proposal: CustomProposalInput,
    opts?: ProposalCreateOptions
  ): Promise<RelayResponse> {
    return this.propose(
      groupId,
      'custom_proposal',
      {
        title: proposal.title,
        ...(proposal.description !== undefined && {
          description: proposal.description,
        }),
        ...(proposal.customData !== undefined && {
          custom_data: proposal.customData,
        }),
      },
      opts
    );
  }

  async vote(
    groupId: string,
    proposalId: string,
    approve: boolean
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'vote_on_proposal',
      group_id: groupId,
      proposal_id: proposalId,
      approve,
    });
  }

  async cancelProposal(
    groupId: string,
    proposalId: string
  ): Promise<RelayResponse> {
    return this.execute({
      type: 'cancel_proposal',
      group_id: groupId,
      proposal_id: proposalId,
    });
  }

  // ── View reads ────────────────────────────────────────────────────────

  async getConfig(groupId: string): Promise<Record<string, unknown> | null> {
    const p = new URLSearchParams({ groupId });
    return this._http.get(`/data/group-config?${p}`);
  }

  async getMember(
    groupId: string,
    memberId: string
  ): Promise<GroupMemberData | null> {
    const p = new URLSearchParams({ groupId, memberId });
    return this._http.get(`/data/group-member?${p}`);
  }

  async isMember(groupId: string, memberId: string): Promise<boolean> {
    const p = new URLSearchParams({ groupId, memberId });
    return this._http.get<boolean>(`/data/group-is-member?${p}`);
  }

  async isOwner(groupId: string, userId: string): Promise<boolean> {
    const p = new URLSearchParams({ groupId, userId });
    return this._http.get<boolean>(`/data/group-is-owner?${p}`);
  }

  async isBlacklisted(groupId: string, userId: string): Promise<boolean> {
    const p = new URLSearchParams({ groupId, userId });
    return this._http.get<boolean>(`/data/group-is-blacklisted?${p}`);
  }

  async getJoinRequest(
    groupId: string,
    requesterId: string
  ): Promise<JoinRequest | null> {
    const p = new URLSearchParams({ groupId, requesterId });
    return this._http.get(`/data/group-join-request?${p}`);
  }

  async getStats(groupId: string): Promise<GroupStats | null> {
    const p = new URLSearchParams({ groupId });
    return this._http.get(`/data/group-stats?${p}`);
  }

  // ── Governance views ──────────────────────────────────────────────────

  async getProposal(
    groupId: string,
    proposalId: string
  ): Promise<Proposal | null> {
    const p = new URLSearchParams({ groupId, proposalId });
    return this._http.get(`/data/proposal?${p}`);
  }

  async getProposalTally(
    groupId: string,
    proposalId: string
  ): Promise<ProposalTally | null> {
    const p = new URLSearchParams({ groupId, proposalId });
    return this._http.get(`/data/proposal-tally?${p}`);
  }

  async getVote(
    groupId: string,
    proposalId: string,
    voter: string
  ): Promise<Vote | null> {
    const p = new URLSearchParams({ groupId, proposalId, voter });
    return this._http.get(`/data/vote?${p}`);
  }

  async getProposalBySequence(
    groupId: string,
    sequence: number
  ): Promise<Proposal | null> {
    const p = new URLSearchParams({
      groupId,
      sequence: String(sequence),
    });
    return this._http.get(`/data/proposal-by-sequence?${p}`);
  }

  async getProposalCount(groupId: string): Promise<number> {
    const p = new URLSearchParams({ groupId });
    return this._http.get<number>(`/data/proposal-count?${p}`);
  }

  async listProposals(
    groupId: string,
    opts?: ListProposalsOptions
  ): Promise<Proposal[]> {
    const p = new URLSearchParams({ groupId });
    if (opts?.fromSequence !== undefined)
      p.set('fromSequence', String(opts.fromSequence));
    if (opts?.limit !== undefined) p.set('limit', String(opts.limit));
    return this._http.get<Proposal[]>(`/data/proposals?${p}`);
  }
}
