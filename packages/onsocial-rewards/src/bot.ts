// ---------------------------------------------------------------------------
// Bot factory — `createRewardsBot()` gives partners a fully-wired
// Grammy Telegram bot for SOCIAL token rewards in 5 lines of code.
// ---------------------------------------------------------------------------
//
// Grammy is a **peer dependency** — partners install it themselves.
//
// Usage:
//   import { createRewardsBot } from '@onsocial/rewards/bot';
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
import { BANNER_URL } from './banner.js';

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

/** Convert yocto-SOCIAL (18 decimals) to human-readable string. */
export function formatSocial(yocto: string): string {
  if (!yocto || yocto === '0') return '0';
  const padded = yocto.padStart(19, '0');
  const intPart = padded.slice(0, padded.length - 18) || '0';
  const decPart = padded.slice(padded.length - 18, padded.length - 16);
  const dec = decPart.replace(/0+$/, '');
  return dec ? `${intPart}.${dec}` : intPart;
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
  const store: AccountStore = config.store ?? new MemoryAccountStore();
  const onError =
    config.onError ??
    ((err: unknown, ctx: string) => console.error(`[onsocial] ${ctx}:`, err));

  // ── On-chain app config (populated at startup) ──
  let appLabel: string = config.appId;
  let rewardPerAction: string = '?';
  let dailyCap: string = '?';
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
    return `🤝 OnSocial stands with ${appLabel}`;
  }

  /** Token contract link for balance display. */
  function tokenLink(): string {
    const contract = config.rewardsContract ?? 'rewards.onsocial.near';
    const isTestnet = contract.endsWith('.testnet');
    const tokenContract = isTestnet
      ? 'token.onsocial.testnet'
      : 'token.onsocial.near';
    const base = isTestnet
      ? 'https://testnet.nearblocks.io'
      : 'https://nearblocks.io';
    return `🪙 Contract: [${tokenContract}](${base}/token/${tokenContract})`;
  }

  // ── Cooldown state ──
  const lastReward = new Map<number, number>();

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
      if (BANNER_URL) {
        await ctx.replyWithPhoto(BANNER_URL, {
          caption: `✅ Linked to \`${existing}\``,
          reply_markup: kb,
          parse_mode: 'Markdown',
        });
      } else {
        await ctx.reply(`✅ Linked to \`${existing}\``, {
          reply_markup: kb,
          parse_mode: 'Markdown',
        });
      }
    } else {
      const kb = new InlineKeyboard().text('🔗 Link Account', 'cb:link');
      const welcomeText =
        `👋 Welcome to ${appLabel}!\n\n` +
        `Earn ${rewardPerAction} SOCIAL per message (up to ${dailyCap}/day) for being active in the group.\n\n` +
        'Tap below to link your NEAR account and start earning 👇';
      if (BANNER_URL) {
        await ctx.replyWithPhoto(BANNER_URL, {
          caption: welcomeText,
          reply_markup: kb,
        });
      } else {
        await ctx.reply(welcomeText, { reply_markup: kb });
      }
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
      const [claimable, appReward] = await Promise.all([
        rewards.getClaimable(accountId),
        rewards.getUserAppReward(accountId),
      ]);

      const unclaimedStr = formatSocial(claimable);
      const earned = appReward ? formatSocial(appReward.total_earned) : '0';

      const kb = new InlineKeyboard()
        .text('💎 Claim', 'cb:claim')
        .text('🔄 Refresh', 'cb:balance');

      const balanceText =
        `⭐ Rewards for \`${accountId}\`\n\n` +
        `💎 Unclaimed: ${unclaimedStr} SOCIAL\n` +
        `🏆 Total earned: ${earned} SOCIAL\n\n` +
        brandLine() +
        '\n\n' +
        tokenLink();

      if (BANNER_URL) {
        await ctx.replyWithPhoto(BANNER_URL, {
          caption: balanceText,
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      } else {
        await ctx.reply(balanceText, {
          reply_markup: kb,
          parse_mode: 'Markdown',
        });
      }
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

    const helpText =
      `❓ How ${appLabel} Rewards Work\n\n` +
      '1️⃣ Be active in the group — send meaningful messages\n' +
      '2️⃣ Earn SOCIAL tokens automatically\n' +
      '3️⃣ Claim your tokens with /claim\n\n' +
      '💰 Reward rates:\n' +
      `  • ${rewardPerAction} SOCIAL per message\n` +
      `  • ${dailyCap} SOCIAL daily cap\n\n` +
      '🔗 Commands:\n' +
      '  /start — Link your NEAR account\n' +
      '  /balance — Check your rewards\n' +
      '  /claim — Withdraw your tokens\n' +
      '  /help — This message\n\n' +
      brandLine();
    if (BANNER_URL) {
      await ctx.replyWithPhoto(BANNER_URL, {
        caption: helpText,
        reply_markup: kb,
      });
    } else {
      await ctx.reply(helpText, { reply_markup: kb });
    }
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
      const [claimable, appReward] = await Promise.all([
        rewards.getClaimable(accountId),
        rewards.getUserAppReward(accountId),
      ]);
      const unclaimedStr = formatSocial(claimable);
      const earned = appReward ? formatSocial(appReward.total_earned) : '0';
      const kb = new InlineKeyboard()
        .text('💎 Claim', 'cb:claim')
        .text('🔄 Refresh', 'cb:balance');
      const text =
        `⭐ Rewards for \`${accountId}\`\n\n` +
        `💎 Unclaimed: ${unclaimedStr} SOCIAL\n` +
        `🏆 Total earned: ${earned} SOCIAL\n\n` +
        brandLine() +
        '\n\n' +
        tokenLink();
      // Photo messages can't be edited — always send a fresh one
      if (BANNER_URL) {
        await ctx.replyWithPhoto(BANNER_URL, {
          caption: text,
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      } else {
        await ctx.reply(text, {
          parse_mode: 'Markdown',
          reply_markup: kb,
        });
      }
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
      const kb = new InlineKeyboard().text('⭐ Balance', 'cb:balance');

      const txLink = result.tx_hash
        ? (config.rewardsContract ?? 'rewards.onsocial.near').endsWith(
            '.testnet'
          )
          ? `https://testnet.nearblocks.io/txns/${result.tx_hash}`
          : `https://nearblocks.io/txns/${result.tx_hash}`
        : null;

      const lines = [`✅ Claimed ${claimed} SOCIAL!`, '', brand];
      if (txLink) lines.push('', `🔗 View transaction:\n${txLink}`);

      await ctx.reply(lines.join('\n'), {
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

    // Lazy-load config on first credit (non-blocking if it fails)
    ensureAppConfig().catch(() => {});

    try {
      const result = await rewards.credit({
        accountId,
        source: 'message',
      });
      if (result.success) {
        lastReward.set(telegramId, now);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function linkAccount(
    ctx: any,
    telegramId: number,
    input: string
  ): Promise<void> {
    const accountId = input.toLowerCase().trim();
    if (!NEAR_ACCOUNT_RE.test(accountId)) {
      await ctx.reply('❌ Invalid NEAR account format.');
      return;
    }

    await store.set(telegramId, accountId);

    const kb = new InlineKeyboard()
      .text('⭐ Balance', 'cb:balance')
      .text('💎 Claim', 'cb:claim');

    const linkedText =
      `✅ Linked to \`${accountId}\`!\n\n` +
      "You'll now earn SOCIAL tokens for activity in the group.\n\n" +
      brandLine();
    if (BANNER_URL) {
      await ctx.replyWithPhoto(BANNER_URL, {
        caption: linkedText,
        reply_markup: kb,
        parse_mode: 'Markdown',
      });
    } else {
      await ctx.reply(linkedText, { reply_markup: kb, parse_mode: 'Markdown' });
    }
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
          '🌱 Nothing to claim yet. Keep being active in the group!',
          { reply_markup: kb }
        );
        return;
      }

      const human = formatSocial(claimable);
      const kb = new InlineKeyboard()
        .text('✅ Confirm Claim', 'cb:claim:confirm')
        .text('❌ Cancel', 'cb:claim:cancel');

      if (BANNER_URL) {
        await ctx.replyWithPhoto(BANNER_URL, {
          caption: `Ready to claim ${human} SOCIAL?`,
          reply_markup: kb,
        });
      } else {
        await ctx.reply(`Ready to claim ${human} SOCIAL?`, {
          reply_markup: kb,
        });
      }
    } catch (err) {
      onError(err, 'claim flow');
      await ctx.reply('⚠️ Could not check balance. Please try again later.');
    }
  }

  return bot;
}
