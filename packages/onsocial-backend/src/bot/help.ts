// ---------------------------------------------------------------------------
// /help — Explain how OnSocial Rewards work
// ---------------------------------------------------------------------------

import { InlineKeyboard } from 'grammy';
import type { CommandContext, Context } from 'grammy';
import { config } from '../config/index.js';

const HELP_TEXT =
  '❓ How OnSocial Rewards Work\n\n' +
  '1️⃣ Be active in OnSocial groups — send meaningful messages\n' +
  '2️⃣ Earn SOCIAL tokens automatically for qualifying contributions\n' +
  '3️⃣ Once you reach the minimum, claim your tokens with /claim\n\n' +
  '📋 Qualifying messages:\n' +
  `  • Text only (no stickers or media)\n` +
  `  • At least ${config.rewards.minMessageLength} characters\n` +
  `  • ${config.rewards.messageCooldownSec}s cooldown between rewards\n\n` +
  '💰 Reward rates:\n' +
  `  • ${config.rewards.messageReward} SOCIAL per message\n` +
  `  • ${config.rewards.dailyCap} SOCIAL daily cap\n` +
  `  • ${config.rewards.minClaimAmount} SOCIAL minimum to claim\n\n` +
  '🔗 Commands:\n' +
  `  /start — Link your NEAR account\n` +
  '  /balance — Check your rewards\n' +
  '  /claim — Withdraw your tokens\n' +
  '  /help — Show this message';

export async function handleHelp(ctx: CommandContext<Context>): Promise<void> {
  // Only respond in private chats — don't spam groups with help text
  if (ctx.chat?.type !== 'private') return;

  const keyboard = new InlineKeyboard()
    .text('📊 Balance', 'cb:balance')
    .text('💎 Claim', 'cb:claim');

  await ctx.reply(HELP_TEXT, { reply_markup: keyboard });
}

/** The help text, exported for use by the callback handler. */
export { HELP_TEXT };
