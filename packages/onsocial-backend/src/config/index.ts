import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Only load .env files in development (Docker passes env vars directly)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`FATAL: ${name} must be set`);
  }
  return value;
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Telegram
  telegramBotToken: required('TELEGRAM_BOT_TOKEN'),
  /** Comma-separated Telegram group IDs where the bot tracks activity. */
  telegramGroupIds: (process.env.TELEGRAM_GROUP_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // NEAR / Relayer
  relayerUrl: process.env.RELAYER_URL || 'http://localhost:3040',
  relayerApiKey: process.env.RELAYER_API_KEY || '',
  nearNetwork: process.env.NEAR_NETWORK || 'testnet',
  rewardsContract:
    process.env.REWARDS_CONTRACT ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'rewards.onsocial.near'
      : 'rewards.onsocial.testnet'),
  nearRpcUrl:
    process.env.NEAR_RPC_URL ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'https://free.rpc.fastnear.com'
      : 'https://test.rpc.fastnear.com'),
  governanceDao:
    process.env.GOVERNANCE_DAO_ACCOUNT ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'governance.onsocial.near'
      : 'governance.onsocial.testnet'),
  relayerAccount:
    process.env.RELAYER_ACCOUNT ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'relayer.onsocial.near'
      : 'relayer.onsocial.testnet'),

  // Postgres
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/onsocial_backend',

  // Bot
  botUsername: process.env.BOT_USERNAME || 'onsocial_pulse_bot',

  /** On-chain app identifier used when crediting rewards. */
  appId: process.env.ONSOCIAL_APP_ID || 'onsocial_telegram',

  // Reward amounts (SOCIAL tokens, decimal)
  rewards: {
    /** Amount credited per qualifying group message. */
    messageReward: parseFloat(process.env.REWARD_MESSAGE || '0.1'),
    /** Amount credited per reaction given/received. */
    reactionReward: parseFloat(process.env.REWARD_REACTION || '0.1'),
    /** Maximum SOCIAL tokens per user per day (must match on-chain max_daily). */
    dailyCap: parseFloat(process.env.REWARD_DAILY_CAP || '1.0'),
    /** Cooldown between creditable messages from the same user, in seconds. */
    messageCooldownSec: parseInt(
      process.env.REWARD_MESSAGE_COOLDOWN_SEC || '60',
      10
    ),
    /** Minimum text length for a message to qualify as meaningful. */
    minMessageLength: parseInt(
      process.env.REWARD_MIN_MESSAGE_LENGTH || '10',
      10
    ),
    /** Minimum SOCIAL balance required before a user can claim. */
    minClaimAmount: parseFloat(process.env.REWARD_MIN_CLAIM || '1.0'),
    /** Number of qualifying messages before nudging an unlinked user. */
    nudgeThreshold: parseInt(process.env.REWARD_NUDGE_THRESHOLD || '5', 10),
  },
} as const;

export type Config = typeof config;
