// ---------------------------------------------------------------------------
// /claim — Trigger a gasless claim of pending rewards
// ---------------------------------------------------------------------------
// The claim action is sent to the relayer, which submits it to the
// rewards contract on behalf of the user. The contract then transfers
// SOCIAL tokens via ft_transfer (with auto-registration).
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { CommandContext, Context } from 'grammy';
import { getUserLink } from '../db/queries.js';
import { viewClaimable } from '../services/near.js';
import { formatSocial } from './balance.js';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

/** Convert a decimal SOCIAL amount to yocto (18 decimals) string. */
export function toYoctoString(amount: number): string {
  const [intPart, decPart = ''] = amount.toString().split('.');
  return intPart + decPart.padEnd(18, '0');
}

/** Compare two yocto strings numerically. Returns -1, 0, or 1. */
export function compareYocto(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  const pa = a.padStart(maxLen, '0');
  const pb = b.padStart(maxLen, '0');
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}

/**
 * /claim command — show confirmation prompt with claimable amount.
 * The actual claim is handled by handleClaimConfirm (callback).
 */
export async function handleClaim(ctx: CommandContext<Context>): Promise<void> {
  // Only respond in private chats — don't post claim flows in groups
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
    const claimableRaw = await viewClaimable(link.accountId);

    if (!claimableRaw || claimableRaw === '0') {
      const keyboard = new InlineKeyboard().text('⭐ Balance', 'cb:balance');
      await ctx.reply(
        '🚀 Nothing to claim yet. Keep being active in the group!',
        { reply_markup: keyboard }
      );
      return;
    }

    // Enforce minimum claim threshold
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

    // Show confirmation
    const claimable = formatSocial(claimableRaw);
    const keyboard = new InlineKeyboard()
      .text('✅ Confirm Claim', 'cb:claim:confirm')
      .text('❌ Cancel', 'cb:claim:cancel');

    await ctx.reply(`Ready to claim ${claimable} SOCIAL?`, {
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error({ err, telegramId }, 'Claim check failed');
    await ctx.reply('⚠️ Could not check balance. Please try again later.');
  }
}

/**
 * Execute the actual claim via the relayer (synchronous / confirmed).
 *
 * Uses `?wait=true` so the relayer waits for `broadcast_tx_commit`.
 * We know the claim either succeeded on-chain or failed — no ambiguity.
 */
export async function executeClaim(
  accountId: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const request = {
    target_account: config.rewardsContract,
    action: { type: 'claim' },
    auth: {
      type: 'intent',
      actor_id: accountId,
      intent: {},
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.relayerApiKey) {
    headers['X-Api-Key'] = config.relayerApiKey;
  }

  const response = await fetch(`${config.relayerUrl}/execute?wait=true`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify(request),
  });

  const data = (await response.json()) as {
    success: boolean;
    status?: string;
    tx_hash?: string;
    error?: string;
  };

  if (!data.success) {
    return {
      success: false,
      error:
        data.error || `Relayer returned ${response.status} (${data.status})`,
    };
  }

  return { success: true, txHash: data.tx_hash };
}
