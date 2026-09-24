import { describe, expect, it } from 'vitest';
import {
  ownedScarceCanTransfer,
  scarceTransferReady,
} from '@/features/scarces/scarce-transfer';

describe('ownedScarceCanTransfer', () => {
  it('allows an unlisted transferable scarce', () => {
    expect(
      ownedScarceCanTransfer({
        transferable: true,
        listingKind: null,
        bidCount: 0,
      })
    ).toBe(true);
  });

  it('allows a fixed listing so the sale comes down in the same transfer', () => {
    expect(
      ownedScarceCanTransfer({
        transferable: true,
        listingKind: 'fixed',
        bidCount: 0,
      })
    ).toBe(true);
  });

  it('hides soulbound drops', () => {
    expect(
      ownedScarceCanTransfer({
        transferable: false,
        listingKind: null,
      })
    ).toBe(false);
  });

  it('hides auctions that already have a bid', () => {
    expect(
      ownedScarceCanTransfer({
        transferable: true,
        listingKind: 'auction',
        bidCount: 1,
      })
    ).toBe(false);
  });
});

describe('scarceTransferReady', () => {
  it('waits until the account lip is green', () => {
    expect(
      scarceTransferReady({
        status: 'checking',
        receiverId: 'alice.testnet',
        ownerId: 'bob.testnet',
      })
    ).toBe(false);
    expect(
      scarceTransferReady({
        status: 'found',
        receiverId: 'alice.testnet',
        ownerId: 'bob.testnet',
      })
    ).toBe(true);
  });

  it('refuses sending the scarce to its owner', () => {
    expect(
      scarceTransferReady({
        status: 'found',
        receiverId: 'Bob.Testnet',
        ownerId: 'bob.testnet',
      })
    ).toBe(false);
  });
});
