// ---------------------------------------------------------------------------
// Bot factory — `createRewardsBot()` gives partners a fully-wired
// Grammy Telegram bot for SOCIAL token rewards in 5 lines of code.
// ---------------------------------------------------------------------------
//
// Grammy is a **peer dependency** — partners install it themselves.
//
// Usage:
//   import { createRewardsBot } from '@onsocial-id/rewards/bot';
//
//   const bot = createRewardsBot({
//     botToken:  process.env.BOT_TOKEN!,
//     apiKey:    process.env.ONSOCIAL_API_KEY!,
//     appId:     'acme_community',
//   });
//
//   bot.start();            // long-polling
//   // or: bot.api.setWebhook(url)
// ---------------------------------------------------------------------------

import { Bot, InlineKeyboard } from 'grammy';
import { OnSocialRewards } from './client.js';
import type { ClaimResponse, AppConfig } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RewardsBotConfig {
  /** Telegram bot token from @BotFather. */
  botToken: string;

  /** OnSocial partner API key. */
  apiKey: string;

  /** Registered app ID on the rewards contract. */
  appId: string;

  /** OnSocial API base URL. Defaults to https://api.onsocial.id */
  baseUrl?: string;

  /** NEAR rewards contract. Defaults to rewards.onsocial.near */
  rewardsContract?: string;

  /** Minimum text length to qualify for a reward (default: 10). */
  minMessageLength?: number;

  /** Cooldown between rewarded messages in seconds (default: 60). */
  cooldownSec?: number;

  /** Minimum SOCIAL tokens required to claim (default: 1). */
  minClaimAmount?: number;

  /** Custom account store — swap in Postgres, Redis, etc. */
  store?: AccountStore;

  /** Called after a reward is credited. */
  onReward?: (accountId: string, source: string) => void;

  /** Called on errors (defaults to console.error). */
  onError?: (error: unknown, context: string) => void;
}

