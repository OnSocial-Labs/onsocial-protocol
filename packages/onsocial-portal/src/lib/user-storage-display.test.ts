import { describe, expect, it } from 'vitest';
import {
  buildUserStorageSummary,
  formatStorageMinNearLabel,
  isValidShareBytesPerRecipient,
  isValidStorageAmountInput,
  parseStorageAmountYocto,
  pickActiveShareGrantsForPool,
  shareGrantRemainingBytes,
  shareGrantUsedPercent,
  splitShareBytesPerRecipient,
  resolveSharePoolBudgetBytes,
  storageCapacityBytesFromNearInput,
  storageManageIsHighlighted,
  STORAGE_DEPOSIT_MIN_YOCTO,
  uniqueShareGrantTargetIds,
} from '@/lib/user-storage-display';
import { nearToYocto } from '@/lib/near-rpc';

describe('buildUserStorageSummary', () => {
  it('computes withdrawable balance after storage coverage', () => {
    const summary = buildUserStorageSummary({
      balance: '2000000000000000000000000',
      used_bytes: 1000,
      locked_balance: '0',
      group_pool_used_bytes: 0,
      platform_pool_used_bytes: 500,
      platform_sponsored: true,
      platform_allowance: 6000,
      platform_last_refill_ns: 0,
    });

    expect(summary).not.toBeNull();
    expect(summary!.effectiveBytes).toBe(500);
    expect(summary!.coveredBytes).toBe(500);
    expect(summary!.effectiveBytes).toBe(500);
    expect(summary!.depositCapacityBytes).toBeGreaterThan(0);
    expect(summary!.withdrawableYocto).toBe(
      2000000000000000000000000n - 500n * 10_000_000_000_000_000_000n
    );
    expect(summary!.storageNeededYocto).toBeGreaterThan(0n);
    expect(summary!.headroomPercent).toBeGreaterThan(90);
  });

  it('shows full headroom when nothing is in use', () => {
    const summary = buildUserStorageSummary({
      balance: '100000000000000000000000',
      used_bytes: 0,
      locked_balance: '0',
      group_pool_used_bytes: 0,
      platform_pool_used_bytes: 0,
      platform_sponsored: true,
      platform_allowance: 6000,
      platform_last_refill_ns: 0,
    });

    expect(summary).not.toBeNull();
    expect(summary!.effectiveBytes).toBe(0);
    expect(summary!.depositCapacityBytes).toBe(10_000);
    expect(summary!.usagePercent).toBe(0);
    expect(summary!.headroomPercent).toBe(100);
  });

  it('returns null when no storage record exists', () => {
    expect(buildUserStorageSummary(null)).toBeNull();
  });
});

describe('storageManageIsHighlighted', () => {
  it('highlights exhausted and inactive buffers', () => {
    expect(
      storageManageIsHighlighted({
        phase: 'exhausted',
        availablePercent: 0,
      })
    ).toBe(true);
    expect(
      storageManageIsHighlighted({
        phase: 'inactive',
        availablePercent: 0,
      })
    ).toBe(true);
  });
});

describe('storage amount validation', () => {
  it('rejects deposits below the UI minimum', () => {
    expect(() => parseStorageAmountYocto('0.0001', 'deposit')).toThrow(
      /Minimum deposit/
    );
    expect(
      isValidStorageAmountInput('0.001', 'deposit', {
        minYocto: STORAGE_DEPOSIT_MIN_YOCTO,
      })
    ).toBe(true);
  });

  it('clamps withdraw amounts to withdrawable balance', () => {
    const maxYocto = BigInt(nearToYocto('0.5'));
    expect(() =>
      parseStorageAmountYocto('1', 'withdraw', { maxYocto })
    ).toThrow(/exceeds withdrawable/);
    expect(parseStorageAmountYocto('0.25', 'withdraw', { maxYocto })).toBe(
      maxYocto / 2n
    );
  });

  it('rejects deposits above wallet balance', () => {
    const maxYocto = BigInt(nearToYocto('1'));
    expect(() => parseStorageAmountYocto('2', 'deposit', { maxYocto })).toThrow(
      /Insufficient NEAR wallet balance/
    );
  });

  it('formats the minimum deposit label', () => {
    expect(formatStorageMinNearLabel(STORAGE_DEPOSIT_MIN_YOCTO)).toBe('0.001');
  });
});

