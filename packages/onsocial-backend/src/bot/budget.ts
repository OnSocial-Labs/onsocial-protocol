import type { CommandContext, Context } from 'grammy';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { viewContract } from '../services/near.js';
import { formatSocial } from './balance.js';

interface AppBudgetMetrics {
  daily_budget: string;
  daily_budget_remaining: string;
}

export async function buildBudgetText(): Promise<string> {
  const metrics = await viewContract<AppBudgetMetrics | null>(
    'get_app_metrics',
    {
      app_id: config.appId,
    }
  );

  if (!metrics || metrics.daily_budget === '0') {
    return '📊 Reward pool: no daily limit';
  }

  const leftToday = formatSocial(metrics.daily_budget_remaining);
  const dailyBudget = formatSocial(metrics.daily_budget);

  return `📊 Reward pool: ${leftToday} / ${dailyBudget} SOCIAL left today`;
}

export async function handleBudget(
  ctx: CommandContext<Context>
): Promise<void> {
  if (ctx.chat?.type !== 'private') return;

  try {
    await ctx.reply(await buildBudgetText());
  } catch (err) {
    logger.error({ err }, 'Budget check failed');
    await ctx.reply('⚠️ Could not fetch reward pool. Please try again later.');
  }
}
