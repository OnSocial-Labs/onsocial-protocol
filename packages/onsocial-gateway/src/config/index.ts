import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveNearRpcUrl, type Network } from '@onsocial/rpc';
import type { Tier } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Only load .env files in development (Docker passes env vars directly)
if (process.env.NODE_ENV !== 'production') {
  // Load root .env (single source of truth for non-secret config)
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
}

/**
 * Pull a secret from Google Secret Manager (dev only).
 * Returns '' if gcloud is unavailable or the secret doesn't exist.
 */
function gsmSecret(name: string): string {
  try {
    const project = process.env.GCP_PROJECT || 'onsocial-protocol';
    return execSync(
      `gcloud secrets versions access latest --secret="${name}" --project="${project}"`,
      { timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString().trim();
  } catch {
    return '';
  }
}

/**
 * Read env var, falling back to GSM in development.
 * In production, env vars must be set explicitly (Docker/systemd).
 */
function env(name: string, fallback = ''): string {
  if (process.env[name]) return process.env[name];
  if (process.env.NODE_ENV === 'production') return fallback;
  const secret = gsmSecret(name);
  if (secret) process.env[name] = secret; // cache for the process lifetime
  return secret || fallback;
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT — MUST be set in production
  jwtSecret: (() => {
    const secret = env('JWT_SECRET');
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET must be set in production');
    }
    return secret || 'dev-secret-change-in-production';
  })(),
  jwtExpiresIn: '1h',

  // CORS — comma-separated allowed origins, default '*' for dev
  corsOrigins: process.env.CORS_ORIGINS || '*',

  // NEAR
  nearNetwork: process.env.NEAR_NETWORK || 'testnet',
  nearRpcUrl: resolveNearRpcUrl(
    (process.env.NEAR_NETWORK || 'testnet') as Network,
    { lavaApiKey: env('LAVA_API_KEY') },
  ),
  socialTokenContract:
    process.env.SOCIAL_TOKEN_CONTRACT ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'token.onsocial.near'
      : 'token.onsocial.testnet'),
  stakingContract:
    process.env.STAKING_CONTRACT ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'staking.onsocial.near'
      : 'staking.onsocial.testnet'),

  // Hasura
  hasuraUrl: (() => {
    const url = process.env.HASURA_URL || 'http://localhost:8080';
    return url.endsWith('/v1/graphql') ? url : `${url}/v1/graphql`;
  })(),
  hasuraAdminSecret: (() => {
    const secret = env('HASURA_ADMIN_SECRET');
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: HASURA_ADMIN_SECRET must be set in production');
    }
    return secret || '';
  })(),

  // Lava RPC — private endpoint key, auto-pulled from GSM in dev
  lavaApiKey: env('LAVA_API_KEY'),

  // Lighthouse (storage) — auto-pulled from GSM in dev
  lighthouseApiKey: env('LIGHTHOUSE_API_KEY'),

  // Relay
  relayUrl: process.env.RELAYER_URL || process.env.RELAY_URL || 'http://localhost:3040',
  relayApiKey: env('RELAYER_API_KEY'),

  // Redis (optional — enables shared rate limits across replicas)
  redisUrl: process.env.REDIS_URL || '',

  // Rate limits (requests per minute) — flat tiers
  rateLimits: {
    free: 60,
    pro: 600,
    scale: 3000,
  } as Record<Tier, number>,

  // Flat tier pricing (USD/month via SOCIAL tokens)
  tierPricing: {
    pro: 49,   // $49/month in SOCIAL
    scale: 199, // $199/month in SOCIAL
  },

  // Price oracle
  refPoolId: parseInt(process.env.REF_POOL_ID || '0', 10),
  socialPriceUsd: parseFloat(process.env.SOCIAL_PRICE_USD || '0.10'),
} as const;

export type Config = typeof config;
