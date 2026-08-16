export type ProtocolDaoProposalStatus =
  | 'InProgress'
  | 'Approved'
  | 'Rejected'
  | 'Removed'
  | 'Expired'
  | 'Moved'
  | 'Failed';

export type ProtocolDaoVote = 'Approve' | 'Reject' | 'Remove';

export type ProtocolDaoAction =
  | 'VoteApprove'
  | 'VoteReject'
  | 'VoteRemove'
  | 'Finalize';

export interface ProtocolDaoVotePolicy {
  quorum: string;
  threshold: [number, number] | string;
  weight_kind: 'RoleWeight' | 'TokenWeight';
}

export interface ProtocolDaoRole {
  name?: string;
  kind?: {
    Group?: string[];
    Member?: string;
  };
  permissions?: string[];
  vote_policy?: Record<string, ProtocolDaoVotePolicy>;
}

export interface ProtocolDaoPolicy {
  roles?: ProtocolDaoRole[];
  default_vote_policy?: ProtocolDaoVotePolicy;
  proposal_bond?: string;
  proposal_period?: string;
}

export interface ProtocolDaoProposal {
  id?: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: ProtocolDaoProposalStatus;
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, ProtocolDaoVote>;
  submission_time: string;
  resolved_at?: string | null;
  policy_snapshot?: ProtocolDaoPolicy | null;
}

export interface ProtocolGovernanceProposal {
  proposal_id: number | null;
  status: string;
  proposer?: string | null;
  description: string | null;
  dao_account: string | null;
  tx_hash: string | null;
  submitted_at: string | null;
  kind?: Record<string, unknown> | null;
  snapshot?: ProtocolDaoProposal | null;
}

export interface ProtocolApplication {
  app_id: string;
  label: string;
  status: string;
  description: string | null;
  created_at: string;
  governance_scope?: 'partners' | 'protocol';
  protocol_kind?: string | null;
  protocol_subject?: string | null;
  protocol_target_account?: string | null;
  protocol_target_method?: string | null;
  governance_proposal: ProtocolGovernanceProposal | null;
}

export interface ProtocolFeedResponse {
  applications: ProtocolApplication[];
  daoPolicy: ProtocolDaoPolicy | null;
  daoAccountId: string;
  /** True while backend is still catching up proposal snapshots. */
  syncing?: boolean;
}
