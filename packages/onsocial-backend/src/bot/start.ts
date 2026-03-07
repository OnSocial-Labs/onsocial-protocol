// ---------------------------------------------------------------------------
// /start — Link a NEAR account to a Telegram user
// ---------------------------------------------------------------------------
// Flow:  /start → welcome + "Link Account" button
//        cb:link → ForceReply prompt → user types account
//        handleAccountLink → validate + link + credit pending
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
import { accountExists } from '../services/near.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

export const NEAR_ACCOUNT_REGEX = /^[a-z0-9._-]+\.(near|testnet)$/;

/** Network-aware account suffix for user-facing messages. */
const ACCOUNT_SUFFIX = config.nearNetwork === 'mainnet' ? '.near' : '.testnet';

/** The prompt text used for ForceReply — also used to detect replies. */
export const LINK_PROMPT = `Enter your NEAR account (e.g. alice${ACCOUNT_SUFFIX}):`;

export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  // Only respond in private chats — don't leak account info in groups
  if (ctx.chat?.type !== 'private') return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const payload = ctx.match?.trim();

  // Direct account link: /start alice.testnet
  if (payload && payload !== 'link') {
    await linkAccount(ctx, telegramId, payload);
    return;
  }

  // No argument (or deep-link "link") — show welcome with buttons
  const existing = await getUserLink(telegramId);

  if (existing) {
    const keyboard = new InlineKeyboard()
      .text('📊 Balance', 'cb:balance')
      .text('💎 Claim', 'cb:claim')
      .row()
      .text('🔗 Change Account', 'cb:link')
      .text('❓ How it works', 'cb:help');

    await ctx.reply(`✅ Your account is linked to \`${existing.accountId}\``, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  } else {
    const pendingCount = await getPendingActivityCount(telegramId);

    const keyboard = new InlineKeyboard()
      .text('🔗 Link Account', 'cb:link')
      .row()
      .text('❓ How it works', 'cb:help');

    let message =
      '👋 Welcome to OnSocial Pulse!\n\n' +
      `Earn ${config.rewards.messageReward} SOCIAL per message (up to ${config.rewards.dailyCap}/day) for being active in OnSocial groups.\n\n`;

    if (pendingCount > 0) {
      message +=
        `🎉 You already have ${pendingCount} qualifying message${pendingCount !== 1 ? 's' : ''} tracked!\n` +
        'Link your account to credit them on-chain.\n\n';
    }

    message += 'Tap the button below to get started 👇';

    await ctx.reply(message, { reply_markup: keyboard });
  }
}

/**
 * Handle plain text messages that look like NEAR account IDs in private chat.
 * Also handles ForceReply responses to the link prompt.
 */
export async function handleAccountLink(ctx: Context): Promise<void> {
  if (ctx.chat?.type !== 'private') return;
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const text = ctx.message?.text?.trim().toLowerCase();
  if (!text) return;

  // Only process if it looks like a NEAR account
  if (!NEAR_ACCOUNT_REGEX.test(text)) return;

  await linkAccount(ctx, telegramId, text);
}

// ---------------------------------------------------------------------------
// Shared linking logic
// ---------------------------------------------------------------------------

async function linkAccount(
  ctx: Context,
  telegramId: number,
  input: string
): Promise<void> {
  const accountId = input.toLowerCase().trim();

  // 1. Validate format
  if (!NEAR_ACCOUNT_REGEX.test(accountId)) {
    await ctx.reply(
      `❌ Invalid account format.\n\nExpected: \`name${ACCOUNT_SUFFIX}\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 2. Check account exists on-chain
  const exists = await accountExists(accountId);
  if (!exists) {
    await ctx.reply(
      `❌ Account \`${accountId}\` not found on ${config.nearNetwork}.\n\n` +
        'Please check the spelling and try again.',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 3. Save link
  await upsertUserLink(telegramId, accountId);
  logger.info({ telegramId, accountId }, 'Account linked');

  // 4. Process any pending activity
  const pendingRecords = await getPendingActivity(telegramId);

  const keyboard = new InlineKeyboard()
    .text('📊 Balance', 'cb:balance')
    .text('💎 Claim', 'cb:claim')
    .row()
    .text('❓ How it works', 'cb:help');

  if (pendingRecords.length > 0) {
    let credited = 0;
    for (const record of pendingRecords) {
      try {
        const result = await creditReward({
          accountId,
          source: record.source,
          action: record.action,
          sourceRef: record.sourceRef,
          appId: 'onsocial_telegram',
        });
        if (result === 'credited') credited++;
      } catch (err) {
        logger.error(
          { err, sourceRef: record.sourceRef },
          'Failed to credit pending activity'
        );
      }
    }

    await deletePendingActivity(telegramId);

    await ctx.reply(
      `✅ Linked to \`${accountId}\`!\n\n` +
        `📨 ${credited} past reward${credited !== 1 ? 's' : ''} credited on-chain.\n` +
        "You'll now earn SOCIAL automatically.",
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  } else {
    await ctx.reply(
      `✅ Linked to \`${accountId}\`!\n\n` +
        "You'll now earn SOCIAL tokens for activity in the group.",
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  }
}