/** Minimal key-value store for Telegram ID → NEAR account mapping. */
export interface AccountStore {
  get(telegramId: number): Promise<string | undefined>;
  set(telegramId: number, accountId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NEAR_ACCOUNT_RE = /^[a-z0-9._-]+\.(near|testnet)$/;

/** Escape Telegram Markdown special chars. */
function escapeMarkdown(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/** Convert yocto-SOCIAL (18 decimals) to human-readable string. */
export function formatSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const s = yocto;
  const padded = s.padStart(19, '0');
  const intPart = padded.slice(0, padded.length - 18) || '0';
  const decPart = padded.slice(padded.length - 18, padded.length - 16);
  const dec = decPart.replace(/0+$/, '');
  return dec ? `${intPart}.${dec}` : intPart;
}

/** Human-readable countdown to next UTC midnight. */
function timeUntilUtcMidnight(): string {
  const now = new Date();
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  const diffMs = next.getTime() - now.getTime();
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// In-memory account store (default)
// ---------------------------------------------------------------------------

class MemoryAccountStore implements AccountStore {
  private map = new Map<number, string>();

  async get(telegramId: number): Promise<string | undefined> {
    return this.map.get(telegramId);
  }

  async set(telegramId: number, accountId: string): Promise<void> {
    this.map.set(telegramId, accountId);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a fully-wired Grammy Telegram bot with SOCIAL token reward
 * mechanics pre-configured.
 *
 * The bot auto-fetches your app's on-chain config (label, reward rates,
 * caps) so the UX is fully branded with zero manual strings.
 *
 * The returned `Bot` instance can be started with `.start()` (long-polling)
 * or used with `webhookCallback(bot, 'express')` for production.
 *
 * Partners can register additional handlers on the returned bot:
 *
 * ```ts
 * const bot = createRewardsBot({ ... });
 * bot.command('ping', ctx => ctx.reply('pong'));
 * bot.start();
 * ```
 */
export function createRewardsBot(config: RewardsBotConfig) {
  // ── SDK client ──
  const rewards = new OnSocialRewards({
    apiKey: config.apiKey,
    appId: config.appId,
    baseUrl: config.baseUrl,
    rewardsContract: config.rewardsContract,
  });

  // ── Settings ──
  const minMessageLength = config.minMessageLength ?? 10;
  const cooldownMs = (config.cooldownSec ?? 60) * 1000;
  const minClaimAmount = config.minClaimAmount ?? 1;
  const minClaimYocto = BigInt(minClaimAmount) * 10n ** 18n;
  const store: AccountStore = config.store ?? new MemoryAccountStore();
  const onError =
    config.onError ??
    ((err: unknown, ctx: string) => console.error(`[onsocial] ${ctx}:`, err));

  // ── On-chain app config (populated at startup) ──
  let appLabel: string = config.appId;
  let rewardPerAction: string | null = null;
  let dailyCap: string | null = null;
  let appConfigLoaded = false;

  /** Fetch once on first use (lazy init). */
  async function ensureAppConfig(): Promise<void> {
    if (appConfigLoaded) return;
    try {
      const cfg: AppConfig | null = await rewards.getAppConfig();
      if (cfg) {
        appLabel = cfg.label || config.appId;
        rewardPerAction = formatSocial(cfg.reward_per_action);
        dailyCap = formatSocial(cfg.daily_cap);
      }
      appConfigLoaded = true;
    } catch (err) {
      onError(err, 'fetch app config');
      appConfigLoaded = true; // don't retry on every message
    }
  }

  /** Branded tagline using the real app label. */
  function brandLine(): string {
    return `🤝 OnSocial stands with ${escapeMarkdown(appLabel)}`;
  }

  /** Token contract URL (testnet/mainnet auto-detect). */
  function tokenUrl(): string {
    const isTestnet = (
      config.rewardsContract ?? 'rewards.onsocial.near'
    ).endsWith('.testnet');
    const tokenContract = isTestnet
      ? 'token.onsocial.testnet'
      : 'token.onsocial.near';
    return isTestnet
      ? `https://testnet.nearblocks.io/token/${tokenContract}`
      : `https://nearblocks.io/token/${tokenContract}`;
  }

  /** Build rich balance text with daily progress and timing. */
  async function buildBalanceText(accountId: string): Promise<string> {
    const [claimable, userReward, appReward] = await Promise.all([
      rewards.getClaimable(accountId),
      rewards.getUserReward(accountId),
      rewards.getUserAppReward(accountId),
    ]);

    const unclaimedStr = formatSocial(claimable);
    const totalEarned = userReward
      ? formatSocial(userReward.total_earned)
      : '0';

    // Unclaimed status hint
    const claimableBig = BigInt(claimable || '0');
    const unclaimedHint =
      claimableBig === 0n
        ? `(min ${minClaimAmount} to claim)`
        : claimableBig < minClaimYocto
          ? `(min ${minClaimAmount} to claim)`
          : '(ready to claim!)';

    // Per-app earned
    const appEarned = appReward ? formatSocial(appReward.total_earned) : '0';

    // Daily progress from per-app reward
    let dailyLine = '';
    if (dailyCap && appReward) {
      const currentDay = Math.floor(Date.now() / 86_400_000);
      const dayRolledOver = appReward.last_day < currentDay;
      const effectiveDaily = dayRolledOver ? '0' : appReward.daily_earned;
      const dailyEarned = formatSocial(effectiveDaily);
      const dailyEarnedNum = dayRolledOver
        ? 0
        : Number(BigInt(appReward.daily_earned)) / 1e18;
      const capNum = Number(dailyCap);
      const capReached = dailyEarnedNum >= capNum;

      dailyLine = `📈 Daily progress: ${dailyEarned} / ${dailyCap} SOCIAL`;
      if (capReached) {
        dailyLine += `\n✓ Cap reached (resets in ${timeUntilUtcMidnight()})`;
      }
      dailyLine += '\n\n';
    }

    // Show both app-specific and global totals so multi-app users
    // understand what came from THIS partner vs. everything.
    const multiApp =
      appReward &&
      userReward &&
      appReward.total_earned !== userReward.total_earned;

    const earnedLines = multiApp
      ? `⭐ Earned with ${appLabel}: ${appEarned} SOCIAL\n\n` +
        `🏆 Total earned: ${totalEarned} SOCIAL`
      : `🏆 Total earned: ${totalEarned} SOCIAL`;

    return (
      `${brandLine()}\n\n` +
      `⭐ Rewards for \`${accountId}\`\n\n` +
      `💎 Unclaimed: ${unclaimedStr} SOCIAL\n` +
      `${unclaimedHint}\n\n` +
      dailyLine +
      `${earnedLines}`
    );
  }

  // ── Cooldown state ──
  const lastReward = new Map<number, number>();

  // ── Anti-cycling state ──
  /** Daily credit count per telegram user (keyed by `telegramId:day`). */
  const dailyCredits = new Map<string, number>();

  // ── Bot ──
  const bot = new Bot(config.botToken);

  // ────────────────────────────────────────────────
  //  /start — Link a NEAR account
  // ────────────────────────────────────────────────

  bot.command('start', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await ensureAppConfig();

    const payload = (ctx.match as string)?.trim();
    if (payload && NEAR_ACCOUNT_RE.test(payload)) {
      await linkAccount(ctx, telegramId, payload);
      return;
    }

    const existing = await store.get(telegramId);
    if (existing) {
      const kb = new InlineKeyboard()
        .text('⭐ Balance', 'cb:balance')
        .text('💎 Claim', 'cb:claim')
        .row()
        .text('🔗 Change Account', 'cb:link');
      await ctx.reply(`${brandLine()}\n\n✅ Linked to \`${existing}\``, {
        reply_markup: kb,
        parse_mode: 'Markdown',
      });
    } else {
      const kb = new InlineKeyboard()
        .text('🔗 Link Account', 'cb:link')
        .row()
        .text('❓ How it works', 'cb:help');
      const rateInfo =
        rewardPerAction && dailyCap
          ? `Earn ${rewardPerAction} SOCIAL per message (up to ${dailyCap}/day) for being active in the group.`
          : 'Earn SOCIAL tokens for being active in the group.';
      const welcomeText =
        `${brandLine()}\n\n` +
        `👋 Welcome!\n\n` +
        `${rateInfo}\n\n` +
        'Tap below to link your NEAR account and start earning 👇';
      await ctx.reply(welcomeText, { reply_markup: kb });
    }
  });

  // ────────────────────────────────────────────────
  //  /balance — Show rewards
  // ────────────────────────────────────────────────

  bot.command('balance', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await ensureAppConfig();

    const accountId = await store.get(telegramId);
    if (!accountId) {
      await ctx.reply(
        '❌ No NEAR account linked.\nUse /start your-account.near first.'
      );
      return;
    }

    try {
      const balanceText = await buildBalanceText(accountId);
      const kb = new InlineKeyboard()
        .text('💎 Claim', 'cb:claim')
        .text('🔄 Refresh', 'cb:balance')
        .row()
        .url('🔗 Contract', tokenUrl());

      await ctx.reply(balanceText, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
    } catch (err) {
      onError(err, 'balance');
      await ctx.reply('⚠️ Could not fetch balance. Please try again later.');
    }
  });

  // ────────────────────────────────────────────────
  //  /claim — Gasless claim
  // ────────────────────────────────────────────────

  bot.command('claim', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await handleClaimFlow(ctx);
  });

  // ────────────────────────────────────────────────
  //  /help — Explain mechanics
  // ────────────────────────────────────────────────

  bot.command('help', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;

    await ensureAppConfig();

    const kb = new InlineKeyboard()
      .text('⭐ Balance', 'cb:balance')
      .text('💎 Claim', 'cb:claim');

    const ratesBlock =
      rewardPerAction && dailyCap
        ? '💰 Reward rates:\n' +
          `  • ${rewardPerAction} SOCIAL per message\n` +
          `  • ${dailyCap} SOCIAL daily cap\n\n`
        : '';

    const helpText =
      `${brandLine()}\n\n` +
      `❓ How Rewards Work\n\n` +
      '1️⃣ Be active in the group — send meaningful messages\n' +
      '2️⃣ Earn SOCIAL tokens automatically\n' +
      '3️⃣ Claim your tokens with /claim\n\n' +
      ratesBlock +
      '🔗 Commands:\n' +
      '  /start — Link your NEAR account\n' +
      '  /balance — Check your rewards\n' +
      '  /claim — Withdraw your tokens\n' +
      '  /help — This message';
    await ctx.reply(helpText, { reply_markup: kb });
  });

  // ────────────────────────────────────────────────
  //  Callback queries
  // ────────────────────────────────────────────────

  bot.callbackQuery('cb:link', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('Enter your NEAR account (e.g. alice.near):', {
      reply_markup: { force_reply: true as const, selective: true },
    });
  });

