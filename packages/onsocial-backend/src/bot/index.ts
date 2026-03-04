// ---------------------------------------------------------------------------
// Telegram bot instance + command/handler/callback registration
// ---------------------------------------------------------------------------

import { Bot, InlineKeyboard, webhookCallback } from 'grammy';
import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { handleStart } from './start.js';
import {
  handleBalance,
  buildBalanceText,
  buildBalanceKeyboard,
} from './balance.js';
import { handleClaim, executeClaim } from './claim.js';
import { handleHelp, HELP_TEXT } from './help.js';
import { handleActivity } from '../handlers/activity.js';
import { getUserLink } from '../db/queries.js';

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

    // Try to update the existing message; fall back to a new one
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
    } catch {
      await ctx.reply(text, { reply_markup: keyboard });
    }
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
    const { viewClaimable } = await import('../services/near.js');
    const { formatSocial } = await import('./balance.js');

    const claimableRaw = await viewClaimable(link.accountId);
    if (!claimableRaw || claimableRaw === '0') {
      await ctx.reply(
        '💭 Nothing to claim yet. Keep being active in the group!'
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
    await ctx.editMessageText('⏳ Submitting your claim...');
  } catch {
    await ctx.reply('⏳ Submitting your claim...');
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

    const keyboard = new InlineKeyboard().text('📊 Balance', 'cb:balance');

    await ctx.reply(`✅ Claim submitted!\n\nView transaction: ${explorerUrl}`, {
      reply_markup: keyboard,
    });

    logger.info(
      { accountId: link.accountId, txHash: result.txHash },
      'Claim submitted'
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

bot.callbackQuery('cb:help', async (ctx) => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('📊 Balance', 'cb:balance')
    .text('💎 Claim', 'cb:claim');

  try {
    await ctx.editMessageText(HELP_TEXT, { reply_markup: keyboard });
  } catch {
    await ctx.reply(HELP_TEXT, { reply_markup: keyboard });
  }
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
