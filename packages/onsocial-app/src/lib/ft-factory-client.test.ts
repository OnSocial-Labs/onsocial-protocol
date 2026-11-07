import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canFinishTakenTokenAccount,
  clearFtFactoryFinish,
  readFtFactoryFinish,
  rememberFtFactoryFinish,
  type FtFactoryFinishInput,
} from '@/lib/ft-factory-client';

const PENDING: FtFactoryFinishInput = {
  createTxHash: '11111111111111111111111111111111111111111111',
  contractId: 'cool.alice.testnet',
  name: 'Cool Token',
  symbol: 'COOL',
  totalSupply: '1000',
  icon: 'data:image/svg+xml,x',
  renounceOwner: false,
};

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

describe('factory finish retry memory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the create tx so a taken name can finish without another signature', () => {
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    expect(canFinishTakenTokenAccount(null, PENDING.contractId)).toBe(false);
    rememberFtFactoryFinish(PENDING);
    const stored = readFtFactoryFinish(PENDING.contractId);
    expect(stored).toEqual(PENDING);
    expect(canFinishTakenTokenAccount(stored, PENDING.contractId)).toBe(true);
    expect(canFinishTakenTokenAccount(stored, 'other.alice.testnet')).toBe(
      false
    );
    clearFtFactoryFinish(PENDING.contractId);
    expect(readFtFactoryFinish(PENDING.contractId)).toBeNull();
  });
});
