import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Tier } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Only load .env files in development (Docker passes env vars directly)
if (process.env.NODE_ENV !== 'production') {
  // Load root .env first (shared secrets), then local .env (overrides)
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  dotenv.config(); // Local .env overrides
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: '1h',

  // NEAR
  nearNetwork: process.env.NEAR_NETWORK || 'testnet',
  nearRpcUrl: process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org',
  socialTokenContract:
    process.env.SOCIAL_TOKEN_CONTRACT || 'social.testnet',
  stakingContract:
    process.env.STAKING_CONTRACT || 'staking.onsocial.testnet',

  // Hasura
  hasuraUrl: (() => {
    const url = process.env.HASURA_URL || 'http://localhost:8080';
    return url.endsWith('/v1/graphql') ? url : `${url}/v1/graphql`;
  })(),
  hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET || '',

  // Lighthouse (storage)
  lighthouseApiKey: process.env.LIGHTHOUSE_API_KEY || '',

  // Relay
  relayUrl: process.env.RELAY_URL || 'http://localhost:3030',

  // Rate limits (requests per minute)
  rateLimits: {
    free: 60,
    starter: 120,
    staker: 600,
    builder: 6000,
    pro: 1000000,  // Effectively unlimited
  } as Record<Tier, number>,

  // Tier thresholds (in SOCIAL tokens, 24 decimals)
  // Phase 1: Simple balance check. Phase 2 will add USD oracle + lock contracts
  tierThresholds: {
    staker: BigInt('100000000000000000000000000'), // 100 SOCIAL (placeholder)
    builder: BigInt('1000000000000000000000000000'), // 1000 SOCIAL (placeholder)
  },
} as const;

export type Config = typeof config;
