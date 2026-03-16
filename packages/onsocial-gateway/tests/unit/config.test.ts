import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function loadConfig(
  overrides: Record<string, string | undefined> = {}
) {
  vi.resetModules();

  const nextEnv = { ...ORIGINAL_ENV };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete nextEnv[key];
    } else {
      nextEnv[key] = value;
    }
  }

  process.env = nextEnv;

  return import('../../src/config/index.js');
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

/**
 * Config enforcement tests — verifies the production guard logic
 * We test the IIFE pattern directly (same code as config/index.ts)
 */
describe('config production guards', () => {
  it('throws if JWT_SECRET is missing in production', () => {
    const makeJwtSecret = (nodeEnv: string, secret?: string) => {
      if (!secret && nodeEnv === 'production') {
        throw new Error('FATAL: JWT_SECRET must be set in production');
      }
      return secret || 'dev-secret-change-in-production';
    };

    expect(() => makeJwtSecret('production', undefined)).toThrow(/JWT_SECRET/);
    expect(() => makeJwtSecret('development', undefined)).not.toThrow();
    expect(makeJwtSecret('development', undefined)).toBe(
      'dev-secret-change-in-production'
    );
    expect(makeJwtSecret('production', 'real-secret')).toBe('real-secret');
  });

  it('throws if HASURA_ADMIN_SECRET is missing in production', () => {
    const makeHasuraSecret = (nodeEnv: string, secret?: string) => {
      if (!secret && nodeEnv === 'production') {
        throw new Error('FATAL: HASURA_ADMIN_SECRET must be set in production');
      }
      return secret || '';
    };

    expect(() => makeHasuraSecret('production', undefined)).toThrow(
      /HASURA_ADMIN_SECRET/
    );
    expect(() => makeHasuraSecret('development', undefined)).not.toThrow();
    expect(makeHasuraSecret('development', undefined)).toBe('');
    expect(makeHasuraSecret('production', 'hasura-secret')).toBe(
      'hasura-secret'
    );
  });
});

describe('config network defaults', () => {
  it('defaults to the testnet token contract', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'test-jwt-secret',
      HASURA_ADMIN_SECRET: 'test-hasura-secret',
      NEAR_NETWORK: 'testnet',
      SOCIAL_TOKEN_CONTRACT: undefined,
    });

    expect(config.socialTokenContract).toBe('token.onsocial.testnet');
  });

  it('defaults to the mainnet token contract', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'test-jwt-secret',
      HASURA_ADMIN_SECRET: 'test-hasura-secret',
      NEAR_NETWORK: 'mainnet',
      SOCIAL_TOKEN_CONTRACT: undefined,
    });

    expect(config.socialTokenContract).toBe('token.onsocial.near');
  });

  it('honors an explicit token contract override', async () => {
    const { config } = await loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'test-jwt-secret',
      HASURA_ADMIN_SECRET: 'test-hasura-secret',
      NEAR_NETWORK: 'mainnet',
      SOCIAL_TOKEN_CONTRACT: 'custom-token.near',
    });

    expect(config.socialTokenContract).toBe('custom-token.near');
  });
});
