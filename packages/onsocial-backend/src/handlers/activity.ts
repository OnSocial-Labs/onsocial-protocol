// ---------------------------------------------------------------------------
// Group activity handler — credit rewards for messages in monitored groups
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { config } from '../config/index.js';
import { getAccountByTelegramId } from '../db/queries.js';
import {
  isPendingDuplicate,
  getLastPendingTime,
  getPendingDailyCount,
  insertPendingActivity,
  getPendingActivityCount,
  hasBeenNudged,
  markNudged,
} from '../db/queries.js';
import { creditReward } from '../services/rewards.js';
import { logger } from '../logger.js';

/**
 * Called on every non-command message. Credits a reward if:
 * 1. The message is in a monitored group.
 * 2. The message passes quality filters.
 * 3. If the sender has a linked NEAR account → credit on-chain immediately.
 *    If not linked → track in pending_activity and nudge once.
 */
export async function handleActivity(ctx: Context): Promise<void> {
  const msg = ctx.message;
  if (!msg || !msg.from) return;

  // Only process monitored groups
  const chatId = msg.chat.id.toString();
  if (
    config.telegramGroupIds.length > 0 &&
    !config.telegramGroupIds.includes(chatId)
  ) {
    return;
  }

  // Only group/supergroup messages
  if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') return;

  // Skip bot messages
  if (msg.from.is_bot) return;

  // Quality filter: skip media-only messages (stickers, GIFs, photos, voice)
  // Only reward text-based contributions
  if (!msg.text) return;

  // Quality filter: skip short messages ("ok", "lol", "gm", emoji-only, etc.)
  const textLength = msg.text.trim().length;
  if (textLength < config.rewards.minMessageLength) return;

  const telegramId = msg.from.id;
  const sourceRef = `tg:msg:${chatId}:${msg.message_id}`;

  try {
    // Check if user has linked a NEAR account
    const accountId = await getAccountByTelegramId(telegramId);

    if (accountId) {
      // ---- Linked user: credit on-chain immediately ----
      const result = await creditReward({
        accountId,
        source: 'telegram',
        action: 'message',
        sourceRef,
        appId: 'onsocial_telegram',
      });

      if (result === 'credited') {
        logger.debug(
          { telegramId, accountId, msgId: msg.message_id },
          'Activity reward credited'
        );
      }
    } else {
      // ---- Unlinked user: track pending activity ----
      await trackPendingActivity(ctx, telegramId, sourceRef, chatId);
    }
  } catch (err) {
    // Never crash the bot for a failed credit — just log
    logger.error(
      { err, telegramId, msgId: msg.message_id },
      'Activity credit error'
    );
  }
}

// ---------------------------------------------------------------------------
// Pending activity tracking for unlinked users
// ---------------------------------------------------------------------------

async function trackPendingActivity(
  ctx: Context,
  telegramId: number,
  sourceRef: string,
  chatId: string
): Promise<void> {
  // Dedup: check both pending_activity and reward_credits
  if (await isPendingDuplicate(sourceRef)) return;

  // Cooldown
  const lastTime = await getLastPendingTime(telegramId);
  if (lastTime) {
    const cooldownMs = config.rewards.messageCooldownSec * 1000;
    if (Date.now() - lastTime.getTime() < cooldownMs) return;
  }

  // Daily cap (each pending record = one messageReward)
  const todayCount = await getPendingDailyCount(telegramId);
  const todayTotal = todayCount * config.rewards.messageReward;
  if (todayTotal + config.rewards.messageReward > config.rewards.dailyCap) {
    return;
  }

  // Record the pending activity
  const inserted = await insertPendingActivity(
    telegramId,
    'telegram',
    'message',
    sourceRef
  );
  if (!inserted) return; // concurrent insert beat us

  // Nudge: after N qualifying messages, reply once in the group
  const count = await getPendingActivityCount(telegramId);
  if (
    count === config.rewards.nudgeThreshold &&
    !(await hasBeenNudged(telegramId))
  ) {
    try {
      const keyboard = new InlineKeyboard().url(
        '🚀 Start earning',
        `https://t.me/${config.botUsername}?start=link`
      );

      await ctx.reply(
        "⭐ You're contributing great content! Link your NEAR account to start earning SOCIAL tokens.",
        {
          reply_parameters: { message_id: ctx.message!.message_id },
          reply_markup: keyboard,
        }
      );
    } catch (nudgeErr) {
      logger.debug({ err: nudgeErr, telegramId }, 'Nudge reply failed');
    }

    await markNudged(telegramId, parseInt(chatId));
  }
}
