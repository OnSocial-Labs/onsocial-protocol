import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveNearRpcUrl, type Network } from '@onsocial/rpc';
import { createRequire } from 'node:module';
import type { Tier } from '../types/index.js';

const require = createRequire(import.meta.url);

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
      { timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
      .toString()
      .trim();
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

// Lazy-loaded to break circular: config → client → logger → config
let _revolutClient:
  | InstanceType<typeof import('../services/revolut/client.js').RevolutClient>
  | null
  | undefined;

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
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',

  // Refresh token — separate secret, longer lifetime
  // Derives from JWT_SECRET via HMAC if REFRESH_SECRET is not explicitly set.
  refreshSecret: (() => {
    const secret = env('REFRESH_SECRET');
    if (secret) return secret;
    const jwtSecret = env('JWT_SECRET');
    if (jwtSecret) {
      return createHmac('sha256', jwtSecret)
        .update('onsocial-refresh-token')
        .digest('hex');
    }
    return 'dev-refresh-secret-change-in-production';
  })(),
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
  /** Max-Age for the refresh cookie in seconds (default 7 days). */
  refreshCookieMaxAge: parseInt(
    process.env.REFRESH_COOKIE_MAX_AGE || String(7 * 24 * 60 * 60),
    10
  ),
  /** Cookie name for refresh token. */
  refreshCookieName: 'onsocial_refresh',

  // CORS — comma-separated allowed origins, default '*' for dev
  corsOrigins: process.env.CORS_ORIGINS || '*',

  // NEAR
  nearNetwork: process.env.NEAR_NETWORK || 'testnet',
  nearRpcUrl: resolveNearRpcUrl(
    (process.env.NEAR_NETWORK || 'testnet') as Network,
    { lavaApiKey: env('LAVA_API_KEY') }
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

  // Nearblocks — optional API key for higher limits
  nearblocksApiUrl:
    process.env.NEARBLOCKS_API_URL ||
    ((process.env.NEAR_NETWORK || 'testnet') === 'mainnet'
      ? 'https://api.nearblocks.io'
      : 'https://api-testnet.nearblocks.io'),
  nearblocksApiKey: env('NEARBLOCKS_API_KEY'),

  // Lighthouse (storage) — auto-pulled from GSM in dev
  lighthouseApiKey: env('LIGHTHOUSE_API_KEY'),

  // Relay
  relayUrl:
    process.env.RELAYER_URL || process.env.RELAY_URL || 'http://localhost:3040',
  relayApiKey: env('RELAYER_API_KEY'),

  // Redis (optional — enables shared rate limits across replicas)
  redisUrl: process.env.REDIS_URL || '',

  // Rate limits (requests per minute) — flat tiers
  rateLimits: {
    free: 60,
    pro: 600,
    scale: 3000,
    service: 10000,
  } as Record<Tier, number>,

  // Revolut Merchant API (keys pulled from GSM — lazy + dynamic import to avoid circular init)
  get revolutClient() {
    if (_revolutClient !== undefined) return _revolutClient;
    const secretKey = env('REVOLUT_SECRET_KEY');
    if (!secretKey) {
      _revolutClient = null;
      return null;
    }
    // Pre-populate variation IDs from GSM so plans.ts can read process.env
    env('REVOLUT_PRO_VARIATION_ID');
    env('REVOLUT_SCALE_VARIATION_ID');
    const { RevolutClient } =
      require('../services/revolut/client.js') as typeof import('../services/revolut/client.js');
    _revolutClient = new RevolutClient({
      secretKey,
      publicKey: env('REVOLUT_PUBLIC_KEY'),
      webhookSigningSecret: env('REVOLUT_WEBHOOK_SIGNING_SECRET'),
      apiUrl:
        env('REVOLUT_API_URL') || 'https://sandbox-merchant.revolut.com/api',
      apiVersion: process.env.REVOLUT_API_VERSION || '2025-12-04',
    });
    return _revolutClient;
  },
} as const;

export type Config = typeof config;
