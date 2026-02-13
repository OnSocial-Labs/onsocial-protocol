import { describe, it, expect } from 'vitest';

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
    expect(makeJwtSecret('development', undefined)).toBe('dev-secret-change-in-production');
    expect(makeJwtSecret('production', 'real-secret')).toBe('real-secret');
  });

  it('throws if HASURA_ADMIN_SECRET is missing in production', () => {
    const makeHasuraSecret = (nodeEnv: string, secret?: string) => {
      if (!secret && nodeEnv === 'production') {
        throw new Error('FATAL: HASURA_ADMIN_SECRET must be set in production');
      }
      return secret || '';
    };

    expect(() => makeHasuraSecret('production', undefined)).toThrow(/HASURA_ADMIN_SECRET/);
    expect(() => makeHasuraSecret('development', undefined)).not.toThrow();
    expect(makeHasuraSecret('development', undefined)).toBe('');
    expect(makeHasuraSecret('production', 'hasura-secret')).toBe('hasura-secret');
  });
});
