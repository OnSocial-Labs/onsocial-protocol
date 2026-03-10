# @onsocial-id/rewards

SDK for crediting and claiming **SOCIAL token** rewards through the OnSocial relayer. Works standalone or with a ready-made Telegram bot.

## Install

```bash
npm install @onsocial-id/rewards
# If building a Telegram bot:
npm install @onsocial-id/rewards grammy
```

## Quick Start — SDK Only

```ts
import { OnSocialRewards } from '@onsocial-id/rewards';

const rewards = new OnSocialRewards({
  apiKey: process.env.ONSOCIAL_API_KEY!,
  appId: process.env.ONSOCIAL_APP_ID!,
});

// Credit a reward
await rewards.credit({ accountId: 'alice.near', source: 'message' });

// Gasless claim
const result = await rewards.claim('alice.near');
console.log(result.claimed); // yocto-SOCIAL amount
```

## Quick Start — Telegram Bot

Create a fully-wired Grammy bot in 5 lines:

```ts
import { createRewardsBot } from '@onsocial-id/rewards/bot';

const bot = createRewardsBot({
  botToken: process.env.BOT_TOKEN!,
  apiKey: process.env.ONSOCIAL_API_KEY!,
  appId: process.env.ONSOCIAL_APP_ID!,
});

bot.start();
```

The bot auto-handles:

- `/start` — Link a NEAR account
- `/balance` — Check rewards
- `/claim` — Gasless token claim
- `/help` — Explain reward mechanics
- Group messages → auto-credit rewards (with cooldown)

### Environment Variables

| Variable           | Description                                                  |
| ------------------ | ------------------------------------------------------------ |
| `BOT_TOKEN`        | Telegram bot token from [@BotFather](https://t.me/BotFather) |
| `ONSOCIAL_API_KEY` | Your OnSocial partner API key                                |
| `ONSOCIAL_APP_ID`  | Your registered app ID                                       |

## API Reference

### `OnSocialRewards`

| Method                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `credit(req)`                 | Credit a reward to a NEAR account      |
| `claim(accountId)`            | Gasless claim of pending rewards       |
| `getUserReward(accountId)`    | Get global reward state (via RPC)      |
| `getUserAppReward(accountId)` | Get per-app reward state (via API)     |
| `getClaimable(accountId)`     | Get claimable balance in yocto-SOCIAL  |
| `getAppConfig()`              | Get your app's on-chain configuration  |
| `getContractInfo()`           | Get contract-level info (pool, totals) |
| `badge(name?)`                | Branding string for partner UIs        |

### `createRewardsBot(config)`

| Option             | Default                   | Description                              |
| ------------------ | ------------------------- | ---------------------------------------- |
| `botToken`         | —                         | Telegram bot token (required)            |
| `apiKey`           | —                         | OnSocial API key (required)              |
| `appId`            | —                         | Your app ID (required)                   |
| `baseUrl`          | `https://api.onsocial.id` | API base URL                             |
| `rewardsContract`  | `rewards.onsocial.near`   | NEAR contract                            |
| `minMessageLength` | `10`                      | Min text length for reward               |
| `cooldownSec`      | `60`                      | Seconds between rewarded messages        |
| `store`            | In-memory Map             | Custom `AccountStore` (Redis, Postgres…) |
| `onReward`         | —                         | Callback after successful credit         |
| `onError`          | `console.error`           | Error handler                            |

## Custom Account Store

By default, Telegram ↔ NEAR account mappings are stored in memory.  
For production, provide a persistent store:

```ts
import { createRewardsBot, type AccountStore } from '@onsocial-id/rewards/bot';

const store: AccountStore = {
  async get(telegramId) {
    /* Redis/Postgres lookup */
  },
  async set(telegramId, accountId) {
    /* persist */
  },
};

const bot = createRewardsBot({ botToken, apiKey, appId, store });
```

## How It Works

1. **Partner registers** on [portal.onsocial.id/partners](https://portal.onsocial.id/partners) → receives API key
2. **OnSocial approves** and configures reward rates and daily caps on-chain
3. **Users interact** → SDK credits rewards via the gasless relayer
4. **Users claim** → tokens transfer from pool to user (zero gas)

## License

MIT — [OnSocial Labs](https://portal.onsocial.id)
