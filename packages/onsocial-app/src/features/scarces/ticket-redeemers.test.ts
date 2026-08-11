import { describe, expect, it } from 'vitest';
import { accountIdsEqual } from '@/lib/account-match';

/**
 * Pure helpers for door-staff UX — keep roster semantics covered without RPC.
 */
export function canManageDoorStaff(opts: {
  viewerId: string | null | undefined;
  creatorId: string | null | undefined;
}): boolean {
  if (!opts.viewerId?.trim() || !opts.creatorId?.trim()) return false;
  return accountIdsEqual(opts.viewerId, opts.creatorId);
}

export function canOpenDoor(opts: {
  isPassKind: boolean;
  maxRedeems: number | null | undefined;
  isOwner: boolean;
  isRedeemer: boolean;
}): boolean {
  if (!opts.isPassKind) return false;
  if (opts.maxRedeems == null || opts.maxRedeems <= 0) return false;
  return opts.isOwner || opts.isRedeemer;
}

export function normalizeDoorStaffAccount(raw: string): string {
  return raw.trim().toLowerCase();
}

export function canAddDoorStaff(opts: {
  draft: string;
  redeemers: string[];
  creatorId: string;
  max: number;
}): boolean {
  const account = normalizeDoorStaffAccount(opts.draft);
  if (!account) return false;
  if (opts.redeemers.length >= opts.max) return false;
  if (accountIdsEqual(account, opts.creatorId)) return false;
  return !opts.redeemers.some((id) => accountIdsEqual(id, account));
}

describe('door staff helpers', () => {
  it('limits manage to the creator', () => {
    expect(
      canManageDoorStaff({ viewerId: 'a.near', creatorId: 'a.near' })
    ).toBe(true);
    expect(
      canManageDoorStaff({ viewerId: 'b.near', creatorId: 'a.near' })
    ).toBe(false);
  });

  it('opens Door for creator or redeemer on redeemable passes', () => {
    expect(
      canOpenDoor({
        isPassKind: true,
        maxRedeems: 1,
        isOwner: false,
        isRedeemer: true,
      })
    ).toBe(true);
    expect(
      canOpenDoor({
        isPassKind: true,
        maxRedeems: 1,
        isOwner: true,
        isRedeemer: false,
      })
    ).toBe(true);
    expect(
      canOpenDoor({
        isPassKind: true,
        maxRedeems: null,
        isOwner: true,
        isRedeemer: true,
      })
    ).toBe(false);
    expect(
      canOpenDoor({
        isPassKind: false,
        maxRedeems: 1,
        isOwner: true,
        isRedeemer: true,
      })
    ).toBe(false);
  });

  it('blocks adding creator, duplicates, and over-cap staff', () => {
    expect(
      canAddDoorStaff({
        draft: 'Door.near',
        redeemers: [],
        creatorId: 'alice.near',
        max: 20,
      })
    ).toBe(true);
    expect(
      canAddDoorStaff({
        draft: 'alice.near',
        redeemers: [],
        creatorId: 'alice.near',
        max: 20,
      })
    ).toBe(false);
    expect(
      canAddDoorStaff({
        draft: 'door.near',
        redeemers: ['door.near'],
        creatorId: 'alice.near',
        max: 20,
      })
    ).toBe(false);
    expect(
      canAddDoorStaff({
        draft: 'new.near',
        redeemers: Array.from({ length: 20 }, (_, i) => `d${i}.near`),
        creatorId: 'alice.near',
        max: 20,
      })
    ).toBe(false);
  });
});
