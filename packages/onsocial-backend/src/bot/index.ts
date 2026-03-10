// ---------------------------------------------------------------------------
// Telegram bot instance + command/handler/callback registration
// ---------------------------------------------------------------------------

import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { handleStart, handleAccountLink, LINK_PROMPT } from './start.js';
import {
  handleBalance,
  buildBalanceText,
  buildBalanceKeyboard,
  formatSocial,
} from './balance.js';

import {
  handleClaim,
  executeClaim,
  toYoctoString,
  compareYocto,
} from './claim.js';
import { handleHelp, HELP_TEXT } from './help.js';
import { handleActivity } from '../handlers/activity.js';
import { getUserLink } from '../db/queries.js';
import { viewClaimable } from '../services/near.js';

export const bot = new Bot(config.telegramBotToken, {
  // Pre-supply bot info so grammY skips the getMe call on first webhook.
  // Recommended for webhook deployments (faster cold starts, no init round-trip).
  botInfo: {
    id: 0,
    is_bot: true as const,
    first_name: 'OnSocial Pulse',
    username: config.botUsername,
    can_join_groups: true,
    can_read_all_group_messages: true,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
    has_topics_enabled: false,
    allows_users_to_create_topics: false,
  },
});

// -- Commands ----------------------------------------------------------------

bot.command('start', handleStart);
bot.command('balance', handleBalance);
bot.command('claim', handleClaim);
bot.command('help', handleHelp);

// -- Inline keyboard callbacks -----------------------------------------------

bot.callbackQuery('cb:balance', async (ctx) => {
  await ctx.answerCallbackQuery();

  const telegramId = ctx.from.id;
  const link = await getUserLink(telegramId);
  if (!link) {
    await ctx.reply(
      '❌ No NEAR account linked.\nUse /start your-account.near first.'
    );
    return;
  }

  try {
    const text = await buildBalanceText(link.accountId);
    const keyboard = buildBalanceKeyboard();

    // Photo messages can't be edited — always send a fresh one
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error({ err, telegramId }, 'Balance callback failed');
    await ctx.reply('⚠️ Could not fetch balance. Please try again later.');
  }
});

