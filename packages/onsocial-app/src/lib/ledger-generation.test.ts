import { describe, expect, it } from 'vitest';
import { snapshotForGeneration } from '@/lib/ledger-generation';

describe('snapshotForGeneration', () => {
  it('returns the store snapshot for the first tick and a later tick', () => {
    const ledger = new Map([['alice.near', 'stand']]);
    let reads = 0;
    const read = () => {
      reads += 1;
      return new Map(ledger);
    };
    const first = snapshotForGeneration(0, read);
    const next = snapshotForGeneration(1, read);
    expect(first).toEqual(ledger);
    expect(next).toEqual(ledger);
    expect(first).not.toBe(next);
    expect(reads).toBe(2);
    expect(snapshotForGeneration(-1, () => ledger)).toBe(ledger);
  });
});
