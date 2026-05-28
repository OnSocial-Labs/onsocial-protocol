// ---------------------------------------------------------------------------
// Reward crediting service — dedup, pre-cap check, credit on-chain
// ---------------------------------------------------------------------------

import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  isDuplicate,
  insertCredit,
  updateCreditStatus,
  getLastCreditTime,
} from '../db/queries.js';
import { evaluateAppCredit, yoctoToSocialNumber } from './app-reward-limits.js';
import { creditOnChain } from './near.js';
import type {
  CreditResult,
  RewardAction,
  RewardSource,
} from '../types/index.js';

interface CreditRequest {
  accountId: string;
  source: RewardSource;
  action: RewardAction;
  /** Unique dedup key, e.g. "tg:msg:chatId:msgId" */
  sourceRef: string;
  /** On-chain app identifier for per-app budget tracking. */
  appId?: string;
  /** Telegram user ID — stored for analytics and pending-activity flows. */
  telegramId?: number;
}

/**
 * Attempt to credit a reward. Returns the outcome.
 *
 * Flow:
 * 1. Dedup — skip if this exact event was already processed.
 * 2. Cooldown — skip if user's last credit for this action was too recent.
 * 3. Pre-cap — per-app daily headroom from on-chain config (saves gas).
 * 4. Insert as pending → call relayer → update status.
 */
export async function creditReward(req: CreditRequest): Promise<CreditResult> {
  const appId = req.appId ?? config.appId;

  // 1. Dedup
  if (await isDuplicate(req.sourceRef)) {
    logger.debug({ sourceRef: req.sourceRef }, 'Duplicate, skipping');
    return 'duplicate';
  }

  // 2. Cooldown
  if (await isOnCooldown(req.accountId, req.action)) {
    logger.debug({ accountId: req.accountId, action: req.action }, 'Cooldown');
    return 'duplicate';
  }

  const decision = await evaluateAppCredit(req.accountId, appId);
  if (!decision.allowed) {
    logger.debug(
      {
        accountId: req.accountId,
        appId,
        reason: decision.reason,
        dailyRemaining: decision.headroom?.dailyRemainingYocto.toString(),
      },
      'Per-app daily cap reached'
    );
    await insertCredit({
      accountId: req.accountId,
      source: req.source,
      action: req.action,
      amount: yoctoToSocialNumber(
        decision.headroom?.rewardPerActionYocto ?? 0n
      ).toString(),
      sourceRef: req.sourceRef,
      telegramId: req.telegramId,
    }).then((id) => updateCreditStatus(id, 'capped'));
    return 'capped';
  }

  const yoctoAmount = decision.amountYocto.toString();
  const decimalAmount = yoctoToSocialNumber(decision.amountYocto);

  // 3. Insert pending + credit on-chain
  const creditId = await insertCredit({
    accountId: req.accountId,
    source: req.source,
    action: req.action,
    amount: decimalAmount.toString(),
    sourceRef: req.sourceRef,
    telegramId: req.telegramId,
  });

  try {
    const txHash = await creditOnChain(
      req.accountId,
      yoctoAmount,
      `${req.source}:${req.action}`,
      appId
    );
    await updateCreditStatus(creditId, 'credited', txHash);
    logger.info(
      { accountId: req.accountId, appId, amount: decimalAmount, txHash },
      'Reward credited'
    );
    return 'credited';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateCreditStatus(creditId, 'failed', undefined, msg);
    logger.error(
      { accountId: req.accountId, appId, amount: decimalAmount, err: msg },
      'Credit failed'
    );
    return 'failed';
  }
}

async function isOnCooldown(
  accountId: string,
  action: RewardAction
): Promise<boolean> {
  const lastTime = await getLastCreditTime(accountId, action);
  if (!lastTime) return false;

  const cooldownMs = config.rewards.messageCooldownSec * 1000;
  return Date.now() - lastTime.getTime() < cooldownMs;
}
