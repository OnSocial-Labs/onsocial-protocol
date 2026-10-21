import { describe, expect, it } from 'vitest';
import { pollIndexConfirm } from '@/lib/index-confirm-poll';

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    at: () => t,
  };
}

describe('pollIndexConfirm', () => {
  it('returns the indexed value on the first match', async () => {
    let reads = 0;
    const time = clock();
    const value = await pollIndexConfirm(
      async () => {
        reads += 1;
        return 4;
      },
      (count) => count === 4,
      { now: time.now, sleep: time.sleep }
    );
    expect(value).toBe(4);
    expect(reads).toBe(1);
    expect(time.at()).toBe(0);
  });

  it('keeps reading until the indexed value matches', async () => {
    let reads = 0;
    const time = clock();
    const value = await pollIndexConfirm(
      async () => {
        reads += 1;
        return reads;
      },
      (count) => count === 3,
      { timeoutMs: 2_000, intervalMs: 400, now: time.now, sleep: time.sleep }
    );
    expect(value).toBe(3);
    expect(reads).toBe(3);
    expect(time.at()).toBe(800);
  });

  it('returns null when the index stays behind for the whole window', async () => {
    let reads = 0;
    const time = clock();
    const value = await pollIndexConfirm(
      async () => {
        reads += 1;
        return 3;
      },
      (count) => count === 4,
      { timeoutMs: 2_000, intervalMs: 400, now: time.now, sleep: time.sleep }
    );
    expect(value).toBeNull();
    expect(time.at()).toBe(2_000);
    expect(reads).toBe(6);
  });

  it('treats a failed read as a miss and still stops at the window', async () => {
    let reads = 0;
    const time = clock();
    const value = await pollIndexConfirm(
      async () => {
        reads += 1;
        if (reads < 2) throw new Error('graph down');
        return 1;
      },
      (count) => count === 4,
      { timeoutMs: 800, intervalMs: 400, now: time.now, sleep: time.sleep }
    );
    expect(value).toBeNull();
    expect(reads).toBe(3);
    expect(time.at()).toBe(800);
  });
});
