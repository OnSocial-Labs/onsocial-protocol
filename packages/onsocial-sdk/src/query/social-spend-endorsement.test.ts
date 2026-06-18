import { describe, expect, it } from 'vitest';
import {
  aggregateEndorsementSupportRows,
  parseLegacyEndorsementSpendTargetId,
  type SocialSpendEventRow,
} from './social-spend.js';

function supportRow(
  partial: Partial<SocialSpendEventRow> & {
    spenderId: string;
    amount: string;
  }
): SocialSpendEventRow {
  return {
    id: partial.id ?? '1',
    blockHeight: partial.blockHeight ?? 1,
    blockTimestamp: partial.blockTimestamp ?? 1,
    receiptId: partial.receiptId ?? 'r1',
    accountId: partial.accountId ?? partial.spenderId,
    eventType: partial.eventType ?? 'SOCIAL_SPENT',
    success: partial.success ?? true,
    spenderId: partial.spenderId,
    amount: partial.amount,
    appId: partial.appId ?? 'portal',
    action: partial.action ?? 'support_endorsement',
    targetType: partial.targetType ?? 'endorsement',
    targetId: partial.targetId ?? 'legacy:alice.near:bob.near:dev',
    seasonId: partial.seasonId ?? null,
    tag: partial.tag ?? null,
    recipientId: partial.recipientId ?? 'bob.near',
    treasuryAmount: partial.treasuryAmount ?? null,
    seasonAmount: partial.seasonAmount ?? null,
    targetAmount: partial.targetAmount ?? null,
    metadata: partial.metadata ?? null,
    label: partial.label ?? null,
    active: partial.active ?? null,
    startsAtNs: partial.startsAtNs ?? null,
    endsAtNs: partial.endsAtNs ?? null,
    claimStartsAtNs: partial.claimStartsAtNs ?? null,
    root: partial.root ?? null,
    totalAmount: partial.totalAmount ?? null,
    paused: partial.paused ?? null,
    oldTreasuryId: partial.oldTreasuryId ?? null,
    treasuryId: partial.treasuryId ?? null,
    settlementPublisher: partial.settlementPublisher ?? null,
    ownerId: partial.ownerId ?? null,
    oldVersion: partial.oldVersion ?? null,
    newVersion: partial.newVersion ?? null,
    extraData: partial.extraData ?? null,
  };
}

describe('parseLegacyEndorsementSpendTargetId', () => {
  it('parses legacy endorsement spend ids', () => {
    expect(
      parseLegacyEndorsementSpendTargetId(
        'legacy:alice.near:bob.near:developer-relations'
      )
    ).toEqual({
      issuer: 'alice.near',
      target: 'bob.near',
      topic: 'developer-relations',
    });
  });

  it('returns null for non-legacy ids', () => {
    expect(
      parseLegacyEndorsementSpendTargetId(
        '550e8400-e29b-41d4-a716-446655440000'
      )
    ).toBeNull();
  });
});

describe('aggregateEndorsementSupportRows', () => {
  it('aggregates totals and ranks supporters by amount', () => {
    const aggregated = aggregateEndorsementSupportRows([
      supportRow({
        spenderId: 'alice.near',
        amount: '100',
        blockTimestamp: 10,
      }),
      supportRow({ spenderId: 'bob.near', amount: '300', blockTimestamp: 20 }),
      supportRow({ spenderId: 'alice.near', amount: '50', blockTimestamp: 30 }),
    ]);

    expect(aggregated.totalAmountYocto).toBe('450');
    expect(aggregated.spendCount).toBe(3);
    expect(aggregated.supporters).toEqual([
      expect.objectContaining({
        accountId: 'bob.near',
        totalAmountYocto: '300',
      }),
      expect.objectContaining({
        accountId: 'alice.near',
        totalAmountYocto: '150',
      }),
    ]);
  });
});
