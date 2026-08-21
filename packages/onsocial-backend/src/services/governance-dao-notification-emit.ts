import { indexerQuery } from '../db/indexer.js';
import { logger } from '../logger.js';
import { listDaoMemberAccountIds } from './governance-dao-membership-store.js';
import type { PersistedDaoProposalSnapshot } from './governance-dao-proposal-store.js';
import {
  planDaoProposalNotifications,
  type DaoNotificationPlan,
} from './governance-dao-notification-plan.js';

export {
  planDaoProposalNotifications,
  type DaoNotificationPlan,
} from './governance-dao-notification-plan.js';

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

async function insertNotificationRows(
  plans: DaoNotificationPlan[],
  opts: {
    daoAccountId: string;
    blockHeight: number | null;
  }
): Promise<number> {
  let inserted = 0;
  for (const plan of plans) {
    for (const recipient of plan.recipients) {
      try {
        const result = await indexerQuery(
          `INSERT INTO notifications (
             owner_account_id, app_id, recipient, actor, notification_type,
             source_contract, source_receipt_id, source_block_height,
             dedupe_key, context, created_at
           ) VALUES (
             $1, 'default', $2, $3, $4,
             $5, NULL, $6,
             $7, $8::jsonb, NOW()
           )
           ON CONFLICT (owner_account_id, app_id, dedupe_key) DO NOTHING`,
          [
            recipient,
            recipient,
            plan.actor,
            plan.type,
            opts.daoAccountId,
            opts.blockHeight,
            plan.dedupeKey,
            JSON.stringify(plan.context),
          ]
        );
        inserted += result.rowCount ?? 0;
      } catch (error) {
        logger.warn(
          {
            err: error,
            daoAccountId: opts.daoAccountId,
            type: plan.type,
            recipient,
          },
          'Failed to emit DAO notification'
        );
      }
    }
  }
  return inserted;
}

/**
 * After a proposal snapshot write: fan out Activity notifications when enabled.
 * Create → members (ex proposer); votes → proposer; terminal status → members.
 * Idempotent via dedupe keys. Never throws into the sync path.
 *
 * If membership rows are empty (policy not indexed yet), force one membership
 * sync and retry so the first proposal is not silently dropped.
 */
export async function emitDaoProposalNotifications(params: {
  daoAccountId: string;
  previous: PersistedDaoProposalSnapshot | null;
  next: PersistedDaoProposalSnapshot;
  blockHeight?: number | null;
}): Promise<void> {
  try {
    let members = await listDaoMemberAccountIds(params.daoAccountId);
    if (members.length === 0) {
      const { syncDaoMemberships } = await import(
        './governance-dao-membership-sync.js'
      );
      await syncDaoMemberships(params.daoAccountId, { force: true });
      members = await listDaoMemberAccountIds(params.daoAccountId);
    }

    const plans = planDaoProposalNotifications({
      daoAccountId: params.daoAccountId,
      previous: params.previous,
      next: params.next,
      memberAccountIds: members,
    });
    if (plans.length === 0) {
      if (members.length === 0) {
        logger.warn(
          {
            daoAccountId: params.daoAccountId,
            proposalId: params.next.id,
          },
          'Skipped DAO notification emit — no indexed members'
        );
      }
      return;
    }

    const inserted = await insertNotificationRows(plans, {
      daoAccountId: normalizeAccountId(params.daoAccountId),
      blockHeight: params.blockHeight ?? null,
    });
    if (inserted > 0) {
      logger.info(
        {
          daoAccountId: params.daoAccountId,
          proposalId: params.next.id,
          inserted,
          types: plans.map((plan) => plan.type),
        },
        'Emitted DAO proposal notifications'
      );
    }
  } catch (error) {
    logger.warn(
      {
        err: error,
        daoAccountId: params.daoAccountId,
        proposalId: params.next.id,
      },
      'DAO notification emit failed'
    );
  }
}
