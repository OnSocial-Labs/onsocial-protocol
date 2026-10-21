import { describe, expect, it } from 'vitest';
import {
  pollTransferOwner,
  scarceOwnerIs,
} from '@/features/scarces/transfer-index-confirm';

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe('scarceOwnerIs', () => {
  it('matches the receiver on the indexed owner row', () => {
    expect(scarceOwnerIs('bob.testnet', 'bob.testnet')).toBe(true);
    expect(scarceOwnerIs('alice.testnet', 'bob.testnet')).toBe(false);
    expect(scarceOwnerIs(null, 'bob.testnet')).toBe(false);
  });
});

describe('pollTransferOwner', () => {
  it('returns when the owner row is the receiver', async () => {
    const time = clock();
    let reads = 0;
    const landed = await pollTransferOwner({
      receiverId: 'bob.testnet',
      readOwnerId: async () => {
        reads += 1;
        return reads < 2 ? 'alice.testnet' : 'bob.testnet';
      },
      timeoutMs: 2_000,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(landed).toBe(true);
    expect(reads).toBe(2);
  });

  it('returns false when the owner row stays on the sender', async () => {
    const time = clock();
    const landed = await pollTransferOwner({
      receiverId: 'bob.testnet',
      readOwnerId: async () => 'alice.testnet',
      timeoutMs: 400,
      intervalMs: 400,
      now: time.now,
      sleep: time.sleep,
    });
    expect(landed).toBe(false);
  });
});
