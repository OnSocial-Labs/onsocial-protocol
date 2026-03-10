// ---------------------------------------------------------------------------
// Reward crediting service — dedup, pre-cap check, credit on-chain
// ---------------------------------------------------------------------------

import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  isDuplicate,
  getDailyTotal,
  getDailyTotalByTelegram,
  insertCredit,
  updateCreditStatus,
  getLastCreditTime,
} from '../db/queries.js';
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
  /** Telegram user ID — used for per-user daily cap enforcement. */
  telegramId?: number;
}

/**
 * Attempt to credit a reward. Returns the outcome.
 *
 * Flow:
 * 1. Dedup — skip if this exact event was already processed.
 * 2. Cooldown — skip if user's last credit for this action was too recent.
 * 3. Pre-cap — skip if user has already hit the daily cap (saves gas).
 * 4. Insert as pending → call relayer → update status.
 */
export async function creditReward(req: CreditRequest): Promise<CreditResult> {
  const amount = getAmount(req.action);

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

  // 3. Pre-cap check (use > not >= — the contract allows crediting up to the cap exactly)
  const todayTotal = await getDailyTotal(req.accountId);
  if (todayTotal + amount > config.rewards.dailyCap) {
    logger.debug(
      { accountId: req.accountId, todayTotal, amount },
      'Daily cap reached'
    );
    // Still record so we don't re-process
    await insertCredit({
      accountId: req.accountId,
      source: req.source,
      action: req.action,
      amount: amount.toString(),
      sourceRef: req.sourceRef,
      telegramId: req.telegramId,
    }).then((id) => updateCreditStatus(id, 'capped'));
    return 'capped';
  }

  // 3b. Per-Telegram-user cap — prevents cycling NEAR accounts to bypass cap
  if (req.telegramId) {
    const tgTotal = await getDailyTotalByTelegram(req.telegramId);
    if (tgTotal + amount > config.rewards.dailyCap) {
      logger.debug(
        { telegramId: req.telegramId, tgTotal, amount },
        'Per-user daily cap reached (account cycling prevention)'
      );
      await insertCredit({
        accountId: req.accountId,
        source: req.source,
        action: req.action,
        amount: amount.toString(),
        sourceRef: req.sourceRef,
        telegramId: req.telegramId,
      }).then((id) => updateCreditStatus(id, 'capped'));
      return 'capped';
    }
  }

  // 4. Insert pending + credit on-chain
  const creditId = await insertCredit({
    accountId: req.accountId,
    source: req.source,
    action: req.action,
    amount: amount.toString(),
    sourceRef: req.sourceRef,
    telegramId: req.telegramId,
  });

  try {
    // Amount must be in yocto-SOCIAL (18 decimals) for the contract
    const yoctoAmount = toYocto(amount);
    const txHash = await creditOnChain(
      req.accountId,
      yoctoAmount,
      `${req.source}:${req.action}`,
      req.appId
    );
    await updateCreditStatus(creditId, 'credited', txHash);
    logger.info(
      { accountId: req.accountId, amount, txHash },
      'Reward credited'
    );
    return 'credited';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateCreditStatus(creditId, 'failed', undefined, msg);
    logger.error(
      { accountId: req.accountId, amount, err: msg },
      'Credit failed'
    );
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAmount(action: RewardAction): number {
  switch (action) {
    case 'message':
      return config.rewards.messageReward;
    case 'reaction':
      return config.rewards.reactionReward;
    default:
      return 0;
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

/** Convert a decimal SOCIAL amount to yocto string (18 decimals). */
function toYocto(amount: number): string {
  // Avoid floating-point issues: multiply integer part and decimal part separately
  const [intPart, decPart = ''] = amount.toString().split('.');
  const padded = decPart.padEnd(18, '0').slice(0, 18);
  const result = intPart + padded;
  // Strip leading zeros but keep at least "0"
  return result.replace(/^0+/, '') || '0';
}