describe('share byte split', () => {
  it('splits available bytes evenly by percent and recipient count', () => {
    expect(splitShareBytesPerRecipient(10_000, 2, 100)).toBe(5_000);
    expect(splitShareBytesPerRecipient(10_000, 4, 50)).toBe(1_250);
    expect(splitShareBytesPerRecipient(10_000, 3, 100)).toBe(3_333);
  });

  it('returns zero when inputs are empty or invalid', () => {
    expect(splitShareBytesPerRecipient(0, 2, 100)).toBe(0);
    expect(splitShareBytesPerRecipient(10_000, 0, 100)).toBe(0);
    expect(splitShareBytesPerRecipient(10_000, 2, 0)).toBe(0);
  });

  it('validates per-recipient minimum bytes', () => {
    expect(isValidShareBytesPerRecipient(2_000)).toBe(true);
    expect(isValidShareBytesPerRecipient(1_999)).toBe(false);
  });

  it('caps share budget by unallocated pool caps and physical availability', () => {
    expect(
      resolveSharePoolBudgetBytes({
        availableBytes: 25_000,
        sharedBytes: 15_600,
        totalCapacityBytes: 25_600,
      })
    ).toBe(10_000);

    expect(
      resolveSharePoolBudgetBytes({
        availableBytes: 5_000,
        sharedBytes: 15_600,
        totalCapacityBytes: 25_600,
      })
    ).toBe(5_000);

    expect(
      resolveSharePoolBudgetBytes({
        availableBytes: 25_000,
        sharedBytes: 25_600,
        totalCapacityBytes: 25_600,
      })
    ).toBe(0);
  });
});

describe('active share grants', () => {
  it('dedupes grant target ids from indexer events', () => {
    expect(
      uniqueShareGrantTargetIds([
        { targetId: 'alice.testnet' },
        { targetId: 'alice.testnet' },
        { targetId: 'bob.testnet' },
        { targetId: '  ' },
      ])
    ).toEqual(['alice.testnet', 'bob.testnet']);
  });

  it('keeps only live allocations from the viewer pool', () => {
    expect(
      pickActiveShareGrantsForPool('sponsor.testnet', [
        {
          accountId: 'alice.testnet',
          shared: {
            max_bytes: 5000,
            used_bytes: 1200,
            pool_id: 'sponsor.testnet',
          },
        },
        {
          accountId: 'bob.testnet',
          shared: {
            max_bytes: 3000,
            used_bytes: 0,
            pool_id: 'other.testnet',
          },
        },
        {
          accountId: 'charlie.testnet',
          shared: null,
        },
      ])
    ).toEqual([
      {
        accountId: 'alice.testnet',
        maxBytes: 5000,
        usedBytes: 1200,
      },
    ]);
  });

  it('derives remaining bytes and usage percent for a grant', () => {
    const grant = {
      accountId: 'alice.testnet',
      maxBytes: 5000,
      usedBytes: 1200,
    };

    expect(shareGrantRemainingBytes(grant)).toBe(3800);
    expect(shareGrantUsedPercent(grant)).toBe(24);
    expect(shareGrantRemainingBytes({ ...grant, usedBytes: 6000 })).toBe(0);
    expect(shareGrantUsedPercent({ ...grant, maxBytes: 0 })).toBe(0);
  });
});

describe('storageCapacityBytesFromNearInput', () => {
  it('maps NEAR deposit amount to chain byte capacity', () => {
    expect(storageCapacityBytesFromNearInput('0.1')).toBe(10_000);
    expect(storageCapacityBytesFromNearInput('')).toBeNull();
    expect(storageCapacityBytesFromNearInput('0')).toBeNull();
  });
});
