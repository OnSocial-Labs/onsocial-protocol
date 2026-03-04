// ---------------------------------------------------------------------------
// Shared types for the rewards backend
// ---------------------------------------------------------------------------

/** Source that triggered the reward. */
export type RewardSource = 'telegram';

/** Specific action that earned the reward. */
export type RewardAction = 'message' | 'reaction';

/** Status of a reward credit record. */
export type CreditStatus = 'pending' | 'credited' | 'capped' | 'failed';

/** A single reward credit event stored in the database. */
export interface CreditRecord {
  id: number;
  accountId: string;
  source: RewardSource;
  action: RewardAction;
  amount: string;
  sourceRef: string;
  status: CreditStatus;
  txHash: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

/** Telegram user ↔ NEAR account link. */
export interface UserLink {
  telegramId: number;
  accountId: string;
  linkedAt: Date;
}

/** Result of attempting to credit a reward. */
export type CreditResult = 'credited' | 'duplicate' | 'capped' | 'failed';

/** Tracked activity for a user who hasn't linked a NEAR account yet. */
export interface PendingActivity {
  id: number;
  telegramId: number;
  source: RewardSource;
  action: RewardAction;
  sourceRef: string;
  createdAt: Date;
}
