// tests/smoke-sdk.test.ts
import { describe, it, expect } from 'vitest';
import { OnSocialSDK } from '../src';

describe('OnSocialSDK (smoke test)', () => {
  it('can be constructed with minimal config', () => {
    const sdk = new OnSocialSDK({ network: 'testnet' });
    expect(sdk).toBeDefined();
    expect(typeof sdk).toBe('object');
    expect(sdk).toHaveProperty('fastGet');
  });
});
