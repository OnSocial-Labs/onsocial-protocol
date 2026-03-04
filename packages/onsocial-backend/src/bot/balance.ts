// ---------------------------------------------------------------------------
// /balance — Show a user's pending rewards
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { CommandContext, Context } from 'grammy';
import { getUserLink, getUserStats } from '../db/queries.js';
import { viewClaimable } from '../services/near.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

export async function handleBalance(
  ctx: CommandContext<Context>
): Promise<void> {
  // Only respond in private chats — don't leak balance info in groups
  if (ctx.chat?.type !== 'private') return;

  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const link = await getUserLink(telegramId);
  if (!link) {
    const keyboard = new InlineKeyboard().text('❓ How it works', 'cb:help');
    await ctx.reply(
      '❌ No NEAR account linked.\nUse /start your-account.near first.',
      { reply_markup: keyboard }
    );
    return;
  }

  try {
    const text = await buildBalanceText(link.accountId);
    const keyboard = buildBalanceKeyboard();

    await ctx.reply(text, { reply_markup: keyboard });
  } catch (err) {
    logger.error({ err, telegramId }, 'Balance check failed');
    await ctx.reply('⚠️ Could not fetch balance. Please try again later.');
  }
}

/** Build the balance text for a given account. Shared by command + callback. */
export async function buildBalanceText(accountId: string): Promise<string> {
  const [stats, claimableRaw] = await Promise.all([
    getUserStats(accountId),
    viewClaimable(accountId).catch(() => '0'),
  ]);

  const claimable = formatSocial(claimableRaw);
  const todayRemaining = Math.max(
    0,
    config.rewards.dailyCap - stats.todayCredited
  );

  return (
    `📊 Rewards for ${accountId}\n\n` +
    `💰 Claimable: ${claimable} SOCIAL\n` +
    `📅 Earned today: ${stats.todayCredited.toFixed(1)} SOCIAL\n` +
    `📈 Remaining today: ${todayRemaining.toFixed(1)} SOCIAL\n` +
    `🏆 All-time credits: ${stats.totalCredited.toFixed(1)} SOCIAL (${stats.count} actions)`
  );
}

/** Build the inline keyboard for the balance view. */
export function buildBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💎 Claim Rewards', 'cb:claim')
    .text('🔄 Refresh', 'cb:balance');
}

/** Convert yocto-SOCIAL string to human-readable decimal. */
export function formatSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(19, '0'); // at least 18 decimals + 1
  const intPart = padded.slice(0, padded.length - 18) || '0';
  const decPart = padded.slice(padded.length - 18, padded.length - 16); // 2 decimal places
  const dec = decPart.replace(/0+$/, '');
  return dec ? `${intPart}.${dec}` : intPart;
}
