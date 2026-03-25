export interface GovernanceProposal {
  proposal_id: number | null;
  status: string;
  description: string | null;
  dao_account: string | null;
  tx_hash: string | null;
  submitted_at: string | null;
  payload?: unknown;
}

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
