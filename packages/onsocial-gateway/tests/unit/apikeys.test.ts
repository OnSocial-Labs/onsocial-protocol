import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTierInfo = vi.fn();

vi.mock('../../src/config/index.js', () => ({
  config: {
    hasuraAdminSecret: '',
    hasuraUrl: 'http://localhost:8080/v1/graphql',
    nodeEnv: 'test',
  },
}));

vi.mock('../../src/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/tiers/index.js', () => ({
  getTierInfo: (...args: unknown[]) => mockGetTierInfo(...args),
}));

import {
  createApiKey,
  listApiKeys,
  lookupApiKey,
} from '../../src/services/apikeys/index.js';

describe('api key service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates pro-tier keys for subscribed non-admin accounts', async () => {
    mockGetTierInfo.mockResolvedValue({ tier: 'pro', rateLimit: 600 });

    const created = await createApiKey('builder.testnet', 'pro-key');

    expect('code' in created).toBe(false);
    if ('code' in created) {
      return;
    }

    expect(created.tier).toBe('pro');

    const keys = await listApiKeys('builder.testnet');
    expect(keys).toHaveLength(1);
    expect(keys[0].tier).toBe('pro');
    expect(mockGetTierInfo).toHaveBeenCalledWith('builder.testnet');
  });

  it('creates service-tier keys for admin accounts', async () => {
    mockGetTierInfo.mockResolvedValue({ tier: 'service', rateLimit: 10000 });

    const created = await createApiKey('admin.testnet', 'admin-key');

    expect('code' in created).toBe(false);
    if ('code' in created) {
      return;
    }

    expect(created.tier).toBe('service');

    const keys = await listApiKeys('admin.testnet');
    expect(keys).toHaveLength(1);
    expect(keys[0].tier).toBe('service');
  });

  it('uses the live account tier when authenticating an existing API key', async () => {
    const accountId = 'auth-live-tier.testnet';
    mockGetTierInfo
      .mockResolvedValueOnce({ tier: 'scale', rateLimit: 5000 })
      .mockResolvedValueOnce({ tier: 'free', rateLimit: 60 });

    const created = await createApiKey(accountId, 'main-key');
    expect('code' in created).toBe(false);
    if ('code' in created) {
      return;
    }

    const lookedUp = await lookupApiKey(created.rawKey);
    expect(lookedUp).not.toBeNull();
    expect(lookedUp!.tier).toBe('free');
  });

  it('shows the live account tier when listing existing API keys', async () => {
    const accountId = 'list-live-tier.testnet';
    mockGetTierInfo
      .mockResolvedValueOnce({ tier: 'pro', rateLimit: 600 })
      .mockResolvedValueOnce({ tier: 'scale', rateLimit: 5000 });

    const created = await createApiKey(accountId, 'main-key');
    expect('code' in created).toBe(false);
    if ('code' in created) {
      return;
    }

    const keys = await listApiKeys(accountId);
    expect(keys).toHaveLength(1);
    expect(keys[0].tier).toBe('scale');
  });
});
