import { afterEach, describe, it, expect, vi } from 'vitest';

// MemoryStore is used when NODE_ENV !== 'production' and HASURA_ADMIN_SECRET is unset
import {
  HasuraStore,
  subscriptionStore,
  type SubscriptionRecord,
} from '../../src/services/revolut/subscriptions.js';

// ── Helpers ───────────────────────────────────────────────────

function futureISO(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3600_000).toISOString();
}

function pastISO(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

const baseSub: Omit<SubscriptionRecord, 'createdAt' | 'updatedAt'> = {
  id: 'sub-1',
  accountId: 'alice.testnet',
  tier: 'pro',
  status: 'active',
  revolutSubscriptionId: 'rev-sub-1',
  revolutCustomerId: 'rev-cust-1',
  revolutSetupOrderId: 'rev-setup-1',
  revolutLastOrderId: 'rev-order-1',
  promotionCode: null,
  promotionCyclesRemaining: 0,
  currentPeriodStart: pastISO(24),
  currentPeriodEnd: futureISO(24 * 29), // ~29 days left
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────

describe('SubscriptionStore (MemoryStore)', () => {
  // Reset store between tests by upserting with a fresh state
  // MemoryStore is a singleton — we just overwrite or rely on unique accountIds

  describe('upsert + getByAccount', () => {
    it('should store and retrieve a subscription', async () => {
      await subscriptionStore.upsert(baseSub);
      const sub = await subscriptionStore.getByAccount('alice.testnet');
      expect(sub).not.toBeNull();
      expect(sub!.accountId).toBe('alice.testnet');
      expect(sub!.tier).toBe('pro');
      expect(sub!.status).toBe('active');
      expect(sub!.createdAt).toBeDefined();
      expect(sub!.updatedAt).toBeDefined();
    });

    it('should return null for unknown account', async () => {
      const sub = await subscriptionStore.getByAccount('unknown.testnet');
      expect(sub).toBeNull();
    });

    it('should update existing subscription on upsert', async () => {
      await subscriptionStore.upsert(baseSub);
      const first = await subscriptionStore.getByAccount('alice.testnet');

      await subscriptionStore.upsert({ ...baseSub, tier: 'scale' });
      const updated = await subscriptionStore.getByAccount('alice.testnet');

      expect(updated!.tier).toBe('scale');
      // createdAt should be preserved
      expect(updated!.createdAt).toBe(first!.createdAt);
    });
  });

  describe('getActiveByAccount', () => {
    it('should return active subscription with valid period', async () => {
      await subscriptionStore.upsert(baseSub);
      const sub = await subscriptionStore.getActiveByAccount('alice.testnet');
      expect(sub).not.toBeNull();
      expect(sub!.tier).toBe('pro');
    });

    it('should return null for cancelled subscription', async () => {
      await subscriptionStore.upsert({ ...baseSub, status: 'cancelled' });
      const sub = await subscriptionStore.getActiveByAccount('alice.testnet');
      expect(sub).toBeNull();
    });

    it('should return null for past_due subscription', async () => {
      await subscriptionStore.upsert({ ...baseSub, status: 'past_due' });
      const sub = await subscriptionStore.getActiveByAccount('alice.testnet');
      expect(sub).toBeNull();
    });

    it('should return null for expired period', async () => {
      await subscriptionStore.upsert({
        ...baseSub,
        currentPeriodEnd: pastISO(1),
      });
      const sub = await subscriptionStore.getActiveByAccount('alice.testnet');
      expect(sub).toBeNull();
    });

    it('should return null for unknown account', async () => {
      const sub = await subscriptionStore.getActiveByAccount('nobody.testnet');
      expect(sub).toBeNull();
    });
  });

  describe('getWithValidPeriod', () => {
    it('should return active subscription with valid period', async () => {
      await subscriptionStore.upsert(baseSub);
      const sub = await subscriptionStore.getWithValidPeriod('alice.testnet');
      expect(sub).not.toBeNull();
      expect(sub!.tier).toBe('pro');
    });

    it('should return cancelled subscription if period is still valid', async () => {
      await subscriptionStore.upsert({
        ...baseSub,
        status: 'cancelled',
        currentPeriodEnd: futureISO(24 * 10), // 10 days left
      });
      const sub = await subscriptionStore.getWithValidPeriod('alice.testnet');
      expect(sub).not.toBeNull();
      expect(sub!.status).toBe('cancelled');
      expect(sub!.tier).toBe('pro');
    });

    it('should return past_due subscription if period is still valid', async () => {
      await subscriptionStore.upsert({
        ...baseSub,
        status: 'past_due',
        currentPeriodEnd: futureISO(24 * 5),
      });
      const sub = await subscriptionStore.getWithValidPeriod('alice.testnet');
      expect(sub).not.toBeNull();
      expect(sub!.status).toBe('past_due');
      expect(sub!.tier).toBe('pro');
    });

    it('should return null for expired period regardless of status', async () => {
      await subscriptionStore.upsert({
        ...baseSub,
        status: 'active',
        currentPeriodEnd: pastISO(1),
      });
      const sub = await subscriptionStore.getWithValidPeriod('alice.testnet');
      expect(sub).toBeNull();
    });

    it('should return null for unknown account', async () => {
      const sub = await subscriptionStore.getWithValidPeriod('nobody.testnet');
      expect(sub).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status to cancelled', async () => {
      await subscriptionStore.upsert(baseSub);
      await subscriptionStore.updateStatus('alice.testnet', 'cancelled');
      const sub = await subscriptionStore.getByAccount('alice.testnet');
      expect(sub!.status).toBe('cancelled');
    });

    it('should update status to past_due', async () => {
      await subscriptionStore.upsert(baseSub);
      await subscriptionStore.updateStatus('alice.testnet', 'past_due');
      const sub = await subscriptionStore.getByAccount('alice.testnet');
      expect(sub!.status).toBe('past_due');
    });
  });

  describe('updatePeriod', () => {
    it('should update period and last order', async () => {
      await subscriptionStore.upsert(baseSub);
      const newStart = new Date().toISOString();
      const newEnd = futureISO(24 * 30);
      await subscriptionStore.updatePeriod(
        'alice.testnet',
        newStart,
        newEnd,
        'new-order-id'
      );
      const sub = await subscriptionStore.getByAccount('alice.testnet');
      expect(sub!.currentPeriodStart).toBe(newStart);
      expect(sub!.currentPeriodEnd).toBe(newEnd);
      expect(sub!.revolutLastOrderId).toBe('new-order-id');
    });
  });

  describe('findBySetupOrderId', () => {
    it('should find subscription by setup order', async () => {
      await subscriptionStore.upsert(baseSub);
      const sub = await subscriptionStore.findBySetupOrderId('rev-setup-1');
      expect(sub).not.toBeNull();
      expect(sub!.accountId).toBe('alice.testnet');
    });

    it('should return null for unknown setup order', async () => {
      const sub = await subscriptionStore.findBySetupOrderId('unknown');
      expect(sub).toBeNull();
    });
  });

  describe('findByRevolutSubscriptionId', () => {
    it('should find by revolut subscription id', async () => {
      await subscriptionStore.upsert(baseSub);
      const sub =
        await subscriptionStore.findByRevolutSubscriptionId('rev-sub-1');
      expect(sub).not.toBeNull();
      expect(sub!.accountId).toBe('alice.testnet');
    });

    it('should return null for unknown revolut subscription id', async () => {
      const sub =
        await subscriptionStore.findByRevolutSubscriptionId('unknown');
      expect(sub).toBeNull();
    });
  });

  describe('listActiveWithRevolutSub', () => {
    it('should list active subscriptions with revolut id', async () => {
      await subscriptionStore.upsert(baseSub);
      await subscriptionStore.upsert({
        ...baseSub,
        id: 'sub-cancelled',
        accountId: 'bob.testnet',
        status: 'cancelled',
        revolutSubscriptionId: 'rev-sub-2',
      });
      const list = await subscriptionStore.listActiveWithRevolutSub();
      const accountIds = list.map((s) => s.accountId);
      expect(accountIds).toContain('alice.testnet');
      expect(accountIds).not.toContain('bob.testnet');
    });
  });

  describe('decrementPromoCycles', () => {
    it('should decrement promo cycles', async () => {
      await subscriptionStore.upsert({
        ...baseSub,
        promotionCyclesRemaining: 3,
      });
      const remaining =
        await subscriptionStore.decrementPromoCycles('alice.testnet');
      expect(remaining).toBe(2);

      const sub = await subscriptionStore.getByAccount('alice.testnet');
      expect(sub!.promotionCyclesRemaining).toBe(2);
    });

    it('should not go below zero', async () => {
      await subscriptionStore.upsert({
        ...baseSub,
        promotionCyclesRemaining: 0,
      });
      const remaining =
        await subscriptionStore.decrementPromoCycles('alice.testnet');
      expect(remaining).toBe(0);
    });
  });
});

describe('HasuraStore', () => {
  it('falls back to update when insert_one on_conflict is unsupported', async () => {
    const store = new HasuraStore(
      'https://hasura.example/v1/graphql',
      'secret'
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        json: async () => ({
          errors: [
            {
              message:
                "'insertDeveloperSubscriptionsOne' has no argument named 'on_conflict'",
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            developerSubscriptions: [
              {
                ...baseSub,
                createdAt: pastISO(48),
                updatedAt: pastISO(24),
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            updateDeveloperSubscriptions: { affectedRows: 1 },
          },
        }),
      } as Response);

    await store.upsert({ ...baseSub, tier: 'scale' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstBody.query).toContain('DeveloperSubscriptionsInsertInput!');
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
    });
    const thirdBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(thirdBody.query).toContain('updateDeveloperSubscriptions');
    expect(thirdBody.variables.tier).toBe('scale');
  });

  it('falls back to plain insert when insert_one on_conflict is unsupported and no row exists', async () => {
    const store = new HasuraStore(
      'https://hasura.example/v1/graphql',
      'secret'
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        json: async () => ({
          errors: [
            {
              message:
                "'insertDeveloperSubscriptionsOne' has no argument named 'on_conflict'",
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            developerSubscriptions: [],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            insertDeveloperSubscriptionsOne: { id: baseSub.id },
          },
        }),
      } as Response);

    await store.upsert(baseSub);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(thirdBody.query).toContain('DeveloperSubscriptionsInsertInput!');
    expect(thirdBody.query).toContain(
      'insertDeveloperSubscriptionsOne(object: $obj)'
    );
    expect(thirdBody.query).not.toContain('on_conflict');
    expect(thirdBody.variables.obj.accountId).toBe(baseSub.accountId);
  });
});
