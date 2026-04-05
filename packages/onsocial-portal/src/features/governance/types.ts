export interface GovernanceProposal {
  proposal_id: number | null;
  status: string;
  proposer?: string | null;
  description: string | null;
  dao_account: string | null;
  tx_hash: string | null;
  submitted_at: string | null;
  payload?: unknown;
}

export type GovernanceScope = 'partners' | 'protocol';

export type ProtocolGovernanceKind =
  | 'upgrade'
  | 'treasury'
  | 'permissions'
  | 'config';

export type GovernanceDaoProposalStatus =
  | 'InProgress'
  | 'Approved'
  | 'Rejected'
  | 'Removed'
  | 'Expired'
  | 'Moved'
  | 'Failed';

export type GovernanceDaoVote = 'Approve' | 'Reject' | 'Remove';

export interface GovernanceDaoProposal {
  id?: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: GovernanceDaoProposalStatus;
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, GovernanceDaoVote>;
  submission_time: string;
  last_actions_log?: Array<{
    block_height: string;
  }>;
}

export interface GovernanceDaoRole {
  name?: string;
  kind?: {
    Group?: string[];
    Member?: string;
  };
  permissions?: string[];
  vote_policy?: Record<string, GovernanceDaoVotePolicy>;
}

export interface GovernanceDaoPolicy {
  roles?: GovernanceDaoRole[];
  default_vote_policy?: GovernanceDaoVotePolicy;
  proposal_period?: string;
}

export interface GovernanceDaoVotePolicy {
  quorum: string;
  threshold: [number, number] | string;
  weight_kind: 'RoleWeight' | 'TokenWeight';
}

export type GovernanceDaoAction =
  | 'VoteApprove'
  | 'VoteReject'
  | 'VoteRemove'
  | 'Finalize';

export interface Application {
  app_id: string;
  label: string;
  status:
    | 'pending'
    | 'ready_for_governance'
    | 'proposal_submitted'
    | 'approved'
    | 'rejected'
    | 'reopened';
  wallet_id: string | null;
  description: string | null;
  website_url: string | null;
  telegram_handle: string | null;
  x_handle: string | null;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  governance_scope?: GovernanceScope;
  protocol_kind?: ProtocolGovernanceKind | null;
  protocol_subject?: string | null;
  protocol_target_account?: string | null;
  protocol_target_method?: string | null;
  governance_proposal: GovernanceProposal | null;
}

export interface ParamErrors {
  rewardPerAction?: string;
  dailyCap?: string;
  totalBudget?: string;
  dailyBudget?: string;
}

export interface ContractParams {
  rewardPerAction: string;
  dailyCap: string;
  totalBudget: string;
  dailyBudget: string;
}

export type GovernanceCreationStatus =
  | 'idle'
  | 'creating'
  | 'draft'
  | 'submitted'
  | 'error';
