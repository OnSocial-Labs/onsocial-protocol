import { query } from './index.js';
import type {
  CreditRecord,
  CreditStatus,
  PendingActivity,
  RewardAction,
  RewardSource,
  UserLink,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// User links (telegram_id ↔ NEAR account)
// ---------------------------------------------------------------------------

export async function upsertUserLink(
  telegramId: number,
  accountId: string
): Promise<void> {
  await query(
    `INSERT INTO user_links (telegram_id, account_id)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO UPDATE SET account_id = $2`,
    [telegramId, accountId]
  );
}

export async function getUserLink(
  telegramId: number
): Promise<UserLink | null> {
  const { rows } = await query<{
    telegram_id: string;
    account_id: string;
    linked_at: Date;
  }>('SELECT * FROM user_links WHERE telegram_id = $1', [telegramId]);

  if (rows.length === 0) return null;
  return {
    telegramId: Number(rows[0].telegram_id),
    accountId: rows[0].account_id,
    linkedAt: rows[0].linked_at,
  };
}

export async function getAccountByTelegramId(
  telegramId: number
): Promise<string | null> {
  const link = await getUserLink(telegramId);
  return link?.accountId ?? null;
}

// ---------------------------------------------------------------------------
// Reward credits
// ---------------------------------------------------------------------------

export async function insertCredit(params: {
  accountId: string;
  source: RewardSource;
  action: RewardAction;
  amount: string;
  sourceRef: string;
}): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO reward_credits (account_id, source, action, amount, source_ref)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      params.accountId,
      params.source,
      params.action,
      params.amount,
      params.sourceRef,
    ]
  );
  return rows[0].id;
}

export async function isDuplicate(sourceRef: string): Promise<boolean> {
  const { rows } = await query<{ found: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM reward_credits WHERE source_ref = $1) AS found`,
    [sourceRef]
  );
  return rows[0].found;
}

/** Sum of all amounts credited (status != 'capped') for a user today (UTC). */
export async function getDailyTotal(accountId: string): Promise<number> {
  const { rows } = await query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM reward_credits
     WHERE account_id = $1
       AND status = 'credited'
       AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')`,
    [accountId]
  );
  return parseFloat(rows[0].total);
}

export async function updateCreditStatus(
  id: number,
  status: CreditStatus,
  txHash?: string,
  errorMessage?: string
): Promise<void> {
  await query(
    `UPDATE reward_credits
     SET status = $2, tx_hash = $3, error_message = $4
     WHERE id = $1`,
    [id, status, txHash ?? null, errorMessage ?? null]
  );
}

/** Timestamp of the user's last credited message (for cooldown). */
export async function getLastCreditTime(
  accountId: string,
  action: RewardAction
): Promise<Date | null> {
  const { rows } = await query<{ created_at: Date }>(
    `SELECT created_at FROM reward_credits
     WHERE account_id = $1 AND action = $2 AND status = 'credited'
     ORDER BY created_at DESC LIMIT 1`,
    [accountId, action]
  );
  return rows.length > 0 ? rows[0].created_at : null;
}

/** Get a user's total credited and claimed amounts. */
export async function getUserStats(
  accountId: string
): Promise<{ totalCredited: number; todayCredited: number; count: number }> {
  const { rows } = await query<{
    total_credited: string;
    today_credited: string;
    count: string;
  }>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status = 'credited'), 0) AS total_credited,
       COALESCE(SUM(amount) FILTER (WHERE status = 'credited'
         AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')), 0) AS today_credited,
       COUNT(*) FILTER (WHERE status = 'credited') AS count
     FROM reward_credits
     WHERE account_id = $1`,
    [accountId]
  );
  return {
    totalCredited: parseFloat(rows[0].total_credited),
    todayCredited: parseFloat(rows[0].today_credited),
    count: parseInt(rows[0].count, 10),
  };
}

export type { CreditRecord, UserLink };

// ---------------------------------------------------------------------------
// Pending activity (pre-link tracking for unlinked users)
// ---------------------------------------------------------------------------

/** Insert a pending activity record. Returns false if dedup key already exists. */
export async function insertPendingActivity(
  telegramId: number,
  source: string,
  action: string,
  sourceRef: string
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO pending_activity (telegram_id, source, action, source_ref)
       VALUES ($1, $2, $3, $4)`,
      [telegramId, source, action, sourceRef]
    );
    return true;
  } catch (err: unknown) {
    // Unique violation on source_ref → duplicate
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return false;
    }
    throw err;
  }
}

/** Check if a source_ref already exists in pending_activity OR reward_credits. */
export async function isPendingDuplicate(sourceRef: string): Promise<boolean> {
  const { rows } = await query<{ found: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM pending_activity WHERE source_ref = $1
       UNION ALL
       SELECT 1 FROM reward_credits WHERE source_ref = $1
     ) AS found`,
    [sourceRef]
  );
  return rows[0].found;
}

/** Count of pending activity records for a user. */
export async function getPendingActivityCount(
  telegramId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM pending_activity WHERE telegram_id = $1',
    [telegramId]
  );
  return parseInt(rows[0].count, 10);
}

/** Get all pending activity for a user, ordered by time. */
export async function getPendingActivity(
  telegramId: number
): Promise<PendingActivity[]> {
  const { rows } = await query<{
    id: number;
    telegram_id: string;
    source: string;
    action: string;
    source_ref: string;
    created_at: Date;
  }>(
    'SELECT * FROM pending_activity WHERE telegram_id = $1 ORDER BY created_at',
    [telegramId]
  );
  return rows.map((r) => ({
    id: r.id,
    telegramId: Number(r.telegram_id),
    source: r.source as RewardSource,
    action: r.action as RewardAction,
    sourceRef: r.source_ref,
    createdAt: r.created_at,
  }));
}

/** Delete all pending activity for a user (after processing). */
export async function deletePendingActivity(telegramId: number): Promise<void> {
  await query('DELETE FROM pending_activity WHERE telegram_id = $1', [
    telegramId,
  ]);
}

/** Timestamp of a user's last pending activity (for cooldown). */
export async function getLastPendingTime(
  telegramId: number
): Promise<Date | null> {
  const { rows } = await query<{ created_at: Date }>(
    `SELECT created_at FROM pending_activity
     WHERE telegram_id = $1
     ORDER BY created_at DESC LIMIT 1`,
    [telegramId]
  );
  return rows.length > 0 ? rows[0].created_at : null;
}

/** Count of pending activity for a user today (UTC). */
export async function getPendingDailyCount(
  telegramId: number
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM pending_activity
     WHERE telegram_id = $1
       AND created_at >= (CURRENT_DATE AT TIME ZONE 'UTC')`,
    [telegramId]
  );
  return parseInt(rows[0].count, 10);
}

// ---------------------------------------------------------------------------
// Nudge log
// ---------------------------------------------------------------------------

export async function hasBeenNudged(telegramId: number): Promise<boolean> {
  const { rows } = await query<{ found: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM nudge_log WHERE telegram_id = $1) AS found',
    [telegramId]
  );
  return rows[0].found;
}

export async function markNudged(
  telegramId: number,
  chatId: number
): Promise<void> {
  await query(
    `INSERT INTO nudge_log (telegram_id, chat_id)
     VALUES ($1, $2)
     ON CONFLICT (telegram_id) DO NOTHING`,
    [telegramId, chatId]
  );
}
