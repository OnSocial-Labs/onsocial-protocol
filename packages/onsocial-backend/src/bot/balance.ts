// ---------------------------------------------------------------------------
// /balance — Show a user's on-chain reward state
// ---------------------------------------------------------------------------
// All data comes from the rewards contract (single source of truth).
// The backend DB is only used for dedup/cooldown in the crediting path;
// the user-facing display is always the contract's view.
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { CommandContext, Context } from 'grammy';
import { getUserLink } from '../db/queries.js';
import { viewUserReward, viewContract } from '../services/near.js';
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

    await ctx.reply(text, {
      reply_markup: keyboard,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error({ err, telegramId }, 'Balance check failed');
    await ctx.reply('⚠️ Could not fetch balance. Please try again later.');
  }
}

/**
 * Build the balance text from the contract's on-chain state.
 * Shared by the /balance command and the cb:balance callback.
 */
export async function buildBalanceText(accountId: string): Promise<string> {
  const [reward, appReward] = await Promise.all([
    viewUserReward(accountId),
    viewContract<{
      total_earned: string;
      daily_earned: string;
      last_day: number;
    } | null>('get_user_app_reward', {
      account_id: accountId,
      app_id: config.appId,
    }),
  ]);

  // User has never been credited
  if (!reward) {
    return (
      `🤝 Powered by OnSocial\n\n` +
      `⭐ Rewards for ${accountId}\n\n` +
      `💎 Unclaimed: 0 SOCIAL\n` +
      `(min ${config.rewards.minClaimAmount} to claim)\n\n` +
      `📈 Daily progress: 0 / ${config.rewards.dailyCap} SOCIAL\n\n` +
      `🏆 Total earned: 0 SOCIAL`
    );
  }

  const unclaimed = formatSocial(reward.claimable);
  const totalEarned = formatSocial(reward.total_earned);
  const dailyCap = config.rewards.dailyCap;

  // Daily progress from per-app reward (more accurate than global)
  const currentDay = Math.floor(Date.now() / 86_400_000);
  const dayRolledOver = appReward
    ? appReward.last_day < currentDay
    : reward.last_day < currentDay;
  const effectiveDailyEarned = dayRolledOver
    ? '0'
    : appReward
      ? appReward.daily_earned
      : reward.daily_earned;

  const dailyEarned = formatSocial(effectiveDailyEarned);

  // Check if daily cap is reached
  const dailyEarnedNum = dayRolledOver
    ? 0
    : Number(effectiveDailyEarned) / 1e18;
  const capReached = dailyEarnedNum >= dailyCap;

  // Show countdown to reset only when cap is reached
  let dailySuffix = '';
  if (capReached) {
    const resetCountdown = timeUntilUtcMidnight();
    dailySuffix = `\n✓ Cap reached (resets in ${resetCountdown})`;
  }

  // Unclaimed status hint
  const minYocto = BigInt(config.rewards.minClaimAmount * 1e18);
  const claimableBig = BigInt(reward.claimable);
  const unclaimedHint =
    claimableBig === 0n
      ? `(min ${config.rewards.minClaimAmount} to claim)`
      : claimableBig < minYocto
        ? `(min ${config.rewards.minClaimAmount} to claim)`
        : '(ready to claim!)';

  // Show per-app vs global earned when user earns from multiple apps
  const appEarned = appReward ? formatSocial(appReward.total_earned) : '0';
  const multiApp = appReward && appReward.total_earned !== reward.total_earned;

  const earnedLines = multiApp
    ? `⭐ Earned with OnSocial: ${appEarned} SOCIAL\n\n` +
      `🏆 Total earned: ${totalEarned} SOCIAL`
    : `🏆 Total earned: ${totalEarned} SOCIAL`;

  return (
    `🤝 Powered by OnSocial\n\n` +
    `⭐ Rewards for ${accountId}\n\n` +
    `💎 Unclaimed: ${unclaimed} SOCIAL\n` +
    `${unclaimedHint}\n\n` +
    `📈 Daily progress: ${dailyEarned} / ${dailyCap} SOCIAL${dailySuffix}\n\n` +
    `${earnedLines}`
  );
}

/** Token contract explorer URL (testnet/mainnet auto-detect). */
export function tokenExplorerUrl(): string {
  const tokenContract =
    config.nearNetwork === 'mainnet'
      ? 'token.onsocial.near'
      : 'token.onsocial.testnet';
  return config.nearNetwork === 'mainnet'
    ? `https://nearblocks.io/token/${tokenContract}`
    : `https://testnet.nearblocks.io/token/${tokenContract}`;
}

/** Build the inline keyboard for the balance view. */
export function buildBalanceKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('💎 Claim Rewards', 'cb:claim')
    .text('🔄 Refresh', 'cb:balance')
    .row()
    .url('🔗 Contract', tokenExplorerUrl());
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

/** Human-readable countdown to next UTC midnight (when daily_earned resets). */
function timeUntilUtcMidnight(): string {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const diffMs = nextMidnight.getTime() - now.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