bot.callbackQuery('cb:claim', async (ctx) => {
  await ctx.answerCallbackQuery();
  // Re-use the same logic as the /claim command via a synthetic call
  // We need to redirect to /claim which does the threshold + confirmation check
  const telegramId = ctx.from.id;
  const link = await getUserLink(telegramId);
  if (!link) {
    await ctx.reply(
      '❌ No NEAR account linked.\nUse /start your-account.near first.'
    );
    return;
  }

  try {
    const claimableRaw = await viewClaimable(link.accountId);
    if (!claimableRaw || claimableRaw === '0') {
      const keyboard = new InlineKeyboard().text('⭐ Balance', 'cb:balance');
      await ctx.reply(
        '🚀 Nothing to claim yet. Keep being active in the group!',
        { reply_markup: keyboard }
      );
      return;
    }

    // Enforce minimum claim threshold (same as /claim command)
    const minYocto = toYoctoString(config.rewards.minClaimAmount);
    if (compareYocto(claimableRaw, minYocto) < 0) {
      const current = formatSocial(claimableRaw);
      const keyboard = new InlineKeyboard().text('⭐ Balance', 'cb:balance');
      await ctx.reply(
        `🚀 You have ${current} SOCIAL unclaimed, but the minimum claim is ${config.rewards.minClaimAmount} SOCIAL.\n` +
          'Keep being active to earn more!',
        { reply_markup: keyboard }
      );
      return;
    }

    const claimable = formatSocial(claimableRaw);
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm Claim', 'cb:claim:confirm')
      .text('❌ Cancel', 'cb:claim:cancel');

    await ctx.reply(`Ready to claim ${claimable} SOCIAL?`, {
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error({ err, telegramId }, 'Claim callback failed');
    await ctx.reply('⚠️ Could not check balance. Please try again later.');
  }
});

bot.callbackQuery('cb:claim:confirm', async (ctx) => {
  await ctx.answerCallbackQuery();

  const telegramId = ctx.from.id;
  const link = await getUserLink(telegramId);
  if (!link) return;

  // Remove the confirmation buttons
  try {
    await ctx.editMessageText('⏳ Claiming your tokens...');
  } catch {
    await ctx.reply('⏳ Claiming your tokens...');
  }

  try {
    const result = await executeClaim(link.accountId);

    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    const explorerUrl =
      config.nearNetwork === 'mainnet'
        ? `https://nearblocks.io/txns/${result.txHash}`
        : `https://testnet.nearblocks.io/txns/${result.txHash}`;

    const keyboard = new InlineKeyboard()
      .url('🔗 View Transaction', explorerUrl)
      .row()
      .text('⭐ Balance', 'cb:balance');

    await ctx.reply(`🚀 OnSocial Rewards\n\n✅ Claim confirmed!`, {
      reply_markup: keyboard,
    });

    logger.info(
      { accountId: link.accountId, txHash: result.txHash },
      'Claim confirmed on-chain'
    );
  } catch (err) {
    logger.error({ err, telegramId }, 'Claim execution failed');
    const keyboard = new InlineKeyboard().text('🔄 Try Again', 'cb:claim');
    await ctx.reply('⚠️ Claim failed. Please try again later.', {
      reply_markup: keyboard,
    });
  }
});

bot.callbackQuery('cb:claim:cancel', async (ctx) => {
  await ctx.answerCallbackQuery('Cancelled');
  try {
    await ctx.editMessageText('Claim cancelled.');
  } catch {
    await ctx.reply('Claim cancelled.');
  }
});

bot.callbackQuery('cb:link', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(LINK_PROMPT, {
    reply_markup: { force_reply: true, selective: true },
  });
});

bot.callbackQuery('cb:help', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('⭐ Balance', 'cb:balance')
    .text('💎 Claim', 'cb:claim');

  await ctx.reply(HELP_TEXT, { reply_markup: keyboard });
});

// -- Private chat: account linking via plain text ----------------------------
// Must be BEFORE the group activity handler so it matches first.
// Only fires in private chats for text that looks like a NEAR account.

bot.on('message', async (ctx, next) => {
  if (ctx.chat?.type === 'private' && ctx.message?.text) {
    const text = ctx.message.text.trim().toLowerCase();
    if (/^[a-z0-9._-]+\.(near|testnet)$/.test(text)) {
      await handleAccountLink(ctx);
      return;
    }
  }
  await next();
});

// -- Group activity handler --------------------------------------------------
// Fires on every non-command message in monitored groups.

bot.on('message', handleActivity);

// -- Error handler -----------------------------------------------------------

bot.catch((err) => {
  logger.error({ err: err.error, ctx: err.ctx?.update }, 'Bot error');
});

/**
 * Express handler for the Telegram webhook endpoint.
 * Mount via `app.post('/webhooks/telegram', webhookHandler)`.
 */
const expressAdapter = webhookCallback(bot, 'express');

export async function webhookHandler(
  req: Request,
  res: Response
): Promise<void> {
  await (expressAdapter as (req: Request, res: Response) => Promise<void>)(
    req,
    res
  );
}

/**
 * Set the Telegram webhook URL. Call once on startup in production.
 * In development, use long-polling instead (bot.start()).
 */
export async function setupWebhook(url: string): Promise<void> {
  await bot.api.setWebhook(url, { drop_pending_updates: true });
  logger.info({ url }, 'Telegram webhook set');
}

/**
 * Start long-polling for development. Does not return until stopped.
 */
export async function startPolling(): Promise<void> {
  await bot.api.deleteWebhook();
  logger.info('Starting Telegram bot in long-polling mode');
  bot.start();
}
