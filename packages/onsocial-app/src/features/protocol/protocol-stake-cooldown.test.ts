import { describe, expect, it } from 'vitest';
import { decodeStakingUnstakePeriodNs } from '@/features/protocol/protocol-stake-cooldown';

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function borshString(value: string): Uint8Array {
  const text = new TextEncoder().encode(value);
  const out = new Uint8Array(4 + text.length);
  out.set(u32(text.length), 0);
  out.set(text, 4);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('decodeStakingUnstakePeriodNs', () => {
  it('reads the unstake period after the staking STATE header', () => {
    const period = 604800000000000n;
    const periodBytes = new Uint8Array(8);
    new DataView(periodBytes.buffer).setBigUint64(0, period, true);
    const state = concat([
      borshString('governance.onsocial.testnet'),
      borshString('token.onsocial.testnet'),
      u32(1),
      new Uint8Array([0]),
      new Uint8Array(16),
      periodBytes,
    ]);
    expect(decodeStakingUnstakePeriodNs(state)).toBe(period.toString());
  });

  it('returns null when the state is too short', () => {
    expect(decodeStakingUnstakePeriodNs(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
