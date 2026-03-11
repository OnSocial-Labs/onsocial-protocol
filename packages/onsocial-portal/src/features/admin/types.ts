export interface Application {
  app_id: string;
  label: string;
  status: string;
  wallet_id: string | null;
  description: string | null;
  expected_users: string | null;
  contact: string | null;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
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

export type ChainStatus =
  | 'idle'
  | 'registering'
  | 'done'
  | 'error'
  | 'skipped';