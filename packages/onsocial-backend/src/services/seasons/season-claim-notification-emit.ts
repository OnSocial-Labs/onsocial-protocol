/**
 * Rally claim-open notifications.
 *
 * When a season settlement is published on-chain, every wallet with a reward
 * gets one Activity row so the collect window does not depend on opening the
 * app. Idempotent via `dedupe_key = season_claim_open:{seasonId}:{accountId}`;
 * safe to re-run. Never throws into the publish path.
 */

import { config } from '../../config/index.js';
import { query } from '../../db/index.js';
import { indexerQuery } from '../../db/indexer.js';
import { logger } from '../../logger.js';
import { assertSeasonId } from './season-registry.js';
import {
  buildSeasonClaimOpenRows,
  SEASON_CLAIM_OPEN_TYPE,
  seasonClaimOpenDedupeKey,
  type SeasonClaimOpenRow,
} from './season-claim-notification-plan.js';

export {
  buildSeasonClaimOpenRows,
  SEASON_CLAIM_OPEN_TYPE,
  seasonClaimOpenDedupeKey,
  type SeasonClaimOpenRow,
} from './season-claim-notification-plan.js';

const APP_ID = 'default';

export interface SeasonClaimOpenEmitResult {
  candidates: number;
  inserted: number;
}

async function insertClaimOpenNotification(
  seasonId: string,
  row: SeasonClaimOpenRow
): Promise<boolean> {
  const result = await indexerQuery(
    `INSERT INTO notifications (
       owner_account_id, app_id, recipient, actor, notification_type,
       source_contract, source_receipt_id, source_block_height,
       dedupe_key, context, created_at
     ) VALUES (
       $1, $2, $3, '', $4,
       $5, NULL, NULL,
       $6, $7::jsonb, NOW()
     )
     ON CONFLICT (owner_account_id, app_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [
      row.accountId,
      APP_ID,
      row.accountId,
      SEASON_CLAIM_OPEN_TYPE,
      config.socialSpendContract,
      seasonClaimOpenDedupeKey(seasonId, row.accountId),
      JSON.stringify({
        seasonId,
        amount: row.amount,
        ...(row.rank > 0 ? { rank: row.rank } : {}),
      }),
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Fan out after a settlement publishes. Callers decide `active` — an inactive
 * publish keeps claims closed on-chain, so no rows go out.
 */
export async function emitSeasonClaimOpenNotifications(
  seasonId: string
): Promise<SeasonClaimOpenEmitResult> {
  const id = assertSeasonId(seasonId);
  try {
    const claims = await query<{
      account_id: string;
      amount: string;
      rank: number;
    }>(
      `SELECT account_id, amount, rank
       FROM season_settlement_claims
       WHERE season_id = $1
         AND amount::numeric > 0
       ORDER BY rank ASC, account_id ASC`,
      [id]
    );
    const rows = buildSeasonClaimOpenRows(claims.rows);
    let inserted = 0;
    for (const row of rows) {
      try {
        if (await insertClaimOpenNotification(id, row)) inserted += 1;
      } catch (error) {
        logger.warn(
          { err: error, seasonId: id, accountId: row.accountId },
          'Failed to emit season claim-open notification'
        );
      }
    }
    if (inserted > 0) {
      logger.info(
        { seasonId: id, candidates: rows.length, inserted },
        'Emitted season claim-open notifications'
      );
    }
    return { candidates: rows.length, inserted };
  } catch (error) {
    logger.warn(
      { err: error, seasonId: id },
      'Season claim-open notification emit failed'
    );
    return { candidates: 0, inserted: 0 };
  }
}