  bot.callbackQuery('cb:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ensureAppConfig();

    const kb = new InlineKeyboard()
      .text('🔗 Link Account', 'cb:link')
      .row()
      .text('⭐ Balance', 'cb:balance')
      .text('💎 Claim', 'cb:claim');

    const ratesBlock =
      rewardPerAction && dailyCap
        ? '💰 Reward rates:\n' +
          `  • ${rewardPerAction} SOCIAL per message\n` +
          `  • ${dailyCap} SOCIAL daily cap\n\n`
        : '';

    const helpText =
      `${brandLine()}\n\n` +
      `❓ How Rewards Work\n\n` +
      '1️⃣ Be active in the group — send meaningful messages\n' +
      '2️⃣ Earn SOCIAL tokens automatically\n' +
      '3️⃣ Claim your tokens with /claim\n\n' +
      ratesBlock +
      '🔗 Commands:\n' +
      '  /start — Link your NEAR account\n' +
      '  /balance — Check your rewards\n' +
      '  /claim — Withdraw your tokens\n' +
      '  /help — This message';
    await ctx.reply(helpText, { reply_markup: kb });
  });

  bot.callbackQuery('cb:balance', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ensureAppConfig();
    const telegramId = ctx.from.id;
    const accountId = await store.get(telegramId);
    if (!accountId) {
      await ctx.reply(
        '❌ No NEAR account linked.\nUse /start your-account.near first.'
      );
      return;
    }
    try {
      const text = await buildBalanceText(accountId);
      const kb = new InlineKeyboard()
        .text('💎 Claim', 'cb:claim')
        .text('🔄 Refresh', 'cb:balance')
        .row()
        .url('🔗 Contract', tokenUrl());
      await ctx.reply(text, {
        parse_mode: 'Markdown',
        reply_markup: kb,
      });
    } catch (err) {
      onError(err, 'balance callback');
      await ctx.reply('⚠️ Could not fetch balance. Please try again later.');
    }
  });

  bot.callbackQuery('cb:claim', async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleClaimFlow(ctx);
  });

  bot.callbackQuery('cb:claim:confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = ctx.from.id;
    const accountId = await store.get(telegramId);
    if (!accountId) return;

    try {
      await ctx.editMessageText('⏳ Claiming your tokens...').catch(() => {});
    } catch {
      // ignore
    }

    try {
      const result: ClaimResponse = await rewards.claim(accountId);
      if (!result.success) throw new Error(result.error || 'Claim failed');

      const claimed = formatSocial(result.claimed);
      const brand = result.powered_by ?? brandLine();

      const txUrl = result.tx_hash
        ? (config.rewardsContract ?? 'rewards.onsocial.near').endsWith(
            '.testnet'
          )
          ? `https://testnet.nearblocks.io/txns/${result.tx_hash}`
          : `https://nearblocks.io/txns/${result.tx_hash}`
        : null;

      const kb = new InlineKeyboard();
      if (txUrl) kb.url('🔗 View Transaction', txUrl).row();
      kb.text('⭐ Balance', 'cb:balance');

      await ctx.reply(`${brand}\n\n✅ Claimed ${claimed} SOCIAL!`, {
        reply_markup: kb,
      });
    } catch (err) {
      onError(err, 'claim confirm');
      const kb = new InlineKeyboard().text('🔄 Try Again', 'cb:claim');
      await ctx.reply('⚠️ Claim failed. Please try again later.', {
        reply_markup: kb,
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

  // ────────────────────────────────────────────────
  //  Private chat: plain text → account linking
  // ────────────────────────────────────────────────

  bot.on('message', async (ctx, next) => {
    if (ctx.chat?.type === 'private' && ctx.message?.text) {
      const text = ctx.message.text.trim().toLowerCase();
      if (NEAR_ACCOUNT_RE.test(text)) {
        await linkAccount(ctx, ctx.from!.id, text);
        return;
      }
    }
    await next();
  });

  // ────────────────────────────────────────────────
  //  Group messages → credit rewards
  // ────────────────────────────────────────────────

  bot.on('message', async (ctx) => {
    const msg = ctx.message;
    if (!msg?.from || msg.from.is_bot) return;
    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') return;
    if (!msg.text || msg.text.trim().length < minMessageLength) return;

    const telegramId = msg.from.id;
    const accountId = await store.get(telegramId);
    if (!accountId) return; // unlinked — nothing to do (no Postgres for pending)

    // Cooldown
    const now = Date.now();
    const last = lastReward.get(telegramId) ?? 0;
    if (now - last < cooldownMs) return;

    // Per-telegram daily cap — prevents cycling NEAR accounts to bypass cap
    const dayKey = `${telegramId}:${Math.floor(now / 86_400_000)}`;
    const dailyUsed = dailyCredits.get(dayKey) ?? 0;
    const capNum = dailyCap ? Number(dailyCap) : Infinity;
    const perAction = rewardPerAction ? Number(rewardPerAction) : 0.1;
    if (dailyUsed + perAction > capNum) return;

    // Lazy-load config on first credit (non-blocking if it fails)
    ensureAppConfig().catch(() => {});

    try {
      const result = await rewards.credit({
        accountId,
        source: 'message',
      });
      if (result.success) {
        lastReward.set(telegramId, now);
        dailyCredits.set(dayKey, dailyUsed + perAction);
        config.onReward?.(accountId, 'message');
      }
    } catch (err) {
      onError(err, 'credit');
    }
  });

  // ────────────────────────────────────────────────
  //  Error handler
  // ────────────────────────────────────────────────

  bot.catch((err) => {
    onError(err.error, `bot error in ${err.ctx?.update?.update_id}`);
  });

  // ────────────────────────────────────────────────
  //  Helpers (scoped)
  // ────────────────────────────────────────────────

  async function linkAccount(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctx: any,
    telegramId: number,
    input: string
  ): Promise<void> {
    const accountId = input.toLowerCase().trim();
    if (!NEAR_ACCOUNT_RE.test(accountId)) {
      await ctx.reply('❌ Invalid NEAR account format.');
      return;
    }

    // Note if switching away from an account with unclaimed balance
    const currentAccount = await store.get(telegramId);
    if (currentAccount && currentAccount !== accountId) {
      try {
        const claimable = await rewards.getClaimable(currentAccount);
        if (claimable !== '0') {
          const unclaimed = formatSocial(claimable);
          const minNum = config.minClaimAmount ?? 1;
          const minYocto = BigInt(Math.floor(minNum * 1e18));
          const canClaim = BigInt(claimable) >= minYocto;
          const hint = canClaim
            ? `You can still claim by switching back to \`${currentAccount}\`.`
            : `You need ${minNum} SOCIAL to claim. Keep earning and switch back later.`;
          await ctx.reply(
            `ℹ️ ${unclaimed} SOCIAL remains unclaimed on \`${currentAccount}\`.\n${hint}`,
            { parse_mode: 'Markdown' }
          );
        }
      } catch {
        // Non-blocking — don't prevent re-link if RPC fails
      }
    }

    await store.set(telegramId, accountId);

    const kb = new InlineKeyboard()
      .text('⭐ Balance', 'cb:balance')
      .text('💎 Claim', 'cb:claim');

    const rateInfo =
      rewardPerAction && dailyCap
        ? `Earn ${rewardPerAction} SOCIAL per message (up to ${dailyCap}/day).`
        : 'Earn SOCIAL tokens for being active in the group.';
    const linkedText =
      `${brandLine()}\n\n` + `✅ Linked to \`${accountId}\`!\n\n` + rateInfo;
    await ctx.reply(linkedText, {
      reply_markup: kb,
      parse_mode: 'Markdown',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleClaimFlow(ctx: any): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const accountId = await store.get(telegramId);
    if (!accountId) {
      await ctx.reply(
        '❌ No NEAR account linked.\nUse /start your-account.near first.'
      );
      return;
    }

    try {
      const claimable = await rewards.getClaimable(accountId);
      if (!claimable || claimable === '0') {
        const kb = new InlineKeyboard().text('⭐ Balance', 'cb:balance');
        await ctx.reply(
          '🚀 Nothing to claim yet. Keep being active in the group!',
          { reply_markup: kb }
        );
        return;
      }

      const claimableBig = BigInt(claimable);
      if (claimableBig < minClaimYocto) {
        const current = formatSocial(claimable);
        const kb = new InlineKeyboard().text('⭐ Balance', 'cb:balance');
        await ctx.reply(
          `🚀 You have ${current} SOCIAL unclaimed, but the minimum claim is ${minClaimAmount} SOCIAL.\n` +
            'Keep being active to earn more!',
          { reply_markup: kb }
        );
        return;
      }

      const human = formatSocial(claimable);
      const kb = new InlineKeyboard()
        .text('✅ Confirm Claim', 'cb:claim:confirm')
        .text('❌ Cancel', 'cb:claim:cancel');

      await ctx.reply(`Ready to claim ${human} SOCIAL?`, {
        reply_markup: kb,
      });
    } catch (err) {
      onError(err, 'claim flow');
      await ctx.reply('⚠️ Could not check balance. Please try again later.');
    }
  }

  return bot;
}
