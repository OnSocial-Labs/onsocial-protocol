// ---------------------------------------------------------------------------
// /start — Link a NEAR account to a Telegram user
// ---------------------------------------------------------------------------
// Usage:  /start alice.testnet
// Deep-link from group nudge: /start link  (shows instructions)
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { CommandContext, Context } from 'grammy';
import {
  upsertUserLink,
  getUserLink,
  getPendingActivityCount,
  getPendingActivity,
  deletePendingActivity,
} from '../db/queries.js';
import { creditReward } from '../services/rewards.js';
import { logger } from '../logger.js';

const NEAR_ACCOUNT_REGEX = /^[a-z0-9._-]+\.(near|testnet)$/;

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  // Only respond in private chats — don't leak account info in groups
  if (ctx.chat?.type !== 'private') return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const payload = ctx.match?.trim();

  // No argument (or deep-link "link") — show welcome with buttons
  if (!payload || payload === 'link') {
    const existing = await getUserLink(telegramId);

    if (existing) {
      const keyboard = new InlineKeyboard()
        .text('📊 Balance', 'cb:balance')
        .text('💎 Claim', 'cb:claim')
        .row()
        .text('❓ How it works', 'cb:help');

      await ctx.reply(
        `✅ Your account is linked to ${existing.accountId}\n\n` +
          'To change it, send:\n/start your-account.near',
        { reply_markup: keyboard }
      );
    } else {
      // Check if they have pending activity from group messages
      const pendingCount = await getPendingActivityCount(telegramId);

      const keyboard = new InlineKeyboard().text('❓ How it works', 'cb:help');

      let message =
        '👋 Welcome to OnSocial Pulse!\n\n' +
        'Earn SOCIAL tokens for being active in OnSocial groups.\n\n';

      if (pendingCount > 0) {
        message +=
          `🎉 Great news! You already have ${pendingCount} qualifying message${pendingCount !== 1 ? 's' : ''} tracked.\n` +
          'Link your account to credit them on-chain!\n\n';
      }

      message +=
        'To get started, link your NEAR account:\n/start your-account.near';

      await ctx.reply(message, { reply_markup: keyboard });
    }
    return;
  }

  // Validate NEAR account format
  if (!NEAR_ACCOUNT_REGEX.test(payload)) {
    await ctx.reply(
      '❌ Invalid NEAR account format.\n\n' +
        'Expected: name.near or name.testnet'
    );
    return;
  }

  const accountId = payload;

  // Save link
  await upsertUserLink(telegramId, accountId);
  logger.info({ telegramId, accountId }, 'Account linked');

  // Process any pending activity
  const pendingRecords = await getPendingActivity(telegramId);

  if (pendingRecords.length > 0) {
    let credited = 0;
    for (const record of pendingRecords) {
      try {
        const result = await creditReward({
          accountId,
          source: record.source,
          action: record.action,
          sourceRef: record.sourceRef,
        });
        if (result === 'credited') credited++;
      } catch (err) {
        logger.error(
          { err, sourceRef: record.sourceRef },
          'Failed to credit pending activity'
        );
      }
    }

    // Clean up regardless — they've been processed
    await deletePendingActivity(telegramId);

    const keyboard = new InlineKeyboard()
      .text('📊 Check Balance', 'cb:balance')
      .text('❓ How it works', 'cb:help');

    await ctx.reply(
      `✅ Linked to ${accountId}!\n\n` +
        `📨 ${credited} past reward${credited !== 1 ? 's' : ''} credited to your account.\n` +
        "You'll now earn SOCIAL tokens for activity in the group.\n" +
        'Use /balance to check your rewards.',
      { reply_markup: keyboard }
    );
  } else {
    const keyboard = new InlineKeyboard()
      .text('📊 Check Balance', 'cb:balance')
      .text('❓ How it works', 'cb:help');

    await ctx.reply(
      `✅ Linked to ${accountId}!\n\n` +
        "You'll now earn SOCIAL tokens for activity in the group.\n" +
        'Use /balance to check your rewards.',
      { reply_markup: keyboard }
    );
  }
}
