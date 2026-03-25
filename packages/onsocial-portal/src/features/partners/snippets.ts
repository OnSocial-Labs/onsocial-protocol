export function installSnippet(tab: 'bot' | 'sdk') {
  return tab === 'bot'
    ? `npm install @onsocial-id/rewards grammy`
    : `npm install @onsocial-id/rewards`;
}

export function envSnippet(
  appId: string,
  apiKey: string,
  tab: 'bot' | 'sdk',
  options?: { maskApiKey?: boolean }
) {
  const maskedApiKey = `${apiKey.slice(0, 10)}${'•'.repeat(24)}${apiKey.slice(-4)}`;
  const resolvedApiKey = options?.maskApiKey ? maskedApiKey : apiKey;
  const lines = [
    `ONSOCIAL_API_KEY=${resolvedApiKey}`,
    `ONSOCIAL_APP_ID=${appId}`,
  ];
  if (tab === 'bot') {
    lines.unshift(`BOT_TOKEN=your-telegram-bot-token`);
    lines.push(`# MIN_MESSAGE_LENGTH=10   # min chars to earn a reward`);
    lines.push(`# COOLDOWN_SEC=60         # seconds between rewarded messages`);
    lines.push(`# MIN_CLAIM_AMOUNT=1      # min SOCIAL earned to allow claim`);
    lines.push(
      `# NUDGE_THRESHOLD=5       # messages before nudging unlinked users (0=off)`
    );
  }
  return lines.join('\n');
}

export function botSnippet() {
  return `import { createRewardsBot } from '@onsocial-id/rewards/bot';

const bot = createRewardsBot({
  botToken:         process.env.BOT_TOKEN!,
  apiKey:           process.env.ONSOCIAL_API_KEY!,
  appId:            process.env.ONSOCIAL_APP_ID!,
  minMessageLength: Number(process.env.MIN_MESSAGE_LENGTH) || 10,
  cooldownSec:      Number(process.env.COOLDOWN_SEC) || 60,
  minClaimAmount:   Number(process.env.MIN_CLAIM_AMOUNT) || 1,
  nudgeThreshold:   Number(process.env.NUDGE_THRESHOLD) || 5,
});

bot.start({ onStart: () => console.log('✅ Bot is running!') });`;
}

export function sdkOnlySnippet() {
  return `import { OnSocialRewards } from '@onsocial-id/rewards';

const rewards = new OnSocialRewards({
  apiKey: process.env.ONSOCIAL_API_KEY!,
  appId:  process.env.ONSOCIAL_APP_ID!,
});

// Credit a reward
await rewards.credit({ accountId: 'alice.near', source: 'message' });

// Gasless claim
const result = await rewards.claim('alice.near');`;
}

export function packageJsonSnippet() {
  return `{
  "name": "my-onsocial-bot",
  "type": "module",
  "scripts": { "start": "node --env-file=.env --import tsx bot.ts" },
  "dependencies": {
    "@onsocial-id/rewards": "latest",
    "grammy": "^1.0.0",
    "tsx": "^4.0.0"
  }
}`;
}
