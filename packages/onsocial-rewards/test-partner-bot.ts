/**
 * Quick test script — run a partner bot via the @onsocial-id/rewards SDK.
 *
 * Usage:
 *   cd packages/onsocial-rewards
 *   ONSOCIAL_BOT_TOKEN=... ONSOCIAL_API_KEY=... npx tsx test-partner-bot.ts
 */

import { createRewardsBot } from './src/bot.js';

const bot = createRewardsBot({
  botToken: process.env.ONSOCIAL_BOT_TOKEN!,
  apiKey: process.env.ONSOCIAL_API_KEY!,
  appId: process.env.ONSOCIAL_APP_ID || 'test_dapp',
  baseUrl: process.env.ONSOCIAL_BASE_URL || 'http://localhost:4001',
  rewardsContract:
    process.env.ONSOCIAL_REWARDS_CONTRACT || 'rewards.onsocial.testnet',
  onError: (err, ctx) => console.error(`[partner-bot] ${ctx}:`, err),
  onReward: (accountId, source) =>
    console.log(`[partner-bot] ✅ Rewarded ${accountId} for ${source}`),
});

console.log('🤝 Partner bot (test_dapp) starting in long-polling mode…');

bot.start({
  onStart: () => console.log('✅ Partner bot is live!'),
});
