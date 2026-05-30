import { describe, expect, it } from 'vitest';
import { buildIdempotencyKey } from '../../src/services/portal-reward-policy.js';

describe('portal-reward-policy', () => {
  it('stand_given idempotency is once per target, not per day', () => {
    const base = {
      action: 'stand_given' as const,
      accountId: 'alice.testnet',
      appId: 'onsocial_portal',
      targetAccountId: 'bob.testnet',
      topic: null,
    };

    const monday = buildIdempotencyKey({ ...base, rewardDay: '2026-05-26' });
    const tuesday = buildIdempotencyKey({ ...base, rewardDay: '2026-05-27' });

    expect(monday).toBe(
      'onsocial_portal:alice.testnet:stand_given:bob.testnet'
    );
    expect(tuesday).toBe(monday);
  });

  it('mutual_stand_created idempotency is once per target', () => {
    const key = buildIdempotencyKey({
      action: 'mutual_stand_created',
      accountId: 'alice.testnet',
      appId: 'onsocial_portal',
      rewardDay: '2026-05-26',
      targetAccountId: 'bob.testnet',
      topic: null,
    });

    expect(key).toBe(
      'onsocial_portal:alice.testnet:mutual_stand_created:bob.testnet'
    );
  });

  it('endorsement_given idempotency is once per target and topic', () => {
    const key = buildIdempotencyKey({
      action: 'endorsement_given',
      accountId: 'alice.testnet',
      appId: 'onsocial_portal',
      rewardDay: '2026-05-26',
      targetAccountId: 'bob.testnet',
      topic: 'builder',
    });

    expect(key).toBe(
      'onsocial_portal:alice.testnet:endorsement_given:bob.testnet:builder'
    );
  });

  it('daily_active idempotency stays per day', () => {
    const monday = buildIdempotencyKey({
      action: 'daily_active',
      accountId: 'alice.testnet',
      appId: 'onsocial_portal',
      rewardDay: '2026-05-26',
      targetAccountId: null,
      topic: null,
    });
    const tuesday = buildIdempotencyKey({
      action: 'daily_active',
      accountId: 'alice.testnet',
      appId: 'onsocial_portal',
      rewardDay: '2026-05-27',
      targetAccountId: null,
      topic: null,
    });

    expect(monday).toBe(
      'onsocial_portal:alice.testnet:2026-05-26:daily_active'
    );
    expect(tuesday).toBe(
      'onsocial_portal:alice.testnet:2026-05-27:daily_active'
    );
  });
});
